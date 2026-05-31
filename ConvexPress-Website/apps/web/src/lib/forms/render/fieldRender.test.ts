/**
 * Public Forms — RENDERER pure-logic tests.
 * Run: `bun test apps/web/src/lib/forms/render/fieldRender.test.ts`
 *
 * Covers the cleanly-pure renderer helpers extracted from FormRenderer.tsx /
 * FormFieldRenderer.tsx, with emphasis on the client↔server VALUE CONTRACT:
 *   - field-type → input-kind mapping for EVERY supported type (incl. the
 *     form-specific captcha/honeypot/page_break/calculation/product); a type with
 *     NO mapping degrades to "unsupported" and never throws;
 *   - initial-value derivation (defaultValue, then initialValues override);
 *   - visibility application (hidden fields excluded from the render set);
 *   - computed-value application/serialization;
 *   - submit-value SERIALIZATION round-trips against the backend decode contract
 *     (array → JSON, object → JSON, scalar → string) AND the export `decodeCell`.
 *
 * Matcher discipline: ONLY `.toBe` / `.toEqual` (the web bun:test shim has no
 * `.not` / `.toThrow`). "Does not throw" is asserted by catching into a boolean.
 */

import { test, expect } from "bun:test";

import {
  inputKindForFieldType,
  isLayoutValueless,
  isComputedType,
  deriveInitialValues,
  sortByMenuOrder,
  selectVisibleFields,
  serializeComputedValue,
  serializeComputedMap,
  displayValueForField,
  buildSubmitPayload,
  serializeFieldValue,
  parseMultiValue,
  isEmptyForRequired,
  LAYOUT_VALUELESS_TYPES,
  COMPUTED_VALUE_TYPES,
  type RenderFieldDef,
} from "./fieldRender";

const f = (over: Partial<RenderFieldDef> & { key: string; type: string }): RenderFieldDef => over;

// ─── 1. field-type → input-kind mapping (EVERY supported type) ──────────────────

test("input kind: basic/first-class types map correctly", () => {
  expect(inputKindForFieldType("text")).toBe("text");
  expect(inputKindForFieldType("textarea")).toBe("textarea");
  expect(inputKindForFieldType("email")).toBe("email");
  expect(inputKindForFieldType("url")).toBe("url");
  expect(inputKindForFieldType("number")).toBe("number");
  expect(inputKindForFieldType("date_picker")).toBe("date");
  expect(inputKindForFieldType("radio")).toBe("radio");
  expect(inputKindForFieldType("checkbox")).toBe("checkbox");
  expect(inputKindForFieldType("true_false")).toBe("boolean");
});

test("input kind: select resolves single vs multi by `multiple`", () => {
  expect(inputKindForFieldType("select")).toBe("select");
  expect(inputKindForFieldType("select", false)).toBe("select");
  expect(inputKindForFieldType("select", true)).toBe("multiselect");
});

test("input kind: computed types (calculation / product)", () => {
  expect(inputKindForFieldType("calculation")).toBe("calculation");
  expect(inputKindForFieldType("product")).toBe("product");
});

test("input kind: layout + security types are 'layout' (value-less)", () => {
  expect(inputKindForFieldType("message")).toBe("layout");
  expect(inputKindForFieldType("accordion")).toBe("layout");
  expect(inputKindForFieldType("tab")).toBe("layout");
  expect(inputKindForFieldType("page_break")).toBe("layout");
  // The two form-security types MUST classify as layout/value-less, matching the
  // backend — otherwise an empty honeypot would be sent + (if required) block.
  expect(inputKindForFieldType("captcha")).toBe("layout");
  expect(inputKindForFieldType("honeypot")).toBe("layout");
});

test("input kind: known-scalar fallbacks render as text", () => {
  expect(inputKindForFieldType("password")).toBe("text-fallback");
  expect(inputKindForFieldType("color_picker")).toBe("text-fallback");
  expect(inputKindForFieldType("date_time_picker")).toBe("text-fallback");
  expect(inputKindForFieldType("time_picker")).toBe("text-fallback");
  expect(inputKindForFieldType("range")).toBe("text-fallback");
  expect(inputKindForFieldType("oembed")).toBe("text-fallback");
  expect(inputKindForFieldType("button_group")).toBe("text-fallback");
});

test("input kind: an UNMAPPED supported type degrades to 'unsupported', never throws", () => {
  // Compound/relational/content types have no first-class renderer in the public
  // Forms Renderer; they must degrade gracefully (a note), not crash.
  for (const t of [
    "image",
    "file",
    "wysiwyg",
    "gallery",
    "link",
    "post_object",
    "page_link",
    "relationship",
    "taxonomy",
    "user",
    "group",
    "repeater",
    "flexible_content",
  ]) {
    expect(inputKindForFieldType(t)).toBe("unsupported");
  }
});

