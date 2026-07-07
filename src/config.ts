import { homedir } from "node:os";
import { join } from "node:path";

// incident.io has a real public API keyed by Bearer tokens (unlike blacksmith's
// cookie-replay). No Origin/Referer/CSRF machinery is needed.
export const API_BASE = "https://api.incident.io";

export const CONFIG_DIR = join(homedir(), ".config", "incidentio");
export const CREDS_PATH = join(CONFIG_DIR, "creds.json");

// Env var override for the API key. Takes precedence over the stored credential.
export const ENV_KEY = "INCIDENT_API_KEY";
