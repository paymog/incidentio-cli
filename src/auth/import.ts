import { hasAuthCookies, parseCookieString, type CookieJar } from "./cookies.ts";

export type ImportedSession = {
  cookies: CookieJar;
  org?: string;
};

// Pull a browser session out of pasted input. Supports three shapes:
//   1. A full `curl ...` command (reads -b/--cookie, -H 'cookie: ...', and the
//      x-incident-organisation-id header).
//   2. A HAR file's JSON (reads request.cookies / Cookie header / org header).
//   3. A bare `name=value; name2=value2` cookie string.
export function extractSession(input: string): ImportedSession {
  const trimmed = input.trim();

  // HAR: JSON with a log.entries array.
  if (trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const fromHar = sessionFromHar(parsed);
      if (Object.keys(fromHar.cookies).length || fromHar.org) return fromHar;
    } catch {
      // fall through to curl/string parsing
    }
  }

  // curl command: -b/--cookie, -H 'cookie: ...', -H 'x-incident-organisation-id: ...'.
  if (/(^|\s)curl(\s|$)/.test(trimmed) || /-b\s|--cookie\s|cookie:/i.test(trimmed)) {
    const fromCurl = sessionFromCurl(trimmed);
    if (Object.keys(fromCurl.cookies).length || fromCurl.org) return fromCurl;
  }

  // Bare cookie string fallback.
  return { cookies: parseCookieString(trimmed) };
}

function headerValue(curl: string, name: string): string | undefined {
  const re = new RegExp(`-H\\s+(['"])\\s*${name}:\\s*([\\s\\S]*?)\\1`, "i");
  const m = curl.match(re);
  return m?.[2]?.trim();
}

function sessionFromCurl(curl: string): ImportedSession {
  let cookies: CookieJar = {};
  const bMatch = curl.match(/(?:-b|--cookie)\s+(['"])([\s\S]*?)\1/);
  if (bMatch) cookies = parseCookieString(bMatch[2]!);
  const cookieHeader = headerValue(curl, "cookie");
  if (cookieHeader) cookies = { ...cookies, ...parseCookieString(cookieHeader) };
  const org = headerValue(curl, "x-incident-organisation-id");
  return { cookies, org };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function sessionFromHar(parsed: unknown): ImportedSession {
  const jar: CookieJar = {};
  let org: string | undefined;
  const entries: unknown = isRecord(parsed) && isRecord(parsed.log) ? parsed.log.entries : [];
  if (!Array.isArray(entries)) return { cookies: jar };
  for (const e of entries) {
    if (!isRecord(e) || !isRecord(e.request)) continue;
    const url: string = typeof e.request.url === "string" ? e.request.url : "";
    if (!url.includes("incident.io")) continue;
    if (Array.isArray(e.request.cookies)) {
      for (const c of e.request.cookies) {
        if (isRecord(c) && typeof c.name === "string") {
          Object.assign(jar, parseCookieString(`${c.name}=${c.value ?? ""}`));
        }
      }
    }
    if (Array.isArray(e.request.headers)) {
      for (const h of e.request.headers) {
        if (!isRecord(h) || typeof h.name !== "string" || typeof h.value !== "string") continue;
        const lname = h.name.toLowerCase();
        if (lname === "cookie") Object.assign(jar, parseCookieString(h.value));
        else if (lname === "x-incident-organisation-id" && !org) org = h.value.trim();
      }
    }
  }
  return { cookies: jar, org };
}

export { hasAuthCookies };