test("input kind: a totally unknown type degrades to 'unsupported' without throwing", () => {
  let threw = false;
  let kind = "";
  try {
    kind = inputKindForFieldType("totally_made_up_type_xyz");
  } catch {
    threw = true;
  }
  expect(threw).toBe(false);
  expect(kind).toBe("unsupported");
});

test("layout/computed type predicates match the canonical sets", () => {
  expect(isLayoutValueless("honeypot")).toBe(true);
  expect(isLayoutValueless("captcha")).toBe(true);
  expect(isLayoutValueless("page_break")).toBe(true);
  expect(isLayoutValueless("text")).toBe(false);
  expect(isComputedType("calculation")).toBe(true);
  expect(isComputedType("product")).toBe(true);
  expect(isComputedType("number")).toBe(false);
  expect(LAYOUT_VALUELESS_TYPES.has("honeypot")).toBe(true);
  expect(COMPUTED_VALUE_TYPES.has("product")).toBe(true);
});

// ─── 2. initial-value derivation ────────────────────────────────────────────────

test("initial values: seeded from defaultValue, null/absent → empty string", () => {
  const fields = [
    f({ key: "a", type: "text", defaultValue: "hello" }),
    f({ key: "b", type: "text", defaultValue: null }),
    f({ key: "c", type: "text" }),
  ];
  expect(deriveInitialValues(fields)).toEqual({ a: "hello", b: "", c: "" });
});

test("initial values: initialValues OVERRIDE defaultValue (precedence default < initial)", () => {
  const fields = [
    f({ key: "a", type: "text", defaultValue: "seed-a" }),
    f({ key: "b", type: "text", defaultValue: "seed-b" }),
  ];
  expect(deriveInitialValues(fields, { a: "prefill-a" })).toEqual({
    a: "prefill-a",
    b: "seed-b",
  });
});

test("initial values: an initialValues key for a non-field is still applied (resume rehydrate)", () => {
  const fields = [f({ key: "a", type: "text" })];
  expect(deriveInitialValues(fields, { a: "x", extra: "y" })).toEqual({
    a: "x",
    extra: "y",
  });
});

test("initial values: type does not change the seed (computed/layout seeded harmlessly)", () => {
  const fields = [
    f({ key: "calc", type: "calculation", defaultValue: "0" }),
    f({ key: "msg", type: "message" }),
    f({ key: "hp", type: "honeypot" }),
  ];
  expect(deriveInitialValues(fields)).toEqual({ calc: "0", msg: "", hp: "" });
});

// ─── sort by menuOrder ──────────────────────────────────────────────────────────

test("sortByMenuOrder: orders ascending, absent menuOrder treated as 0, no mutation", () => {
  const input = [
    f({ key: "b", type: "text", menuOrder: 2 }),
    f({ key: "a", type: "text", menuOrder: 1 }),
    f({ key: "z", type: "text" }), // absent → 0
  ];
  const out = sortByMenuOrder(input);
  expect(out.map((x) => x.key)).toEqual(["z", "a", "b"]);
  // original array order preserved (pure)
  expect(input.map((x) => x.key)).toEqual(["b", "a", "z"]);
});

// ─── 3. visibility application (hidden fields excluded) ─────────────────────────

const showWhen = (field: string, value: string) =>
  JSON.stringify({
    action: "show",
    logic: "and",
    rules: [{ field, operator: "==", value }],
  });

test("visibility: fields with no logic always render", () => {
  const fields = [
    f({ key: "a", type: "text" }),
    f({ key: "b", type: "text", conditionalLogic: null }),
  ];
  const out = selectVisibleFields(fields, {});
  expect(out.map((x) => x.key)).toEqual(["a", "b"]);
});

test("visibility: a hidden field is EXCLUDED from the render set", () => {
  const fields = [
    f({ key: "plan", type: "text" }),
    f({ key: "pro_only", type: "text", conditionalLogic: showWhen("plan", "pro") }),
  ];
  // plan != pro ⇒ pro_only hidden ⇒ not in the set
  expect(selectVisibleFields(fields, { plan: "basic" }).map((x) => x.key)).toEqual(["plan"]);
  // plan == pro ⇒ pro_only shown
  expect(selectVisibleFields(fields, { plan: "pro" }).map((x) => x.key)).toEqual([
    "plan",
    "pro_only",
  ]);
});

