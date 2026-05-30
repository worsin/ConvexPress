/**
 * Form Logic mirror test (Website copy) — asserts the Website `formLogic.ts`
 * mirror is behaviorally identical to the backend source-of-truth copy.
 * Run: `bun test apps/web/src/lib/forms/formLogic.test.ts`
 *
 * The three formLogic.ts copies are kept byte-identical; this suite is the
 * executable guard that the Website mirror evaluates the same way for
 * cross-field operands, requiredWhen, section scope (including the transitive
 * nested-group cascade), and the submit-trust contract.
 */

import { test, expect } from "bun:test";

import {
  evaluateRuleCF,
  evaluateLogicData,
  isFieldRequired,
  recomputeVisibility,
  validateSubmission,
  compileZodFromVisibleFields,
  detectRuleCycle,
  findDanglingRuleRefs,
  type LogicFieldDef,
} from "./formLogic";

const cl = (data: unknown) => JSON.stringify(data);
const field = (p: Partial<LogicFieldDef> & { key: string }): LogicFieldDef => ({
  type: "text",
  required: false,
  ...p,
});

// Minimal validateFieldValue stub: required + empty => invalid (mirrors the
// backend helpers/customFieldValidation.ts empty-handling contract).
const validate = (
  _t: string,
  v: string,
  _s: Record<string, unknown>,
  required: boolean,
) => {
  const empty = !v || v === "" || v === "[]" || v === "{}";
  return empty && required ? { valid: false, error: "req" } : { valid: true };
};

test("cross-field > comparison", () => {
  const rule = {
    field: "end",
    operator: ">" as const,
    value: "start",
    operandKind: "field" as const,
  };
  expect(evaluateRuleCF(rule, { end: "10", start: "5" })).toBe(true);
  expect(evaluateRuleCF(rule, { end: "1", start: "5" })).toBe(false);
});

test("evaluateLogicData fails open on malformed", () => {
  expect(evaluateLogicData("{bad", {})).toBe(true);
  expect(evaluateLogicData(undefined, {})).toBe(true);
});

test("requiredWhen: hidden never required", () => {
  const f = field({
    key: "x",
    settings: cl({
      requiredWhen: {
        action: "show",
        logic: "and",
        rules: [{ field: "y", operator: "==", value: "1" }],
      },
    }),
  });
  expect(isFieldRequired(f, true, { y: "1" })).toBe(true);
  expect(isFieldRequired(f, false, { y: "1" })).toBe(false);
});

test("section hidden hides descendant", () => {
  const group = field({
    key: "g",
    _id: "g1",
    type: "group",
    conditionalLogic: cl({
      action: "show",
      logic: "and",
      rules: [{ field: "t", operator: "==", value: "yes" }],
    }),
  });
  const child = field({ key: "c", parentFieldId: "g1" });
  const vis = recomputeVisibility([group, child], { t: "no" });
  expect(vis.hiddenFieldKeys.has("c")).toBe(true);
});

test("detectRuleCycle catches 2-node cycle", () => {
  const a = field({
    key: "a",
    conditionalLogic: cl({
      action: "show",
      logic: "and",
      rules: [{ field: "b", operator: "not_empty", value: "" }],
    }),
  });
  const b = field({
    key: "b",
    conditionalLogic: cl({
      action: "show",
      logic: "and",
      rules: [{ field: "a", operator: "not_empty", value: "" }],
    }),
  });
  expect(detectRuleCycle([a, b]) !== null).toBe(true);
});

