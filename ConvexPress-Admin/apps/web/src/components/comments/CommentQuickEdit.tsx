import { getErrorMessage, asId } from "@/lib/utils";
/**
 * CommentQuickEdit - Inline quick edit form below a comment row.
 *
 * Appears when a moderator clicks "Quick Edit" on a comment row action.
 * Allows editing content and changing status inline without navigating away.
 */

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

interface CommentQuickEditProps {
  commentId: string;
  currentContent: string;
  currentStatus: string;
  onClose: () => void;
}

export function CommentQuickEdit({
  commentId,
  currentContent,
  currentStatus,
  onClose,
}: CommentQuickEditProps) {
  const [content, setContent] = useState(currentContent);
  const [status, setStatus] = useState(currentStatus);
  const [isSaving, setIsSaving] = useState(false);

  const updateMutation = useMutation(api.comments.mutations.update);
  const approveMutation = useMutation(api.comments.mutations.approve);
  const rejectMutation = useMutation(api.comments.mutations.reject);
  const spamMutation = useMutation(api.comments.mutations.spam);

  async function handleSave() {
    setIsSaving(true);
    try {
      // Update content if changed
      if (content.trim() !== currentContent) {
        await updateMutation({
          commentId: asId<"comments">(commentId),
          content: content.trim(),
        });
      }

      // Update status if changed
      if (status !== currentStatus) {
        if (status === "approved") {
          await approveMutation({ commentId: asId<"comments">(commentId) });
        } else if (status === "pending") {
          await rejectMutation({ commentId: asId<"comments">(commentId) });
        } else if (status === "spam") {
          await spamMutation({ commentId: asId<"comments">(commentId) });
        }
      }

      toast.success("Comment updated.");
      onClose();
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to update comment");
      console.error("Failed to update comment:", error);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="border-t border-border bg-muted/30 px-4 py-3">
      <div className="text-xs font-medium text-foreground mb-2">
        Quick Edit
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-none border bg-transparent px-2.5 py-2 text-xs transition-colors placeholder:text-muted-foreground focus-visible:ring-1 outline-hidden disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 mb-2"
        disabled={isSaving}
        aria-label="Edit comment content"
      />

      <div className="flex items-center gap-3 mb-2">
        <label className="text-xs text-muted-foreground" htmlFor="quick-edit-status">
          Status:
        </label>
        <select
          id="quick-edit-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={isSaving || currentStatus === "trash"}
          className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 rounded-none border bg-transparent px-2 py-1 text-xs outline-hidden transition-colors focus-visible:ring-1"
        >
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="spam">Spam</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || !content.trim()}
        >
          {isSaving && <Loader2 className="mr-1.5 size-3 animate-spin" />}
          Update
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={isSaving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
