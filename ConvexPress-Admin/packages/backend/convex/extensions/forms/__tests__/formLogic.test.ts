/**
 * Form Logic & Validation — pure engine tests (backend source-of-truth copy).
 * Run: `bun test convex/extensions/forms/__tests__/formLogic.test.ts`
 *
 * Covers the contract the submit mutation depends on:
 *   - cross-field operands (operandKind:"field"); absent kind = literal;
 *   - NaN cross-field compare = false (no throw);
 *   - requiredWhen: visible required only on trigger match; hidden never required;
 *   - section (`group`) hidden hides descendants, overriding inner field rules;
 *   - page marker hidden (inert until markers exist);
 *   - recomputeVisibility / validateSubmission server-trust adversarial cases;
 *   - zod gate flips ok independently;
 *   - detectRuleCycle + findDanglingRuleRefs authoring guards.
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
  resolveOperand,
  evaluateRuleCF,
  evaluateLogicData,
  isFieldRequired,
  evaluateSectionVisibility,
  evaluatePageVisibility,
  recomputeVisibility,
  validateSubmission,
  compileZodFromVisibleFields,
  detectRuleCycle,
  findDanglingRuleRefs,
  type LogicFieldDef,
  type ConditionalOperator as ConditionalOperatorT,
} from "../formLogic";

// Minimal validateFieldValue stub matching helpers/customFieldValidation.ts:
// required + empty => invalid; everything else valid (structural-only here).
const validate = (
  _type: string,
  value: string,
  _settings: Record<string, unknown>,
  required: boolean,
) => {
  const empty = !value || value === "" || value === "[]" || value === "{}";
  if (empty && required) return { valid: false, error: "This field is required." };
  return { valid: true };
};

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

describe("cross-field operands", () => {
  test("operandKind:field compares against another field's value", () => {
    const rule = {
      field: "end",
      operator: ">" as const,
      value: "start",
      operandKind: "field" as const,
    };
    expect(evaluateRuleCF(rule, { end: "10", start: "5" })).toBe(true);
    expect(evaluateRuleCF(rule, { end: "3", start: "5" })).toBe(false);
  });

  test("absent operandKind = literal", () => {
    expect(resolveOperand({ field: "a", operator: "==", value: "x" }, {})).toBe("x");
    expect(
      resolveOperand(
        { field: "a", operator: "==", value: "b", operandKind: "field" },
        { b: "y" },
      ),
    ).toBe("y");
  });

  test("NaN cross-field compare = false, no throw", () => {
    const rule = {
      field: "end",
      operator: ">" as const,
      value: "start",
      operandKind: "field" as const,
    };
    expect(evaluateRuleCF(rule, { end: "abc", start: "5" })).toBe(false);
  });

  test("evaluateLogicData honors action/logic with cross-field rules", () => {
    const logic = cl({
      action: "show",
      logic: "and",
      rules: [
        { field: "end", operator: ">", value: "start", operandKind: "field" },
      ],
    });
    expect(evaluateLogicData(logic, { end: "10", start: "5" })).toBe(true);
    expect(evaluateLogicData(logic, { end: "1", start: "5" })).toBe(false);
  });
});

describe("conditional-required (requiredWhen)", () => {
  const f = field({
    key: "reason",
    settings: cl({
      requiredWhen: {
        action: "show",
        logic: "and",
        rules: [{ field: "status", operator: "==", value: "other" }],
      },
    }),
  });

  test("visible field required only when trigger matches", () => {
    expect(isFieldRequired(f, true, { status: "other" })).toBe(true);
    expect(isFieldRequired(f, true, { status: "open" })).toBe(false);
  });

  test("hidden field never required", () => {
    expect(isFieldRequired(f, false, { status: "other" })).toBe(false);
  });

  test("static required still required when visible", () => {
    const r = field({ key: "name", required: true });
    expect(isFieldRequired(r, true, {})).toBe(true);
    expect(isFieldRequired(r, false, {})).toBe(false);
  });
});

describe("section + page scope", () => {
  test("hidden group hides descendants, overriding inner field rule", () => {
    const group = field({
      key: "billing",
      _id: "grp1",
      type: "group",
      conditionalLogic: cl({
        action: "show",
        logic: "and",
        rules: [{ field: "same_as_shipping", operator: "==", value: "no" }],
      }),
    });
    // Child says show-always (its own rule passes), but parent group is hidden.
    const child = field({
      key: "billing_zip",
      parentFieldId: "grp1",
      conditionalLogic: cl({
        action: "show",
        logic: "and",
        rules: [{ field: "country", operator: "==", value: "US" }],
      }),
    });
    const defs = [group, child];
    const vis = recomputeVisibility(defs, {
      same_as_shipping: "yes", // group hidden
      country: "US", // child's own rule would show
    });
    expect(vis.hiddenFieldKeys.has("billing_zip")).toBe(true);
    expect(vis.visibleFieldKeys.has("billing_zip")).toBe(false);
  });

  test("group visible => child follows its own rule", () => {
    const group = field({ key: "g", _id: "grp1", type: "group" });
    const child = field({ key: "c", parentFieldId: "grp1" });
    const vis = recomputeVisibility([group, child], {});
    expect(vis.visibleFieldKeys.has("c")).toBe(true);
  });

  test("evaluateSectionVisibility reads the group's own logic", () => {
    const group = field({
      key: "g",
      type: "group",
      conditionalLogic: cl({
        action: "show",
        logic: "and",
        rules: [{ field: "x", operator: "==", value: "1" }],
      }),
    });
    expect(evaluateSectionVisibility(group, { x: "1" })).toBe(true);
    expect(evaluateSectionVisibility(group, { x: "0" })).toBe(false);
  });

  test("absent page marker = visible (inert)", () => {
    expect(evaluatePageVisibility(undefined, {})).toBe(true);
    expect(evaluatePageVisibility({ settings: undefined }, {})).toBe(true);
  });

  test("page marker with hide logic removes its page", () => {
    const marker = {
      settings: cl({
        conditionalLogic: {
          action: "show",
          logic: "and",
          rules: [{ field: "wants_more", operator: "==", value: "yes" }],
        },
      }),
    };
    expect(evaluatePageVisibility(marker, { wants_more: "no" })).toBe(false);
    expect(evaluatePageVisibility(marker, { wants_more: "yes" })).toBe(true);
  });
});

describe("server-trust contract", () => {
  test("hidden required field => submission accepted (not blocked)", () => {
    const hidden = field({
      key: "extra",
      required: true,
      conditionalLogic: cl({
        action: "show",
        logic: "and",
        rules: [{ field: "toggle", operator: "==", value: "on" }],
      }),
    });
    const vis = recomputeVisibility([hidden], { toggle: "off" });
    const res = validateSubmission([hidden], { toggle: "off" }, vis, validate);
    expect(res.ok).toBe(true);
  });

  test("spoofed value for a server-hidden field is dropped", () => {
    const hidden = field({
      key: "secret",
      conditionalLogic: cl({
        action: "show",
        logic: "and",
        rules: [{ field: "toggle", operator: "==", value: "on" }],
      }),
    });
    const vis = recomputeVisibility([hidden], { toggle: "off", secret: "x" });
    expect(vis.visibleFieldKeys.has("secret")).toBe(false);
    expect(vis.hiddenFieldKeys.has("secret")).toBe(true);
  });

  test("omitted value for a visible required field => ok:false with error", () => {
    const req = field({ key: "email", required: true });
    const vis = recomputeVisibility([req], {});
    const res = validateSubmission([req], {}, vis, validate);
    expect(res.ok).toBe(false);
    expect(res.errors.email).toBeTruthy();
  });

  test("zod gate flips ok independently of imperative checks", () => {
    const req = field({ key: "name", required: true });
    const vis = recomputeVisibility([req], {});
    const schema = compileZodFromVisibleFields([req], vis, {});
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ name: "Ada" }).success).toBe(true);
  });

  test("layout + group fields excluded from validation", () => {
    const msg = field({ key: "m", type: "message" });
    const grp = field({ key: "g", type: "group", required: true });
    const vis = recomputeVisibility([msg, grp], {});
    const res = validateSubmission([msg, grp], {}, vis, validate);
    expect(res.ok).toBe(true);
  });
});

describe("authoring guards", () => {
  test("detectRuleCycle flags a 2-node cycle", () => {
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
    const cycle = detectRuleCycle([a, b]);
    expect(cycle).not.toBeNull();
    expect(cycle!.sort()).toEqual(["a", "b"]);
  });

  test("detectRuleCycle passes an acyclic graph", () => {
    const a = field({
      key: "a",
      conditionalLogic: cl({
        action: "show",
        logic: "and",
        rules: [{ field: "b", operator: "not_empty", value: "" }],
      }),
    });
    const b = field({ key: "b" });
    expect(detectRuleCycle([a, b])).toBeNull();
  });

  test("findDanglingRuleRefs flags an unknown field reference", () => {
    const a = field({
      key: "a",
      conditionalLogic: cl({
        action: "show",
        logic: "and",
        rules: [{ field: "ghost", operator: "==", value: "1" }],
      }),
    });
    const dangling = findDanglingRuleRefs([a]);
    expect(dangling).toEqual([{ fieldKey: "a", missingRef: "ghost" }]);
  });

  test("cycle still fails open at runtime (stays submittable)", () => {
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
    // Even with a (hypothetically persisted) cycle, recompute does not loop and
    // produces a deterministic visibility result.
    const vis = recomputeVisibility([a, b], {});
    expect(vis.visibleFieldKeys.size + vis.hiddenFieldKeys.size).toBe(2);
  });

  test("detectRuleCycle flags a self-referencing field (a shows-if a)", () => {
    const a = field({
      key: "a",
      conditionalLogic: cl({ rules: [{ field: "a", operator: "not_empty", value: "" }] }),
    });
    expect(detectRuleCycle([a]) !== null).toBe(true);
  });

  test("detectRuleCycle flags a 3-node cycle (a->b->c->a)", () => {
    const mk = (key: string, dep: string) =>
      field({ key, conditionalLogic: cl({ rules: [{ field: dep, operator: "not_empty", value: "" }] }) });
    const cycle = detectRuleCycle([mk("a", "b"), mk("b", "c"), mk("c", "a")]);
    expect(cycle !== null).toBe(true);
    expect(cycle!.sort()).toEqual(["a", "b", "c"]);
  });

  test("detectRuleCycle ignores edges to unknown keys (dangling, not a cycle)", () => {
    // a -> ghost (unknown) is dangling, NOT a cycle; graph is acyclic.
    const a = field({
      key: "a",
      conditionalLogic: cl({ rules: [{ field: "ghost", operator: "==", value: "1" }] }),
    });
    expect(detectRuleCycle([a])).toBeNull();
  });

  test("detectRuleCycle follows cross-field operand edges (operandKind:field)", () => {
    // a's LHS is itself but RHS operand points at b; b points back at a via LHS.
    const a = field({
      key: "a",
      conditionalLogic: cl({
        rules: [{ field: "a", operator: "==", value: "b", operandKind: "field" }],
      }),
    });
    const b = field({
      key: "b",
      conditionalLogic: cl({ rules: [{ field: "a", operator: "not_empty", value: "" }] }),
    });
    expect(detectRuleCycle([a, b]) !== null).toBe(true);
  });

  test("findDanglingRuleRefs catches a cross-field operand ghost", () => {
    const a = field({
      key: "a",
      conditionalLogic: cl({
        rules: [{ field: "a", operator: "==", value: "ghost", operandKind: "field" }],
      }),
    });
    const dangling = findDanglingRuleRefs([a]);
    expect(dangling).toEqual([{ fieldKey: "a", missingRef: "ghost" }]);
  });

  test("findDanglingRuleRefs is empty for a clean graph", () => {
    const a = field({
      key: "a",
      conditionalLogic: cl({ rules: [{ field: "b", operator: "==", value: "1" }] }),
    });
    const b = field({ key: "b" });
    expect(findDanglingRuleRefs([a, b])).toEqual([]);
  });

  test("findDanglingRuleRefs ignores malformed logic JSON (no throw, no refs)", () => {
    const a = field({ key: "a", conditionalLogic: "{not json" });
    expect(findDanglingRuleRefs([a])).toEqual([]);
    expect(detectRuleCycle([a])).toBeNull();
  });
});

// ─── Every operator, in both the field-scope (evaluateConditionalLogic via
// recomputeVisibility) and cross-field (evaluateRuleCF) evaluators. These lock
// the EXACT operator semantics the submit mutation trusts. ─────────────────────
describe("operators (literal, via evaluateRuleCF)", () => {
  const run = (operator: ConditionalOperatorT, value: string, current: string) =>
    evaluateRuleCF({ field: "f", operator, value }, { f: current });

  test("== matches only on exact string equality", () => {
    expect(run("==", "x", "x")).toBe(true);
    expect(run("==", "x", "y")).toBe(false);
    expect(run("==", "x", "")).toBe(false); // absent/empty != "x"
  });

  test("!= is the negation of ==", () => {
    expect(run("!=", "x", "y")).toBe(true);
    expect(run("!=", "x", "x")).toBe(false);
    expect(run("!=", "x", "")).toBe(true);
  });

  test("contains is substring (case-sensitive), empty needle always matches", () => {
    expect(run("contains", "ell", "hello")).toBe(true);
    expect(run("contains", "ELL", "hello")).toBe(false); // case-sensitive
    expect(run("contains", "zzz", "hello")).toBe(false);
    expect(run("contains", "", "hello")).toBe(true); // "".includes too
    expect(run("contains", "x", "")).toBe(false); // empty haystack
  });

  test("empty matches '', '[]', '{}' sentinels and nothing else", () => {
    expect(run("empty", "", "")).toBe(true);
    expect(run("empty", "", "[]")).toBe(true);
    expect(run("empty", "", "{}")).toBe(true);
    expect(run("empty", "", "0")).toBe(false);
    expect(run("empty", "", " ")).toBe(false); // a space is not empty
  });

  test("not_empty is the exact complement of empty", () => {
    expect(run("not_empty", "", "x")).toBe(true);
    expect(run("not_empty", "", "")).toBe(false);
    expect(run("not_empty", "", "[]")).toBe(false);
    expect(run("not_empty", "", "{}")).toBe(false);
    expect(run("not_empty", "", "0")).toBe(true); // "0" is not empty
  });

  test("unknown operator falls open to true", () => {
    expect(
      evaluateRuleCF(
        // deliberately invalid operator
        { field: "f", operator: "~=" as unknown as ConditionalOperatorT, value: "x" },
        { f: "y" },
      ),
    ).toBe(true);
  });
});

describe("numeric coercion edges (>, <)", () => {
  const gt = (value: string, current: string) =>
    evaluateRuleCF({ field: "f", operator: ">", value }, current === "__absent__" ? {} : { f: current });
  const lt = (value: string, current: string) =>
    evaluateRuleCF({ field: "f", operator: "<", value }, current === "__absent__" ? {} : { f: current });

  test("Number() coercion: numeric strings compare numerically not lexically", () => {
    expect(gt("9", "10")).toBe(true); // "10" > "9" numerically (lexical would be false)
    expect(lt("100", "9")).toBe(true); // 9 < 100
  });

  test("empty/absent LHS coerces to 0", () => {
    expect(gt("0", "__absent__")).toBe(false); // 0 > 0 false
    expect(gt("0", "")).toBe(false); // 0 > 0 false
    expect(lt("5", "__absent__")).toBe(true); // 0 < 5 true (documented foot-gun)
    expect(lt("5", "")).toBe(true);
    expect(lt("-1", "")).toBe(false); // 0 < -1 false
  });

  test('"" and "0" behave identically under > (both coerce to 0)', () => {
    expect(gt("0", "")).toBe(gt("0", "0"));
    expect(gt("-1", "")).toBe(gt("-1", "0"));
  });

  test("non-numeric operand => NaN compare => false, never throws (both directions)", () => {
    expect(gt("abc", "10")).toBe(false); // 10 > NaN false
    expect(lt("abc", "10")).toBe(false); // 10 < NaN false
    expect(evaluateRuleCF({ field: "f", operator: ">", value: "5" }, { f: "abc" })).toBe(false);
    expect(evaluateRuleCF({ field: "f", operator: "<", value: "5" }, { f: "abc" })).toBe(false);
  });

  test("whitespace-only numeric string coerces (Number(' ') === 0)", () => {
    expect(lt("5", " ")).toBe(true); // Number(" ") === 0 < 5
  });
});

describe("and / or combinations + show vs hide actions", () => {
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

  test("and+show: both rules must match", () => {
    expect(two("and", "show", "1", "2")).toBe(true);
    expect(two("and", "show", "1", "x")).toBe(false);
    expect(two("and", "show", "x", "2")).toBe(false);
  });

  test("or+show: any rule matches", () => {
    expect(two("or", "show", "1", "x")).toBe(true);
    expect(two("or", "show", "x", "2")).toBe(true);
    expect(two("or", "show", "x", "x")).toBe(false);
  });

  test("and+hide: hidden when both match (inverts show)", () => {
    expect(two("and", "hide", "1", "2")).toBe(false); // both match => hidden
    expect(two("and", "hide", "1", "x")).toBe(true); // not both => shown
  });

  test("or+hide: hidden when any matches", () => {
    expect(two("or", "hide", "1", "x")).toBe(false); // a matches => hidden
    expect(two("or", "hide", "x", "x")).toBe(true); // none match => shown
  });

  test("defaults: missing action => show, missing logic => and", () => {
    const r = evaluateLogicData(
      cl({
        rules: [
          { field: "a", operator: "==", value: "1" },
          { field: "b", operator: "==", value: "2" },
        ],
      }),
      { a: "1", b: "2" },
    );
    expect(r).toBe(true);
    const r2 = evaluateLogicData(
      cl({ rules: [{ field: "a", operator: "==", value: "1" }, { field: "b", operator: "==", value: "2" }] }),
      { a: "1", b: "nope" },
    );
    expect(r2).toBe(false); // default "and" requires both
  });
});

describe("rule shapes: canonical `field` vs legacy `fieldKey`", () => {
  test("legacy fieldKey resolves the LHS in evaluateRuleCF", () => {
    expect(evaluateRuleCF({ fieldKey: "f", operator: "==", value: "x" }, { f: "x" })).toBe(true);
    expect(evaluateRuleCF({ fieldKey: "f", operator: "==", value: "x" }, { f: "y" })).toBe(false);
  });

  test("canonical `field` wins when both field and fieldKey are present", () => {
    // field === "a" should be read; fieldKey "b" ignored.
    const rule = { field: "a", fieldKey: "b", operator: "==" as const, value: "hit" };
    expect(evaluateRuleCF(rule, { a: "hit", b: "miss" })).toBe(true);
    expect(evaluateRuleCF(rule, { a: "miss", b: "hit" })).toBe(false);
  });

  test("legacy fieldKey is honored by recomputeVisibility (field scope)", () => {
    const f = field({
      key: "dep",
      conditionalLogic: cl({ rules: [{ fieldKey: "trigger", operator: "==", value: "on" }] }),
    });
    expect(recomputeVisibility([f], { trigger: "on" }).visibleFieldKeys.has("dep")).toBe(true);
    expect(recomputeVisibility([f], { trigger: "off" }).hiddenFieldKeys.has("dep")).toBe(true);
  });

  test("legacy fieldKey is tracked as a dependency for cycle + dangling", () => {
    const a = field({
      key: "a",
      conditionalLogic: cl({ rules: [{ fieldKey: "ghost", operator: "==", value: "1" }] }),
    });
    expect(findDanglingRuleRefs([a])).toEqual([{ fieldKey: "a", missingRef: "ghost" }]);
  });
});

describe("enabled flag: false disables, absent stays active", () => {
  const f = (enabled?: boolean) =>
    field({
      key: "dep",
      conditionalLogic: cl({
        ...(enabled === undefined ? {} : { enabled }),
        action: "show",
        rules: [{ field: "t", operator: "==", value: "on" }],
      }),
    });

  test("enabled:false => rule ignored => field visible (fail open)", () => {
    const vis = recomputeVisibility([f(false)], { t: "off" });
    expect(vis.visibleFieldKeys.has("dep")).toBe(true);
  });

  test("absent enabled => rule active => hidden when trigger mismatches", () => {
    const vis = recomputeVisibility([f(undefined)], { t: "off" });
    expect(vis.hiddenFieldKeys.has("dep")).toBe(true);
  });

  test("enabled:true => rule active (only explicit false disables)", () => {
    const vis = recomputeVisibility([f(true)], { t: "off" });
    expect(vis.hiddenFieldKeys.has("dep")).toBe(true);
  });

  test("enabled:false also disables a cross-field rule branch in recompute", () => {
    const cf = field({
      key: "dep",
      conditionalLogic: cl({
        enabled: false,
        rules: [{ field: "x", operator: "==", value: "y", operandKind: "field" }],
      }),
    });
    const vis = recomputeVisibility([cf], { x: "0", y: "9" });
    expect(vis.visibleFieldKeys.has("dep")).toBe(true);
  });
});

describe("fail-open: missing / malformed / empty logic stays visible", () => {
  test("undefined / null / empty-string logic => visible", () => {
    expect(evaluateLogicData(undefined, {})).toBe(true);
    expect(evaluateLogicData(null, {})).toBe(true);
    expect(evaluateLogicData("", {})).toBe(true);
  });

  test("malformed JSON => visible (no throw)", () => {
    expect(evaluateLogicData("{not json", {})).toBe(true);
    expect(evaluateLogicData("[1,2,3", {})).toBe(true);
  });

  test("rules not an array / empty array => visible", () => {
    expect(evaluateLogicData(cl({ rules: "nope" }), {})).toBe(true);
    expect(evaluateLogicData(cl({ rules: [] }), {})).toBe(true);
    expect(evaluateLogicData(cl({ action: "show" }), {})).toBe(true); // no rules key
  });

  test("recomputeVisibility: a malformed-logic field is visible, not dropped", () => {
    const f = field({ key: "weird", conditionalLogic: "{broken" });
    const vis = recomputeVisibility([f], {});
    expect(vis.visibleFieldKeys.has("weird")).toBe(true);
  });
});

describe("cross-field operand resolution + hidden-operand semantics", () => {
  test("operandKind:field reads the live value of the named field", () => {
    const rule = { field: "max", operator: "<" as const, value: "limit", operandKind: "field" as const };
    expect(evaluateRuleCF(rule, { max: "3", limit: "5" })).toBe(true);
    expect(evaluateRuleCF(rule, { max: "9", limit: "5" })).toBe(false);
  });

  test("operandKind:field pointing at an ABSENT operand resolves to '' (vacuous, no throw)", () => {
    // "" == "" => true for ==
    expect(resolveOperand({ field: "a", operator: "==", value: "ghost", operandKind: "field" }, {})).toBe("");
    expect(
      evaluateRuleCF({ field: "a", operator: "==", value: "ghost", operandKind: "field" }, { a: "" }),
    ).toBe(true);
  });

  test("== between two equal fields is true; != is its complement", () => {
    const eq = { field: "p", operator: "==" as const, value: "c", operandKind: "field" as const };
    const ne = { field: "p", operator: "!=" as const, value: "c", operandKind: "field" as const };
    expect(evaluateRuleCF(eq, { p: "secret", c: "secret" })).toBe(true);
    expect(evaluateRuleCF(ne, { p: "secret", c: "secret" })).toBe(false);
    expect(evaluateRuleCF(ne, { p: "secret", c: "other" })).toBe(true);
  });

  test("recomputeVisibility uses the cross-field branch when operandKind:field present", () => {
    // end > start (cross-field): show only when end greater.
    const f = field({
      key: "warn",
      conditionalLogic: cl({
        rules: [{ field: "end", operator: ">", value: "start", operandKind: "field" }],
      }),
    });
    expect(recomputeVisibility([f], { end: "10", start: "5" }).visibleFieldKeys.has("warn")).toBe(true);
    expect(recomputeVisibility([f], { end: "1", start: "5" }).hiddenFieldKeys.has("warn")).toBe(true);
  });
});

describe("nested-section cascade (transitive group hiding)", () => {
  const hideUnless = (id: string, parent?: string) =>
    field({
      key: id,
      _id: id,
      type: "group",
      parentFieldId: parent,
      // group's own logic: show only when `t` === "yes"
      conditionalLogic: parent
        ? undefined // inner groups carry no own logic; they inherit ancestor state
        : cl({ rules: [{ field: "t", operator: "==", value: "yes" }] }),
    });

  test("grandchild under a hidden outer group is hidden (2 levels)", () => {
    const outer = hideUnless("o");
    const inner = hideUnless("i", "o");
    const leaf = field({ key: "leaf", parentFieldId: "i" });
    const vis = recomputeVisibility([outer, inner, leaf], { t: "no" });
    expect(vis.hiddenFieldKeys.has("leaf")).toBe(true);
    expect(vis.visibleFieldKeys.has("leaf")).toBe(false);
  });

  test("cascade is order-independent (defs listed leaf-first)", () => {
    const outer = hideUnless("o");
    const inner = hideUnless("i", "o");
    const leaf = field({ key: "leaf", parentFieldId: "i" });
    const vis = recomputeVisibility([leaf, inner, outer], { t: "no" });
    expect(vis.hiddenFieldKeys.has("leaf")).toBe(true);
  });

  test("3-level chain (outer > mid > inner > leaf) all hidden when outer hidden", () => {
    const outer = hideUnless("o");
    const mid = hideUnless("m", "o");
    const inner = hideUnless("i", "m");
    const leaf = field({ key: "leaf", parentFieldId: "i" });
    const vis = recomputeVisibility([outer, mid, inner, leaf], { t: "no" });
    expect(vis.hiddenFieldKeys.has("leaf")).toBe(true);
    // The group fields' keys are their ids ("i" = inner group, "m" = mid group).
    expect(vis.hiddenFieldKeys.has("i")).toBe(true);
    expect(vis.hiddenFieldKeys.has("m")).toBe(true);
  });

  test("visible outer => nested leaf follows through (shown)", () => {
    const outer = hideUnless("o");
    const inner = hideUnless("i", "o");
    const leaf = field({ key: "leaf", parentFieldId: "i" });
    const vis = recomputeVisibility([outer, inner, leaf], { t: "yes" });
    expect(vis.visibleFieldKeys.has("leaf")).toBe(true);
  });

  test("a malformed cyclic parent chain among groups terminates (no infinite loop)", () => {
    const a = field({ key: "a", _id: "a", type: "group", parentFieldId: "b" });
    const b = field({ key: "b", _id: "b", type: "group", parentFieldId: "a" });
    const vis = recomputeVisibility([a, b], {});
    expect(vis.visibleFieldKeys.size + vis.hiddenFieldKeys.size).toBe(2);
  });

  test("nested hidden required field does NOT block submission (server-trust)", () => {
    const outer = hideUnless("o");
    const inner = hideUnless("i", "o");
    const leaf = field({ key: "leaf", required: true, parentFieldId: "i" });
    const vis = recomputeVisibility([outer, inner, leaf], { t: "no" });
    const res = validateSubmission([outer, inner, leaf], { t: "no" }, vis, validate);
    expect(res.ok).toBe(true);
  });
});

describe("requiredWhen edge paths", () => {
  test("requiredWhen as a pre-stringified JSON string is honored", () => {
    const f = field({
      key: "r",
      settings: cl({
        requiredWhen: JSON.stringify({ rules: [{ field: "t", operator: "==", value: "on" }] }),
      }),
    });
    expect(isFieldRequired(f, true, { t: "on" })).toBe(true);
    expect(isFieldRequired(f, true, { t: "off" })).toBe(false);
  });

  test("requiredWhen with a cross-field operand", () => {
    const f = field({
      key: "r",
      settings: cl({
        requiredWhen: { rules: [{ field: "end", operator: ">", value: "start", operandKind: "field" }] },
      }),
    });
    expect(isFieldRequired(f, true, { end: "10", start: "5" })).toBe(true);
    expect(isFieldRequired(f, true, { end: "1", start: "5" })).toBe(false);
  });

  test("no requiredWhen + not static-required => optional when visible", () => {
    const f = field({ key: "r" });
    expect(isFieldRequired(f, true, {})).toBe(false);
  });

  test("malformed settings JSON => not required (no throw)", () => {
    const f = field({ key: "r", settings: "{broken" });
    expect(isFieldRequired(f, true, {})).toBe(false);
  });

  test("static required overrides absent requiredWhen", () => {
    const f = field({ key: "r", required: true });
    expect(isFieldRequired(f, true, {})).toBe(true);
  });
});

describe("validateSubmission + zod gate (the exact submit contract)", () => {
  test("cross-field requiredWhen whose operand field is absent => '' => vacuously not required", () => {
    // 'amount' is required only when `tier == <value of field 'gate'>`. The LHS
    // 'tier' has a concrete value but the operand field 'gate' is absent, so the
    // operand resolves to "" and "premium" == "" is false => not required.
    const amount = field({
      key: "amount",
      settings: cl({
        requiredWhen: { rules: [{ field: "tier", operator: "==", value: "gate", operandKind: "field" }] },
      }),
    });
    const vis = recomputeVisibility([amount], { tier: "premium" }); // 'gate' absent
    const res = validateSubmission([amount], { tier: "premium" }, vis, validate);
    expect(res.ok).toBe(true);
  });

  test("conditionally-required visible field, trigger ON, value omitted => ok:false", () => {
    const reason = field({
      key: "reason",
      settings: cl({ requiredWhen: { rules: [{ field: "status", operator: "==", value: "other" }] } }),
    });
    const vis = recomputeVisibility([reason], { status: "other" });
    const res = validateSubmission([reason], { status: "other" }, vis, validate);
    expect(res.ok).toBe(false);
    expect(res.errors.reason !== undefined).toBe(true);
  });

  test("conditionally-required visible field, trigger OFF, value omitted => ok", () => {
    const reason = field({
      key: "reason",
      settings: cl({ requiredWhen: { rules: [{ field: "status", operator: "==", value: "other" }] } }),
    });
    const vis = recomputeVisibility([reason], { status: "open" });
    const res = validateSubmission([reason], { status: "open" }, vis, validate);
    expect(res.ok).toBe(true);
  });

  test("zod gate: optional field accepts [] / {} sentinels and absence", () => {
    const opt = field({ key: "tags" });
    const vis = recomputeVisibility([opt], {});
    const schema = compileZodFromVisibleFields([opt], vis, {});
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ tags: "[]" }).success).toBe(true);
    expect(schema.safeParse({ tags: "{}" }).success).toBe(true);
  });

  test("zod gate: required field rejects [] and {} sentinels (not just '')", () => {
    const req = field({ key: "tags", required: true });
    const vis = recomputeVisibility([req], {});
    const schema = compileZodFromVisibleFields([req], vis, {});
    expect(schema.safeParse({ tags: "[]" }).success).toBe(false);
    expect(schema.safeParse({ tags: "{}" }).success).toBe(false);
    expect(schema.safeParse({ tags: "ok" }).success).toBe(true);
  });

  test("zod gate: hidden required field excluded from schema (submission passes)", () => {
    const hidden = field({
      key: "extra",
      required: true,
      conditionalLogic: cl({ rules: [{ field: "toggle", operator: "==", value: "on" }] }),
    });
    const vis = recomputeVisibility([hidden], { toggle: "off" });
    const schema = compileZodFromVisibleFields([hidden], vis, { toggle: "off" });
    expect(schema.safeParse({}).success).toBe(true);
  });

  test("validateSubmission ignores a spoofed value for a server-hidden field", () => {
    const hidden = field({
      key: "secret",
      required: true,
      conditionalLogic: cl({ rules: [{ field: "toggle", operator: "==", value: "on" }] }),
    });
    const vis = recomputeVisibility([hidden], { toggle: "off", secret: "spoofed" });
    const res = validateSubmission([hidden], { toggle: "off", secret: "spoofed" }, vis, validate);
    expect(res.ok).toBe(true); // hidden => not validated, value disregarded
  });
});
