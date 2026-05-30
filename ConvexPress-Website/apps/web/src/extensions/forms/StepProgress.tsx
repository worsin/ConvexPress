/**
 * Form Multi-Step — live, skip-aware progress indicator.
 *
 * Renders the LIVE (already conditional-skip-filtered) step list as numbered /
 * labeled segments with current / visited / upcoming states + a "Step X of N"
 * label, where N is the live count (it collapses honestly as logic skips
 * steps). State is conveyed by more than color (number + text + aria-current),
 * per a11y. Theme tokens only, no hardcoded colors.
 *
 * Hidden entirely for a one-step form (single-page degrade) — the host gates
 * rendering on `activeSteps.length > 1` so this component assumes >= 2 here.
 */

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WizardStep } from "./wizardSteps";

interface StepProgressProps {
  /** The live, non-skipped steps (already filtered by conditional logic). */
  activeSteps: WizardStep[];
  /** Index into `activeSteps` of the current step. */
  currentIndex: number;
  /** Furthest active index the user has reached (visited ≤ this). */
  furthestIndex: number;
  /** When true, visited segments are clickable buttons that jump back. */
  allowBackNav?: boolean;
  /** Jump to an earlier active step index (only called for visited segments). */
  onJumpTo?: (index: number) => void;
}

export function StepProgress({
  activeSteps,
  currentIndex,
  furthestIndex,
  allowBackNav,
  onJumpTo,
}: StepProgressProps) {
  const total = activeSteps.length;
  const currentStep = activeSteps[currentIndex];

  return (
    <nav
      aria-label="Form progress"
      data-slot="step-progress"
      className="flex flex-col gap-2"
    >
      <p className="text-xs font-medium text-muted-foreground">
        Step {currentIndex + 1} of {total}
        {currentStep?.title ? (
          <span className="text-foreground"> · {currentStep.title}</span>
        ) : null}
      </p>
      <ol className="flex items-center gap-1.5">
        {activeSteps.map((step, i) => {
          const isCurrent = i === currentIndex;
          const isVisited = i < currentIndex || i <= furthestIndex;
          const isComplete = i < currentIndex;
          const canJump = Boolean(allowBackNav) && isVisited && i < currentIndex;

          const dotClass = cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums transition-colors",
            isCurrent
              ? "border-primary bg-primary text-primary-foreground"
              : isComplete
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-muted text-muted-foreground",
          );

          const segLabel = step.title
            ? `Step ${i + 1}: ${step.title}`
            : `Step ${i + 1}`;

          const dot = (
            <span className={dotClass} aria-hidden="true">
              {isComplete ? <Check className="size-3.5" /> : i + 1}
            </span>
          );

          return (
            <li
              key={step.index}
              className="flex items-center gap-1.5"
              aria-current={isCurrent ? "step" : undefined}
            >
              {canJump ? (
                <button
                  type="button"
                  onClick={() => onJumpTo?.(i)}
                  className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  aria-label={`Go back to ${segLabel}`}
                >
                  {dot}
                </button>
              ) : (
                <span aria-label={segLabel}>{dot}</span>
              )}
              {i < total - 1 ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-px w-4 sm:w-8",
                    isComplete ? "bg-primary/40" : "bg-border",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
