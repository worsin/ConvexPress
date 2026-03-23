/**
 * CommentReplyForm - Dedicated inline reply form.
 *
 * Simplified form with just a textarea, Reply, and Cancel buttons.
 * Calls the `comments.mutations.reply` Convex mutation.
 */

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { toast } from "sonner";

import { cn, getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface CommentReplyFormProps {
  parentCommentId: string;
  onCancel: () => void;
  onSuccess?: () => void;
  className?: string;
}

export function CommentReplyForm({
  parentCommentId,
  onCancel,
  onSuccess,
  className,
}: CommentReplyFormProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const replyMutation = useMutation(api.comments.mutations.reply);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      const result = await replyMutation({
        parentCommentId: parentCommentId as Id<"comments">,
        content: content.trim(),
      });

      if (result.status === "approved") {
        toast.success("Reply posted.");
      } else if (result.status === "pending") {
        toast.info("Your reply is awaiting moderation.");
      }

      setContent("");
      onSuccess?.();
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to post reply");
      console.error("Failed to post reply:", error);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      data-slot="comment-reply-form"
      onSubmit={handleSubmit}
      className={cn("flex flex-col gap-2", className)}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Reply</span>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Write your reply..."
        rows={3}
        maxLength={5000}
        disabled={isSubmitting}
        className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-none border bg-transparent px-2.5 py-2 text-xs transition-colors placeholder:text-muted-foreground focus-visible:ring-1 outline-hidden disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Reply content"
      />

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={isSubmitting || !content.trim()}
        >
          {isSubmitting ? "Posting..." : "Reply"}
        </Button>
      </div>
    </form>
  );
}