test("visibility: step restriction intersects with the conditional filter", () => {
  const fields = [
    f({ key: "a", type: "text" }),
    f({ key: "b", type: "text" }),
    f({ key: "c", type: "text" }),
  ];
  const step = new Set(["a", "b"]);
  expect(selectVisibleFields(fields, {}, step).map((x) => x.key)).toEqual(["a", "b"]);
  // null/undefined step ⇒ whole form
  expect(selectVisibleFields(fields, {}, null).map((x) => x.key)).toEqual(["a", "b", "c"]);
});

test("visibility: malformed conditional logic fails OPEN (field renders)", () => {
  const fields = [f({ key: "a", type: "text", conditionalLogic: "{not json" })];
  expect(selectVisibleFields(fields, {}).map((x) => x.key)).toEqual(["a"]);
});

// ─── 4. computed-value application + serialization ──────────────────────────────

test("serializeComputedValue: number → its string form, object → JSON", () => {
  expect(serializeComputedValue(42)).toBe("42");
  expect(serializeComputedValue(0)).toBe("0");
  expect(serializeComputedValue({ quantity: 2, lineTotal: 500 })).toBe(
    '{"quantity":2,"lineTotal":500}',
  );
});

test("serializeComputedMap: mirrors FormRenderer's computed overlay", () => {
  expect(
    serializeComputedMap({ subtotal: 1999, line: { quantity: 3, lineTotal: 900 } }),
  ).toEqual({ subtotal: "1999", line: '{"quantity":3,"lineTotal":900}' });
});

test("displayValueForField: computed prefers recomputed value, falls back to stored then ''", () => {
  const calc = f({ key: "total", type: "calculation" });
  expect(displayValueForField(calc, { total: "stale" }, { total: "999" })).toBe("999");
  // computed value absent ⇒ fall back to stored
  expect(displayValueForField(calc, { total: "stale" }, {})).toBe("stale");
  // both absent ⇒ ""
  expect(displayValueForField(calc, {}, {})).toBe("");
});

test("displayValueForField: a normal field always uses the stored value", () => {
  const txt = f({ key: "name", type: "text" });
  // even if a computedValues entry exists for the key, a non-computed field ignores it
  expect(displayValueForField(txt, { name: "Ada" }, { name: "IGNORED" })).toBe("Ada");
  expect(displayValueForField(txt, {}, {})).toBe("");
});

// ─── 5. submit-value selection + SERIALIZATION (backend decode contract) ────────

test("buildSubmitPayload: keys by fieldKey, includes computed, value defaults to ''", () => {
  const visible = [
    f({ key: "name", type: "text" }),
    f({ key: "total", type: "calculation" }),
    f({ key: "missing", type: "text" }),
  ];
  expect(buildSubmitPayload(visible, { name: "Ada", total: "1999" })).toEqual([
    { fieldKey: "name", value: "Ada" },
    { fieldKey: "total", value: "1999" },
    { fieldKey: "missing", value: "" },
  ]);
});

test("buildSubmitPayload: layout + security (value-less) fields are DROPPED", () => {
  const visible = [
    f({ key: "name", type: "text" }),
    f({ key: "msg", type: "message" }),
    f({ key: "acc", type: "accordion" }),
    f({ key: "tab1", type: "tab" }),
    f({ key: "pb", type: "page_break" }),
    f({ key: "cap", type: "captcha" }),
    f({ key: "hp", type: "honeypot" }),
  ];
  // Only the value-bearing `name` survives — captcha/honeypot are NOT sent, even
  // though they're "visible", matching the server which never persists them.
  expect(
    buildSubmitPayload(visible, {
      name: "Ada",
      msg: "x",
      acc: "x",
      tab1: "x",
      pb: "x",
      cap: "x",
      hp: "bot-filled",
    }),
  ).toEqual([{ fieldKey: "name", value: "Ada" }]);
});

test("BUGFIX regression: a honeypot value is NEVER serialized into the payload", () => {
  // Pre-fix, FormRenderer's local LAYOUT_TYPES lacked captcha/honeypot, so a
  // honeypot's value leaked into the payload. This locks the corrected behavior.
  const visible = [f({ key: "website", type: "honeypot" })];
  expect(buildSubmitPayload(visible, { website: "http://spam.example" })).toEqual([]);
});

// serializeFieldValue ↔ backend decode contract -----------------------------------

test("serialize: single-choice (select/radio/button_group) → scalar string", () => {
  expect(serializeFieldValue("select", "pro")).toBe("pro");
  expect(serializeFieldValue("radio", "yes")).toBe("yes");
  expect(serializeFieldValue("button_group", "b")).toBe("b");
});

