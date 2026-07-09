---
name: incidentio-cli
description: Invoke the `incidentio` CLI to drive the incident.io API — incidents, actions, follow-ups, alerts/alert sources/routes, escalations & on-call schedules, catalog (types/entries/resources), custom fields, severities, incident types/roles/statuses/timestamps, status pages (including creating and managing public pages, components, layout, subscribers, templates), workflows, users, teams, API keys, heartbeats, maintenance windows, and settings. Uses the public Bearer API (OpenAPI-generated commands) plus internal dashboard (cookie) commands generated from captured HARs, hand-curated internal endpoints, and a `raw` escape hatch for any un-codified path. Use whenever a task needs incident.io data or actions, such as "list our incidents", "create an incident", "show the on-call schedule", "build or manage a status page", "list status page subscribers", "tune a dashboard setting", or "hit an internal dashboard endpoint".
---

# incident.io CLI

Invoke the `incidentio` binary. Source of truth: [`paymog/incidentio-cli`](https://github.com/paymog/incidentio-cli).

Unlike blacksmith's cookie-replay, incident.io has a **real public API** keyed by Bearer
tokens. `incidentio` speaks it directly — no browser, no cookies. Commands are
**generated from incident.io's official OpenAPI specs** (one per resource tag), so every
documented endpoint is available. The API base is `https://api.incident.io`.

## Auth (required before any command)

A Bearer API key. Create one at **Settings → API keys** (`app.incident.io/settings/api-keys`);
when creating it you choose its scopes (e.g. `incidents.create`), and the scope set is fixed
after creation.

```sh
incidentio auth set <api-key>     # store it (chmod 600, ~/.config/incidentio/creds.json)
incidentio auth status            # show masked key + last-updated
incidentio auth logout            # clear stored credentials
```

Resolution order: `--api-key <key>` flag → `$INCIDENT_API_KEY` → stored credential. For a
one-off or CI, export `INCIDENT_API_KEY` and skip `auth set`.

A `401`/`403` means the key is invalid, revoked, or lacks the scope the endpoint needs
(e.g. calling `incidents create` with a read-only key). Re-check the key's scopes in the
dashboard.

## Usage

```sh
incidentio list [filter]         # every command (optionally filtered by substring)
incidentio list incidents        # all verbs for the `incidents` resource
incidentio <resource> <verb> [flags]
```

Commands are two tokens: **`<resource> <verb>`**. Output is pretty-printed JSON — pipe to
`jq`, or pass `--raw` for the unformatted response.

### Flags

| Flag | Meaning |
| --- | --- |
| `--api-key <key>` | API key for this call (else `$INCIDENT_API_KEY` or stored) |
| `--<param> <value>` | path params: `--id`, `--user-id`, `--schedule-id`, `--alert-source-config-id` |
| `--query key=value` | query param, repeatable (incl. bracket filters — see below) |
| `--body-file <path>` | JSON request body from file (for POST/PUT) |
| `--body-json '<json>'` | inline JSON request body |
| `--set a.b=value` | set a body field, repeatable |
| `--raw` | print the raw response, no JSON formatting |
| `--auth cookie\|bearer` | (`raw` only) force the auth mode; otherwise inferred from the path |

### Bracket query filters

List endpoints use bracket keys (Rails-style). Pass them verbatim to `--query`; repeat for
multi-value filters. incident.io's list filters are powerful but the documented param names
appear in `incidentio list <resource>` output.

```sh
# incidents in the "live" status category, severity rank >= a given severity
incidentio incidents list --query 'status_category[one_of]=live' --query 'severity[gte]=<sev-id>'
# created within a date range (tilde-separated)
incidentio incidents list --query 'created_at[date_range]=2026-06-01~2026-06-30'
# any-of multiple modes
incidentio incidents list --query 'mode[one_of]=standard' --query 'mode[one_of]=retrospective'
```

Dates are ISO-8601 UTC (`2026-06-04T00:00:00.000Z`). For "now" compute it:
`date -u +%FT%T.000Z` (macOS) or `date -u -d '30 days ago' +%FT%T.000Z` (GNU).

## Command surface

Run `incidentio list` for the authoritative set (~300 commands: ~170 public Bearer-API
commands across 52 resources, plus ~125 internal/dashboard commands marked 🍪, and the `raw`
escape hatch). Grouped
highlights (`GET` unless noted):

### Incidents
```sh
incidentio incidents list [--query status[one_of]=<id>] [--query page_size=50]
incidentio incidents show --id <id>
incidentio incidents create --body-json '{"name":"...","severity_id":"...","visibility":"public"}'
incidentio incidents edit --id <id>            # edit fields/status of an incident
incidentio incidents import-postmortem-document --id <id>
```

### Actions, follow-ups, attachments
```sh
incidentio actions list --query incident_id=<id>
incidentio follow-ups list --query incident_id=<id>
incidentio follow-ups create --body-json '{"incident_id":"...","content":"..."}'
incidentio follow-ups connect-external-issue --id <id> --body-json '{...}'
incidentio incident-attachments list --query incident_id=<id>
```

### Alerts & alert sources
```sh
incidentio alerts list
incidentio alerts show --id <id>
incidentio alerts resolve --id <id>
incidentio alert-sources list
incidentio alert-routes list
incidentio alert-events create-http --alert-source-config-id <id> --body-json '{...}'
incidentio heartbeat ping --alert-source-config-id <id>   # GET ping
```

### Escalations & on-call schedules
```sh
incidentio escalations list [--query status=active]
incidentio escalations create --body-json '{...}'
incidentio escalations cancel-escalation --id <id>
incidentio escalation-paths list
incidentio schedules list
incidentio schedules show --id <id>
incidentio schedule-entries list --schedule-id <id>
incidentio schedule-overrides list --schedule-id <id>
incidentio schedule-replicas list --schedule-id <id>
```

### Catalog (service catalog as code)
```sh
incidentio catalog-types list
incidentio catalog-types create --body-json '{...}'
incidentio catalog-types update-type-schema --id <id> --body-json '{...}'
incidentio catalog-entries list --query catalog_type_id=<id>
incidentio catalog-entries bulk-update-entries --body-json '{...}'
incidentio catalog-resources list
```

### Config (custom fields, severities, types, roles, statuses, timestamps)
```sh
incidentio custom-fields list
incidentio custom-field-options list --query custom_field_id=<id>
incidentio severities list
incidentio incident-types list
incidentio incident-roles list
incidentio incident-statuses list
incidentio incident-timestamps list
```

### Status pages
```sh
# Read (Bearer public API)
incidentio status-pages list
incidentio status-pages show --status-page-id <id>          # includes current_structure
incidentio status-page-incidents list --query status_page_id=<id>
incidentio status-page-maintenances list --query status_page_id=<id>

# Manage the page itself (🍪 internal — the public API cannot create pages/components)
incidentio status-pages create --body-json '{"name":"Acme","subpath":"acme","theme":"light"}'
incidentio status-pages update --status-page-id <id> --body-json '{"name":"Acme","subpath":"acme","support_label":"Report a problem","allow_search_engine_indexing":false}'
incidentio status-page-components create --body-json '{"name":"API","status_page_id":"<id>"}'
incidentio status-page-components delete --id <component-id>
incidentio status-page-structures create --body-json '{"status_page_id":"<id>","items":[
  {"group":{"name":"Core","display_aggregated_uptime":true,"hidden":false,"components":[
    {"component_id":"<id>","display_uptime":true,"hidden":false}]}},
  {"component":{"component_id":"<id>","display_uptime":true,"hidden":false}}]}'

# Audit subscribers / templates (🍪)
incidentio status-page-subscriptions --query status_page_id=<id>
incidentio status-page-templates --query status_page_id=<id>
```

Notes: creating/branding a page and defining its components/layout is **internal-only** (cookie
session); the public Bearer API only lists/shows and publishes incidents/maintenance. Public-page
components are page-native objects (create them, then place them with `status-page-structures`),
not a custom field (that model is for *internal* pages). `theme` is `light`|`dark`. Team plan allows
**one** public page (a second `create` returns `422 exceeded your allowance`). Logo/favicon/brand
color are uploads done in the dashboard.

### Users, teams, API keys, workflows
```sh
incidentio users list --query email=<email>
incidentio users show --id <id>
incidentio teams list
incidentio api-keys list
incidentio api-keys rotate --id <id>
incidentio workflows list
```

### Housekeeping
```sh
incidentio utilities identity              # validate the key + show the identity
incidentio maintenancewindows list
incidentio ipallowlists show
incidentio telemetry update --id <id> --body-json '{...}'
```

## Dashboard / internal API (🍪 — needs a browser session)

These hit `app.incident.io/api/*`, which **rejects API keys** ("Cannot use API keys to
authenticate to internal APIs"). They replay a logged-in browser session. Import one first:

```sh
# devtools → Network → right-click any /api/ request → Copy as cURL
incidentio auth import '<paste curl>'        # or: pbpaste | incidentio auth import
incidentio auth set-org 01G9XY4BZ7YGBPJ3K50NB30YXS   # x-incident-organisation-id (auto-captured from the curl if present)
```

Then commands marked 🍪 in `list` work. Highlights — things the public API can't do:

```sh
incidentio saved-views --query context=incidents     # saved filter views
incidentio insights trends --query start_date=2026-06-01 --query end_date=2026-06-30
incidentio insights custom-dashboards
incidentio policies                                 # policy list
incidentio policy-violations
incidentio incident-timelines timeline --incident-timeline <id>            # full timeline
incidentio incident-timelines activity-log --incident-timeline <id>        # activity log
incidentio debriefs incident-debriefs --query incident_id=<id>
incidentio incident-suggestions for-incident --query incident_id=<id>      # AI suggestions
incidentio postmortems templates --query incident_id=<id>
incidentio schedule-reports
incidentio user-preferences
incidentio identity self                  # who am I + scopes (dashboard identity)
```

A `401 "No authorization material"` on a 🍪 command means the session cookie isn't being
recognized (wrong/expired) — re-import a fresh Copy-as-cURL. Org id resolves `--org` →
`$INCIDENT_ORG_ID` → stored.

## Raw requests & reverse-engineering new endpoints

Not every endpoint is codified. `incidentio raw <METHOD> </path>` hits **any** endpoint with your
stored creds — the fast path for probing and reverse-engineering internal routes:

```sh
incidentio raw GET  /api/status_pages                    # cookie inferred (/api/*)
incidentio raw GET  /v2/incidents --query page_size=1    # bearer inferred (else)
incidentio raw POST /api/status_pages --body-json '{}'   # probe: 422 names required fields
incidentio raw PUT  /api/settings/self --body-json '{...}'   # tune a setting
incidentio raw DELETE /api/status_pages/<id> --auth cookie
```

Auth is inferred (`/api/*` → cookie, otherwise bearer); override with `--auth cookie|bearer`.
Inline any IDs directly in the path (`raw` does no `:param` substitution).

**Codify a new endpoint (recipe):**
1. Probe with an empty/partial body: `incidentio raw POST /api/<thing> --body-json '{}'`.
2. Read the `422 validation_error` — the `source.field` / message names the required fields; retry
   with an intentionally invalid enum value to learn allowed values.
3. Add a `Command` to `src/commands/manual-internal.ts` (it's merged at load time and survives HAR
   regeneration), then `bun run build`.

## Recipes
### Validate your API key
```sh
incidentio utilities identity | jq '.identity'
```

### Open incidents, newest first
```sh
incidentio incidents list --query 'status_category[one_of]=live' \
  | jq '.incidents[] | {id, name, severity: .severity.name, status: .incident_status.name}'
```

### Page through a list (cursor pagination)
`list` responses include a `pagination_meta.after` cursor; pass it back as `--query after=<cursor>`:
```sh
incidentio incidents list --query page_size=250 > first.json
AFTER=$(jq -r '.pagination_meta.after // empty' first.json)
[ -n "$AFTER" ] && incidentio incidents list --query page_size=250 --query "after=$AFTER" > second.json
```

### Declare an incident
```sh
incidentio incidents create --body-json '{
  "name": "API 5xx spike",
  "severity_id": "<sev-id>",
  "summary": "Elevated 5xx from the edge.",
  "visibility": "public"
}' | jq '.incident.id'
```
Need the severity/status IDs first? `incidentio severities list` / `incidentio incident-statuses list`.

### Which verbs does a resource have?
```sh
incidentio list schedules      # shows list/create/show/update/delete + nested schedule-entries/overrides/replicas
```

## Regenerate the command catalog

Commands live in `src/commands/generated.ts`, generated from incident.io's per-tag OpenAPI
specs (fetched live from `docs.incident.io`):

```sh
bun run codegen
```

The generator discovers the REST tag set from `docs.incident.io/llms.txt`, fetches each
`/openapi/tags/<tag>.json`, derives a `<resource> <verb>` name per operation, and resolves
collisions (e.g. `catalog-types update-type` vs `update-type-schema`; `heartbeat ping` vs
`ping-post`). After regenerating, rebuild (`bun run build`).

Dashboard/internal commands are generated from captured browser HAR(s) via `bun run codegen:har
<a.har> [b.har ...]`. It harvests GET **and** write endpoints (POST→`create`, PUT/PATCH→`update`,
DELETE→`delete`), templates ULID/Slack IDs to `:param`, drops anything the public Bearer API already
covers, and **overwrites** `generated-internal.ts` — so pass **every** HAR you want represented in a
single invocation (e.g. `app.incident.io.har app.incident.io2.har app.incident.io3.har`). Hand-verified
internal endpoints that appear in no HAR (e.g. status-page create/update/components/structures) live in
`src/commands/manual-internal.ts` and are merged at load time, so they survive regeneration.

## Common issues

### `not authenticated`
No key found via flag, env, or store. Run `incidentio auth set <key>` or `export INCIDENT_API_KEY=<key>`.

### `HTTP 401` / `HTTP 403` (public/Bearer commands)
The key is invalid/expired, or lacks the scope the endpoint requires (e.g. a read-only key
calling a write verb). Check the key's scopes in **Settings → API keys**; scopes are fixed
at creation — rotate or create a new key if you need more.

### `needs a browser session` / `401 "No authorization material"` (🍪 dashboard commands)
Dashboard commands (`app.incident.io/api/*`) reject API keys. They need a logged-in browser
session: re-import via `incidentio auth import <curl>` (Copy-as-cURL from app.incident.io),
and ensure the org id is set (`auth set-org` or `--org`). HARs from Chrome/Brave usually
strip cookies — use Copy-as-cURL.

### `HTTP 422` with a validation message
The body/query is the wrong shape (missing required field, bad enum, wrong type). The error
body names the offending `source.field` — fix the `--body-json`/`--query`/`--set` value.

### `HTTP 429`
Rate limit (default 1200 req/min/key). The error body includes `rate_limit.retry_after`.
Back off and retry; don't hammer.

### `unknown command`
Commands are `<resource> <verb>`. Run `incidentio list <resource>` to see the exact verbs.
If you typed just the resource, the CLI suggests its verbs. CRUD verbs are collapsed
(`incidents list/create/show/update/delete`); non-CRUD actions keep their name
(`incidents edit`, `escalations cancel-escalation`, `catalog-entries bulk-update-entries`).

### Missing endpoint
The endpoint isn't in the generated catalog. Re-run `bun run codegen` to pick up newly
published incident.io endpoints, then rebuild.
