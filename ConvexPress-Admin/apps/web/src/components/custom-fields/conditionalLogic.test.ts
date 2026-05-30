/**
 * Regression tests for the conditional-logic evaluator.
 * Run: `bun test apps/web/src/components/custom-fields/conditionalLogic.test.ts`
 *
 * The headline test ("builder shape ...") is the exact case that was broken:
 * builder writes `{ field, operator, value }` with no `enabled`, and the old
 * renderer required `logic.enabled` (so rules never applied) while reading
 * `rule.fieldKey` (which the builder never wrote).
 */

import { test, expect } from "bun:test";
import { evaluateConditionalLogic } from "./conditionalLogic";

const mk = (data: unknown) => JSON.stringify(data);

test("no logic -> visible (fail open)", () => {
  expect(evaluateConditionalLogic(undefined, {})).toBe(true);
  expect(evaluateConditionalLogic("", {})).toBe(true);
  expect(evaluateConditionalLogic(null, {})).toBe(true);
});

test("malformed JSON -> visible (fail open)", () => {
  expect(evaluateConditionalLogic("{not json", {})).toBe(true);
});

test("empty rules -> visible", () => {
  expect(
    evaluateConditionalLogic(mk({ action: "show", logic: "and", rules: [] }), {}),
  ).toBe(true);
});

test("REGRESSION: builder shape {field}, no `enabled` -> rules actually apply", () => {
  const logic = mk({
    action: "show",
    logic: "and",
    rules: [{ field: "field_plan", operator: "==", value: "pro" }],
  });
  // Before the fix BOTH of these returned true (rules dead).
  expect(evaluateConditionalLogic(logic, { field_plan: "pro" })).toBe(true);
  expect(evaluateConditionalLogic(logic, { field_plan: "basic" })).toBe(false);
});

test("hide action inverts visibility", () => {
  const logic = mk({
    action: "hide",
    logic: "and",
    rules: [{ field: "f", operator: "==", value: "x" }],
  });
  expect(evaluateConditionalLogic(logic, { f: "x" })).toBe(false); // hidden on match
  expect(evaluateConditionalLogic(logic, { f: "y" })).toBe(true); // shown otherwise
});

test("normalizer: legacy `fieldKey` shape still resolves", () => {
  const logic = mk({
    action: "show",
    logic: "and",
    rules: [{ fieldKey: "f", operator: "==", value: "x" }],
  });
  expect(evaluateConditionalLogic(logic, { f: "x" })).toBe(true);
});

test("explicit `enabled: false` disables rules (fail open)", () => {
  const logic = mk({
    action: "show",
    enabled: false,
    logic: "and",
    rules: [{ field: "f", operator: "==", value: "x" }],
  });
  expect(evaluateConditionalLogic(logic, { f: "nope" })).toBe(true);
});

test("or-logic: any rule matches", () => {
  const logic = mk({
    action: "show",
    logic: "or",
    rules: [
      { field: "a", operator: "==", value: "1" },
      { field: "b", operator: "==", value: "2" },
    ],
  });
  expect(evaluateConditionalLogic(logic, { a: "0", b: "2" })).toBe(true);
  expect(evaluateConditionalLogic(logic, { a: "0", b: "0" })).toBe(false);
});

test("operators: contains / empty / not_empty / numeric", () => {
  expect(
    evaluateConditionalLogic(
      mk({ rules: [{ field: "f", operator: "contains", value: "ell" }] }),
      { f: "hello" },
    ),
  ).toBe(true);
  expect(
    evaluateConditionalLogic(mk({ rules: [{ field: "f", operator: "empty", value: "" }] }), {
      f: "",
    }),
  ).toBe(true);
  expect(
    evaluateConditionalLogic(mk({ rules: [{ field: "f", operator: "not_empty", value: "" }] }), {
      f: "x",
    }),
  ).toBe(true);
  expect(
    evaluateConditionalLogic(mk({ rules: [{ field: "f", operator: ">", value: "5" }] }), {
      f: "10",
    }),
  ).toBe(true);
});
