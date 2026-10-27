/**
 * The review step (form setting `reviewStep`): every answer, page by page,
 * with an Edit link to each page, before the final submit (and payment).
 * Focus moves to its heading when it opens, so a screen reader starts there.
 */
import { Fragment, useEffect, useRef } from "react";

import type { ReviewSection } from "./reviewStep";
import { StepNav } from "./StepNav";

interface FormReviewStepProps {
  sections: ReviewSection[];
  onEdit: (position: number) => void;
  onBack: () => void;
  onContinue: () => void;
  continueLabel: string;
  isSubmitting: boolean;
  /** Pages can be revisited (the form allows going back). */
  canEdit: boolean;
}

export function FormReviewStep({ sections, onEdit, onBack, onContinue, continueLabel, isSubmitting, canEdit }: FormReviewStepProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <section data-slot="form-review" aria-labelledby="form-review-heading" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 ref={heading} id="form-review-heading" tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">
          Review your answers
        </h2>
        <p className="text-sm text-muted-foreground">Check everything before you continue. Nothing is sent until you do.</p>
      </div>
      {sections.map((section) => (
        <div key={section.position} data-slot="form-review-section" className="flex flex-col gap-3 rounded-md border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
            {canEdit ? (
              <button
                type="button"
                onClick={() => onEdit(section.position)}
                disabled={isSubmitting}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
                aria-label={`Edit ${section.title}`}
              >
                Edit
              </button>
            ) : null}
          </div>
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            {section.answers.map((answer) => (
              <Fragment key={answer.key}>
                <dt className="text-sm text-muted-foreground">{answer.label}</dt>
                <dd className="m-0 break-words text-sm text-foreground">{answer.value}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      ))}
      <StepNav canBack isFinal onBack={onBack} onNext={onContinue} onSubmit={onContinue} isSubmitting={isSubmitting} submitLabel={continueLabel} />
    </section>
  );
}
