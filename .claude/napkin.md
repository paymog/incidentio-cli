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
## Internal dashboard API (v0.2.0)
- app.incident.io/api/* is the dashboard SPA's internal API. It REJECTS API keys:
  `"Cannot use API keys to authenticate to internal APIs"` (401). Needs browser session
  cookies + `x-incident-organisation-id` header (org id = 01G9XY4BZ7YGBPJ3K50NB30YXS for goldsky).
  Same Laravel/XSRF model as blacksmith — ported cookies.ts/import.ts.
- incident.io IDs are ULIDs (26-char Crockford base32, e.g. 01G9XY4BZ7YGBPJ3K50NB30YXS), NOT
  UUIDs. The HAR codegen must match ULID (+ Slack IDs ^[TUB][0-9A-Z]{8,}$) to template :param.
- The auth-gate varies: `policies`/`incidents` 401 on bad session; `saved_views`/`insights`
  422 (validate first). To verify the cookie path, test against an auth-gated endpoint — a
  fake cookie there gives 401 "No authorization material", and the CLI's response matches raw
  curl exactly (proves cookies+org header are sent correctly).
- HARs from Chrome/Brave strip ALL cookies (both the array and the Cookie header). Codegen
  harvests endpoint *shapes* only; the session is imported via Copy-as-cURL (`auth import`).
- incident.io's dashboard session cookie is named `aclax` (base64 Gorilla securecookie:
  `<unix_ts>|<data>|<mac>`), NOT `*_session`. `authed_orgs` rides alongside. Copy-as-cURL
  gives clean text values (browser sends clean base64, not binary — so the Brave-decrypt
  binary I saw was a decryption artifact, not real). BUT captured tokens 401 even via raw
  curl with full headers → likely session-token rotation (Gorilla can rotate per request),
  so a copied token goes stale fast. Tooling is correct (client matches raw curl byte-for-byte).
- `auth import` with no args reads stdin → blocks on TTY until Ctrl-D. Added an isTTY hint
  so it doesn't look hung; `pbpaste | incidentio auth import` is the reliable path.
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
## v0.5.0 Alert-Route Expression Findings (2026-07-10)
- PUT /api/alert_routes/:id rejects any `users` key inside escalation_config.escalation_targets entries. Strip it before PUT; API silently restores it afterward.
- Navigation expressions live in the route-level `expressions` array; they are NOT a separate endpoint.
- Expression-reference binding in custom-field array_value: `{"reference":"expressions[\"<ref>\"]"}` — no `value` or `sort_key`.
- Workflow create (POST /api/workflows) body is `{trigger:"<name>", workflow:{...}}` — trigger is TOP-LEVEL, not nested. Verified 2026-07-21.
- Two commands now share PUT /api/alert_routes/:id: `update-route` (generic, existing) and `update-route-expr` (expression pattern). Both are intentional; the description is the typed contract.

## Changelog 2026-07-21 discovery
- New public OpenAPI tag: `secrets-v2` → `/v2/secrets` CRUD + rotate. codegen picks it up.
- Also new public: `POST /v2/status_page_retrospective_incidents` (create retrospective SP incident).
- `incident-attachments` create now accepts `resource_type: "arbitrary_url"` (+ title/url/emoji).
- Catalog types gained `owning_team_ids` on create/update payloads (team-owned catalog types).
- API keys create/update gained `comments` field.
- Internal secrets: `/api/secrets` same shape as public; create `{name,value}`; rotate `{value}`; show returns versions[].
- Internal workflow triggers: GET `/api/workflows/triggers` includes `alert.updated`, `alert.attached`, `scheduled`.
- webhook.send step params: headers type `TemplatedText["plain_single_line_with_secrets"]`; signing via `signing_secret` (Secret), `generated_signing_secret`, `signature_header_name` (HMAC-SHA256).
- Policies GET/PUT now carry `run_on_private_incidents` (bool). PUT write shape: subject/operation as bare strings; follow_up needs due_date_config `{incident_timestamp_id, days:{value:{literal}}, calculation_type}`.
- Public secrets commands shadow if internal reuse same names — use `*-internal` suffix for cookie variants.
- Insights MTTR graph is UI-only so far; `/api/insights/custom_dashboards` exists but no dedicated alert-MTTR path found.
