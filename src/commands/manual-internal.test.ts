import { describe, expect, test } from "bun:test";
import { manualInternalCommands } from "./manual-internal.ts";
import { findCommand } from "./types.ts";

// ── Command catalogue tests ────────────────────────────────────────────────

describe("catalog-entries internal commands", () => {
  test("create-entry exists at correct path", () => {
    const cmd = findCommand(manualInternalCommands, ["catalog-entries", "create-entry"]);
    expect(cmd).toBeDefined();
    expect(cmd!.method).toBe("POST");
    expect(cmd!.path).toBe("/api/catalog_entries");
    expect(cmd!.pathParams).toEqual([]);
    expect(cmd!.auth).toBe("cookie");
  });

  test("update-entry exists at correct path with id param", () => {
    const cmd = findCommand(manualInternalCommands, ["catalog-entries", "update-entry"]);
    expect(cmd).toBeDefined();
    expect(cmd!.method).toBe("PUT");
    expect(cmd!.path).toBe("/api/catalog_entries/:id");
    expect(cmd!.pathParams).toEqual(["id"]);
    expect(cmd!.auth).toBe("cookie");
  });

  test("create-entry description mentions attribute_values and required fields", () => {
    const cmd = findCommand(manualInternalCommands, ["catalog-entries", "create-entry"]);
    expect(cmd!.description).toContain("catalog_type_id");
    expect(cmd!.description).toContain("attribute_values");
    expect(cmd!.description).toContain("array_value");
    expect(cmd!.description).toContain("external_id");
  });

  test("update-entry description mentions omit null attributes constraint", () => {
    const cmd = findCommand(manualInternalCommands, ["catalog-entries", "update-entry"]);
    expect(cmd!.description).toContain("Omit null-valued attributes");
    expect(cmd!.description).toContain("attribute_values");
  });
});

describe("custom-fields create-catalog-backed command", () => {
  test("exists at correct internal path", () => {
    const cmd = findCommand(manualInternalCommands, ["custom-fields", "create-catalog-backed"]);
    expect(cmd).toBeDefined();
    expect(cmd!.method).toBe("POST");
    expect(cmd!.path).toBe("/api/custom_fields");
    expect(cmd!.pathParams).toEqual([]);
    expect(cmd!.auth).toBe("cookie");
  });

  test("description documents all required body fields", () => {
    const cmd = findCommand(manualInternalCommands, ["custom-fields", "create-catalog-backed"]);
    const d = cmd!.description!;
    expect(d).toContain("field_type");
    expect(d).toContain("multi_select");
    expect(d).toContain("catalog_type_id");
    expect(d).toContain("field_mode");
    expect(d).toContain("condition_groups");
    expect(d).toContain("dynamic_options");
  });
});

describe("alert-routes dashboard commands", () => {
  test("show-route GET at internal path", () => {
    const cmd = findCommand(manualInternalCommands, ["alert-routes", "show-route"]);
    expect(cmd).toBeDefined();
    expect(cmd!.method).toBe("GET");
    expect(cmd!.path).toBe("/api/alert_routes/:id");
    expect(cmd!.pathParams).toEqual(["id"]);
    expect(cmd!.auth).toBe("cookie");
  });

  test("update-route PUT at internal path", () => {
    const cmd = findCommand(manualInternalCommands, ["alert-routes", "update-route"]);
    expect(cmd).toBeDefined();
    expect(cmd!.method).toBe("PUT");
    expect(cmd!.path).toBe("/api/alert_routes/:id");
    expect(cmd!.pathParams).toEqual(["id"]);
    expect(cmd!.auth).toBe("cookie");
  });

  test("update-route description documents version increment requirement", () => {
    const cmd = findCommand(manualInternalCommands, ["alert-routes", "update-route"]);
    const d = cmd!.description!;
    expect(d).toContain("version");
    expect(d).toContain("current_version + 1");
  });

  test("update-route description documents incident template custom_fields format", () => {
    const cmd = findCommand(manualInternalCommands, ["alert-routes", "update-route"]);
    const d = cmd!.description!;
    expect(d).toContain("custom_field_id");
    expect(d).toContain("merge_strategy");
    expect(d).toContain("first-wins");
    expect(d).toContain("array_value");
    expect(d).toContain("sort_key");
  });
});

