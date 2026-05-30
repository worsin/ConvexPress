/**
 * Form Multi-Step — Back / Next / Submit controls.
 *
 * Next validates the current step (via the renderer's lifted `validate()`), and
 * on pass flushes an immediate autosave then advances to the next ACTIVE step.
 * On the final step, Next becomes Submit (spinner + disabled while pending,
 * mirroring the renderer's Loader2 styling). Back retreats to the previous
 * active step (gated by allowBackNav) and never re-validates.
 *
 * `page_break` nextLabel / prevLabel overrides are read by the host and passed
 * down as `nextLabel` / `prevLabel`. Theme tokens only.
 */

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface StepNavProps {
  /** True when a previous active step exists AND back-nav is allowed. */
  canBack: boolean;
  /** True when this is the last active step (Next → Submit). */
  isFinal: boolean;
  /** Retreat to the previous active step (no re-validation). */
  onBack: () => void;
  /** Validate → flush autosave → advance to the next active step. */
  onNext: () => void;
  /** Final-step submit (isComplete:true). */
  onSubmit: () => void;
  /** Disable + spinner the Submit button while the final submit is pending. */
  isSubmitting: boolean;
  /** Optional label override for the Next button (from the page_break). */
  nextLabel?: string;
  /** Optional label override for the Back button (from the page_break). */
  prevLabel?: string;
}

export function StepNav({
  canBack,
  isFinal,
  onBack,
  onNext,
  onSubmit,
  isSubmitting,
  nextLabel,
  prevLabel,
}: StepNavProps) {
  return (
    <div
      data-slot="step-nav"
      className="flex items-center justify-between gap-3 pt-2"
    >
      <div>
        {canBack ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onBack}
            disabled={isSubmitting}
          >
            {prevLabel || "Back"}
          </Button>
        ) : (
          <span />
        )}
      </div>

      {isFinal ? (
        <Button
          type="button"
          size="lg"
          onClick={onSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              Submitting…
            </>
          ) : (
            "Submit"
          )}
        </Button>
      ) : (
        <Button type="button" size="lg" onClick={onNext} disabled={isSubmitting}>
          {nextLabel || "Next"}
        </Button>
      )}
    </div>
  );
}
