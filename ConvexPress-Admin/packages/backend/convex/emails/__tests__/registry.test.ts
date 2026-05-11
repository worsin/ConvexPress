import { describe, expect, test } from "bun:test";

import { EMAIL_TEMPLATE_REGISTRY, EMAIL_TEMPLATE_REGISTRY_BY_SLUG } from "../registry";
import { DEFAULT_TEMPLATES } from "../templateDefaults";
import {
  GLOBAL_EMAIL_SAMPLE_VARIABLES,
  buildTemplateSampleVariables,
} from "../testData";

describe("email template registry integrity", () => {
  test("registry and defaults stay aligned", () => {
    const defaultSlugs = new Set(DEFAULT_TEMPLATES.map((template) => template.slug));
    const registrySlugs = new Set(EMAIL_TEMPLATE_REGISTRY.map((template) => template.slug));

    expect(defaultSlugs.size).toBe(DEFAULT_TEMPLATES.length);
    expect(registrySlugs.size).toBe(EMAIL_TEMPLATE_REGISTRY.length);
    expect(defaultSlugs.size).toBe(registrySlugs.size);

    for (const slug of defaultSlugs) {
      expect(registrySlugs.has(slug)).toBe(true);
    }

    for (const slug of registrySlugs) {
      expect(defaultSlugs.has(slug)).toBe(true);
    }
  });

  test("every template has canonical metadata and renderable content", () => {
    for (const template of DEFAULT_TEMPLATES) {
      const registryEntry = EMAIL_TEMPLATE_REGISTRY_BY_SLUG[template.slug];

      expect(template.name.length).toBeGreaterThan(0);
      expect(template.description.length).toBeGreaterThan(0);
      expect(template.subjectTemplate.length).toBeGreaterThan(0);
      expect(template.bodyHtml.length).toBeGreaterThan(0);
      expect(template.category.length).toBeGreaterThan(0);
      expect(registryEntry).toBeDefined();
      expect(["event", "direct", "digest", "manual"]).toContain(
        registryEntry.triggerKind,
      );

      if (registryEntry.triggerKind === "event") {
        expect(registryEntry.canonicalEventCode).toBeTruthy();
      }
    }
  });

  test("sample data covers every declared variable", () => {
    for (const template of DEFAULT_TEMPLATES) {
      const variables = buildTemplateSampleVariables(template.availableVariables);

      for (const [key, value] of Object.entries(GLOBAL_EMAIL_SAMPLE_VARIABLES)) {
        expect(typeof variables[key]).toBe("string");
        expect(variables[key].length).toBeGreaterThan(0);
        expect(value.length).toBeGreaterThan(0);
      }

      for (const variable of template.availableVariables) {
        expect(typeof variables[variable.name]).toBe("string");
        expect(variables[variable.name].length).toBeGreaterThan(0);
      }
    }
  });
});
