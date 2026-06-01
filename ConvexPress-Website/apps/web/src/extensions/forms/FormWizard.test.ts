/**
 * FormWizard payload-filter test.
 * Run: `bun test apps/web/src/extensions/forms/FormWizard.test.ts`
 *
 * Locks the autosave/submit payload filter (`buildWizardPayload`): every
 * value-less layout/security type (message/accordion/tab/page_break/captcha/
 * honeypot) is dropped — NOT just `page_break` — so a debounced draft save never
 * leaks a honeypot/captcha value to the server. Value-bearing fields (incl.
 * computed calculation/product) are kept; fields absent from the value map emit
 * no key.
 *
 * Matcher discipline: only `.toBe` / `.toEqual` (web bun:test shim).
 */

import { test, expect } from "bun:test";

import { buildWizardPayload } from "./FormWizard";

const f = (key: string, type: string) => ({ key, type });

test("buildWizardPayload: drops ALL value-less layout/security types, not just page_break", () => {
  const fields = [
    f("name", "text"),
    f("msg", "message"),
    f("acc", "accordion"),
    f("tab1", "tab"),
    f("pb", "page_break"),
    f("cap", "captcha"),
    f("hp", "honeypot"),
  ];
  const values = {
    name: "Ada",
    msg: "x",
    acc: "x",
    tab1: "x",
    pb: "x",
    cap: "x",
    hp: "bot-filled",
  };
  // Only the value-bearing `name` survives — captcha/honeypot/page_break and the
  // classic layout types are all dropped from the draft payload.
  expect(buildWizardPayload(fields, values)).toEqual([
    { fieldKey: "name", value: "Ada" },
  ]);
});

test("buildWizardPayload regression: a honeypot value is NEVER sent on autosave", () => {
  // Pre-fix the wizard filtered only `page_break`, so a honeypot/captcha value
  // leaked into every debounced draft save. This locks the corrected behavior.
  const fields = [f("website", "honeypot"), f("token", "captcha")];
  const values = { website: "http://spam.example", token: "solved" };
  expect(buildWizardPayload(fields, values)).toEqual([]);
});

test("buildWizardPayload: keeps value-bearing fields incl. computed; defaults nothing", () => {
  const fields = [
    f("email", "text"),
    f("total", "calculation"),
    f("line", "product"),
  ];
  const values = { email: "a@b.co", total: "1999", line: '{"quantity":2}' };
  expect(buildWizardPayload(fields, values)).toEqual([
    { fieldKey: "email", value: "a@b.co" },
    { fieldKey: "total", value: "1999" },
    { fieldKey: "line", value: '{"quantity":2}' },
  ]);
});

test("buildWizardPayload: a field absent from the value map emits no key", () => {
  const fields = [f("a", "text"), f("b", "text")];
  // only `a` has a value → `b` (undefined in map) is skipped entirely
  expect(buildWizardPayload(fields, { a: "x" })).toEqual([
    { fieldKey: "a", value: "x" },
  ]);
});

test("buildWizardPayload: an empty-string value IS sent (only undefined is skipped)", () => {
  const fields = [f("a", "text")];
  expect(buildWizardPayload(fields, { a: "" })).toEqual([
    { fieldKey: "a", value: "" },
  ]);
});
