/**
 * CommentFlagDialog - Flag reason selection confirmation dialog.
 *
 * This is a confirmation dialog (the ONLY acceptable popup type per design rules).
 * Allows users to report a comment by selecting a reason and optionally providing details.
 * Calls the `comments.mutations.flag` Convex mutation.
 */

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface CommentFlagDialogProps {
  commentId: string;
}

type FlagReason = "spam" | "harassment" | "off-topic" | "misinformation" | "other";

const FLAG_REASONS: { value: FlagReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "off-topic", label: "Off-topic" },
  { value: "misinformation", label: "Misinformation" },
  { value: "other", label: "Other" },
];

export function CommentFlagDialog({ commentId }: CommentFlagDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<FlagReason>("spam");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const flagMutation = useMutation(api.comments.mutations.flag);

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      await flagMutation({
        commentId: commentId as Id<"comments">,
        reason,
        details: reason === "other" ? details.trim() : undefined,
      });
      toast.success("Comment reported. Thank you for helping keep the community safe.");
      setIsOpen(false);
      setReason("spam");
      setDetails("");
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to report comment");
      console.error("Failed to report comment:", error);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Report comment"
      >
        <Flag className="size-3" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="mt-2 border border-border bg-card p-3 text-xs space-y-3">
      <div className="font-medium text-foreground">Report this comment</div>

      {/* Reason select */}
      <div className="space-y-1.5">
        <label className="text-[10px] text-muted-foreground" htmlFor={`flag-reason-${commentId}`}>
          Reason
        </label>
        <select
          id={`flag-reason-${commentId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value as FlagReason)}
          disabled={isSubmitting}
          className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-none border bg-transparent px-2 py-1.5 text-xs outline-hidden transition-colors focus-visible:ring-1"
        >
          {FLAG_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {/* Details (required for "other") */}
      {reason === "other" && (
        <div className="space-y-1.5">
          <label className="text-[10px] text-muted-foreground" htmlFor={`flag-details-${commentId}`}>
            Details <span className="text-destructive">*</span>
          </label>
          <textarea
            id={`flag-details-${commentId}`}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Please describe the issue..."
            rows={2}
            maxLength={500}
            disabled={isSubmitting}
            className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-none border bg-transparent px-2 py-1.5 text-xs outline-hidden transition-colors focus-visible:ring-1 placeholder:text-muted-foreground"
          />
          <span className="text-[10px] text-muted-foreground">
            {details.length} / 500
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="destructive"
          onClick={handleSubmit}
          disabled={isSubmitting || (reason === "other" && !details.trim())}
        >
          {isSubmitting && <Loader2 className="mr-1 size-3 animate-spin" />}
          Report
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setIsOpen(false);
            setReason("spam");
            setDetails("");
          }}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
