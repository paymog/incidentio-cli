#!/usr/bin/env bun
// Generate src/commands/generated-internal.ts from incident.io dashboard HAR(s).
//
// The dashboard SPA talks to an internal API at app.incident.io/api/* that rejects
// API keys ("Cannot use API keys to authenticate to internal APIs"), so these
// commands replay a browser session (cookies + org id + XSRF), like blacksmith.
// HARs usually have cookies stripped on export, so this only harvests the endpoint
// *shapes* (method, templated path, query keys); the session is imported separately
// via `incidentio auth import <curl>`.
//
// Endpoints already covered by the public Bearer API are dropped (prefer Bearer).
//
// Usage: bun run codegen:har <app.incident.io.har> [more.hars...]
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { commands as publicCommands } from "../commands/generated.ts";
import type { Command } from "../commands/types.ts";

const OUT = join(process.cwd(), "src", "commands", "generated-internal.ts");
// incident.io IDs are ULIDs (26-char Crockford base32, e.g. 01G9XY4BZ7N437K1NNN01AS98A),
// not UUIDs. Slack IDs are T/U/B + ~10 alnum. Both must template to :param.
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const SLACK_ID = /^[TUB][0-9A-Z]{8,}$/;
const DIGITS = /^\d+$/;

// Collection segment -> the name of the path param that follows it.
const COLLECTION_PARAM: Record<string, string> = {
  teams: "team",
  users: "user",
  incidents: "incident",
  schedules: "schedule",
  alerts: "alert",
  debriefs: "debrief",
  custom_fields: "custom_field",
  postmortems: "postmortem",
  postmortem_documents: "postmortem_document",
  status_pages: "status_page",
  slack_team_configs: "slack_team_config",
  incident_statuses: "incident_status",
  incident_types: "incident_type",
  incident_roles: "incident_role",
  incident_timestamps: "incident_timestamp",
  catalog_types: "catalog_type",
  incident_calls: "incident_call",
  policies: "policy",
  policy_types: "policy_type",
  tasks: "task",
  "incident-timelines": "incident_timeline",
  severities: "severity",
  incident_participants: "incident_participant",
  incident_alerts: "incident_alert",
  escalation_paths: "escalation_path",
  follow_ups: "follow_up",
  incident_attachments: "incident_attachment",
  incident_relationships: "incident_relationship",
  incident_subscriptions: "incident_subscription",
  schedule_entries: "schedule_entry",
  schedule_overrides: "schedule_override",
  schedule_replicas: "schedule_replica",
  maintenance_windows: "maintenance_window",
  alert_routes: "alert_route",
  alert_sources: "alert_source",
  alert_source_configs: "alert_source_config",
  alert_attributes: "alert_attribute",
  alert_notes: "alert_note",
  custom_field_options: "custom_field_option",
  incident_updates: "incident_update",
};

function singular(s: string): string {
  if (s.endsWith("ies")) return s.slice(0, -3) + "y";
  if (s.endsWith("s")) return s.slice(0, -1);
  return s;
}

function templatePath(rawPath: string): { path: string; params: string[] } {
  const segs = rawPath.split("/").filter(Boolean);
  const params: string[] = [];
  const out: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    const prev = segs[i - 1];
    if (ULID.test(seg) || DIGITS.test(seg) || SLACK_ID.test(seg)) {
      let name = (prev ? COLLECTION_PARAM[prev] : undefined) ?? `${singular(prev ?? seg)}_id`;
      while (params.includes(name)) name += "_2";
      params.push(name);
      out.push(`:${name}`);
    } else {
      out.push(seg);
    }
  }
  return { path: "/" + out.join("/"), params };
}

const VERB: Record<string, string> = {
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
};

function commandName(templatedPath: string, method: string): string[] {
  const segs = templatedPath.split("/").filter(Boolean).slice(1); // drop leading "api"
  const trailingParam = segs.length > 0 && segs[segs.length - 1]!.startsWith(":");
  const tokens = segs
    .filter((s) => !s.startsWith(":"))
    .map((s) => s.replace(/_/g, "-"));
  const verb = VERB[method] ?? (trailingParam ? "show" : "");
  if (verb) tokens.push(verb);
  return tokens.length ? tokens : ["api"];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function collect(harJson: unknown): Command[] {
  if (!isRecord(harJson) || !isRecord(harJson.log) || !Array.isArray(harJson.log.entries)) {
    throw new Error("not a HAR document (expected { log: { entries: [] } })");
  }
  const byKey = new Map<string, Command>();
  for (const e of harJson.log.entries) {
    if (!isRecord(e) || !isRecord(e.request)) continue;
    const url: string = typeof e.request.url === "string" ? e.request.url : "";
    if (!/app\.incident\.io/.test(url)) continue;
    const path = new URL(url).pathname;
    if (!path.startsWith("/api/")) continue;
    const method: string = typeof e.request.method === "string" ? e.request.method.toUpperCase() : "";
    if (!VERB[method] && method !== "GET") continue;
    const { path: tpl, params } = templatePath(path);
    const name = commandName(tpl, method);
    const queryKeys = [...new Set([...new URL(url).searchParams.keys()])];
    const key = name.join(" ");
    if (byKey.has(key)) continue; // first seen wins
    byKey.set(key, {
      name,
      method,
      path: tpl,
      pathParams: params,
      query: queryKeys,
      description: `${method} ${path}`,
      auth: "cookie",
    });
  }
  return [...byKey.values()];
}

function serialize(commands: Command[]): string {
  const header = `// AUTO-GENERATED by src/codegen/fromHar.ts — do not edit by hand.
// Regenerate: bun run codegen:har <app.incident.io.har> [more.hars...]
// These are incident.io's INTERNAL dashboard endpoints (app.incident.io/api/*),
// authenticated by browser session cookies (auth: "cookie"). Endpoints reachable
// via the public Bearer API are excluded in favour of those commands.
import type { Command } from "./types.ts";

`;
  const body = commands
    .map((c) => {
      const entries = [
        `"name": ${JSON.stringify(c.name)}`,
        `"method": ${JSON.stringify(c.method)}`,
        `"path": ${JSON.stringify(c.path)}`,
        `"pathParams": ${JSON.stringify(c.pathParams)}`,
        `"query": ${JSON.stringify(c.query)}`,
        `"auth": "cookie"`,
        `"description": ${JSON.stringify(c.description ?? "")}`,
      ];
      return `  { ${entries.join(", ")} },`;
    })
    .join("\n");
  return `${header}export const internalCommands: Command[] = [\n${body}\n];\n`;
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    throw new Error("usage: bun run codegen:har <app.incident.io.har> [more.hars...]");
  }
  const all: Command[] = [];
  for (const f of files) {
    const json: unknown = await Bun.file(f).json();
    const got = collect(json);
    console.error(`  ${f}: ${got.length} internal endpoints`);
    all.push(...got);
  }

  // Dedupe within internal (by command key) — first wins.
  const seen = new Map<string, Command>();
  for (const c of all) seen.set(c.name.join(" "), c);
  // Drop anything the public Bearer API already covers (same command key).
  const publicKeys = new Set(publicCommands.map((c) => c.name.join(" ")));
  const internal = [...seen.values()]
    .filter((c) => !publicKeys.has(c.name.join(" ")))
    .sort((a, b) => a.name.join(" ").localeCompare(b.name.join(" ")));

  writeFileSync(OUT, serialize(internal));
  console.error(
    `wrote ${internal.length} internal commands -> ${OUT} (dropped ${seen.size - internal.length} covered by public API)`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
