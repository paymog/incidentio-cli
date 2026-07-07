#!/usr/bin/env bun
import { commands } from "./commands/generated.ts";
import { findCommand } from "./commands/types.ts";
import { request, type RequestOptions } from "./http/client.ts";
import { loadCreds, resolveApiKey, saveCreds } from "./auth/store.ts";

const VERSION = "0.1.0";

type Flags = {
  values: Record<string, string>; // --key value  and  --key=value
  query: [string, string][];
  set: [string, string][];
  bodyJson?: string;
  bodyFile?: string;
  apiKey?: string;
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
    console.log(`${c.method.padEnd(6)} ${key}${params ? " " + params : ""}${q}`);
  }
  console.log(`\n${commands.length} commands.`);
}

function mask(key: string): string {
  return key.length <= 8 ? "•".repeat(key.length) : `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

async function handleAuth(args: string[]): Promise<void> {
  const sub = args[0];
  switch (sub) {
    case "set": {
      const key = args[1];
      if (!key) throw new Error("usage: incidentio auth set <api-key>");
      await saveCreds(key);
      console.log(`saved API key (${mask(key)}).`);
      break;
    }
    case "status": {
      const creds = await loadCreds();
      if (!creds) {
        console.log("not authenticated. Run `incidentio auth set <api-key>` or set INCIDENT_API_KEY.");
        process.exit(1);
      }
      console.log(`authenticated. api key: ${mask(creds.apiKey)}`);
      console.log(`updated: ${creds.updatedAt}`);
      break;
    }
    case "logout": {
      await saveCreds("");
      console.log("cleared credentials.");
      break;
    }
    default:
      console.log("usage: incidentio auth <set|status|logout>");
  }
}

function usage(): void {
  console.log(`incidentio — incident.io API CLI (v${VERSION})

Usage:
  incidentio auth set <api-key>      store an API key
  incidentio auth status             show auth state
  incidentio auth logout             clear stored credentials
  incidentio list [filter]           list available commands
  incidentio <command...> [flags]    run a command (see \`incidentio list\`)

Auth resolution: --api-key flag → $INCIDENT_API_KEY → stored credential.

Flags:
  --api-key <key>      API key for this call (else $INCIDENT_API_KEY or stored)
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
  const apiKey = await resolveApiKey(flags.apiKey);

  const opts: RequestOptions = {
    pathValues: flags.values,
    query: flags.query,
    body: command.method === "GET" || command.method === "HEAD"
      ? undefined
      : await buildBody(flags),
  };

  const resp = await request(command, apiKey, opts);
  printResult(resp.text, resp.contentType, flags.raw);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
