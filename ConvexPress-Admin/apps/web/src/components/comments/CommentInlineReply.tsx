import { getErrorMessage, asId } from "@/lib/utils";
/**
 * CommentInlineReply - Inline reply form below a comment row.
 *
 * Appears when a moderator clicks "Reply" on a comment row action.
 * Calls the `comments.mutations.reply` Convex mutation.
 * Since the replier is a moderator, the reply is auto-approved.
 */

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface CommentInlineReplyProps {
  commentId: string;
  authorName: string;
  onClose: () => void;
}

export function CommentInlineReply({
  commentId,
  authorName,
  onClose,
}: CommentInlineReplyProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const replyMutation = useMutation(api.comments.mutations.reply);

  async function handleSubmit() {
    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      await replyMutation({
        parentCommentId: asId<"comments">(commentId),
        content: content.trim(),
      });
      toast.success(`Reply to ${authorName} posted.`);
      setContent("");
      onClose();
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to post reply");
      console.error("Failed to post reply:", error);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-3">
      <div className="text-xs text-muted-foreground mb-2">
        Reply to {authorName}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Type your reply..."
        rows={3}
        className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-none border bg-transparent px-2.5 py-2 text-xs transition-colors placeholder:text-muted-foreground focus-visible:ring-1 outline-hidden disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isSubmitting}
        aria-label="Reply content"
      />
      <div className="flex items-center gap-2 mt-2">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={isSubmitting || !content.trim()}
        >
          {isSubmitting && <Loader2 className="mr-1.5 size-3 animate-spin" />}
          Reply
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
