import { describe, expect, test } from "bun:test";

import {
  computeActiveSteps,
  deriveSteps,
  isStepActive,
  visibleFieldKeys,
} from "./wizardSteps";
import type { PublicFormField } from "@/components/forms/FormFieldRenderer";

/** Minimal field factory — only the fields the step model reads. */
function field(
  partial: Partial<PublicFormField> & { key: string; type?: string },
): PublicFormField {
  return {
    _id: partial.key,
    label: partial.label ?? partial.key,
    name: partial.key,
    key: partial.key,
    type: partial.type ?? "text",
    settings: partial.settings ?? "{}",
    conditionalLogic: partial.conditionalLogic ?? null,
    menuOrder: partial.menuOrder ?? 0,
    required: partial.required,
    defaultValue: partial.defaultValue,
    instructions: partial.instructions,
    parentFieldId: partial.parentFieldId ?? null,
  };
}

function pageBreak(label: string, menuOrder: number): PublicFormField {
  return field({ key: `pb_${menuOrder}`, type: "page_break", label, menuOrder });
}

/** Serialize a show-when-equals rule the shared evaluator understands. */
function showWhen(refKey: string, value: string): string {
  return JSON.stringify({
    action: "show",
    logic: "and",
    rules: [{ field: refKey, operator: "==", value }],
  });
}

describe("deriveSteps", () => {
  test("no page breaks → exactly one step with all field keys", () => {
    const steps = deriveSteps([
      field({ key: "a", menuOrder: 0 }),
      field({ key: "b", menuOrder: 1 }),
    ]);
    expect(steps.length).toBe(1);
    expect(steps[0]!.fieldKeys).toEqual(["a", "b"]);
    expect(steps[0]!.title).toBe(undefined);
  });

  test("N breaks → N+1 steps with correct fieldKeys and titles", () => {
    const steps = deriveSteps([
      field({ key: "a", menuOrder: 0 }),
      pageBreak("Step Two", 1),
      field({ key: "b", menuOrder: 2 }),
      pageBreak("Step Three", 3),
      field({ key: "c", menuOrder: 4 }),
    ]);
    expect(steps.length).toBe(3);
    expect(steps[0]!.fieldKeys).toEqual(["a"]);
    expect(steps[0]!.title).toBe(undefined);
    expect(steps[1]!.fieldKeys).toEqual(["b"]);
    expect(steps[1]!.title).toBe("Step Two");
    expect(steps[2]!.fieldKeys).toEqual(["c"]);
    expect(steps[2]!.title).toBe("Step Three");
  });

  test("leading / trailing / consecutive breaks create no empty steps", () => {
    const steps = deriveSteps([
      pageBreak("Leading", 0),
      field({ key: "a", menuOrder: 1 }),
      pageBreak("Mid A", 2),
      pageBreak("Mid B", 3),
      field({ key: "b", menuOrder: 4 }),
      pageBreak("Trailing", 5),
    ]);
    expect(steps.length).toBe(2);
    expect(steps[0]!.fieldKeys).toEqual(["a"]);
    // The leading break titles the first real run.
    expect(steps[0]!.title).toBe("Leading");
    expect(steps[1]!.fieldKeys).toEqual(["b"]);
    // The LAST break before run 2 ("Mid B") wins the title.
    expect(steps[1]!.title).toBe("Mid B");
  });

  test("sorts by menuOrder before splitting", () => {
    const steps = deriveSteps([
      field({ key: "c", menuOrder: 4 }),
      field({ key: "a", menuOrder: 0 }),
      pageBreak("Two", 2),
      field({ key: "b", menuOrder: 3 }),
    ]);
    expect(steps.length).toBe(2);
    expect(steps[0]!.fieldKeys).toEqual(["a"]);
    expect(steps[1]!.fieldKeys).toEqual(["b", "c"]);
  });

  test("isSkippable true only when every field is conditional", () => {
    const steps = deriveSteps([
      field({ key: "always", menuOrder: 0 }),
      field({ key: "maybe", menuOrder: 1, conditionalLogic: showWhen("x", "1") }),
      pageBreak("Two", 2),
      field({ key: "c1", menuOrder: 3, conditionalLogic: showWhen("x", "1") }),
      field({ key: "c2", menuOrder: 4, conditionalLogic: showWhen("x", "2") }),
    ]);
    expect(steps[0]!.isSkippable).toBe(false);
    expect(steps[1]!.isSkippable).toBe(true);
  });

  test("empty input → one empty step", () => {
    const steps = deriveSteps([]);
    expect(steps.length).toBe(1);
    expect(steps[0]!.fieldKeys).toEqual([]);
  });
});

describe("visibility + active steps", () => {
  const fields = [
    field({ key: "a", menuOrder: 0 }),
    pageBreak("Two", 1),
    field({ key: "b", menuOrder: 2, conditionalLogic: showWhen("a", "yes") }),
    pageBreak("Three", 3),
    field({ key: "c", menuOrder: 4 }),
  ];
  const steps = deriveSteps(fields);

  test("visibleFieldKeys filters by the shared evaluator", () => {
    expect(visibleFieldKeys(steps[1]!, { a: "no" }, fields)).toEqual([]);
    expect(visibleFieldKeys(steps[1]!, { a: "yes" }, fields)).toEqual(["b"]);
  });

  test("isStepActive false when all fields hidden", () => {
    expect(isStepActive(steps[1]!, { a: "no" }, fields)).toBe(false);
    expect(isStepActive(steps[1]!, { a: "yes" }, fields)).toBe(true);
  });

  test("computeActiveSteps drops a fully-hidden step", () => {
    const hidden = computeActiveSteps(steps, { a: "no" }, fields);
    expect(hidden.length).toBe(2);
    expect(hidden.map((s) => s.fieldKeys)).toEqual([["a"], ["c"]]);

    const shown = computeActiveSteps(steps, { a: "yes" }, fields);
    expect(shown.length).toBe(3);
  });

  test("computeActiveSteps agrees with evaluateConditionalLogic per field", () => {
    // Step 2 visible only when a === "yes"; step model must mirror that exactly.
    expect(computeActiveSteps(steps, {}, fields).length).toBe(2);
    expect(computeActiveSteps(steps, { a: "yes" }, fields).length).toBe(3);
  });
});
