/**
 * CommentEditForm - Inline edit form for comment content.
 *
 * Replaces the comment content with a textarea when editing.
 * Calls the `comments.mutations.update` Convex mutation on save.
 * Shows toast notifications on success/error via Sonner.
 */

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface CommentEditFormProps {
  commentId: string;
  initialContent: string;
  onSave: () => void;
  onCancel: () => void;
}

const MAX_CONTENT_LENGTH = 5000;

export function CommentEditForm({
  commentId,
  initialContent,
  onSave,
  onCancel,
}: CommentEditFormProps) {
  const [content, setContent] = useState(initialContent);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateMutation = useMutation(api.comments.mutations.update);

  const trimmedContent = content.trim();
  const isValid = trimmedContent.length > 0 && trimmedContent.length <= MAX_CONTENT_LENGTH;
  const hasChanged = trimmedContent !== initialContent.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!isValid || !hasChanged || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await updateMutation({
        commentId: commentId as Id<"comments">,
        content: trimmedContent,
      });
      toast.success("Comment updated");
      onSave();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update comment";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={isSubmitting}
        rows={3}
        maxLength={MAX_CONTENT_LENGTH}
        className={cn(
          "w-full resize-none rounded-none border border-input bg-background px-3 py-2 text-xs",
          "focus:outline-hidden focus:ring-1 focus:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        aria-label="Edit comment"
      />

      {/* Character count */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-[10px]",
            trimmedContent.length > MAX_CONTENT_LENGTH * 0.9
              ? "text-destructive"
              : "text-muted-foreground",
          )}
        >
          {trimmedContent.length}/{MAX_CONTENT_LENGTH}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="xs"
            disabled={!isValid || !hasChanged || isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}
