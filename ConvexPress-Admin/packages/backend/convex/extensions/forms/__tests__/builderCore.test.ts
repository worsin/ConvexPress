/**
 * ConvexPress Forms — Builder pure-core tests (form CRUD + duplicate remap).
 * Run: `bun test convex/extensions/forms/__tests__/builderCore.test.ts`
 *
 * Covers the pure logic the admin builder mutations (create/update/duplicate/
 * publish/archive) compose, extracted to `builderCore.ts` so it is testable
 * without a Convex ctx:
 *
 *   - slugify / isValidSlug   — normalization, special chars, empty title, bound.
 *   - nextCopySlug            — first free "-copy[-n]" via a taken-predicate,
 *                               collision suffixing, exhaustion fallback.
 *   - normalizeSettings       — default "{}" and JSON validity gate.
 *   - isValidStatusTransition — draft↔published↔archived (no terminal state).
 *   - remapFieldReferences    — the DUPLICATE deep-copy fix: conditionalLogic
 *                               rules (incl. cross-field operand `value`),
 *                               requiredWhen (string + object), calc formulas
 *                               (`{field_key}` leaves, `{row.x}` untouched), and
 *                               `quantityFieldKey` all rewired to NEW keys.
 *
 * Dialect: minimal bun:test — toBe/toEqual + try/catch flags only.
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
  slugify,
  isValidSlug,
  nextCopySlug,
  normalizeSettings,
  isValidStatusTransition,
  remapFieldReferences,
  remapFormulaRefs,
  remapConditionalLogicJson,
  remapSettingsJson,
  SLUG_MAX_LENGTH,
  type FormStatus,
} from "../builderCore";

// ─── slugify / isValidSlug ───────────────────────────────────────────────────

describe("slugify", () => {
  test("lowercases and hyphenates spaces", () => {
    expect(slugify("Contact Us")).toBe("contact-us");
  });

  test("collapses runs of special chars into a single hyphen", () => {
    expect(slugify("Hello,   World!!!  & Friends")).toBe("hello-world-friends");
  });

  test("strips leading and trailing separators", () => {
    expect(slugify("  --Lead Form--  ")).toBe("lead-form");
    expect(slugify("***Pricing***")).toBe("pricing");
  });

  test("keeps digits and underscores collapse to hyphen", () => {
    // Underscore is NOT [a-z0-9] so it becomes a separator.
    expect(slugify("Form_2024 v2")).toBe("form-2024-v2");
  });

  test("empty / all-punctuation title yields empty string", () => {
    expect(slugify("")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("!!!")).toBe("");
    expect(slugify("---")).toBe("");
  });

  test("unicode / non-ascii letters are dropped (ascii-only slug)", () => {
    expect(slugify("Café Résumé")).toBe("caf-r-sum");
  });

  test("bounds the slug to SLUG_MAX_LENGTH chars", () => {
    const long = "a".repeat(200);
    const out = slugify(long);
    expect(out.length).toBe(SLUG_MAX_LENGTH);
  });

  test("isValidSlug reflects presence of an alphanumeric char", () => {
    expect(isValidSlug("Hello World")).toBe(true);
    expect(isValidSlug("!!!")).toBe(false);
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("a")).toBe(true);
  });
});

// ─── nextCopySlug ────────────────────────────────────────────────────────────

describe("nextCopySlug", () => {
  test("returns base-copy when that is free", () => {
    expect(nextCopySlug("contact", () => false, 999)).toBe("contact-copy");
  });

  test("suffixes -2 when base-copy is taken", () => {
    const taken = new Set(["contact-copy"]);
    expect(nextCopySlug("contact", (c) => taken.has(c), 999)).toBe("contact-copy-2");
  });

  test("walks the suffix sequence past multiple collisions", () => {
    const taken = new Set(["contact-copy", "contact-copy-2", "contact-copy-3"]);
    expect(nextCopySlug("contact", (c) => taken.has(c), 999)).toBe("contact-copy-4");
  });

  test("falls back to the fallback suffix when -copy..-99 are all taken", () => {
    // Everything taken → exhaustion path uses the supplied fallback suffix.
    const out = nextCopySlug("x", () => true, 1234567890);
    expect(out).toBe("x-copy-1234567890");
  });

  test("does not consult the predicate for unrelated slugs", () => {
    const probed: string[] = [];
    const out = nextCopySlug(
      "lead",
      (c) => {
        probed.push(c);
        return false;
      },
      999,
    );
    expect(out).toBe("lead-copy");
    expect(probed).toEqual(["lead-copy"]);
  });
});

// ─── normalizeSettings ───────────────────────────────────────────────────────

describe("normalizeSettings", () => {
  test("absent settings default to {}", () => {
    const r = normalizeSettings(undefined);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("{}");
  });

  test("empty string defaults to {}", () => {
    const r = normalizeSettings("");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("{}");
  });

  test("valid JSON passes through unchanged", () => {
    const json = '{"requireLogin":true,"entryLimit":5}';
    const r = normalizeSettings(json);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(json);
  });

  test("malformed JSON is rejected", () => {
    const r = normalizeSettings("{not json");
    expect(r.ok).toBe(false);
  });
});

// ─── isValidStatusTransition ─────────────────────────────────────────────────

describe("isValidStatusTransition", () => {
  const all: FormStatus[] = ["draft", "published", "archived"];

  test("every transition among the three states is allowed (no terminal)", () => {
    for (const from of all) {
      for (const to of all) {
        expect(isValidStatusTransition(from, to)).toBe(true);
      }
    }
  });

  test("idempotent self transitions are allowed", () => {
    expect(isValidStatusTransition("published", "published")).toBe(true);
    expect(isValidStatusTransition("archived", "archived")).toBe(true);
  });

  test("publish, unpublish, archive, restore are all legal", () => {
    expect(isValidStatusTransition("draft", "published")).toBe(true); // publish
    expect(isValidStatusTransition("published", "draft")).toBe(true); // unpublish
    expect(isValidStatusTransition("published", "archived")).toBe(true); // archive
    expect(isValidStatusTransition("archived", "draft")).toBe(true); // restore
  });

  test("an unknown source status is not a valid origin", () => {
    // Defensive: an out-of-union value (cast) returns false, never throws.
    expect(isValidStatusTransition("bogus" as FormStatus, "draft")).toBe(false);
  });
});

// ─── remapFormulaRefs (calc {field_key} leaves) ──────────────────────────────

describe("remapFormulaRefs", () => {
  const map = new Map([
    ["field_price_OLD", "field_price_NEW"],
    ["field_qty_OLD", "field_qty_NEW"],
  ]);

  test("rewrites known {key} refs and leaves operators/literals intact", () => {
    expect(remapFormulaRefs("{field_price_OLD} * {field_qty_OLD} + 5", map)).toBe(
      "{field_price_NEW} * {field_qty_NEW} + 5",
    );
  });

  test("leaves unknown refs untouched (treated as literals)", () => {
    expect(remapFormulaRefs("{field_unknown} + 1", map)).toBe("{field_unknown} + 1");
  });

  test("does not touch {row.x} repeater sub-references", () => {
    expect(remapFormulaRefs("sum({row.lineTotal})", map)).toBe("sum({row.lineTotal})");
  });

  test("tolerates internal whitespace inside the braces (tokenizer trims)", () => {
    expect(remapFormulaRefs("{ field_price_OLD }", map)).toBe("{field_price_NEW}");
  });

  test("empty map is a no-op", () => {
    expect(remapFormulaRefs("{field_price_OLD}", new Map())).toBe("{field_price_OLD}");
  });
});

// ─── remapConditionalLogicJson ───────────────────────────────────────────────

describe("remapConditionalLogicJson", () => {
  const map = new Map([
    ["field_color_OLD", "field_color_NEW"],
    ["field_size_OLD", "field_size_NEW"],
  ]);

  test("remaps canonical rule.field references", () => {
    const json = JSON.stringify({
      action: "show",
      logic: "and",
      rules: [{ field: "field_color_OLD", operator: "==", value: "red" }],
    });
    const out = JSON.parse(remapConditionalLogicJson(json, map) as string);
    expect(out.rules[0].field).toBe("field_color_NEW");
    expect(out.rules[0].value).toBe("red"); // literal operand untouched
  });

  test("remaps the legacy fieldKey alias too", () => {
    const json = JSON.stringify({
      rules: [{ fieldKey: "field_color_OLD", operator: "!=", value: "blue" }],
    });
    const out = JSON.parse(remapConditionalLogicJson(json, map) as string);
    expect(out.rules[0].fieldKey).toBe("field_color_NEW");
  });

  test("remaps the cross-field operand value when operandKind=field", () => {
    const json = JSON.stringify({
      rules: [
        {
          field: "field_color_OLD",
          operator: "==",
          value: "field_size_OLD",
          operandKind: "field",
        },
      ],
    });
    const out = JSON.parse(remapConditionalLogicJson(json, map) as string);
    expect(out.rules[0].field).toBe("field_color_NEW");
    expect(out.rules[0].value).toBe("field_size_NEW"); // operand is a KEY here
  });

  test("does NOT remap value for a literal operand", () => {
    const json = JSON.stringify({
      rules: [
        {
          field: "field_color_OLD",
          operator: "==",
          value: "field_size_OLD", // looks like a key but operandKind is literal
        },
      ],
    });
    const out = JSON.parse(remapConditionalLogicJson(json, map) as string);
    expect(out.rules[0].value).toBe("field_size_OLD");
  });

  test("malformed JSON is returned verbatim (never destroyed)", () => {
    expect(remapConditionalLogicJson("{bad json", map)).toBe("{bad json");
  });

  test("rule-less / non-object JSON returned verbatim", () => {
    const noRules = JSON.stringify({ action: "show" });
    expect(remapConditionalLogicJson(noRules, map)).toBe(noRules);
  });

  test("null/undefined pass through", () => {
    expect(remapConditionalLogicJson(undefined, map)).toBe(undefined);
    expect(remapConditionalLogicJson(null, map)).toBe(null);
  });
});

// ─── remapSettingsJson (requiredWhen + formulas + quantityFieldKey) ──────────

describe("remapSettingsJson", () => {
  const map = new Map([
    ["field_a_OLD", "field_a_NEW"],
    ["field_qty_OLD", "field_qty_NEW"],
  ]);

  test("remaps requiredWhen in string form", () => {
    const rw = JSON.stringify({
      rules: [{ field: "field_a_OLD", operator: "not_empty", value: "" }],
    });
    const settings = JSON.stringify({ requiredWhen: rw });
    const out = JSON.parse(remapSettingsJson(settings, map) as string);
    const innerRw = JSON.parse(out.requiredWhen);
    expect(innerRw.rules[0].field).toBe("field_a_NEW");
  });

  test("remaps requiredWhen in nested object form", () => {
    const settings = JSON.stringify({
      requiredWhen: {
        rules: [{ field: "field_a_OLD", operator: "==", value: "yes" }],
      },
    });
    const out = JSON.parse(remapSettingsJson(settings, map) as string);
    // Object form stays an object.
    expect(out.requiredWhen.rules[0].field).toBe("field_a_NEW");
  });

  test("remaps calc formula and unitPriceFormula leaves", () => {
    const settings = JSON.stringify({
      formula: "{field_a_OLD} * 2",
      unitPriceFormula: "{field_qty_OLD} + 1",
    });
    const out = JSON.parse(remapSettingsJson(settings, map) as string);
    expect(out.formula).toBe("{field_a_NEW} * 2");
    expect(out.unitPriceFormula).toBe("{field_qty_NEW} + 1");
  });

  test("remaps the bare quantityFieldKey", () => {
    const settings = JSON.stringify({ quantityFieldKey: "field_qty_OLD" });
    const out = JSON.parse(remapSettingsJson(settings, map) as string);
    expect(out.quantityFieldKey).toBe("field_qty_NEW");
  });

  test("preserves unrelated settings keys untouched", () => {
    const settings = JSON.stringify({
      formula: "{field_a_OLD}",
      placeholder: "Enter a value",
      maxLength: 50,
    });
    const out = JSON.parse(remapSettingsJson(settings, map) as string);
    expect(out.placeholder).toBe("Enter a value");
    expect(out.maxLength).toBe(50);
    expect(out.formula).toBe("{field_a_NEW}");
  });

  test("settings with no references returns the original string", () => {
    const settings = JSON.stringify({ placeholder: "hi", maxLength: 3 });
    expect(remapSettingsJson(settings, map)).toBe(settings);
  });

  test("malformed JSON returned verbatim", () => {
    expect(remapSettingsJson("{bad", map)).toBe("{bad");
  });

  test("null/undefined pass through", () => {
    expect(remapSettingsJson(undefined, map)).toBe(undefined);
    expect(remapSettingsJson(null, map)).toBe(null);
  });
});

// ─── remapFieldReferences (the duplicate bug-fix integration) ────────────────

describe("remapFieldReferences (duplicate deep-copy fix)", () => {
  test("rewrites BOTH conditionalLogic and settings onto the new keys", () => {
    const keyMap = new Map([
      ["field_trigger_OLD", "field_trigger_NEW"],
      ["field_price_OLD", "field_price_NEW"],
    ]);
    const field = {
      conditionalLogic: JSON.stringify({
        rules: [{ field: "field_trigger_OLD", operator: "==", value: "yes" }],
      }),
      settings: JSON.stringify({ formula: "{field_price_OLD} * 2" }),
    };
    const out = remapFieldReferences(field, keyMap);
    const cl = JSON.parse(out.conditionalLogic as string);
    const settings = JSON.parse(out.settings as string);
    expect(cl.rules[0].field).toBe("field_trigger_NEW");
    expect(settings.formula).toBe("{field_price_NEW} * 2");
  });

  test("a copied field whose refs point at SIBLINGS no longer leaks to originals", () => {
    // Simulate the real duplicate path: two fields copied together, the second
    // referencing the first by KEY. After remap, the reference must point at the
    // COPIED first field, not the original (the bug).
    const keyMap = new Map([
      ["field_country_OLD", "field_country_NEW"],
    ]);
    const dependent = {
      conditionalLogic: JSON.stringify({
        action: "show",
        rules: [{ field: "field_country_OLD", operator: "==", value: "US" }],
      }),
      settings: null,
    };
    const out = remapFieldReferences(dependent, keyMap);
    const cl = JSON.parse(out.conditionalLogic as string);
    // The remapped ref is the NEW key — NOT the original OLD key.
    expect(cl.rules[0].field).toBe("field_country_NEW");
    expect(cl.rules[0].field === "field_country_OLD").toBe(false);
  });

  test("empty keyMap returns the field unchanged (identity)", () => {
    const field = {
      conditionalLogic: JSON.stringify({ rules: [{ field: "x", operator: "==", value: "y" }] }),
      settings: JSON.stringify({ formula: "{x}" }),
    };
    const out = remapFieldReferences(field, new Map());
    expect(out).toBe(field);
  });

  test("fields with no references survive untouched", () => {
    const keyMap = new Map([["field_a_OLD", "field_a_NEW"]]);
    const field = { conditionalLogic: null, settings: JSON.stringify({ placeholder: "x" }) };
    const out = remapFieldReferences(field, keyMap);
    expect(out.conditionalLogic).toBe(null);
    expect(JSON.parse(out.settings as string).placeholder).toBe("x");
  });
});
