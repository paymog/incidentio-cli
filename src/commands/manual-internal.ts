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
    name: ["status-pages", "update-summary-api"],
    method: "POST",
    path: "/api/status_pages/:status_page_id/action/update_summary_api",
    pathParams: ["status_page_id"],
    query: [],
    auth: "cookie",
    description:
      "Enable/disable the Widget API for a status page. Body: { expose_status_summary_api: true|false }. " +
      "When enabled, exposes an unauthenticated public summary of system status at <page-url>/api/v1/summary " +
      "(a parent page returns every sub-page under `subpages`; append a sub-page slug for one sub-page). " +
      "NOTE: the general `status-pages update` PUT silently ignores expose_status_summary_api (and other toggle " +
      "fields) \u2014 it only writes name/subpath/support_label/allow_search_engine_indexing. Use this action endpoint.",
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
  // The internal /api/alert_routes/:id accepts the full route payload; key
  // differences from the public PUT:
  //   1. Mandatory `version` field (optimistic concurrency) — must be current+1.
  //   2. escalation_config.escalation_targets entries must NOT include the `users`
  //      member; the GET payload has an invalid users binding the PUT rejects.
  //      The API silently restores `users` after a successful PUT.
  //   3. incident_template.custom_fields supports two binding modes:
  //      a) Static option: {custom_field_id,merge_strategy,binding:{array_value:[{reference:"",value:"<opt-id>",label,sort_key}]}}
  //      b) Expression reference: {custom_field_id,merge_strategy,binding:{array_value:[{reference:"expressions[\"<expr-ref>\"]"}]}}
  //   4. Expressions are declared in the route-level `expressions` array and used
  //      by reference in custom-field bindings (see `alert-routes update-route-expr`).
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
      'must be incremented by 1 when updating (see `alert-routes update-route`). ' +
      'NOTE: the returned escalation_config.escalation_targets entries contain a ' +
      '`users` field that the PUT endpoint rejects — omit it when building the update body.',
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
      'First GET with `alert-routes show-route --id <id>` to capture the current version. ' +
      'Body: full route payload with version = current_version + 1 (optimistic concurrency). ' +
      'REQUIRED: omit the `users` key from every entry in escalation_config.escalation_targets; ' +
      'the GET payload carries an invalid users binding the PUT endpoint rejects (API restores it). ' +
      'Static custom-field binding: ' +
      'incident_template.custom_fields:[{custom_field_id:"<id>",merge_strategy:"first-wins",' +
      'binding:{array_value:[{reference:"",value:"<option-id>",label:"<label>",sort_key:0}]}}]. ' +
      'Expression-reference binding (see update-route-expr for the full expression pattern): ' +
      'incident_template.custom_fields:[{custom_field_id:"<id>",merge_strategy:"first-wins",' +
      'binding:{array_value:[{reference:"expressions[\\"<expr-ref>\\"]"}]}}]. ' +
      'merge_strategy values: "first-wins" | "last-wins" | "append".',
  },
  // ── Alert route catalog navigation expression (dashboard) ───────────────────
  // Verified: a navigation expression in the route's `expressions` array can derive
  // a component array by navigating from an alert Service attribute through the
  // catalog "Components" relationship. This is the only way to auto-populate the
  // Affected Components custom field from alert metadata without a static option list.
  //
  // The `expressions` array is part of the standard PUT /api/alert_routes/:id body;
  // this command documents the exact expression shape and binding pattern.
  {
    name: ["alert-routes", "update-route-expr"],
    method: "PUT",
    path: "/api/alert_routes/:id",
    pathParams: ["id"],
    query: [],
    auth: "cookie",
    description:
      'Update an alert route adding a catalog navigation expression that derives component ' +
      'entries from an alert Service attribute, then binds the result to an incident custom field. ' +
      'Same PUT endpoint as update-route; same version+1 and users-omission rules apply. ' +
      'Add an entry to the route body\'s top-level `expressions` array: ' +
      '{id:"<expr-id>",label:"<label>",reference:"<ref>", ' +
      'returns:{type:"CatalogEntry[\\"<component-type-id>\\"]",array:true}, ' +
      'root_reference:"alert.attributes.<service-alert-attribute-id>", ' +
      'operations:[{operation_type:"navigate", ' +
      'returns:{type:"CatalogEntry[\\"<component-type-id>\\"]",array:true}, ' +
      'navigate:{reference:"catalog_attribute[\\"components\\"]",reference_label:"Components"}}]}. ' +
      'Then bind it in incident_template.custom_fields: ' +
      '{custom_field_id:"<affected-components-field-id>",merge_strategy:"first-wins", ' +
      'binding:{array_value:[{reference:"expressions[\\"<ref>\\"]"}]}}. ' +
      'Get service-alert-attribute-id from the alert source\'s attribute list; ' +
      'get component-type-id from `catalog-types list`. ' +
      'After a successful PUT the API echoes the expressions array with the expression intact.',
  },

  // ── Secrets store (dashboard internal API, changelog 2026-07-21) ────────────
  // Public Bearer API mirrors these at /v2/secrets (secrets list/create/show/
  // update/delete/rotate). Internal paths are identical shapes and useful when
  // only a dashboard session is available. Value is write-only — responses expose
  // last_four_chars + version history, never the secret itself.
  // Create body: {name, value, description?, owning_team_ids?}.
  // Update body: {name, description?, owning_team_ids?} (no value — use rotate).
  // Rotate body: {value} → bumps version, keeps name.
  // description is a TextDocument on some code paths; omit it (public API accepts
  // plain string; internal create without description works).
  {
    name: ["secrets", "list-internal"],
    method: "GET",
    path: "/api/secrets",
    pathParams: [],
    query: ["page_size", "after", "team_ids"],
    auth: "cookie",
    description:
      "List organisation/team secrets via dashboard API (name, version, last_four_chars, owning_team_ids). " +
      "Filter with --query team_ids=<id>. Prefer public `secrets list` with a Bearer key when available.",
  },
  {
    name: ["secrets", "show-internal"],
    method: "GET",
    path: "/api/secrets/:id",
    pathParams: ["id"],
    query: [],
    auth: "cookie",
    description:
      "Show a secret + full version history (version, last_four_chars, created_by, created_at). " +
      "Never returns the secret value.",
  },
  {
    name: ["secrets", "create-internal"],
    method: "POST",
    path: "/api/secrets",
    pathParams: [],
    query: [],
    auth: "cookie",
    description:
      'Create a secret. Body: {name, value, owning_team_ids?}. ' +
      "Value is write-only. Response: secret {id,name,version,last_four_chars,owning_team_ids}.",
  },
  {
    name: ["secrets", "update-internal"],
    method: "PUT",
    path: "/api/secrets/:id",
    pathParams: ["id"],
    query: [],
    auth: "cookie",
    description:
      "Update secret metadata. Body: {name, owning_team_ids?}. Does not change the value — use rotate.",
  },
  {
    name: ["secrets", "rotate-internal"],
    method: "POST",
    path: "/api/secrets/:id/actions/rotate",
    pathParams: ["id"],
    query: [],
    auth: "cookie",
    description:
      "Rotate a secret to a new value (bumps version). Body: {value}. " +
      "Prior versions remain in show.versions for audit; value itself is never returned.",
  },
  {
    name: ["secrets", "delete-internal"],
    method: "DELETE",
    path: "/api/secrets/:id",
    pathParams: ["id"],
    query: [],
    auth: "cookie",
    description: "Delete a secret and its version history.",
  },

  // ── Workflows (dashboard internal API, changelog 2026-07-21) ────────────────
  // Public Bearer CRUD exists at /v2/workflows. The dashboard API is richer:
  //   - GET /api/workflows/triggers lists every trigger name (incl. new
  //     alert.updated / alert.attached / scheduled).
  //   - GET show expands webhook.send step params: headers type
  //     TemplatedText["plain_single_line_with_secrets"], plus signing_secret
  //     (type Secret), generated_signing_secret, signature_header_name.
  //   - POST body is split: top-level `trigger` (string name) + `workflow` object
  //     (name, once_for, condition_groups, steps, expressions, state, ...).
  //     Trigger is NOT inside workflow. once_for is an array of engine keys
  //     (e.g. ["alert"] or ["incident","alert.id"]).
  {
    name: ["workflows", "triggers"],
    method: "GET",
    path: "/api/workflows/triggers",
    pathParams: [],
    query: [],
    auth: "cookie",
    description:
      "List workflow triggers. Notable names: alert.updated (alert created/changed), " +
      "alert.attached, scheduled (recurring), incident.updated, manual, escalation.created, ... " +
      "Each entry: {name, label, icon, group_label}.",
  },
  {
    name: ["workflows", "list-internal"],
    method: "GET",
    path: "/api/workflows",
    pathParams: [],
    query: [],
    auth: "cookie",
    description:
      "List workflows via the dashboard API (slim steps). Prefer public `workflows list` with Bearer when available.",
  },
  {
    name: ["workflows", "show-internal"],
    method: "GET",
    path: "/api/workflows/:id",
    pathParams: ["id"],
    query: [],
    auth: "cookie",
    description:
      "Show a workflow with full step param schemas. webhook.send exposes: endpoint, method, " +
      'headers (TemplatedText plain_single_line_with_secrets — secret refs allowed), body, ' +
      "signing_secret (type Secret — org secret id or generated), generated_signing_secret, " +
      "signature_header_name (HMAC-SHA256 header).",
  },
  {
    name: ["workflows", "create-internal"],
    method: "POST",
    path: "/api/workflows",
    pathParams: [],
    query: [],
    auth: "cookie",
    description:
      'Create a workflow. Body shape differs from the public API: ' +
      '{trigger:"<trigger-name>", workflow:{name, once_for, condition_groups, steps, expressions, ' +
      'runs_on_incident_modes, continue_on_step_error, runs_on_incidents, state, private_incident_scope, ...}}. ' +
      '`trigger` is TOP-LEVEL (not inside workflow). once_for is engine keys e.g. ["alert"] or ["incident"]. ' +
      'New triggers: "alert.updated", "alert.attached", "scheduled". ' +
      'Webhook step name "webhook.send"; bind signing via param_bindings on signing_secret / ' +
      "generated_signing_secret / signature_header_name. state: active|disabled|draft|error.",
  },
  {
    name: ["workflows", "delete-internal"],
    method: "DELETE",
    path: "/api/workflows/:id",
    pathParams: ["id"],
    query: [],
    auth: "cookie",
    description: "Delete a workflow via the dashboard API.",
  },

  // ── Policies: run on private incidents (changelog 2026-07-21) ───────────────
  // GET /api/policies already generated. New field run_on_private_incidents (bool,
  // default false). PUT accepts a simplified write shape — subjects/operations are
  // bare strings (references/values), not the expanded GET objects.
  {
    name: ["policies", "update"],
    method: "PUT",
    path: "/api/policies/:id",
    pathParams: ["id"],
    query: [],
    auth: "cookie",
    description:
      "Update a policy, including run_on_private_incidents. Required body: " +
      "enabled, name, description, policy_type, conditions, requirements; optional " +
      "run_on_private_incidents (bool, default false), due_date_config (required for follow_up type). " +
      "Write shape differs from GET: each condition uses subject:<reference string>, " +
      'operation:<value string>, param_bindings:[{value:{literal}}|{array_value:[{literal}]}]. ' +
      'due_date_config: {incident_timestamp_id, days:{value:{literal:"<n>"}}, calculation_type}. ' +
      "GET first, simplify subjects/operations to strings, flip run_on_private_incidents, PUT back.",
  },
];
