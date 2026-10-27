import { describe, expect, test } from "bun:test";

import type { PublicFormField } from "@/components/forms/FormFieldRenderer";
import { reviewSections, reviewValue } from "./reviewStep";
import type { WizardStep } from "./wizardSteps";

const field = (key: string, type: string, extra: Partial<PublicFormField> = {}): PublicFormField => ({
  _id: key, key, name: key, label: key.replace(/_/g, " "), type, settings: "{}", ...extra,
});
const choices = (pairs: [string, string][]) => JSON.stringify({ choices: pairs.map(([value, label]) => ({ value, label })) });

describe("reviewValue", () => {
  test("choices read as their labels; several are listed", () => {
    expect(reviewValue(field("package", "radio", { settings: choices([["practice", "Practice — $299/month"]]) }), "practice")).toBe("Practice — $299/month");
    expect(reviewValue(field("days", "checkbox", { settings: choices([["mon", "Monday"], ["tue", "Tuesday"]]) }), '["mon","tue"]')).toBe("Monday, Tuesday");
  });
  test("yes or no, not answered, and passwords never shown", () => {
    expect(reviewValue(field("billing_same", "true_false"), "1")).toBe("Yes");
    expect(reviewValue(field("billing_same", "true_false"), "0")).toBe("No");
    expect(reviewValue(field("job_title", "text"), "  ")).toBe("Not answered");
    expect(reviewValue(field("secret", "password"), "hunter2")).toBe("Entered");
    expect(reviewValue(field("npi", "text"), "1234567893")).toBe("1234567893");
  });
});

describe("reviewSections", () => {
  test("lists each page's visible answers in order, without layout fields or hidden ones", () => {
    const fields = [
      field("step_one", "page_break", { label: "About you" }),
      field("first_name", "text", { label: "First name" }),
      field("billing_same", "true_false", { label: "Billing same as service" }),
      field("billing_city", "text", { label: "Billing city", conditionalLogic: JSON.stringify({ action: "show", logic: "and", rules: [{ field: "billing_same", operator: "!=", value: "1" }] }) }),
      field("intro", "message", { label: "A note" }),
    ];
    const steps: WizardStep[] = [
      { index: 0, title: "About you", fieldKeys: ["first_name", "billing_same", "billing_city", "intro"], isSkippable: false },
      { index: 1, title: "", fieldKeys: [], isSkippable: true },
    ];
    const sections = reviewSections(steps, { first_name: "Ada", billing_same: "1", billing_city: "Reno" }, fields);
    expect(sections).toEqual([
      { position: 0, title: "About you", answers: [
        { key: "first_name", label: "First name", value: "Ada" },
        { key: "billing_same", label: "Billing same as service", value: "Yes" },
      ] },
    ]);
  });
});
