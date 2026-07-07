import { mkdirSync } from "node:fs";
import { CONFIG_DIR, CREDS_PATH, ENV_KEY } from "../config.ts";

export type Creds = {
  apiKey: string;
  updatedAt: string;
};

type CredsData = { apiKey: string; updatedAt?: unknown };

// Validate the persisted JSON shape before trusting it. The file is external
// input, so we narrow with `in` rather than casting blindly.
function isCredsData(value: unknown): value is CredsData {
  return (
    typeof value === "object" &&
    value !== null &&
    "apiKey" in value &&
    typeof value.apiKey === "string"
  );
}

export async function loadCreds(): Promise<Creds | undefined> {
  const file = Bun.file(CREDS_PATH);
  if (!(await file.exists())) return undefined;
  const data: unknown = await file.json().catch(() => undefined);
  if (!isCredsData(data)) return undefined;
  const updatedAt =
    typeof data.updatedAt === "string" ? data.updatedAt : "";
  return { apiKey: data.apiKey, updatedAt };
}

export async function saveCreds(apiKey: string): Promise<Creds> {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const creds: Creds = { apiKey, updatedAt: new Date().toISOString() };
  await Bun.write(CREDS_PATH, JSON.stringify(creds, null, 2));
  // Credentials file: owner-only.
  await Bun.$`chmod 600 ${CREDS_PATH}`.quiet().nothrow();
  return creds;
}

// Resolution order: --api-key flag → $INCIDENT_API_KEY → stored credential.
export async function resolveApiKey(flag?: string): Promise<string> {
  if (flag) return flag;
  const env = process.env[ENV_KEY];
  if (env) return env;
  const creds = await loadCreds();
  if (creds) return creds.apiKey;
  throw new Error(
    "not authenticated. Run `incidentio auth set <api-key>`, or set the INCIDENT_API_KEY env var.",
  );
}
