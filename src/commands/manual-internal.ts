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
      'Create a public status page, or a catalog-backed parent page with sub-pages. ' +
      'Simple body: name, subpath, theme ("light"|"dark"), date_view ("weekly"|"daily"). ' +
      'Parent page body adds parent_page_options: {page_type:"parent", ' +
      'split_by_catalog_type_id:"<type-id>", split_by_component_attribute_id:"<attr-id>", ' +
      'sub_pages:[{defined_by_catalog_entry_id:"<entry-id>",name:"...",subpath:"..."}]}. ' +
      'Get catalog type / attribute IDs from `catalog-types show --id <type-id>`. ' +
      'GET /api/status_pages/:id returns current_structure and sub-page definitions.',
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
  // ── Catalog entries (dashboard internal API) ────────────────────────────────
  // The internal path /api/catalog_entries was verified against the dashboard;
  // it requires catalog_type_id, name, external_id, and attribute_values (pass {}
  // when there are no attributes). The public API at /v3/catalog_entries works for
  // simple entries; use these when you need the verified attribute_values contract.
  {
    name: ["catalog-entries", "create-entry"],
    method: "POST",
    path: "/api/catalog_entries",
    pathParams: [],
    query: [],
    auth: "cookie",
    description:
      'Create a catalog entry via the dashboard API (cookie auth). ' +
      'Body (required): catalog_type_id, name, external_id, attribute_values (pass {} when none). ' +
      'Attribute value shapes — plain text: {"<attr-id>":{"value":"text"}}; ' +
      'catalog-relation (array): {"<attr-id>":{"array_value":["<entry-id>",...]}}; ' +
      'intentional clear: {"<attr-id>":{"value":null}}. ' +
      'Attribute IDs come from `catalog-types show --id <type-id>` (.schema.attributes[].id).',
  },
  {
    name: ["catalog-entries", "update-entry"],
    method: "PUT",
    path: "/api/catalog_entries/:id",
    pathParams: ["id"],
    query: [],
    auth: "cookie",
    description:
      'Update a catalog entry via the dashboard API (cookie auth). ' +
      'Body (required): name, attribute_values. Omit null-valued attributes entirely ' +
      '(do not pass {"value":null} — just leave the key out). ' +
      'Attribute value shapes — plain text: {"<attr-id>":{"value":"text"}}; ' +
      'catalog-relation (array): {"<attr-id>":{"array_value":["<entry-id>",...]}}. ' +
      'Use --id for the entry ID.',
  },
  // ── Catalog-backed custom fields (dashboard internal API) ────────────────────
  // The public API at /v2/custom_fields lacks catalog_type_id, condition_groups, and
  // field_mode — use this command to create catalog-backed multi-select fields.
  {
    name: ["custom-fields", "create-catalog-backed"],
    method: "POST",
    path: "/api/custom_fields",
    pathParams: [],
    query: [],
    auth: "cookie",
    description:
      'Create a catalog-backed multi-select custom field via the dashboard API (cookie auth). ' +
      'Body (required): name, description, field_type:"multi_select", catalog_type_id, ' +
      'field_mode:"dashboard", dynamic_options:false, cannot_be_unset:false, options:[], ' +
      'condition_groups:[]. ' +
      'Set dynamic_options:true to auto-populate options from catalog entries. ' +
      'condition_groups controls when the field appears on an incident form. ' +
      'Get catalog_type_id from `catalog-types list`.',
  },
  // ── Alert routes with incident-template custom-field bindings (dashboard) ───
  // The internal /api/alert_routes/:id accepts the full route payload; the key
  // difference from the public PUT is the mandatory version field (optimistic
  // concurrency) and the incident_template.custom_fields binding format below.
  {
    name: ["alert-routes", "show-route"],
    method: "GET",
    path: "/api/alert_routes/:id",
    pathParams: ["id"],
    query: [],
    auth: "cookie",
    description:
      'Show a single alert route via the dashboard API (cookie auth). ' +
      'Returns the full route payload including the current version number, which ' +
      'must be incremented by 1 when updating (see `alert-routes update-route`).',
  },
  {
    name: ["alert-routes", "update-route"],
    method: "PUT",
    path: "/api/alert_routes/:id",
    pathParams: ["id"],
    query: [],
    auth: "cookie",
    description:
      'Update an alert route via the dashboard API (cookie auth). ' +
      'First GET the current route with `alert-routes show-route --id <id>` to capture version. ' +
      'Body: full route payload with version set to current_version + 1 (optimistic concurrency). ' +
      'Incident template custom fields format — ' +
      'incident_template.custom_fields:[{custom_field_id:"<id>",merge_strategy:"first-wins",' +
      'binding:{array_value:[{reference:"",value:"<option-id>",label:"<label>",sort_key:0}]}}]. ' +
      'merge_strategy values: "first-wins" (use first alert match) | "last-wins" | "append".',
  },
];
