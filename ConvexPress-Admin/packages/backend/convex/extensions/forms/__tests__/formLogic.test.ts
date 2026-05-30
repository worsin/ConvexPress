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
});
