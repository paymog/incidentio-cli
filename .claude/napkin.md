# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|

## User Preferences
- Mirror the patterns in ../blacksmith-cli (bun + TS, compiled binary, `src/commands/generated.ts`, `bs`-style flag parsing).
- GitHub publishing handle: `paymog` (same as blacksmith-cli). Homebrew tap: `paymog/homebrew-tap`.

## Patterns That Work
- incident.io docs are Mintlify; each endpoint page embeds a full OpenAPI YAML fragment.
- The clean codegen source is per-tag OpenAPI JSON at `https://docs.incident.io/openapi/tags/<tag>.json`.
  Discover the 52 REST tags by grepping llms.txt (`https://docs.incident.io/llms.txt`) for group pages whose
## Project TS Rules (enforced)
- No `any`/`as any`. Parsed JSON and fetch results are `unknown` → validate with type guards (blacksmith uses `any` everywhere; don't copy that).
- Don't extract one-expression functions. Inline unless it's a durable contract / type guard / multi-callsite.
- Static lookup tables → `Record<K,V>`; dynamic collections → `Set`/`Map`.
  blurb starts with "API endpoints for" -> slug = path segment, minus `.md`.
- Command naming: resource = tag slug minus trailing `-vN`; verb from operationId suffix. Collapse CRUD prefixes
  (List/Create/Show/Update/Delete/Destroy) to a single word; on within-resource collisions fall back to the full
  kebab suffix (e.g. catalog-types: `update-type` vs `update-type-schema`). Cross-resource dupes: append `-<method>`
  (e.g. heartbeat `ping-get` / `ping-post`).
- Resource is best derived from the TAG FILENAME, not the URL path top (schedule-replicas-v2.json paths start
  with /v2/schedules/... but belong to schedule-replicas).

## Patterns That Don't Work
- `https://docs.incident.io/openapi.json` / `openapi.yaml` / `api-reference/openapi.json` -> 404. No single spec exists.
- `https://api-docs.incident.io/openapi.json` -> returns the docs HTML shell, not JSON.

## Domain Notes
- incident.io auth is a Bearer API key (NOT cookies like blacksmith). Much simpler: store one string.
- API base: `https://api.incident.io`. Paths in the spec already include `/v1`/`/v2`/`/v3`.
- Rate limit 1200 req/min/key; 429 body names `retry_after`. Errors carry `request_id`.
- List filters use bracket query keys (`status[one_of]=ABC`, repeatable). Use URLSearchParams.append, not set.
