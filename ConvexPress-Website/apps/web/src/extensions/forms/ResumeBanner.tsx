/**
 * Form Multi-Step — "welcome back" resume banner.
 *
 * Shown only on the resume path: confirms restored progress + which step. It is
 * dismissible and `role="status"` (polite), never blocking. Theme tokens only.
 */

import { useState } from "react";
import { RotateCcw, X } from "lucide-react";

interface ResumeBannerProps {
  /** 1-based step number the user was restored to (for the copy). */
  stepNumber?: number;
}

export function ResumeBanner({ stepNumber }: ResumeBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      role="status"
      data-slot="resume-banner"
      className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3 text-sm text-foreground"
    >
      <RotateCcw className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="flex-1">
        Welcome back — we restored your progress.
        {stepNumber ? ` Continue from step ${stepNumber}.` : ""}
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
