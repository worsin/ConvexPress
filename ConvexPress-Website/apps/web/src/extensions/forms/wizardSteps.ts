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
  /**
   * The PAGE-level conditional logic (JSON string) carried by the `page_break`
   * marker that introduces this step, if any. When this evaluates to hidden the
   * WHOLE step is skipped — independent of its individual fields' visibility.
   * Absent (e.g. the first run, or a break with no page logic) ⇒ always shown.
   * Resolved from the marker's top-level `conditionalLogic`, falling back to
   * `settings.conditionalLogic` (matching `formLogic.evaluatePageVisibility`).
   */
  pageLogic?: string;
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
 * The PAGE-level conditional logic JSON carried by a `page_break` marker, if
 * any. Prefers the top-level `conditionalLogic` column; falls back to
 * `settings.conditionalLogic` (the shape `formLogic.evaluatePageVisibility`
 * reads). Tolerant of malformed `settings` (returns undefined, i.e. always
 * shown) so a bad marker never strands the wizard.
 */
function pageBreakLogic(marker: PublicFormField): string | undefined {
  if (marker.conditionalLogic != null) return marker.conditionalLogic;
  let settings: unknown;
  try {
    settings = JSON.parse(marker.settings ?? "{}");
  } catch {
    return undefined;
  }
  if (!settings || typeof settings !== "object") return undefined;
  const cl = (settings as Record<string, unknown>).conditionalLogic;
  if (cl == null) return undefined;
  if (typeof cl === "string") return cl;
  try {
    return JSON.stringify(cl);
  } catch {
    return undefined;
  }
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
  // title + page-level logic contributed by the most recent break so they
  // attach to the next run.
  type Run = { title?: string; pageLogic?: string; fields: PublicFormField[] };
  const runs: Run[] = [];
  let current: Run = { fields: [] };
  let pendingTitle: string | undefined;
  let pendingPageLogic: string | undefined;

  const flush = () => {
    if (current.fields.length > 0) {
      runs.push(current);
    }
    current = { title: undefined, pageLogic: undefined, fields: [] };
  };

  for (const field of sorted) {
    if (field.type === PAGE_BREAK) {
      // Close the current run; the break's label + page logic apply to whatever
      // comes next. The LAST break before a run wins (consecutive breaks).
      flush();
      pendingTitle = field.label?.trim() ? field.label : undefined;
      pendingPageLogic = pageBreakLogic(field);
      current.title = pendingTitle;
      current.pageLogic = pendingPageLogic;
      continue;
    }
    if (current.fields.length === 0) {
      // First field of a fresh run inherits the pending title + page logic.
      current.title = pendingTitle;
      current.pageLogic = pendingPageLogic;
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
    pageLogic: run.pageLogic,
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
 * A step is ACTIVE when (a) its introducing `page_break` is not page-hidden by
 * its own conditional logic AND (b) it has at least one currently-visible field.
 * Either an empty step (all fields hidden) OR a page-hidden step is skipped in
 * both directions — so a conditionally-hidden page_break never strands the user
 * on a ghost step.
 */
export function isStepActive(
  step: WizardStep,
  values: Record<string, string>,
  fields: PublicFormField[],
): boolean {
  // Page-level gate first: a hidden page is skipped regardless of its fields.
  if (!evaluateConditionalLogic(step.pageLogic, values)) return false;
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

/**
 * Clamp a desired step index into the valid range `[0, stepCount - 1]`.
 *
 * HARDENED against untrusted input: the resume token IS the credential for an
 * anonymous draft, so `currentStep` is attacker-influenced. A bare
 * `Math.min/Math.max` clamp lets `NaN` / `Infinity` / floats slip through
 * (`Math.max(NaN, 0) === NaN`), which then indexes the active-step array as
 * `undefined` and poisons every derived label/payload. Here:
 *   - non-finite or non-number → 0 (first step),
 *   - floats → floored to an integer,
 *   - out-of-range → clamped to the nearest end,
 *   - empty / non-positive `stepCount` → 0 (never returns a negative index).
 *
 * Always returns a finite integer in `[0, max(0, stepCount - 1)]`.
 */
export function clampStepIndex(index: number, stepCount: number): number {
  const last = Number.isFinite(stepCount) ? Math.max(0, Math.floor(stepCount) - 1) : 0;
  if (typeof index !== "number" || Number.isNaN(index)) return 0;
  // ±Infinity is meaningful as "off the end" — clamp to the nearest end rather
  // than snapping to 0 (which would silently send an attacker to step 1).
  if (index === Number.POSITIVE_INFINITY) return last;
  if (index === Number.NEGATIVE_INFINITY) return 0;
  const i = Math.floor(index);
  if (i < 0) return 0;
  if (i > last) return last;
  return i;
}

/**
 * Progress as a 0–100 integer for the CURRENT step within `totalSteps`.
 *
 * Definition: the share of steps the user has COMPLETED on arriving at
 * `currentIndex` is `currentIndex / totalSteps` (step 1 of 4 ⇒ 0%, the last of
 * 4 ⇒ 75%, a finished single-page ⇒ handled by the caller). We report the
 * progress INTO the form so the bar fills as steps are cleared.
 *
 * DIVIDE-BY-ZERO SAFE: `totalSteps <= 0` (or non-finite) ⇒ 0, never `NaN`/
 * `Infinity`. Inputs are clamped so a bad `currentIndex` can't produce a value
 * outside `[0, 100]`.
 */
export function progressPercent(currentIndex: number, totalSteps: number): number {
  if (!Number.isFinite(totalSteps) || totalSteps <= 0) return 0;
  const total = Math.floor(totalSteps);
  const idx = clampStepIndex(currentIndex, total);
  const pct = Math.round((idx / total) * 100);
  // Defensive bound (already guaranteed by the clamp, but never emit junk).
  return Math.min(100, Math.max(0, pct));
}
