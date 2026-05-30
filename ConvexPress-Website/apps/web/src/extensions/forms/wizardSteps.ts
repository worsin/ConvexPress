/**
 * Form Multi-Step & Save-Continue — pure step model.
 *
 * The algorithmic heart of the wizard. ZERO React, ZERO Convex — fully
 * synchronous and unit-testable. Every UI piece (StepProgress, StepNav,
 * FormWizard) reads its segmentation + skip logic from these functions.
 *
 * Contract anchored to the on-disk reality (PLAN §0 ground-truth):
 *   - Input is the `getBySlug` field array: each field has `{ key, type,
 *     conditionalLogic, menuOrder, label, settings, ... }` (see PublicFormField).
 *   - Steps are derived by sorting on `menuOrder` (default 0, matching the
 *     renderer's `(a.menuOrder ?? 0)`) and splitting at every `page_break`.
 *   - The conditional evaluator is the SHARED `evaluateConditionalLogic`
 *     (serialized-JSON + value-map signature). We import it; we never
 *     re-implement it, so step-skip matches the renderer's per-field show/hide
 *     and the server's recompute byte-for-byte.
 *
 * SSR-safe: no `window`/`crypto` at module load (this module touches neither).
 */

import { evaluateConditionalLogic } from "@/lib/forms/conditionalLogic";
import type { PublicFormField } from "@/components/forms/FormFieldRenderer";

/** A wizard step: a contiguous run of fields between two page breaks. */
export interface WizardStep {
  /** 0-based position in the FULL (unfiltered) step list. */
  index: number;
  /** Step title (the preceding page_break's label), if any. */
  title?: string;
  /** The `key`s of the fields that belong to this step (in render order). */
  fieldKeys: string[];
  /**
   * True when EVERY field in this step is conditional (has non-null
   * conditionalLogic) — i.e. the whole step can vanish when logic hides it.
   * A step with at least one always-visible field is never skippable.
   */
  isSkippable: boolean;
}

/** The page-break field type marker (registered as a layout/no-value type). */
const PAGE_BREAK = "page_break";

/**
 * Sort fields by their admin-authored order, matching the renderer's
 * `(a.menuOrder ?? 0) - (b.menuOrder ?? 0)`. Stable: equal menuOrder keeps the
 * incoming order.
 */
function sortByMenuOrder(fields: PublicFormField[]): PublicFormField[] {
  return [...fields].sort((a, b) => (a.menuOrder ?? 0) - (b.menuOrder ?? 0));
}

/**
 * Split the field list into steps at each `page_break`.
 *
 * Rules (PLAN Step 1):
 *   - Sort by menuOrder first.
 *   - A `page_break` ends the current run; its `label` becomes the NEXT step's
 *     title.
 *   - Empty runs are dropped (leading / trailing / consecutive breaks never
 *     create empty steps → no off-by-one).
 *   - Zero `page_break` ⇒ exactly one step (single-page degrade).
 *   - `isSkippable = run.every(f => f.conditionalLogic != null)`.
 */
export function deriveSteps(fields: PublicFormField[]): WizardStep[] {
  const sorted = sortByMenuOrder(fields);

  // Accumulate runs of fields, splitting at page breaks. We track the pending
  // title contributed by the most recent break so it attaches to the next run.
  const runs: Array<{ title?: string; fields: PublicFormField[] }> = [];
  let current: { title?: string; fields: PublicFormField[] } = { fields: [] };
  let pendingTitle: string | undefined;

  const flush = () => {
    if (current.fields.length > 0) {
      runs.push(current);
    }
    current = { title: undefined, fields: [] };
  };

  for (const field of sorted) {
    if (field.type === PAGE_BREAK) {
      // Close the current run; the break's label titles whatever comes next.
      flush();
      pendingTitle = field.label?.trim() ? field.label : undefined;
      current.title = pendingTitle;
      continue;
    }
    if (current.fields.length === 0) {
      // First field of a fresh run inherits the pending title.
      current.title = pendingTitle;
    }
    current.fields.push(field);
  }
  flush();

  // Zero non-empty runs (e.g. a form of only breaks, or no fields) ⇒ one empty
  // step so the renderer/host still mounts something coherent.
  if (runs.length === 0) {
    return [{ index: 0, title: undefined, fieldKeys: [], isSkippable: false }];
  }

  return runs.map((run, index) => ({
    index,
    title: run.title,
    fieldKeys: run.fields.map((f) => f.key),
    isSkippable: run.fields.every((f) => f.conditionalLogic != null),
  }));
}

/**
 * The `key`s of fields on this step that are CURRENTLY visible, per the shared
 * conditional evaluator. Uses the real `(serialized-JSON, value-map)` signature
 * so it agrees with the renderer's `visibleFields` and the server recompute.
 */
export function visibleFieldKeys(
  step: WizardStep,
  values: Record<string, string>,
  fields: PublicFormField[],
): string[] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  return step.fieldKeys.filter((key) => {
    const field = byKey.get(key);
    if (!field) return false;
    return evaluateConditionalLogic(field.conditionalLogic, values);
  });
}

/**
 * A step is ACTIVE when it has at least one currently-visible field. An empty
 * step (all fields hidden by logic) is skipped in both directions.
 */
export function isStepActive(
  step: WizardStep,
  values: Record<string, string>,
  fields: PublicFormField[],
): boolean {
  return visibleFieldKeys(step, values, fields).length > 0;
}

/**
 * The live, non-skipped step list both nav and progress read. Recomputed on
 * every value change; the host clamps its `stepIndex` into this list so a step
 * emptied by logic never strands the user.
 */
export function computeActiveSteps(
  steps: WizardStep[],
  values: Record<string, string>,
  fields: PublicFormField[],
): WizardStep[] {
  return steps.filter((step) => isStepActive(step, values, fields));
}
