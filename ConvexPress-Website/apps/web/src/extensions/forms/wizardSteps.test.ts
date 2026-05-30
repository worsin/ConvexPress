import { describe, expect, test } from "bun:test";

import {
  clampStepIndex,
  computeActiveSteps,
  deriveSteps,
  isStepActive,
  progressPercent,
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

/** A page_break whose PAGE-level logic lives on the top-level column. */
function pageBreakWithLogic(
  label: string,
  menuOrder: number,
  logic: string,
): PublicFormField {
  return field({
    key: `pb_${menuOrder}`,
    type: "page_break",
    label,
    menuOrder,
    conditionalLogic: logic,
  });
}

/** A page_break whose PAGE-level logic lives under settings.conditionalLogic. */
function pageBreakWithSettingsLogic(
  label: string,
  menuOrder: number,
  logic: unknown,
): PublicFormField {
  return field({
    key: `pb_${menuOrder}`,
    type: "page_break",
    label,
    menuOrder,
    settings: JSON.stringify({ conditionalLogic: logic }),
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

describe("deriveSteps — partitioning edge cases", () => {
  test("a single page_break and nothing else → one empty step (no fields)", () => {
    const steps = deriveSteps([pageBreak("Only", 0)]);
    expect(steps.length).toBe(1);
    expect(steps[0]!.fieldKeys).toEqual([]);
  });

  test("a form of ONLY page breaks → one empty step (no ghost steps)", () => {
    const steps = deriveSteps([
      pageBreak("A", 0),
      pageBreak("B", 1),
      pageBreak("C", 2),
    ]);
    expect(steps.length).toBe(1);
    expect(steps[0]!.fieldKeys).toEqual([]);
  });

  test("a break with a blank / whitespace label contributes no title", () => {
    const steps = deriveSteps([
      field({ key: "a", menuOrder: 0 }),
      field({ key: "pbn", type: "page_break", label: "   ", menuOrder: 1 }),
      field({ key: "b", menuOrder: 2 }),
    ]);
    expect(steps.length).toBe(2);
    expect(steps[1]!.title).toBe(undefined);
  });

  test("step.index is the stable full-list position, contiguous from 0", () => {
    const steps = deriveSteps([
      field({ key: "a", menuOrder: 0 }),
      pageBreak("Two", 1),
      field({ key: "b", menuOrder: 2 }),
      pageBreak("Three", 3),
      field({ key: "c", menuOrder: 4 }),
    ]);
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  test("two fields sharing a menuOrder keep their incoming order (stable sort)", () => {
    const steps = deriveSteps([
      field({ key: "a", menuOrder: 0 }),
      field({ key: "b", menuOrder: 0 }),
    ]);
    expect(steps[0]!.fieldKeys).toEqual(["a", "b"]);
  });

  test("fields with a missing menuOrder default to 0 and sort ahead of higher orders", () => {
    const steps = deriveSteps([
      field({ key: "later", menuOrder: 5 }),
      field({ key: "default" }), // menuOrder omitted → 0
    ]);
    expect(steps[0]!.fieldKeys).toEqual(["default", "later"]);
  });

  test("a page_break between two consecutive same-menuOrder fields still splits", () => {
    // Page break shares menuOrder 1 with field `b`; stable sort keeps pb before b
    // (incoming order), so the split lands between a and b.
    const steps = deriveSteps([
      field({ key: "a", menuOrder: 0 }),
      pageBreak("Two", 1),
      field({ key: "b", menuOrder: 1 }),
    ]);
    expect(steps.length).toBe(2);
    expect(steps[0]!.fieldKeys).toEqual(["a"]);
    expect(steps[1]!.fieldKeys).toEqual(["b"]);
  });

  test("isSkippable is false for a step with zero fields (empty single step)", () => {
    // `every` over an empty array is vacuously true; the empty-form path must
    // NOT report the lone empty step as skippable (it is the only step).
    const steps = deriveSteps([]);
    expect(steps[0]!.isSkippable).toBe(false);
  });
});

describe("deriveSteps — page_break interacting with conditional-hidden fields", () => {
  // Step 2's ONLY field is conditional; when hidden the step must drop, and the
  // surrounding always-visible steps must NOT be merged or renumbered wrongly.
  const fields = [
    field({ key: "a", menuOrder: 0 }),
    pageBreak("Two", 1),
    field({ key: "b", menuOrder: 2, conditionalLogic: showWhen("a", "go") }),
    pageBreak("Three", 3),
    field({ key: "c", menuOrder: 4 }),
  ];
  const steps = deriveSteps(fields);

  test("a step whose every field is conditional is marked skippable", () => {
    expect(steps[1]!.isSkippable).toBe(true);
    expect(steps[0]!.isSkippable).toBe(false);
    expect(steps[2]!.isSkippable).toBe(false);
  });

  test("a mix where one field is always-visible keeps the step un-skippable", () => {
    const mixed = deriveSteps([
      field({ key: "x", menuOrder: 0 }),
      field({ key: "y", menuOrder: 1, conditionalLogic: showWhen("x", "1") }),
    ]);
    expect(mixed[0]!.isSkippable).toBe(false);
  });

  test("hiding the only field on a middle step collapses 3 active steps to 2", () => {
    expect(computeActiveSteps(steps, { a: "no" }, fields).map((s) => s.fieldKeys)).toEqual([
      ["a"],
      ["c"],
    ]);
    expect(computeActiveSteps(steps, { a: "go" }, fields).length).toBe(3);
  });
});

describe("deriveSteps — conditionally-hidden page_break (ghost-step guard)", () => {
  // A page_break carrying its OWN page-level logic. When that logic hides the
  // page, the step it introduces must be skipped — not rendered as a ghost step.
  const logic = showWhen("plan", "pro");

  test("page-hidden step is dropped from the active list (top-level logic)", () => {
    const fields = [
      field({ key: "a", menuOrder: 0 }),
      pageBreakWithLogic("Pro extras", 1, logic),
      field({ key: "b", menuOrder: 2 }), // always-visible field on the gated page
    ];
    const steps = deriveSteps(fields);
    expect(steps.length).toBe(2);
    expect(steps[1]!.pageLogic).toBe(logic);

    // plan != pro → the whole second page is skipped even though `b` is visible.
    const hidden = computeActiveSteps(steps, { plan: "free" }, fields);
    expect(hidden.map((s) => s.fieldKeys)).toEqual([["a"]]);
    // plan == pro → the page appears.
    const shown = computeActiveSteps(steps, { plan: "pro" }, fields);
    expect(shown.length).toBe(2);
  });

  test("page-level logic under settings.conditionalLogic is honored too", () => {
    const fields = [
      field({ key: "a", menuOrder: 0 }),
      pageBreakWithSettingsLogic("Pro extras", 1, {
        action: "show",
        logic: "and",
        rules: [{ field: "plan", operator: "==", value: "pro" }],
      }),
      field({ key: "b", menuOrder: 2 }),
    ];
    const steps = deriveSteps(fields);
    expect(isStepActive(steps[1]!, { plan: "free" }, fields)).toBe(false);
    expect(isStepActive(steps[1]!, { plan: "pro" }, fields)).toBe(true);
  });

  test("page gate AND field gate both apply (page shown but field hidden → inactive)", () => {
    const fields = [
      field({ key: "a", menuOrder: 0 }),
      pageBreakWithLogic("Gated", 1, showWhen("plan", "pro")),
      field({ key: "b", menuOrder: 2, conditionalLogic: showWhen("a", "yes") }),
    ];
    const steps = deriveSteps(fields);
    // Page is shown (plan==pro) but the only field is hidden (a!=yes) → inactive.
    expect(isStepActive(steps[1]!, { plan: "pro", a: "no" }, fields)).toBe(false);
    // Both satisfied → active.
    expect(isStepActive(steps[1]!, { plan: "pro", a: "yes" }, fields)).toBe(true);
  });

  test("malformed settings on a page_break never throws → page treated as shown", () => {
    const badBreak = field({
      key: "pbx",
      type: "page_break",
      label: "X",
      menuOrder: 1,
      settings: "{not json",
    });
    const fields = [
      field({ key: "a", menuOrder: 0 }),
      badBreak,
      field({ key: "b", menuOrder: 2 }),
    ];
    let threw = false;
    let steps: ReturnType<typeof deriveSteps> = [];
    try {
      steps = deriveSteps(fields);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    // Bad settings ⇒ no page logic ⇒ step shown.
    expect(steps[1]!.pageLogic).toBe(undefined);
    expect(isStepActive(steps[1]!, {}, fields)).toBe(true);
  });

  test("a break with NO page logic leaves pageLogic undefined (inert, always shown)", () => {
    const fields = [
      field({ key: "a", menuOrder: 0 }),
      pageBreak("Two", 1),
      field({ key: "b", menuOrder: 2 }),
    ];
    const steps = deriveSteps(fields);
    expect(steps[1]!.pageLogic).toBe(undefined);
    expect(isStepActive(steps[1]!, {}, fields)).toBe(true);
  });
});

describe("clampStepIndex — untrusted current-step hardening", () => {
  test("in-range integer passes through unchanged", () => {
    expect(clampStepIndex(0, 4)).toBe(0);
    expect(clampStepIndex(2, 4)).toBe(2);
    expect(clampStepIndex(3, 4)).toBe(3);
  });

  test("above the last step clamps to the last index", () => {
    expect(clampStepIndex(99, 4)).toBe(3);
    expect(clampStepIndex(4, 4)).toBe(3);
  });

  test("negative clamps to 0", () => {
    expect(clampStepIndex(-1, 4)).toBe(0);
    expect(clampStepIndex(-9999, 4)).toBe(0);
  });

  test("NaN / Infinity / -Infinity → 0 (never NaN-poisons the array index)", () => {
    expect(clampStepIndex(Number.NaN, 4)).toBe(0);
    expect(clampStepIndex(Number.POSITIVE_INFINITY, 4)).toBe(3);
    expect(clampStepIndex(Number.NEGATIVE_INFINITY, 4)).toBe(0);
  });

  test("floats are floored to an integer in range", () => {
    expect(clampStepIndex(1.9, 4)).toBe(1);
    expect(clampStepIndex(2.000001, 4)).toBe(2);
    expect(clampStepIndex(3.9, 4)).toBe(3); // floor(3.9)=3 ≤ last(3)
  });

  test("empty / zero / negative stepCount → 0 (never a negative index)", () => {
    expect(clampStepIndex(0, 0)).toBe(0);
    expect(clampStepIndex(5, 0)).toBe(0);
    expect(clampStepIndex(-5, 0)).toBe(0);
    expect(clampStepIndex(2, -3)).toBe(0);
  });

  test("non-finite stepCount → treated as a single step (index 0)", () => {
    expect(clampStepIndex(3, Number.NaN)).toBe(0);
    expect(clampStepIndex(3, Number.POSITIVE_INFINITY)).toBe(0);
  });

  test("non-number index (defensive, untyped resume value) → 0", () => {
    expect(clampStepIndex("2" as unknown as number, 4)).toBe(0);
    expect(clampStepIndex(undefined as unknown as number, 4)).toBe(0);
    expect(clampStepIndex(null as unknown as number, 4)).toBe(0);
  });

  test("the result is always finite and a fixed point (re-clamp is stable)", () => {
    // This stability is what prevents the host's clamp→setState seam from
    // looping: clamp(clamp(x)) === clamp(x) for every input.
    for (const x of [Number.NaN, -5, 0, 1.7, 3, 99, Number.POSITIVE_INFINITY]) {
      const once = clampStepIndex(x, 4);
      expect(Number.isInteger(once)).toBe(true);
      expect(clampStepIndex(once, 4)).toBe(once);
    }
  });
});

describe("progressPercent — bounded + divide-by-zero safe", () => {
  test("first step of N is 0%, last step of N reflects steps completed", () => {
    expect(progressPercent(0, 4)).toBe(0);
    expect(progressPercent(1, 4)).toBe(25);
    expect(progressPercent(2, 4)).toBe(50);
    expect(progressPercent(3, 4)).toBe(75);
  });

  test("zero total steps → 0 (no divide-by-zero / NaN)", () => {
    const p = progressPercent(0, 0);
    expect(p).toBe(0);
    expect(Number.isNaN(p)).toBe(false);
  });

  test("negative or non-finite total → 0", () => {
    expect(progressPercent(1, -2)).toBe(0);
    expect(progressPercent(1, Number.NaN)).toBe(0);
    expect(progressPercent(1, Number.POSITIVE_INFINITY)).toBe(0);
  });

  test("an out-of-range current index is clamped, output stays within [0,100]", () => {
    expect(progressPercent(99, 4)).toBe(75); // clamped to last index (3) → 75%
    expect(progressPercent(-5, 4)).toBe(0);
    expect(progressPercent(Number.NaN, 4)).toBe(0);
  });

  test("single-step form: index 0 of 1 → 0%", () => {
    expect(progressPercent(0, 1)).toBe(0);
  });

  test("result is always an integer in [0,100]", () => {
    for (const total of [1, 2, 3, 7, 10]) {
      for (let i = -1; i <= total + 1; i++) {
        const p = progressPercent(i, total);
        expect(Number.isInteger(p)).toBe(true);
        expect(p >= 0 && p <= 100).toBe(true);
      }
    }
  });
});
