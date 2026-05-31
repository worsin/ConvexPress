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

test("every operator: ==, !=, contains, empty, not_empty, >, <", () => {
  const r = (operator: string, value: string, current: string) =>
    evaluateConditionalLogic(mk({ rules: [{ field: "f", operator, value }] }), { f: current });
  expect(r("==", "x", "x")).toBe(true);
  expect(r("==", "x", "y")).toBe(false);
  expect(r("!=", "x", "y")).toBe(true);
  expect(r("!=", "x", "x")).toBe(false);
  expect(r("contains", "ell", "hello")).toBe(true);
  expect(r("contains", "ELL", "hello")).toBe(false); // case-sensitive
  expect(r("empty", "", "[]")).toBe(true);
  expect(r("empty", "", "0")).toBe(false);
  expect(r("not_empty", "", "0")).toBe(true);
  expect(r("not_empty", "", "{}")).toBe(false);
  expect(r(">", "5", "10")).toBe(true); // numeric, not lexical
  expect(r("<", "5", "1")).toBe(true);
});

test("numeric coercion: empty<5 true, empty>0 false, non-numeric => false", () => {
  const r = (operator: string, value: string, vm: Record<string, string>) =>
    evaluateConditionalLogic(mk({ rules: [{ field: "f", operator, value }] }), vm);
  expect(r("<", "5", {})).toBe(true); // Number("") = 0 < 5
  expect(r(">", "0", {})).toBe(false); // 0 > 0
  expect(r(">", "5", { f: "abc" })).toBe(false); // NaN compare, no throw
});

test("and+show requires all; or+show requires any", () => {
  const rules = [
    { field: "a", operator: "==", value: "1" },
    { field: "b", operator: "==", value: "2" },
  ];
  expect(evaluateConditionalLogic(mk({ logic: "and", rules }), { a: "1", b: "2" })).toBe(true);
  expect(evaluateConditionalLogic(mk({ logic: "and", rules }), { a: "1", b: "x" })).toBe(false);
  expect(evaluateConditionalLogic(mk({ logic: "or", rules }), { a: "1", b: "x" })).toBe(true);
});

test("hide inverts and+/or combinations", () => {
  const rules = [
    { field: "a", operator: "==", value: "1" },
    { field: "b", operator: "==", value: "2" },
  ];
  expect(evaluateConditionalLogic(mk({ action: "hide", logic: "and", rules }), { a: "1", b: "2" })).toBe(false);
  expect(evaluateConditionalLogic(mk({ action: "hide", logic: "or", rules }), { a: "x", b: "x" })).toBe(true);
});

test("defaults: missing action => show, missing logic => and", () => {
  const rules = [
    { field: "a", operator: "==", value: "1" },
    { field: "b", operator: "==", value: "2" },
  ];
  expect(evaluateConditionalLogic(mk({ rules }), { a: "1", b: "2" })).toBe(true);
  expect(evaluateConditionalLogic(mk({ rules }), { a: "1", b: "x" })).toBe(false);
});
