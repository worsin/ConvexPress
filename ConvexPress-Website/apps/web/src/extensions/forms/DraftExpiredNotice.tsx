/**
 * Form Multi-Step — expired / completed / unknown draft notice.
 *
 * Shown by the resume route when the `resume` query returns an expired marker,
 * a non-resumable status, or nothing. Explains the link is no longer valid and
 * offers a start-fresh CTA back to the live form. Theme tokens only; no
 * color-only signaling.
 */

import { Link } from "@tanstack/react-router";
import { FileClock } from "lucide-react";

interface DraftExpiredNoticeProps {
  /** The form slug, so the start-fresh CTA links to the live form. */
  slug: string;
}

export function DraftExpiredNotice({ slug }: DraftExpiredNoticeProps) {
  return (
    <div
      role="status"
      data-slot="draft-expired"
      tabIndex={-1}
      className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-10 text-center outline-none"
    >
      <FileClock className="size-10 text-muted-foreground" aria-hidden="true" />
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold text-foreground">
          This saved form is no longer available
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          The link you used has expired or the form was already submitted. You
          can start a fresh response below.
        </p>
      </div>
      <Link
        to="/forms/$slug"
        params={{ slug }}
        className="inline-flex items-center rounded-full border border-input bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
      >
        Start a new form
      </Link>
    </div>
  );
}
