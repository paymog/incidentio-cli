#!/usr/bin/env bun
// Generate src/commands/generated.ts from incident.io's per-tag OpenAPI specs.
// incident.io ships no single OpenAPI file; instead each Mintlify endpoint page
// embeds a fragment, and the full per-tag spec lives at
//   https://docs.incident.io/openapi/tags/<tag>.json
// We discover the REST tag set from llms.txt (group pages described as
// "API endpoints for"), fetch each tag spec, and emit one Command per operation.
//
// Usage: bun run codegen
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "../commands/types.ts";

const DOCS = "https://docs.incident.io";
const LLMS = `${DOCS}/llms.txt`;
const tagSpecUrl = (tag: string) => `${DOCS}/openapi/tags/${tag}.json`;
const OUT = join(process.cwd(), "src", "commands", "generated.ts");

// --- OpenAPI subset (only what we consume). External JSON stays `unknown`. ---

type OASParam = { name: string; in: string };
type OASOperation = {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: unknown[];
  requestBody?: { content?: Record<string, unknown> };
};
type Verb = "get" | "post" | "put" | "patch" | "delete";
type OASPathItem = Partial<Record<Verb, OASOperation>>;
type OASTagDoc = { paths: Record<string, OASPathItem> };
const VERBS: readonly Verb[] = ["get", "post", "put", "patch", "delete"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isParam(v: unknown): v is OASParam {
  return (
    isRecord(v) &&
    typeof v.name === "string" &&
    typeof v.in === "string"
  );
}

function isTagDoc(v: unknown): v is OASTagDoc {
  return isRecord(v) && isRecord(v.paths);
}

// --- naming --------------------------------------------------------------

// First PascalCase word → canonical CRUD verb. operationId suffixes like
// ListEntries / ShowPagingProvider / DestroyScheduleReplica all begin with a
// CRUD word, so the leading word collapses regardless of the trailing noun.
const CRUD_PREFIX: Record<string, string> = {
  list: "list",
  create: "create",
  show: "show",
  update: "update",
  delete: "delete",
  destroy: "delete",
};

// Split PascalCase/camelCase (incl. acronym runs like HTTP, V3) into kebab.
function camelToKebab(s: string): string {
  return s
    .replace(/(.)([A-Z][a-z]+)/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function resourceFromTag(tag: string): string {
  // catalog-entries-v3 -> catalog-entries; ipallowlists-v1 stays ipallowlists.
  return tag.replace(/-v\d+$/, "");
}

// operationId is "<Tag Name>_<Suffix>", e.g. "Incidents V2_Create",
// "Catalog V3_UpdateTypeSchema", "Heartbeat V2_Ping#1". The tag half may
// contain spaces but never an underscore, so split on the LAST underscore.
function suffixFromOperationId(operationId: string | undefined): string {
  if (!operationId) return "";
  const tail = operationId.slice(operationId.lastIndexOf("_") + 1);
  // Disambiguator suffixes like "Ping#1" (the GET twin of a POST "Ping").
  return tail.replace(/#\d+$/, "");
}

// Collapse compound CRUD suffixes to their canonical verb: "ListEntries",
// "ShowPagingProvider", "DestroyType" all begin with a CRUD word whose leading
// kebab segment maps to list/create/show/update/delete.
function crudWord(suffix: string): string | undefined {
  const firstWord = camelToKebab(suffix).split("-")[0];
  return firstWord ? CRUD_PREFIX[firstWord] : undefined;
}

// --- fetch + parse -------------------------------------------------------

async function discoverTags(): Promise<string[]> {
  const text = await (await fetch(LLMS)).text();
  // Group page lines look like:
  //   - [Actions](https://docs.incident.io/api-reference/actions-v2.md): API endpoints for actions
  const re = /api-reference\/([a-z0-9-]+)\.md\): API endpoints for/g;
  const tags = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) tags.add(m[1]!);
  const sorted = [...tags].sort();
  if (sorted.length === 0) {
    throw new Error(`no API tags found in ${LLMS} — docs format may have changed`);
  }
  return sorted;
}

async function loadTagDoc(tag: string): Promise<OASTagDoc> {
  const json: unknown = await (await fetch(tagSpecUrl(tag))).json();
  if (!isTagDoc(json)) {
    throw new Error(`tag spec for ${tag} was not an OpenAPI doc with .paths`);
  }
  return json;
}

function templatePath(rawPath: string): { path: string; params: string[] } {
  const params: string[] = [];
  const path = rawPath.replace(/\{([a-z0-9_]+)\}/gi, (_, name: string) => {
    params.push(name);
    return `:${name}`;
  });
  return { path, params };
}

type OpRow = {
  tag: string;
  resource: string;
  method: string;
  path: string;
  params: string[];
  query: string[];
  suffix: string;
  summary: string;
  hasBody: boolean;
};

function collectOperations(tag: string, doc: OASTagDoc): OpRow[] {
  const resource = resourceFromTag(tag);
  const rows: OpRow[] = [];
  for (const [rawPath, item] of Object.entries(doc.paths)) {
    if (!item) continue;
    for (const verb of VERBS) {
      const op = item[verb];
      if (!op) continue;
      const { path, params } = templatePath(rawPath);
      const paramsArr = isRecord(op) && Array.isArray(op.parameters) ? op.parameters : [];
      const query = paramsArr.filter(isParam).filter((p) => p.in === "query").map((p) => p.name);
      const hasBody =
        isRecord(op) &&
        isRecord(op.requestBody) &&
        isRecord(op.requestBody.content);
      const suffix = suffixFromOperationId(
        isRecord(op) && typeof op.operationId === "string" ? op.operationId : undefined,
      );
      const summary =
        isRecord(op) && typeof op.summary === "string" ? op.summary : `${verb.toUpperCase()} ${rawPath}`;
      rows.push({
        tag,
        resource,
        method: verb.toUpperCase(),
        path,
        params,
        query,
        suffix,
        summary,
        hasBody,
      });
    }
  }
  return rows;
}

// Collapse CRUD verbs per resource; on collision fall back to the full kebab
// suffix; if that still collides, disambiguate by method (GET keeps the plain
// verb, others get -<method>).
function assignVerbs(rows: OpRow[]): Command[] {
  const byResource = new Map<string, OpRow[]>();
  for (const r of rows) {
    const list = byResource.get(r.resource) ?? [];
    list.push(r);
    byResource.set(r.resource, list);
  }

  const commands: Command[] = [];
  for (const [, group] of byResource) {
    // First pass: collapsed CRUD verb.
    const candidates = group.map((r) => ({ r, verb: crudWord(r.suffix) ?? camelToKebab(r.suffix) }));
    // Group by verb within the resource to detect collisions.
    const byVerb = new Map<string, typeof candidates>();
    for (const c of candidates) {
      const arr = byVerb.get(c.verb) ?? [];
      arr.push(c);
      byVerb.set(c.verb, arr);
    }
    for (const [, bucket] of byVerb) {
      if (bucket.length === 1) {
        commands.push(toCommand(bucket[0]!.r, bucket[0]!.verb));
        continue;
      }
      // Collision: recompute with the full kebab suffix.
      const recomputed = bucket.map((c) => ({
        r: c.r,
        verb: camelToKebab(c.r.suffix) || c.verb,
      }));
      // If the kebab suffix is itself just a CRUD word, keep the canonical.
      for (const c of recomputed) {
        const canonical = crudWord(c.r.suffix);
        if (canonical && camelToKebab(c.r.suffix) === canonical) c.verb = canonical;
      }
      // Residual collision (identical kebab, e.g. heartbeat ping/ping): suffix
      // by method. GET sorts first and keeps the plain verb.
      const seen = new Map<string, number>();
      recomputed.sort((a, b) => methodRank(a.r.method) - methodRank(b.r.method));
      for (const c of recomputed) {
        const count = seen.get(c.verb) ?? 0;
        seen.set(c.verb, count + 1);
        const verb = count === 0 ? c.verb : `${c.verb}-${c.r.method.toLowerCase()}`;
        commands.push(toCommand(c.r, verb));
      }
    }
  }
  return commands;
}

function methodRank(method: string): number {
  // Stable tie-break order when disambiguating by method.
  const order: Record<string, number> = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };
  return order[method] ?? 9;
}

function toCommand(r: OpRow, verb: string): Command {
  const bodyContentType =
    r.hasBody && r.method !== "GET" && r.method !== "HEAD" ? "application/json" : undefined;
  return {
    name: [r.resource, verb],
    method: r.method,
    path: r.path,
    pathParams: r.params,
    query: r.query,
    bodyContentType,
    description: r.summary,
  };
}

// --- emit ----------------------------------------------------------------

function serialize(commands: Command[]): string {
  const header = `// AUTO-GENERATED by src/codegen/fromOpenapi.ts — do not edit by hand.
// Regenerate: bun run codegen
// Source: incident.io per-tag OpenAPI specs (https://docs.incident.io/openapi/tags/<tag>.json)
import type { Command } from "./types.ts";

`;
  const body = commands
    .map((c) => {
      const entries: string[] = [
        `"name": ${JSON.stringify(c.name)}`,
        `"method": ${JSON.stringify(c.method)}`,
        `"path": ${JSON.stringify(c.path)}`,
        `"pathParams": ${JSON.stringify(c.pathParams)}`,
        `"query": ${JSON.stringify(c.query)}`,
      ];
      if (c.bodyContentType) entries.push(`"bodyContentType": ${JSON.stringify(c.bodyContentType)}`);
      entries.push(`"description": ${JSON.stringify(c.description ?? "")}`);
      return `  { ${entries.join(", ")} },`;
    })
    .join("\n");
  return `${header}export const commands: Command[] = [\n${body}\n];\n`;
}

async function main(): Promise<void> {
  const tags = await discoverTags();
  console.error(`discovered ${tags.length} tags`);

  const rows: OpRow[] = [];
  let missing = 0;
  for (const tag of tags) {
    try {
      const doc = await loadTagDoc(tag);
      rows.push(...collectOperations(tag, doc));
    } catch (err) {
      console.error(`  ! ${tag}: ${err instanceof Error ? err.message : String(err)}`);
      missing++;
    }
  }

  const commands = assignVerbs(rows).sort((a, b) =>
    a.name.join(" ").localeCompare(b.name.join(" ")),
  );

  // Sanity: surface any duplicate command keys (should be none after disambig).
  const keys = new Set<string>();
  const dupes: string[] = [];
  for (const c of commands) {
    const k = c.name.join(" ");
    if (keys.has(k)) dupes.push(k);
    keys.add(k);
  }

  writeFileSync(OUT, serialize(commands));
  console.error(
    `wrote ${commands.length} commands across ${tags.length - missing}/${tags.length} tags -> ${OUT}`,
  );
  if (dupes.length) console.error(`WARNING duplicate command keys: ${dupes.join(", ")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