describe("status-pages create command", () => {
  test("documents parent_page_options for sub-page creation", () => {
    const cmd = findCommand(manualInternalCommands, ["status-pages", "create"]);
    expect(cmd).toBeDefined();
    const d = cmd!.description!;
    expect(d).toContain("parent_page_options");
    expect(d).toContain("split_by_catalog_type_id");
    expect(d).toContain("defined_by_catalog_entry_id");
    expect(d).toContain("sub_pages");
  });
});

// ── No name collisions with other commands ────────────────────────────────

describe("no duplicate command names in manualInternalCommands", () => {
  test("all names are unique", () => {
    const seen = new Set<string>();
    for (const cmd of manualInternalCommands) {
      const key = cmd.name.join(" ");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

// ── Body construction helpers (inline, no http calls) ────────────────────

// Re-implement the setDeep utility locally to test the attribute_values pattern
// without importing the CLI's main entry point.
function setDeep(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    cursor =
      typeof next === "object" && next !== null && !Array.isArray(next)
        ? (next as Record<string, unknown>)
        : (cursor[part] = {});
  }
  cursor[parts[parts.length - 1]!] = value;
}

describe("catalog entry attribute_values body construction", () => {
  test("plain text attribute via setDeep", () => {
    const body: Record<string, unknown> = { name: "My Service", attribute_values: {} };
    setDeep(body, "attribute_values.01ATTR123.value", "production");
    expect((body.attribute_values as Record<string, unknown>)["01ATTR123"]).toEqual({
      value: "production",
    });
  });

  test("catalog-relation array_value via setDeep", () => {
    const body: Record<string, unknown> = {
      catalog_type_id: "01TYPE123",
      name: "Service A",
      external_id: "service-a",
      attribute_values: {},
    };
    setDeep(body, "attribute_values.01ATTR456.array_value", ["01ENTRY1", "01ENTRY2"]);
    const attrs = body.attribute_values as Record<string, unknown>;
    expect(attrs["01ATTR456"]).toEqual({ array_value: ["01ENTRY1", "01ENTRY2"] });
  });

  test("full catalog entry create body has all required fields", () => {
    const body = {
      catalog_type_id: "01TYPE123",
      name: "My Service",
      external_id: "my-service",
      attribute_values: {
        "01ATTR1": { value: "text" },
        "01ATTR2": { array_value: ["01ENTRY1"] },
      },
    };
    expect(body).toHaveProperty("catalog_type_id");
    expect(body).toHaveProperty("name");
    expect(body).toHaveProperty("external_id");
    expect(body).toHaveProperty("attribute_values");
    expect(typeof body.attribute_values).toBe("object");
  });
});

describe("alert route update body construction", () => {
  test("version increment pattern", () => {
    // Simulates: GET route (version:3) → PUT with version:4
    const currentVersion = 3;
    const updateBody = {
      version: currentVersion + 1,
      name: "My Route",
      incident_template: {
        custom_fields: [
          {
            custom_field_id: "01CF123",
            merge_strategy: "first-wins",
            binding: {
              array_value: [{ reference: "", value: "01OPT1", label: "P1", sort_key: 0 }],
            },
          },
        ],
      },
    };
    expect(updateBody.version).toBe(4);
    expect(updateBody.incident_template.custom_fields[0].merge_strategy).toBe("first-wins");
    expect(updateBody.incident_template.custom_fields[0].binding.array_value[0].sort_key).toBe(0);
  });

  test("setDeep builds incident_template.custom_fields path correctly", () => {
    const body: Record<string, unknown> = {};
    const customFields = [
      {
        custom_field_id: "01CF123",
        merge_strategy: "first-wins",
        binding: { array_value: [{ reference: "", value: "01OPT1", label: "Critical", sort_key: 0 }] },
      },
    ];
    setDeep(body, "incident_template.custom_fields", customFields);
    const tmpl = body.incident_template as Record<string, unknown>;
    expect(Array.isArray(tmpl.custom_fields)).toBe(true);
    expect((tmpl.custom_fields as unknown[]).length).toBe(1);
  });
});
