import { API_BASE, DASHBOARD_BASE, ORIGIN, REFERER } from "../config.ts";
import { mergeSetCookies, serializeJar, xsrfHeader, type CookieJar } from "../auth/cookies.ts";
import { saveCreds } from "../auth/store.ts";
import type { Command } from "../commands/types.ts";

export type RequestOptions = {
  pathValues: Record<string, string>;
  query: [string, string][];
  body?: unknown;
};

export type HttpResponse = {
  status: number;
  contentType: string;
  text: string;
};

// Auth is resolved per-command: the public API takes a Bearer key, the dashboard's
// internal API replays a browser session (cookies + org id header + XSRF).
export type Auth =
  | { mode: "bearer"; apiKey: string }
  | { mode: "cookie"; cookies: CookieJar; org: string };

function buildUrl(base: string, command: Command, opts: RequestOptions): string {
  let path = command.path;
  for (const param of command.pathParams) {
    const value = opts.pathValues[param];
    if (value === undefined) {
      const flag = param.replace(/_/g, "-");
      throw new Error(
        `missing --${flag} <${param}> for \`${command.name.join(" ")}\``,
      );
    }
    path = path.replace(`:${param}`, encodeURIComponent(value));
  }
  const url = new URL(base + path);
  // append (not set): incident.io list filters repeat bracket keys,
  // e.g. mode[one_of]=standard&mode[one_of]=tutorial.
  for (const [k, v] of opts.query) url.searchParams.append(k, v);
  return url.toString();
}

export async function request(
  command: Command,
  auth: Auth,
  opts: RequestOptions,
): Promise<HttpResponse> {
  const isCookie = auth.mode === "cookie";
  const base = isCookie ? DASHBOARD_BASE : API_BASE;
  const url = buildUrl(base, command, opts);

  const headers: Record<string, string> = {
    accept: "application/json",
  };
  if (auth.mode === "bearer") {
    headers.authorization = `Bearer ${auth.apiKey}`;
  } else {
    // Laravel dashboard: Origin/Referer keep CORS/CSRF happy; the org id header
    // scopes the request; the cookie jar carries the session.
    headers.origin = ORIGIN;
    headers.referer = REFERER;
    headers.cookie = serializeJar(auth.cookies);
    headers["x-incident-organisation-id"] = auth.org;
  }

  let bodyInit: string | undefined;
  if (command.method !== "GET" && command.method !== "HEAD") {
    if (auth.mode === "cookie") {
      const xsrf = xsrfHeader(auth.cookies);
      if (xsrf) headers["x-xsrf-token"] = xsrf;
    }
    if (opts.body !== undefined) {
      headers["content-type"] = command.bodyContentType ?? "application/json";
      bodyInit =
        typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    }
  }

  const resp = await fetch(url, { method: command.method, headers, body: bodyInit });
  const text = await resp.text();

  // Persist rotated session cookies so the dashboard session stays warm.
  if (auth.mode === "cookie") {
    const setCookies = resp.headers.getSetCookie?.() ?? [];
    if (setCookies.length && mergeSetCookies(auth.cookies, setCookies)) {
      await saveCreds({ cookies: auth.cookies });
    }
  }

  if (resp.status === 401 || resp.status === 403) {
    const hint =
      auth.mode === "cookie"
        ? "the dashboard session expired or is invalid — re-run `incidentio auth import <curl>` with a fresh cookie"
        : "check your API key and its scopes";
    throw new Error(`HTTP ${resp.status}: authentication failed — ${hint}.\n${text.slice(0, 500)}`);
  }
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText}\n${text}`);
  }

  return {
    status: resp.status,
    contentType: resp.headers.get("content-type") ?? "",
    text,
  };
}
