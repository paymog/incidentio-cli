import { API_BASE } from "../config.ts";
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

function buildUrl(command: Command, opts: RequestOptions): string {
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
  const url = new URL(API_BASE + path);
  // append (not set): incident.io list filters repeat bracket keys,
  // e.g. mode[one_of]=standard&mode[one_of]=tutorial.
  for (const [k, v] of opts.query) url.searchParams.append(k, v);
  return url.toString();
}

export async function request(
  command: Command,
  apiKey: string,
  opts: RequestOptions,
): Promise<HttpResponse> {
  const url = buildUrl(command, opts);
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
  };

  let bodyInit: string | undefined;
  if (command.method !== "GET" && command.method !== "HEAD") {
    if (opts.body !== undefined) {
      headers["content-type"] = command.bodyContentType ?? "application/json";
      bodyInit =
        typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    }
  }

  const resp = await fetch(url, { method: command.method, headers, body: bodyInit });
  const text = await resp.text();

  if (resp.status === 401 || resp.status === 403) {
    throw new Error(
      `HTTP ${resp.status}: authentication failed. Check your API key and its scopes.\n${text.slice(0, 500)}`,
    );
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
