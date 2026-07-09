import type { Command } from "./types.ts";

// Hand-curated internal (cookie) endpoints, reverse-engineered against
// app.incident.io/api/*. These live here (NOT in generated-internal.ts) because
// `bun run codegen:har` only emits GET endpoints that appear in a captured HAR —
// write endpoints (POST/PUT/DELETE) and anything not exercised in the HAR would be
// dropped on regeneration. Keep verified-by-hand endpoints in this file so they
// survive codegen.
//
// How these were found: hit the endpoint with an empty/partial body and read the
// 422 `validation_error` response, which names the required fields. See the skill's
// "Reverse-engineering new endpoints" recipe, or just use `incidentio raw`.
//
// Verified 2026-07-09 against org `goldsky` while standing up the public status page
// (INFRA-5001). The public Bearer API only lists/shows status pages and publishes
// incidents/maintenance — creating a page and its components/layout is internal-only.
export const manualInternalCommands: Command[] = [
  {
    name: ["status-pages", "create"],
    method: "POST",
    path: "/api/status_pages",
    pathParams: [],
    query: [],
    auth: "cookie",
    description:
      'Create a public status page. Body: name, subpath, theme ("light"|"dark").',
  },
  {
    name: ["status-pages", "update"],
    method: "PUT",
    path: "/api/status_pages/:status_page_id",
    pathParams: ["status_page_id"],
    query: [],
    auth: "cookie",
    description:
      "Update a status page. Body (required): name, subpath, support_label, allow_search_engine_indexing; plus optionals theme, date_view, display_uptime_mode, template_mode, *_disabled flags.",
  },
  {
    name: ["status-page-components", "create"],
    method: "POST",
    path: "/api/status_page_components",
    pathParams: [],
    query: [],
    auth: "cookie",
    description: "Create a status page component. Body: name, status_page_id.",
  },
  {
    name: ["status-page-components", "delete"],
    method: "DELETE",
    path: "/api/status_page_components/:id",
    pathParams: ["id"],
    query: [],
    auth: "cookie",
    description: "Delete a status page component (204 on success).",
  },
  {
    name: ["status-page-structures", "create"],
    method: "POST",
    path: "/api/status_page_structures",
    pathParams: [],
    query: [],
    auth: "cookie",
    description:
      'Set a status page\'s layout. Body: status_page_id, items[] where each item is { "component": { component_id, display_uptime, hidden } } or { "group": { name, display_aggregated_uptime, hidden, components: [{ component_id, display_uptime, hidden }] } }.',
  },
];
