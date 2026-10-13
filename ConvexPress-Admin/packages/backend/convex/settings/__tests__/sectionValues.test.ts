import { describe, expect, test } from "bun:test";
import { validate } from "convex-helpers/validators";

import { SECTION_NAMES } from "../defaults";
import {
  SECTION_VALUE_VALIDATORS,
  anySectionValuesValidator,
  readSectionValues,
  sectionWithMetaValidator,
} from "../sectionValues";
import { boundedJsonValidator, toBoundedJson } from "../../helpers/jsonValue";

const meta = { _id: null, updatedAt: null, updatedBy: null };

describe("settings section values", () => {
  test("every section's defaults satisfy its validator and the shared unions", () => {
    for (const section of SECTION_NAMES) {
      const values = readSectionValues(section, undefined);
      expect(validate(SECTION_VALUE_VALIDATORS[section], values)).toBe(true);
      expect(validate(anySectionValuesValidator, values)).toBe(true);
      expect(validate(sectionWithMetaValidator, { ...values, ...meta })).toBe(true);
    }
  });

  test("stored values are read at the declared type", () => {
    const general = readSectionValues("general", {
      siteTitle: "Stored title",
      weekStartsOn: "monday",
      legacyKey: "dropped",
      logoUrl: "https://example.test/logo.png",
    });
    expect(general.siteTitle).toBe("Stored title");
    expect(general.weekStartsOn).toBe(0);
    expect(general.logoUrl).toBe("https://example.test/logo.png");
    expect(general).not.toHaveProperty("legacyKey");
    expect(general).not.toHaveProperty("siteLogo");
    expect(validate(SECTION_VALUE_VALIDATORS.general, general)).toBe(true);
  });

  test("nested objects fall back field by field", () => {
    const header = readSectionValues("header", {
      layout: { style: "centered", sticky: "sometimes" },
      navigation: { enabled: false, menuSource: "custom", style: "pills", dropdownStyle: "mega" },
    });
    expect(header.layout.style).toBe("centered");
    expect(header.layout.sticky).toBe("always");
    expect(header.layout.height).toBe("normal");
    expect(header.navigation).toEqual({ enabled: false, menuSource: "custom", style: "pills", dropdownStyle: "mega" });
    expect(validate(SECTION_VALUE_VALIDATORS.header, header)).toBe(true);
  });

  test("footer rows keep valid cells and drop unreadable ones", () => {
    const footer = readSectionValues("footer", {
      rows: [
        {
          id: "row-1",
          background: "muted",
          padding: "normal",
          container: "default",
          staleRowKey: true,
          columns: [
            { id: "c1", cell: { type: "text", body: "Hello", staleCellKey: 1 } },
            { id: "c2", cell: { type: "unknown" } },
            {
              id: "c3",
              cell: { type: "links", heading: "Links", items: [{ label: "Home", url: "/" }, { label: 3 }] },
            },
          ],
        },
        { id: "row-2" },
      ],
    });
    expect(footer.rows).toHaveLength(1);
    expect(footer.rows[0].columns).toEqual([
      { id: "c1", cell: { type: "text", body: "Hello" } },
      { id: "c3", cell: { type: "links", heading: "Links", items: [{ label: "Home", url: "/" }] } },
    ]);
    expect(validate(SECTION_VALUE_VALIDATORS.footer, footer)).toBe(true);
  });

  test("plugin flags include registry flags and drop non-boolean values", () => {
    const plugins = readSectionValues("plugins", { knowledgeBaseEnabled: false, commerceEnabled: "yes", label: "x" });
    expect(plugins.knowledgeBaseEnabled).toBe(false);
    expect(plugins.commerceEnabled).toBe(false);
    expect(plugins).not.toHaveProperty("label");
    expect(validate(SECTION_VALUE_VALIDATORS.plugins, plugins)).toBe(true);
  });

  test("template customize values keep JSON and drop keys Convex records reject", () => {
    const template = readSectionValues("appearance.template", {
      active: "core",
      overrides: { "shop.catalog": "journal" },
      variants: {},
      settings: { core: { colors: { primary: "#000", _private: "x" }, footer: { rows: [{ id: "r", columns: [] }] } } },
    });
    expect(template.settings.core.colors).toEqual({ primary: "#000" });
    expect(template.settings.core.footer).toEqual({ rows: [{ id: "r", columns: [] }] });
    expect(validate(SECTION_VALUE_VALIDATORS["appearance.template"], template)).toBe(true);
  });
});

describe("bounded JSON", () => {
  test("values deeper than the bound are kept as JSON text", () => {
    const value = { a: { b: { c: [1, { d: true }] } }, _hidden: 1, list: [undefined, 2n] };
    const bounded = toBoundedJson(value, 3);
    expect(bounded).toEqual({ a: { b: { c: '[1,{"d":true}]' } }, list: [null, "2"] });
    expect(validate(boundedJsonValidator(3), bounded)).toBe(true);
  });
});
