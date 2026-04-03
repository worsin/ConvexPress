import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { cn, getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface CommentFormProps {
  postId: string;
  parentId?: string;
  isLoggedIn?: boolean;
  onCancel?: () => void;
  onSuccess?: () => void;
  className?: string;
}

/**
 * Comment form for authenticated users.
 * ConvexPress requires authentication for all comments (no guest fields).
 * Calls the `comments.mutations.create` Convex mutation.
 */
export function CommentForm({
  postId,
  parentId,
  isLoggedIn = false,
  onCancel,
  onSuccess,
  className,
}: CommentFormProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedStatus, setSubmittedStatus] = useState<string | null>(null);

  const createMutation = useMutation(api.comments.mutations.create);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      const result = await createMutation({
        postId: postId as Id<"posts">,
        content: content.trim(),
        parentId: parentId ? (parentId as Id<"comments">) : undefined,
      });

      if (result.status === "approved") {
        toast.success("Comment posted.");
      } else if (result.status === "pending") {
        setSubmittedStatus("pending");
        toast.info("Your comment is awaiting moderation.");
      }

      setContent("");
      onSuccess?.();
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to post comment");
      console.error("Failed to post comment:", error);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  // Not logged in -- should not render form
  if (!isLoggedIn) {
    return (
      <div className={cn("py-4 text-center border border-border bg-muted/30", className)}>
        <p className="text-xs text-muted-foreground">
          <a href="/login" className="text-primary hover:underline">
            Log in
          </a>{" "}
          to leave a comment.
        </p>
      </div>
    );
  }

  return (
    <form
      data-slot="comment-form"
      onSubmit={handleSubmit}
      className={cn("flex flex-col gap-3", className)}
    >
      {parentId && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">Reply to comment</span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Submitted status notice */}
      {submittedStatus === "pending" && (
        <div className="bg-primary/10 px-3 py-2 text-xs text-primary">
          Your comment is awaiting moderation.
        </div>
      )}

      {/* Comment Text */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="comment-content" className="text-xs">
          Comment <span className="text-destructive">*</span>
        </Label>
        <textarea
          id="comment-content"
          placeholder="Write your comment..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          required
          rows={4}
          maxLength={5000}
          className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-none border bg-transparent px-2.5 py-2 text-xs transition-colors placeholder:text-muted-foreground focus-visible:ring-1 outline-hidden disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isSubmitting}
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {content.trim().length} / 5000
          </span>
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-end">
        <Button
          type="submit"
          variant="default"
          size="default"
          disabled={isSubmitting || !content.trim()}
        >
          <Send className="size-3" data-icon="inline-start" />
          {isSubmitting ? "Posting..." : "Post Comment"}
        </Button>
      </div>
    </form>
  );
}
