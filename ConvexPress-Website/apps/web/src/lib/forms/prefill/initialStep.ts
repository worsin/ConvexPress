/**
 * Form Prefill — initial-step resolver (EZ `getInitialStep` parity).
 *
 * Decides which step a prefilled deep-link should open on. Pure + SSR-safe.
 *
 * Resolution:
 *   1. An explicit `step=` param that is in `formDef.steps` allowlist → that step.
 *   2. Else a smart default (predicate seam, supplied by Multi-Step): the
 *      furthest step whose prerequisite fields are already filled by prefill.
 *   3. Single-page (`!formDef.steps?.length`) → `undefined`.
 *   4. Unknown / out-of-range `step=` → ignored, fall through to the default.
 *
 * The default predicate is intentionally conservative (only advances past steps
 * whose every prerequisite is filled). The Multi-Step System may inject a richer
 * `coveragePredicate`.
 */

import type { PublicFormDefinition } from "./types";

export interface InitialStepOptions {
  /**
   * Predicate seam (Multi-Step): given a step id + the prefilled values, return
   * true when that step's prerequisites are satisfied (so a smart default may
   * advance past it). Absent ⇒ no smart-advance (default to first step).
   */
  coveragePredicate?: (
    stepId: string,
    initialValues: Record<string, string>,
  ) => boolean;
}

export function resolveInitialStep(
  searchParams: Record<string, unknown>,
  formDef: PublicFormDefinition,
  initialValues: Record<string, string>,
  options: InitialStepOptions = {},
): string | undefined {
  const steps = formDef.steps;
  // Single-page form ⇒ no step concept.
  if (!steps || steps.length === 0) return undefined;

  // 1. Explicit, allowlisted step= wins.
  const rawStep = searchParams["step"];
  if (typeof rawStep === "string" && rawStep.length > 0) {
    if (steps.includes(rawStep)) return rawStep;
    // Unknown / out-of-range → ignore, fall through to the default.
  }

  // 2. Smart default via the coverage predicate: furthest step whose
  // prerequisites are filled. Without a predicate, stay on the first step.
  if (options.coveragePredicate) {
    let furthest = steps[0]!;
    for (const stepId of steps) {
      if (options.coveragePredicate(stepId, initialValues)) {
        furthest = stepId;
      } else {
        break;
      }
    }
    return furthest;
  }

  // 3. Default: the first step.
  return steps[0];
}
