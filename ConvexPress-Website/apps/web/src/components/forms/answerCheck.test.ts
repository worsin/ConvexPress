import { expect, test } from "bun:test";

import { answerError, answerRules } from "./answerCheck";

test("the browser refuses the answers the server would, on the step they were typed", () => {
  const npi = answerRules(JSON.stringify({ format: "us-npi" }));
  expect(answerError("text", "1234567890", npi)).toContain("check digit");
  expect(answerError("text", "1234567893", npi)).toBeNull();
  expect(answerError("text", "abc", answerRules(JSON.stringify({ format: "phone" })))).toContain("phone");
  expect(answerError("text", "Nevada", answerRules(JSON.stringify({ format: "us-state" })))).toContain("two-letter");
  expect(answerError("text", "abc", answerRules(JSON.stringify({ format: "us-zip" })))).toContain("ZIP");
  expect(answerError("email", "dana@", {})).toContain("email");
  expect(answerError("url", "summit spine", {})).toContain("web address");
  expect(answerError("url", "https://summitspine.com", {})).toBeNull();
  expect(answerError("number", "0", answerRules(JSON.stringify({ min: 1, max: 500 })))).toBe("Enter 1 or more.");
  expect(answerError("number", "501", answerRules(JSON.stringify({ min: 1, max: 500 })))).toBe("Enter 500 or less.");
});

test("empty answers and unknown settings are left alone", () => {
  expect(answerError("text", "   ", answerRules(JSON.stringify({ format: "us-npi" })))).toBeNull();
  expect(answerRules("not json")).toEqual({});
  expect(answerError("text", "anything", answerRules(JSON.stringify({ format: "made-up" })))).toBeNull();
});