test("operators: ==, !=, contains, empty, not_empty (cross-field evaluator)", () => {
  expect(evaluateRuleCF({ field: "f", operator: "==", value: "x" }, { f: "x" })).toBe(true);
  expect(evaluateRuleCF({ field: "f", operator: "!=", value: "x" }, { f: "y" })).toBe(true);
  expect(evaluateRuleCF({ field: "f", operator: "contains", value: "ell" }, { f: "hello" })).toBe(true);
  expect(evaluateRuleCF({ field: "f", operator: "contains", value: "ELL" }, { f: "hello" })).toBe(false);
  expect(evaluateRuleCF({ field: "f", operator: "empty", value: "" }, { f: "[]" })).toBe(true);
  expect(evaluateRuleCF({ field: "f", operator: "not_empty", value: "" }, { f: "0" })).toBe(true);
});

test("numeric coercion: empty<5 true, empty>0 false, non-numeric false (no throw)", () => {
  expect(evaluateRuleCF({ field: "f", operator: "<", value: "5" }, {})).toBe(true); // 0 < 5
  expect(evaluateRuleCF({ field: "f", operator: ">", value: "0" }, {})).toBe(false); // 0 > 0
  expect(evaluateRuleCF({ field: "f", operator: ">", value: "5" }, { f: "abc" })).toBe(false); // NaN
  expect(evaluateRuleCF({ field: "f", operator: ">", value: "9" }, { f: "10" })).toBe(true); // numeric not lexical
});

test("and/or + show/hide combinations", () => {
  const two = (logic: "and" | "or", action: "show" | "hide", va: string, vb: string) =>
    evaluateLogicData(
      cl({
        action,
        logic,
        rules: [
          { field: "a", operator: "==", value: "1" },
          { field: "b", operator: "==", value: "2" },
        ],
      }),
      { a: va, b: vb },
    );
  expect(two("and", "show", "1", "2")).toBe(true);
  expect(two("and", "show", "1", "x")).toBe(false);
  expect(two("or", "show", "1", "x")).toBe(true);
  expect(two("and", "hide", "1", "2")).toBe(false); // both match => hidden
  expect(two("or", "hide", "x", "x")).toBe(true); // none match => shown
});

test("legacy fieldKey vs canonical field; field wins when both present", () => {
  expect(evaluateRuleCF({ fieldKey: "f", operator: "==", value: "x" }, { f: "x" })).toBe(true);
  const both = { field: "a", fieldKey: "b", operator: "==" as const, value: "hit" };
  expect(evaluateRuleCF(both, { a: "hit", b: "miss" })).toBe(true);
});

test("enabled:false disables (fail open); absent stays active", () => {
  const dis = field({
    key: "dep",
    conditionalLogic: cl({ enabled: false, rules: [{ field: "t", operator: "==", value: "on" }] }),
  });
  const act = field({
    key: "dep",
    conditionalLogic: cl({ rules: [{ field: "t", operator: "==", value: "on" }] }),
  });
  expect(recomputeVisibility([dis], { t: "off" }).visibleFieldKeys.has("dep")).toBe(true);
  expect(recomputeVisibility([act], { t: "off" }).hiddenFieldKeys.has("dep")).toBe(true);
});

test("malformed / empty logic fails open (visible)", () => {
  expect(evaluateLogicData("{bad", {})).toBe(true);
  expect(evaluateLogicData(cl({ rules: [] }), {})).toBe(true);
  expect(recomputeVisibility([field({ key: "w", conditionalLogic: "{broken" })], {}).visibleFieldKeys.has("w")).toBe(true);
});

test("cross-field operand resolves the named field; absent operand => ''", () => {
  const r = { field: "max", operator: "<" as const, value: "limit", operandKind: "field" as const };
  expect(evaluateRuleCF(r, { max: "3", limit: "5" })).toBe(true);
  expect(evaluateRuleCF({ field: "a", operator: "==", value: "ghost", operandKind: "field" }, { a: "" })).toBe(true);
});

