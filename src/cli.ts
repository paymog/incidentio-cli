#!/usr/bin/env bun
import { commands as publicCommands } from "./commands/generated.ts";
import { internalCommands } from "./commands/generated-internal.ts";
import { findCommand } from "./commands/types.ts";
import { request, type Auth, type RequestOptions } from "./http/client.ts";
import { clearCreds, loadCreds, resolveApiKey, resolveDashboard, saveCreds } from "./auth/store.ts";
import { extractSession, hasAuthCookies } from "./auth/import.ts";

// Public API (Bearer) + dashboard internal API (cookie) commands, merged. The
// command's `auth` field decides which credential each one uses at run time.
const commands = [...publicCommands, ...internalCommands];

const VERSION = "0.2.0";

type Flags = {
  values: Record<string, string>; // --key value  and  --key=value (path params)
  query: [string, string][];
  set: [string, string][];
  bodyJson?: string;
  bodyFile?: string;
  apiKey?: string;
  org?: string; // dashboard x-incident-organisation-id override
  raw: boolean;
};

function parseFlags(args: string[]): Flags {
  const flags: Flags = { values: {}, query: [], set: [], raw: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith("--")) throw new Error(`unexpected argument: ${arg}`);
    let key = arg.slice(2);
    let value: string | undefined;
    const eq = key.indexOf("=");
    if (eq >= 0) {
      value = key.slice(eq + 1);
      key = key.slice(0, eq);
    }
    const takeValue = (): string => {
      if (value !== undefined) return value;
      const next = args[++i];
      if (next === undefined) throw new Error(`flag --${key} needs a value`);
      return next;
    };
    switch (key) {
      case "raw":
        flags.raw = true;
        break;
      case "query":
      case "q": {
        const [k, ...rest] = takeValue().split("=");
        flags.query.push([k!, rest.join("=")]);
        break;
      }
      case "set": {
        const [k, ...rest] = takeValue().split("=");
        flags.set.push([k!, rest.join("=")]);
        break;
      }
      case "body-json":
        flags.bodyJson = takeValue();
        break;
      case "body-file":
        flags.bodyFile = takeValue();
        break;
      case "api-key":
        flags.apiKey = takeValue();
        break;
      case "org":
        flags.org = takeValue();
        break;
      default:
        // Path-param value, e.g. --id, --schedule-id, --alert-source-config-id.
        flags.values[key.replace(/-/g, "_")] = takeValue();
    }
  }
  return flags;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function buildBody(flags: Flags): Promise<unknown> {
  let body: Record<string, unknown> | undefined;
  if (flags.bodyFile) {
    body = asObject(await Bun.file(flags.bodyFile).json());
  }
  if (flags.bodyJson) {
    body = asObject(JSON.parse(flags.bodyJson));
  }
  for (const [path, raw] of flags.set) {
    if (body === undefined) body = {};
    setDeep(body, path, parseValue(raw));
  }
  return body;
}

function asObject(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  throw new Error(
    `request body must be a JSON object, got ${Array.isArray(value) ? "array" : typeof value}`,
  );
}

// set a.b.c = v on a nested object, creating intermediate objects as needed.
function setDeep(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    cursor = isRecord(next) ? next : (cursor[part] = {});
  }
  cursor[parts[parts.length - 1]!] = value;
}

function parseValue(v: string): unknown {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null") return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function printResult(text: string, contentType: string, raw: boolean): void {
  if (raw || !contentType.includes("json")) {
    process.stdout.write(text.endsWith("\n") ? text : text + "\n");
    return;
  }
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    process.stdout.write(text + "\n");
  }
}

function listCommands(filter: string): void {
  for (const c of commands) {
    const key = c.name.join(" ");
    if (filter && !key.includes(filter)) continue;
    const params = c.pathParams
      .map((p) => `--${p.replace(/_/g, "-")} <${p}>`)
      .join(" ");
    const q = c.query.length ? `  [?${c.query.join("|")}]` : "";
    const auth = c.auth === "cookie" ? " 🍪" : "";
    console.log(`${c.method.padEnd(6)} ${key}${params ? " " + params : ""}${q}${auth}`);
  }
  console.log(
    `\n${commands.length} commands (${internalCommands.length} internal 🍪 need \`incidentio auth import\`).`,
  );
}

