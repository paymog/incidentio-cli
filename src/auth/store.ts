import { mkdirSync } from "node:fs";
import { CONFIG_DIR, CREDS_PATH, ENV_KEY, ENV_ORG } from "../config.ts";
import type { CookieJar } from "./cookies.ts";

// A single creds file holds BOTH auth modes:
//   - apiKey: Bearer token for the public API (api.incident.io/v*).
//   - cookies + org: browser session for the dashboard's internal API
//     (app.incident.io/api/*), which rejects API keys.
export type Creds = {
  apiKey?: string;
  cookies?: CookieJar;
  org?: string;
  updatedAt: string;
};

type Stored = { apiKey?: unknown; cookies?: unknown; org?: unknown; updatedAt?: unknown };

function isStored(value: unknown): value is Stored {
  return typeof value === "object" && value !== null;
}

export async function loadCreds(): Promise<Creds | undefined> {
  const file = Bun.file(CREDS_PATH);
  if (!(await file.exists())) return undefined;
  const data: unknown = await file.json().catch(() => undefined);
  if (!isStored(data)) return undefined;
  const apiKey = typeof data.apiKey === "string" ? data.apiKey : undefined;
  const cookies =
    typeof data.cookies === "object" && data.cookies !== null
      ? (data.cookies as CookieJar)
      : undefined;
  const org = typeof data.org === "string" ? data.org : undefined;
  if (!apiKey && !cookies) return undefined;
  const updatedAt = typeof data.updatedAt === "string" ? data.updatedAt : "";
  return { apiKey, cookies, org, updatedAt };
}

// Merge a patch into the existing file (so importing a session keeps the API key,
// and setting an API key keeps the session). Always rewrites chmod 600.
export async function saveCreds(patch: Partial<Creds>): Promise<Creds> {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const existing = (await loadCreds()) ?? { updatedAt: "" };
  const merged: Creds = {
    apiKey: patch.apiKey !== undefined ? patch.apiKey : existing.apiKey,
    cookies: patch.cookies !== undefined ? patch.cookies : existing.cookies,
    org: patch.org !== undefined ? patch.org : existing.org,
    updatedAt: new Date().toISOString(),
  };
  await Bun.write(CREDS_PATH, JSON.stringify(merged, null, 2));
  await Bun.$`chmod 600 ${CREDS_PATH}`.quiet().nothrow();
  return merged;
}

export async function clearCreds(): Promise<void> {
  mkdirSync(CONFIG_DIR, { recursive: true });
  await Bun.write(CREDS_PATH, JSON.stringify({ updatedAt: new Date().toISOString() }, null, 2));
  await Bun.$`chmod 600 ${CREDS_PATH}`.quiet().nothrow();
}

// Resolution order for the public API: --api-key flag → $INCIDENT_API_KEY → stored.
export async function resolveApiKey(flag?: string): Promise<string> {
  if (flag) return flag;
  const env = process.env[ENV_KEY];
  if (env) return env;
  const creds = await loadCreds();
  if (creds?.apiKey) return creds.apiKey;
  throw new Error(
    "not authenticated. Run `incidentio auth set <api-key>`, or set the INCIDENT_API_KEY env var.",
  );
}

// Resolution for the dashboard/internal API. Needs a browser session (cookies) and
// the organisation id header. org: --org → $INCIDENT_ORG_ID → stored.
export async function resolveDashboard(orgFlag?: string): Promise<{
  cookies: CookieJar;
  org: string;
}> {
  const creds = await loadCreds();
  const cookies = creds?.cookies;
  if (!cookies || Object.keys(cookies).length === 0) {
    throw new Error(
      "this internal command needs a browser session. Run `incidentio auth import <curl-or-har>` (Copy-as-cURL from a logged-in app.incident.io tab).",
    );
  }
  const org = orgFlag ?? process.env[ENV_ORG] ?? creds.org;
  if (!org) {
    throw new Error(
      "missing organisation id. Run `incidentio auth set-org <org-id>` (the x-incident-organisation-id from a dashboard request).",
    );
  }
  return { cookies, org };
}
