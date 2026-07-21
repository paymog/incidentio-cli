# incidentio-cli (`incidentio`)

A CLI for the [incident.io](https://incident.io/) API. incident.io has a real public API
keyed by Bearer tokens, so this talks to `api.incident.io` directly — no browser, no cookies.
Every command is **generated from incident.io's official OpenAPI specs**, so the full
documented surface (~179 public endpoints across 53 resources, plus internal dashboard commands) is covered.

## Install

**Homebrew** (no Bun required — installs a prebuilt binary):

```sh
brew install paymog/tap/incidentio   # provides the `incidentio` command
```

**Bun** (if you have [Bun](https://bun.sh) — installs straight from GitHub):

```sh
bun install -g github:paymog/incidentio-cli
```

**From source:**

```sh
bun install
bun run build        # produces ./incidentio for the current platform
bun run build:all    # cross-compile dist/ binaries (darwin/linux, arm64/x64)
```

Or run without building: `bun run src/cli.ts <command>`.

## Auth

Two auth modes — the CLI picks per command automatically:

- **Public API** (`api.incident.io/v*`, Bearer key): most commands. Create a key at
  **Settings → API keys** (`app.incident.io/settings/api-keys`); scopes are fixed at creation.

```sh
incidentio auth set <api-key>     # store it (~/.config/incidentio/creds.json, chmod 600)
incidentio auth status            # show key, session, org
incidentio auth logout            # clear all credentials
```

Resolution: `--api-key <key>` → `$INCIDENT_API_KEY` → stored. For CI, `export INCIDENT_API_KEY=<key>`.

- **Dashboard / internal API** (`app.incident.io/api/*`, browser session): commands marked 🍪
  in `list`. incident.io rejects API keys for these ("Cannot use API keys to authenticate to
  internal APIs"), so they replay a logged-in browser session — saved views, insights,
  policies, incident timelines, AI suggestions, debriefs, and more. Import one:

```sh
# In a logged-in app.incident.io tab: devtools → Network → right-click any /api/ request →
# Copy as cURL. Then:
incidentio auth import '<paste curl>'        # or: pbpaste | incidentio auth import
incidentio auth import ./app.incident.io.har # from a HAR (cookies often stripped — prefer cURL)
incidentio auth set-org 01G9XY4BZ7YGBPJ3K50NB30YXS   # x-incident-organisation-id
```

Org id resolves `--org` → `$INCIDENT_ORG_ID` → stored. A `401` on a 🍪 command means the
session expired — re-import a fresh cookie.

## Usage

```sh
incidentio list [filter]            # list every command (optionally filtered)
incidentio list incidents           # all verbs for a resource
incidentio <resource> <verb> [flags]
```

```sh
incidentio incidents list --query page_size=50
incidentio incidents show --id 01FDAG4SAP5TYPT98WGR2N7W91
incidentio incidents create --body-json '{"name":"...","severity_id":"...","visibility":"public"}'
incidentio users list --query email=alice@example.com
incidentio heartbeat ping --alert-source-config-id 01FCNDV6P870EA6S7TK1DSYDG0
```

### Flags

| Flag | Meaning |
| --- | --- |
| `--api-key <key>` | API key for this call (else `$INCIDENT_API_KEY` or stored) |
| `--<param> <value>` | path params: `--id`, `--user-id`, `--schedule-id`, `--alert-source-config-id` |
| `--query key=value` | query param, repeatable (incl. bracket filters like `status[one_of]=<id>`) |
| `--body-file <path>` | JSON request body from file |
| `--body-json '<json>'` | inline JSON request body |
| `--set a.b=value` | set a body field, repeatable |
| `--raw` | print the raw response, no JSON formatting |

List filters use bracket keys (`status[one_of]`, `severity[gte]`, `created_at[date_range]`);
repeat `--query` for multi-value filters. Output is pretty-printed JSON — pipe to `jq`.

## Regenerate the command catalog

Commands live in `src/commands/generated.ts`, generated from incident.io's per-tag OpenAPI
specs:

```sh
bun run codegen
```

incident.io publishes no single OpenAPI file; instead each resource tag has a full spec at
`docs.incident.io/openapi/tags/<tag>.json`. The generator discovers the tag set from
`docs.incident.io/llms.txt`, fetches each tag spec, and derives a `<resource> <verb>` name per
operation (CRUD verbs collapsed; collisions resolved, e.g. `catalog-types update-type` vs
`update-type-schema`, `heartbeat ping` vs `ping-post`). After regenerating, rebuild.

The internal/dashboard commands live in `src/commands/generated-internal.ts`, generated
from a captured browser HAR of `app.incident.io/api/*`:

```sh
bun run codegen:har ~/Downloads/app.incident.io.har  # one or more HARs
```

These are cookie-authenticated and deduplicated against the public catalog (anything the
public API can do stays Bearer). The HAR only yields endpoint *shapes*; the session is
imported separately via `auth import` (HARs from Chrome/Brave usually strip cookies, so
prefer Copy-as-cURL).

## Claude Code skill

This repo ships a [Claude Code](https://claude.com/claude-code) skill that teaches the agent
to drive `incidentio` (auth, the command surface, bracket filters, and recipes). It lives in
[`skills/incidentio-cli`](skills/incidentio-cli).

Install with [`npx skills`](https://github.com/vercel-labs/skills):

```sh
npx skills add paymog/incidentio-cli            # into ./.claude/skills/
npx skills add paymog/incidentio-cli --global --yes
```

Or manually:

```sh
git clone https://github.com/paymog/incidentio-cli
cp -r incidentio-cli/skills/incidentio-cli ~/.claude/skills/incidentio-cli
```

## Release

Tag-driven. On a `v*` tag, GitHub Actions compiles the four binaries, attaches them to a
GitHub Release, and updates the `incidentio` formula in `paymog/homebrew-tap` (binary
download, no build deps). The tap push uses the `HOMEBREW_TAP_DEPLOY_KEY` secret.

```sh
git tag v0.1.0
git push origin v0.1.0
```

## Shape

- `src/cli.ts` — entry point, arg parsing, command dispatch.
- `src/auth/store.ts` — API key storage + resolution.
- `src/http/client.ts` — request builder, Bearer auth, error handling.
- `src/commands/` — `Command` type and the generated catalog.
- `src/codegen/fromOpenapi.ts` — incident.io OpenAPI specs → command catalog.