function mask(key: string): string {
  return key.length <= 8 ? "•".repeat(key.length) : `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

async function readSource(args: string[]): Promise<string> {
  if (args.length === 0 || args[0] === "-") return await Bun.stdin.text();
  const candidate = args[0]!;
  const file = Bun.file(candidate);
  if (await file.exists()) return await file.text();
  // Treat the remaining args as literal pasted text (e.g. an inline curl).
  return args.join(" ");
}

async function handleAuth(args: string[]): Promise<void> {
  const sub = args[0];
  switch (sub) {
    case "set": {
      const key = args[1];
      if (!key) throw new Error("usage: incidentio auth set <api-key>");
      await saveCreds({ apiKey: key });
      console.log(`saved API key (${mask(key)}).`);
      break;
    }
    case "import": {
      const source = await readSource(args.slice(1));
      const session = extractSession(source);
      if (Object.keys(session.cookies).length === 0) {
        throw new Error(
          "no cookies found (expected a curl command, HAR, or cookie string). Note: HARs exported from Chrome/Brave often strip cookies — use Copy-as-cURL instead.",
        );
      }
      if (!hasAuthCookies(session.cookies)) {
        console.error(
          "warning: no session-shaped cookie found (no *_session / remember_web_* / incident*); the session may not authenticate.",
        );
      }
      await saveCreds({ cookies: session.cookies, org: session.org });
      const orgNote = session.org ? ` org=${session.org}` : "";
      console.log(
        `imported ${Object.keys(session.cookies).length} cookie(s): ${Object.keys(session.cookies).join(", ")}${orgNote}`,
      );
      if (!session.org) {
        console.error("note: no x-incident-organisation-id found — run `incidentio auth set-org <org-id>`.");
      }
      break;
    }
    case "set-org": {
      const org = args[1];
      if (!org) throw new Error("usage: incidentio auth set-org <org-id>");
      await saveCreds({ org });
      console.log(`default org set to ${org}`);
      break;
    }
    case "status": {
      const creds = await loadCreds();
      if (!creds) {
        console.log("not authenticated. Run `incidentio auth set <api-key>` (public API) or `incidentio auth import <curl>` (dashboard).");
        process.exit(1);
      }
      console.log(`api key:    ${creds.apiKey ? mask(creds.apiKey) : "(none)"}`);
      console.log(`dashboard:  ${creds.cookies ? `${Object.keys(creds.cookies).length} cookies` : "(none)"}`);
      console.log(`org:        ${creds.org ?? "(none — needed for dashboard commands)"}`);
      console.log(`updated:    ${creds.updatedAt}`);
      break;
    }
    case "logout": {
      await clearCreds();
      console.log("cleared all credentials.");
      break;
    }
    default:
      console.log("usage: incidentio auth <set|import|set-org|status|logout>");
  }
}

function usage(): void {
  console.log(`incidentio — incident.io API CLI (v${VERSION})

Usage:
  incidentio auth set <api-key>        store an API key (public API)
  incidentio auth import <curl|har>    import a dashboard browser session
  incidentio auth set-org <org-id>     set the dashboard organisation id
  incidentio auth status               show auth state
  incidentio auth logout               clear all credentials
  incidentio list [filter]             list available commands
  incidentio <command...> [flags]      run a command (see \`incidentio list\`)

Two auth modes: public API commands use a Bearer key (--api-key → $INCIDENT_API_KEY
→ stored); internal/dashboard commands (marked 🍪 in \`list\`) replay a browser session
imported via \`auth import\`, plus the organisation id (--org → $INCIDENT_ORG_ID → stored).

Flags:
  --api-key <key>      API key for a public-API call
  --org <org-id>       dashboard organisation id (x-incident-organisation-id)
  --<param> <value>    path params, e.g. --id, --schedule-id, --user-id
  --query key=value    query param (repeatable; supports bracket keys)
  --body-file <path>   JSON request body from file
  --body-json '<json>' inline JSON request body
  --set a.b=value      set a body field (repeatable)
  --raw                print raw response, no JSON formatting`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (
    argv.length === 0 ||
    argv[0] === "--help" ||
    argv[0] === "-h" ||
    argv[0] === "help"
  ) {
    usage();
    return;
  }
  if (argv[0] === "--version" || argv[0] === "version") {
    console.log(VERSION);
    return;
  }
  if (argv[0] === "auth") return handleAuth(argv.slice(1));
  if (argv[0] === "list") return listCommands(argv.slice(1).join(" "));

  // Split leading non-flag tokens (the command) from flags.
  const splitAt = argv.findIndex((a) => a.startsWith("-"));
  const tokens = splitAt === -1 ? argv : argv.slice(0, splitAt);
  const flagArgs = splitAt === -1 ? [] : argv.slice(splitAt);

  const command = findCommand(commands, tokens);
  if (!command) {
    // Helpful fallback: if the first token names a resource, show its verbs.
    const resourceMatches = commands.filter((c) => c.name[0] === tokens[0]);
    if (resourceMatches.length) {
      console.error(`unknown command: ${tokens.join(" ")}. Did you mean one of:`);
      for (const c of resourceMatches) console.error(`  ${c.name.join(" ")}`);
    } else {
      console.error(`unknown command: ${tokens.join(" ")}\nRun \`incidentio list\` to see commands.`);
    }
    process.exit(1);
  }

  const flags = parseFlags(flagArgs);
  const auth: Auth =
    command.auth === "cookie"
      ? { mode: "cookie", ...(await resolveDashboard(flags.org)) }
      : { mode: "bearer", apiKey: await resolveApiKey(flags.apiKey) };

  const opts: RequestOptions = {
    pathValues: flags.values,
    query: flags.query,
    body: command.method === "GET" || command.method === "HEAD"
      ? undefined
      : await buildBody(flags),
  };

  const resp = await request(command, auth, opts);
  printResult(resp.text, resp.contentType, flags.raw);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
