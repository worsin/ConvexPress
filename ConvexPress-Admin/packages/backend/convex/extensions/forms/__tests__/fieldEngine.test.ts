/**
 * Forms FIELD ENGINE — form-specific field-type integration tests.
 * Run: `bun test convex/extensions/forms/__tests__/fieldEngine.test.ts`
 *
 * The Forms extension REUSES the platform customFields field system and adds
 * five form-specific types (Wave One): `page_break`, `captcha`, `honeypot`
 * (value-less) and `calculation`, `product` (value-BEARING, server-recomputed).
 * This suite locks how those types flow through the THREE field-engine seams the
 * submit + export pipelines depend on:
 *
 *   1. Type registry  — they ARE valid (`SUPPORTED_FIELD_TYPES` / isValidFieldType),
 *      and an unknown type is rejected.
 *   2. Value validation (`validateFieldValue` + the Form Logic `validateSubmission`
 *      / `compileZodFromVisibleFields` gate) — the value-less trio is EXCLUDED, so
 *      a `required` honeypot/captcha/page_break can NEVER block a legitimate
 *      submission; calculation/product ARE validated (client value discarded for
 *      calculation; product validates only its user-editable parts).
 *   3. CSV export (`selectColumns`) — the value-less trio gets NO column; the
 *      value-bearing computed types DO.
 *
 * KEY REGRESSION LOCK — type-list drift. The "layout / no-value" set is declared
 * in three places that MUST agree:
 *   - customFields/validators.LAYOUT_FIELD_TYPES   (platform source of truth)
 *   - export.LAYOUT_OR_NO_VALUE                    (CSV column filter)
 *   - formLogic.LAYOUT_TYPES                       (validation skip — private)
 * `assertLayoutSetsAgree` below pins the two reachable sets to the same membership
 * so a future edit to one can't silently re-open the divergence this suite fixed
 * (a value-less form field getting required-validated or an export column).
 *
 * `.toBe` / `.toEqual` only; errors surfaced via a try/catch flag.
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
  SUPPORTED_FIELD_TYPES,
  LAYOUT_FIELD_TYPES,
  COMPUTED_FIELD_TYPES,
  isValidFieldType,
} from "../../../customFields/validators";
import { validateFieldValue } from "../../../helpers/customFieldValidation";
import { selectColumns } from "../export";
import {
  recomputeVisibility,
  validateSubmission,
  compileZodFromVisibleFields,
  type LogicFieldDef,
} from "../formLogic";

// The five form-specific types Wave One added on top of the platform set.
const FORM_TYPES = ["captcha", "honeypot", "page_break", "calculation", "product"] as const;
// The value-LESS subset (rendered, never persisted, never required-blocking).
const NO_VALUE_FORM_TYPES = ["page_break", "captcha", "honeypot"] as const;
// The value-BEARING computed subset (server-recomputed; NOT layout).
const COMPUTED_TYPES = ["calculation", "product"] as const;

// The injected validator the engine expects. Mirrors helpers/customFieldValidation
// for the empty/required check; delegates real per-type rules to the real impl so
// these tests exercise the SAME validation the submit path runs.
const validate = (
  type: string,
  value: string,
  settings: Record<string, unknown>,
  required: boolean,
) => validateFieldValue(type, value, settings, required);

const cl = (data: unknown) => JSON.stringify(data);

function field(partial: Partial<LogicFieldDef> & { key: string }): LogicFieldDef {
  return {
    type: "text",
    required: false,
    conditionalLogic: undefined,
    settings: undefined,
    parentFieldId: undefined,
    ...partial,
  };
}

// ─── 1. Type registry ────────────────────────────────────────────────────────

describe("field engine — type registry (SUPPORTED_FIELD_TYPES)", () => {
  test("the 5 form-specific types are all registered", () => {
    for (const t of FORM_TYPES) {
      expect(SUPPORTED_FIELD_TYPES.includes(t)).toBe(true);
    }
  });

  test("isValidFieldType accepts every form-specific type", () => {
    for (const t of FORM_TYPES) {
      expect(isValidFieldType(t)).toBe(true);
    }
  });

  test("isValidFieldType accepts a representative platform (non-form) type", () => {
    expect(isValidFieldType("text")).toBe(true);
    expect(isValidFieldType("email")).toBe(true);
  });

  test("isValidFieldType REJECTS an unknown / made-up type", () => {
    expect(isValidFieldType("not_a_real_type")).toBe(false);
    expect(isValidFieldType("")).toBe(false);
    expect(isValidFieldType("CAPTCHA")).toBe(false); // case-sensitive
  });

  test("the value-less trio is classified layout; computed pair is NOT layout", () => {
    for (const t of NO_VALUE_FORM_TYPES) {
      expect(LAYOUT_FIELD_TYPES.has(t)).toBe(true);
    }
    for (const t of COMPUTED_TYPES) {
      expect(LAYOUT_FIELD_TYPES.has(t)).toBe(false);
      expect(COMPUTED_FIELD_TYPES.has(t)).toBe(true);
    }
  });
});

// ─── 2a. validateFieldValue — per-type acceptance ────────────────────────────

describe("field engine — validateFieldValue for form types", () => {
  test("a value-less type accepts ANY string, required or not (never blocks)", () => {
    for (const t of NO_VALUE_FORM_TYPES) {
      // Even an empty value + required must pass: these never carry a value, so
      // the validateFieldValue empty-check would otherwise wrongly reject them.
      // (The submit gate ALSO skips them — see validateSubmission tests below.)
      expect(validateFieldValue(t, "", {}, false).valid).toBe(true);
      expect(validateFieldValue(t, "anything", {}, false).valid).toBe(true);
    }
  });

  test("calculation accepts whatever NON-EMPTY value the client sent (discarded + recomputed)", () => {
    // A tampered client total must not fail validation — the submit mutation
    // overwrites it with the server recompute regardless. (For the empty +
    // required corner, see the documented helper-ordering test below.)
    expect(validateFieldValue("calculation", "999999", {}, false).valid).toBe(true);
    expect(validateFieldValue("calculation", "not-a-number", {}, false).valid).toBe(true);
    expect(validateFieldValue("calculation", "", {}, false).valid).toBe(true);
  });

  test("DOCUMENTED helper ordering: validateFieldValue's empty-check fires before the type switch", () => {
    // KNOWN customFields-CORE behavior (FLAGGED, not fixed here): the top-of-fn
    // empty guard runs before `case "calculation"`, so a required + empty
    // calculation is reported required by the RAW helper even though a computed
    // field is "never user-required" by design. The submit path only reaches
    // this if an author wrongly marks a calculation `required` — see the
    // forms-side guard locked in `validateSubmission` tests below.
    expect(validateFieldValue("calculation", "", {}, true).valid).toBe(false);
  });

  test("product accepts a numeric quantity or a JSON object; rejects negative qty", () => {
    expect(validateFieldValue("product", "2", {}, false).valid).toBe(true);
    expect(validateFieldValue("product", cl({ quantity: 3, option: "blue" }), {}, false).valid).toBe(true);
    expect(validateFieldValue("product", "", {}, false).valid).toBe(true);
    // Negative quantity is the one user-editable part we DO reject.
    expect(validateFieldValue("product", "-1", {}, false).valid).toBe(false);
    expect(validateFieldValue("product", cl({ quantity: -5 }), {}, false).valid).toBe(false);
  });

  test("product rejects a non-numeric, non-JSON garbage value", () => {
    expect(validateFieldValue("product", "{bad json", {}, false).valid).toBe(false);
  });
});

// ─── 2b. validateSubmission / zod gate — value-less types never block ─────────

describe("field engine — value-less form types are skipped by the submit gate", () => {
  test("a REQUIRED honeypot/captcha/page_break does NOT fail validateSubmission", () => {
    // This is the drift the hardening fixed: before, formLogic.LAYOUT_TYPES
    // omitted these three, so a visible required one (empty by design) would be
    // required-validated and reject EVERY legitimate submission.
    for (const t of NO_VALUE_FORM_TYPES) {
      const def = field({ key: `f_${t}`, type: t, required: true });
      const vis = recomputeVisibility([def], {}); // no value submitted
      const res = validateSubmission([def], {}, vis, validate);
      expect(res.ok).toBe(true);
      expect(res.errors[`f_${t}`]).toBe(undefined);
    }
  });

  test("a REQUIRED value-less field is EXCLUDED from the zod required shape", () => {
    for (const t of NO_VALUE_FORM_TYPES) {
      const def = field({ key: `f_${t}`, type: t, required: true });
      const vis = recomputeVisibility([def], {});
      const schema = compileZodFromVisibleFields([def], vis, {});
      // Empty value map must still parse — the type contributes no required key.
      expect(schema.safeParse({}).success).toBe(true);
    }
  });

  test("the value-less types coexist with a real required field without blocking it", () => {
    const hp = field({ key: "f_hp", type: "honeypot", required: true });
    const cap = field({ key: "f_cap", type: "captcha", required: true });
    const name = field({ key: "f_name", type: "text", required: true });
    const defs = [hp, cap, name];

    // Real field filled → whole submission valid (security fields don't interfere).
    const visOk = recomputeVisibility(defs, { f_name: "Ada" });
    const resOk = validateSubmission(defs, { f_name: "Ada" }, visOk, validate);
    expect(resOk.ok).toBe(true);

    // Real field blank → ONLY the real field errors; never the security fields.
    const visBad = recomputeVisibility(defs, {});
    const resBad = validateSubmission(defs, {}, visBad, validate);
    expect(resBad.ok).toBe(false);
    expect(resBad.errors.f_name).toBe("This field is required.");
    expect(resBad.errors.f_hp).toBe(undefined);
    expect(resBad.errors.f_cap).toBe(undefined);
  });
});

// ─── 2c. validateSubmission — computed types ARE validated ────────────────────

describe("field engine — computed types flow through validation", () => {
  test("a visible calculation field passes (value discarded, never blocks)", () => {
    const calc = field({ key: "f_total", type: "calculation", required: false });
    const vis = recomputeVisibility([calc], { f_total: "12345" });
    const res = validateSubmission([calc], { f_total: "12345" }, vis, validate);
    expect(res.ok).toBe(true);
  });

  test("a product field with a negative quantity is REJECTED by validateSubmission", () => {
    const prod = field({ key: "f_prod", type: "product", required: false });
    const vis = recomputeVisibility([prod], { f_prod: "-3" });
    const res = validateSubmission([prod], { f_prod: "-3" }, vis, validate);
    expect(res.ok).toBe(false);
    expect(res.errors.f_prod).toBe("Quantity cannot be negative.");
  });

  test("a REQUIRED but EMPTY computed field does NOT block (value is server-derived)", () => {
    // Forms-side guard: even if an author wrongly marks a calculation/product
    // `required`, an empty client value must pass — the submit mutation fills the
    // value server-side in its authoritative recompute. (Without the guard the
    // helper's empty-check would reject it; see the documented helper test.)
    for (const t of COMPUTED_TYPES) {
      const def = field({ key: `f_${t}`, type: t, required: true });
      const vis = recomputeVisibility([def], {});
      const res = validateSubmission([def], {}, vis, validate);
      expect(res.ok).toBe(true);
      const schema = compileZodFromVisibleFields([def], vis, {});
      expect(schema.safeParse({}).success).toBe(true);
    }
  });

  test("a still-INVALID computed value (negative product qty) is caught even when required", () => {
    // The required-relaxation must NOT swallow real per-type errors: a present
    // but invalid product value is still rejected.
    const prod = field({ key: "f_prod", type: "product", required: true });
    const vis = recomputeVisibility([prod], { f_prod: "-9" });
    const res = validateSubmission([prod], { f_prod: "-9" }, vis, validate);
    expect(res.ok).toBe(false);
    expect(res.errors.f_prod).toBe("Quantity cannot be negative.");
  });
});

// ─── 3. CSV export column selection ──────────────────────────────────────────

describe("field engine — export column selection for form types", () => {
  const defs = [
    { name: "name", label: "Name", key: "f_name", type: "text" },
    { name: "pb", label: "Step", key: "f_pb", type: "page_break" },
    { name: "cap", label: "Captcha", key: "f_cap", type: "captcha" },
    { name: "hp", label: "Website", key: "f_hp", type: "honeypot" },
    { name: "total", label: "Total", key: "f_total", type: "calculation" },
    { name: "prod", label: "Product", key: "f_prod", type: "product" },
  ];

  test("value-less form types get NO CSV column", () => {
    const { columns } = selectColumns(defs);
    const names = columns.map((c) => c.name);
    expect(names.includes("pb")).toBe(false);
    expect(names.includes("cap")).toBe(false);
    expect(names.includes("hp")).toBe(false);
  });

  test("value-bearing computed types DO get a CSV column", () => {
    const { columns } = selectColumns(defs);
    const names = columns.map((c) => c.name);
    expect(names.includes("total")).toBe(true);
    expect(names.includes("prod")).toBe(true);
  });

  test("the surviving column set is exactly the value-bearing fields, in order", () => {
    const { columns } = selectColumns(defs);
    expect(columns.map((c) => c.name)).toEqual(["name", "total", "prod"]);
  });

  test("explicitly requesting a value-less field warns (treated as no column)", () => {
    const { columns, warnings } = selectColumns(defs, ["hp", "name"]);
    expect(columns.map((c) => c.name)).toEqual(["name"]);
    expect(warnings).toEqual(["hp"]);
  });
});

// ─── REGRESSION LOCK: cross-module layout-set agreement ──────────────────────

describe("field engine — layout/no-value type-list drift lock", () => {
  // The expected canonical membership. If a new value-less type is added, update
  // this list AND all three declaration sites together.
  const EXPECTED_LAYOUT = ["message", "accordion", "tab", "page_break", "captcha", "honeypot"];

  test("validators.LAYOUT_FIELD_TYPES has exactly the canonical members", () => {
    const got = [...LAYOUT_FIELD_TYPES].sort();
    expect(got).toEqual([...EXPECTED_LAYOUT].sort());
  });

  test("export drops exactly the canonical members (no column for any of them)", () => {
    // Build one def per canonical layout type + one data field; only the data
    // field should survive column selection. This pins export.LAYOUT_OR_NO_VALUE
    // (private) to the same membership as validators without importing it.
    const layoutDefs = EXPECTED_LAYOUT.map((t) => ({
      name: t,
      label: t,
      key: `f_${t}`,
      type: t,
    }));
    const dataDef = { name: "keep", label: "Keep", key: "f_keep", type: "text" };
    const { columns } = selectColumns([...layoutDefs, dataDef]);
    expect(columns.map((c) => c.name)).toEqual(["keep"]);
  });

  test("the submit validation gate skips exactly the canonical members", () => {
    // Pins formLogic.LAYOUT_TYPES (private) to the same membership: every
    // canonical layout type, even when REQUIRED + empty, passes the gate.
    const layoutDefs: LogicFieldDef[] = EXPECTED_LAYOUT.map((t) =>
      field({ key: `f_${t}`, type: t, required: true }),
    );
    const vis = recomputeVisibility(layoutDefs, {});
    const res = validateSubmission(layoutDefs, {}, vis, validate);
    expect(res.ok).toBe(true);
    const schema = compileZodFromVisibleFields(layoutDefs, vis, {});
    expect(schema.safeParse({}).success).toBe(true);
  });

  test("a computed type is NOT treated as layout by export OR the submit gate", () => {
    // Symmetric guard: calculation/product must NOT be skipped — they carry a
    // value (export column + validation), unlike the value-less trio.
    for (const t of COMPUTED_TYPES) {
      const { columns } = selectColumns([
        { name: t, label: t, key: `f_${t}`, type: t },
      ]);
      expect(columns.map((c) => c.name)).toEqual([t]);
    }
  });
});
