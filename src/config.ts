import { homedir } from "node:os";
import { join } from "node:path";

// incident.io has a real public API keyed by Bearer tokens (unlike blacksmith's
// cookie-replay). No Origin/Referer/CSRF machinery is needed for it.
export const API_BASE = "https://api.incident.io";

// The dashboard SPA's internal API (app.incident.io/api/*) rejects API keys
// ("Cannot use API keys to authenticate to internal APIs"), so internal commands
// replay the browser's Laravel session cookies + XSRF, just like blacksmith.
export const DASHBOARD_BASE = "https://app.incident.io";
export const ORIGIN = "https://app.incident.io";
export const REFERER = "https://app.incident.io/";

export const CONFIG_DIR = join(homedir(), ".config", "incidentio");
export const CREDS_PATH = join(CONFIG_DIR, "creds.json");

// Env var overrides. INCIDENT_API_KEY for the public API; INCIDENT_ORG_ID is the
// x-incident-organisation-id header the dashboard API requires.
export const ENV_KEY = "INCIDENT_API_KEY";
export const ENV_ORG = "INCIDENT_ORG_ID";