test("serialize: multi-choice (checkbox) → JSON array string the backend JSON.parses", () => {
  const wire = serializeFieldValue("checkbox", ["a", "b"]);
  expect(wire).toBe('["a","b"]');
  // backend validateCheckbox does JSON.parse + Array.isArray:
  const decoded = JSON.parse(wire);
  expect(Array.isArray(decoded)).toBe(true);
  expect(decoded).toEqual(["a", "b"]);
});

test("serialize: multi-select (select + multiple) → JSON array string", () => {
  expect(serializeFieldValue("select", ["x"], true)).toBe('["x"]');
  // empty selection → "[]" (valid empty array, satisfies validateSelect multiple)
  expect(serializeFieldValue("select", "", true)).toBe("[]");
  expect(serializeFieldValue("checkbox", "", false)).toBe("[]");
});

test("serialize: true_false → '1'/'0' from boolean OR legacy string", () => {
  expect(serializeFieldValue("true_false", true)).toBe("1");
  expect(serializeFieldValue("true_false", false)).toBe("0");
  expect(serializeFieldValue("true_false", "true")).toBe("1");
  expect(serializeFieldValue("true_false", "1")).toBe("1");
  expect(serializeFieldValue("true_false", "0")).toBe("0");
});

test("serialize: scalar text-like → String() passthrough", () => {
  expect(serializeFieldValue("text", "hello")).toBe("hello");
  expect(serializeFieldValue("number", "42")).toBe("42");
  expect(serializeFieldValue("date_picker", "2026-01-15")).toBe("2026-01-15");
  expect(serializeFieldValue("email", "a@b.co")).toBe("a@b.co");
});

test("serialize: an object value (e.g. product line) → JSON string", () => {
  expect(serializeFieldValue("product", JSON.stringify({ quantity: 2 }))).toBe(
    '{"quantity":2}',
  );
});

// parseMultiValue round-trip ------------------------------------------------------

test("parseMultiValue: round-trips serializeFieldValue for multi-choice", () => {
  const wire = serializeFieldValue("checkbox", ["one", "two", "three"]);
  expect(parseMultiValue(wire)).toEqual(["one", "two", "three"]);
});

test("parseMultiValue: malformed/empty → [] (never throws)", () => {
  expect(parseMultiValue("")).toEqual([]);
  expect(parseMultiValue("[]")).toEqual([]);
  expect(parseMultiValue("{not json")).toEqual([]);
  expect(parseMultiValue('{"a":1}')).toEqual([]); // object, not array → []
});

// ─── backend decodeCell contract (downstream of storage) ───────────────────────
// Re-implements the backend `export.ts` decodeCell to lock the contract our
// serialization feeds: array → "; "-joined, object → JSON, scalar → String().

function decodeCell(raw: string | undefined): string {
  if (raw == null) return "";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => (x == null ? "" : String(x))).join("; ");
    }
    if (parsed && typeof parsed === "object") {
      return JSON.stringify(parsed);
    }
    return String(parsed);
  } catch {
    return raw;
  }
}

test("decodeCell contract: our checkbox JSON array decodes to a '; '-joined cell", () => {
  const wire = serializeFieldValue("checkbox", ["red", "blue"]);
  expect(decodeCell(wire)).toBe("red; blue");
});

test("decodeCell contract: a single-choice scalar decodes to itself", () => {
  const wire = serializeFieldValue("select", "pro");
  expect(decodeCell(wire)).toBe("pro");
});

test("decodeCell contract: a product object decodes to its JSON", () => {
  const wire = serializeFieldValue("product", JSON.stringify({ quantity: 2 }));
  expect(decodeCell(wire)).toBe('{"quantity":2}');
});

test("decodeCell contract: a plain text value (non-JSON) decodes to itself", () => {
  expect(decodeCell("hello world")).toBe("hello world");
});

// ─── client required-empty contract ────────────────────────────────────────────

test("isEmptyForRequired: '', '[]', '{}', and whitespace are empty; real values are not", () => {
  expect(isEmptyForRequired("")).toBe(true);
  expect(isEmptyForRequired("   ")).toBe(true);
  expect(isEmptyForRequired("[]")).toBe(true);
  expect(isEmptyForRequired("{}")).toBe(true);
  expect(isEmptyForRequired(undefined)).toBe(true);
  expect(isEmptyForRequired("x")).toBe(false);
  expect(isEmptyForRequired('["a"]')).toBe(false);
  expect(isEmptyForRequired("0")).toBe(false); // a real "0" answer is NOT empty
});
