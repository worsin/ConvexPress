/**
 * Preview Banner
 *
 * Sticky banner displayed at the top of the page when viewing a post or page
 * in preview mode (i.e., content that is not yet published).
 *
 * Shows the current status (draft, pending, future, private) and provides
 * a link to exit preview mode or edit the content in the admin.
 */

import { Link } from "@tanstack/react-router";
import { Eye, X } from "lucide-react";

import { cn } from "@/lib/utils";

interface PreviewBannerProps {
  /** Current content status */
  status: "draft" | "pending" | "future" | "private" | string;
  /** Content type being previewed */
  contentType?: "post" | "page";
  /** Admin edit URL (optional - link to admin editor) */
  editUrl?: string;
  /** Callback to dismiss the banner */
  onDismiss?: () => void;
  className?: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending: "Pending Review",
  future: "Scheduled",
  private: "Private",
};

export function PreviewBanner({
  status,
  contentType = "post",
  editUrl,
  onDismiss,
  className,
}: PreviewBannerProps) {
  const statusLabel = STATUS_LABELS[status] ?? status;
  const contentLabel = contentType === "page" ? "page" : "post";

  return (
    <div
      data-slot="preview-banner"
      role="alert"
      className={cn(
        "sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-border bg-muted px-4 py-2",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Eye className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-xs font-medium">
          Preview Mode
        </span>
        <span className="text-xs text-muted-foreground">
          &mdash; This {contentLabel} is currently{" "}
          <span className="font-medium text-foreground">{statusLabel}</span>
          {" "}and not visible to the public.
        </span>
      </div>

      <div className="flex items-center gap-2">
        {editUrl && (
          <Link
            to={editUrl}
            className="text-xs font-medium text-foreground underline-offset-2 transition-colors hover:underline"
          >
            Edit in Admin
          </Link>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="flex size-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Dismiss preview banner"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
