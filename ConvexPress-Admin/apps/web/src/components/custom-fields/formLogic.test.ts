/**
 * Form Logic mirror test (admin FE copy) — asserts the admin `formLogic.ts`
 * mirror is behaviorally identical to the backend source-of-truth copy.
 * Run: `bun test apps/web/src/components/custom-fields/formLogic.test.ts`
 *
 * The three formLogic.ts copies are kept byte-identical (verified by md5 in
 * review); this suite is the executable guard that the admin mirror evaluates
 * the same way for cross-field, requiredWhen, and section/page scope.
 */

import { test, expect } from "bun:test";

import {
  evaluateRuleCF,
  evaluateLogicData,
  isFieldRequired,
  recomputeVisibility,
  detectRuleCycle,
  type LogicFieldDef,
} from "./formLogic";

const cl = (data: unknown) => JSON.stringify(data);
const field = (p: Partial<LogicFieldDef> & { key: string }): LogicFieldDef => ({
  type: "text",
  required: false,
  ...p,
});

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