test("nested-section cascade: grandchild under a hidden group is hidden", () => {
  const outer = field({
    key: "o",
    _id: "o",
    type: "group",
    conditionalLogic: cl({ rules: [{ field: "t", operator: "==", value: "yes" }] }),
  });
  const inner = field({ key: "i", _id: "i", type: "group", parentFieldId: "o" });
  const leaf = field({ key: "leaf", parentFieldId: "i" });
  const vis = recomputeVisibility([outer, inner, leaf], { t: "no" });
  expect(vis.hiddenFieldKeys.has("leaf")).toBe(true);
});

test("cyclic group parent chain terminates (no infinite loop)", () => {
  const a = field({ key: "a", _id: "a", type: "group", parentFieldId: "b" });
  const b = field({ key: "b", _id: "b", type: "group", parentFieldId: "a" });
  const vis = recomputeVisibility([a, b], {});
  expect(vis.visibleFieldKeys.size + vis.hiddenFieldKeys.size).toBe(2);
});

test("findDanglingRuleRefs catches a cross-field operand ghost", () => {
  const a = field({
    key: "a",
    conditionalLogic: cl({ rules: [{ field: "a", operator: "==", value: "ghost", operandKind: "field" }] }),
  });
  expect(findDanglingRuleRefs([a])).toEqual([{ fieldKey: "a", missingRef: "ghost" }]);
});

test("submit contract: spoofed value for a server-hidden required field is ignored", () => {
  const hidden = field({
    key: "secret",
    required: true,
    conditionalLogic: cl({ rules: [{ field: "toggle", operator: "==", value: "on" }] }),
  });
  const vis = recomputeVisibility([hidden], { toggle: "off", secret: "spoofed" });
  const res = validateSubmission([hidden], { toggle: "off", secret: "spoofed" }, vis, validate);
  expect(res.ok).toBe(true);
});

test("zod gate: required field rejects [] / {} sentinels, accepts a value", () => {
  const req = field({ key: "tags", required: true });
  const vis = recomputeVisibility([req], {});
  const schema = compileZodFromVisibleFields([req], vis, {});
  expect(schema.safeParse({ tags: "[]" }).success).toBe(false);
  expect(schema.safeParse({ tags: "ok" }).success).toBe(true);
});

// ── Wave-Two: value-less + computed types never block a legitimate submission ──

test("value-less type marked required does NOT block submission (honeypot/captcha/page_break)", () => {
  // A visible honeypot/captcha/page_break flagged `required` is EMPTY by design
  // for a human. It is a LAYOUT_TYPE → skipped entirely, so an empty value must
  // not fail the required check (pre-fix it rejected every legitimate submission).
  for (const t of ["honeypot", "captcha", "page_break"]) {
    const f = field({ key: `vl_${t}`, type: t, required: true });
    const vis = recomputeVisibility([f], {});
    const res = validateSubmission([f], {}, vis, validate);
    expect(res.ok).toBe(true);
  }
});

test("value-less required type is also excluded from the zod gate (no required key)", () => {
  const hp = field({ key: "website", type: "honeypot", required: true });
  const vis = recomputeVisibility([hp], {});
  const schema = compileZodFromVisibleFields([hp], vis, {});
  // Empty payload passes — the honeypot never contributes a required `.min(1)` key.
  expect(schema.safeParse({}).success).toBe(true);
});

test("required computed type with empty client value does NOT block (calculation/product)", () => {
  // A computed field's value is server-recomputed; an empty CLIENT value is
  // expected. Even when wrongly marked `required`, it must not block the submit
  // (the gate forces required=false for COMPUTED_TYPES).
  for (const t of ["calculation", "product"]) {
    const f = field({ key: `c_${t}`, type: t, required: true });
    const vis = recomputeVisibility([f], { [`c_${t}`]: "" });
    const res = validateSubmission([f], { [`c_${t}`]: "" }, vis, validate);
    expect(res.ok).toBe(true);
    // …and the zod gate treats it as optional (empty payload still parses).
    const schema = compileZodFromVisibleFields([f], vis, { [`c_${t}`]: "" });
    expect(schema.safeParse({}).success).toBe(true);
  }
});
