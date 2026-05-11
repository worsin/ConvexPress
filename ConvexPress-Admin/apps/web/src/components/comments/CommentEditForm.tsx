import { getErrorMessage, asId } from "@/lib/utils";
/**
 * CommentEditForm - Full edit form for the Edit Comment page.
 *
 * Contains content textarea with character count (max 5000),
 * status dropdown (Approved/Pending/Spam), moderation info display,
 * and Update/Trash action buttons.
 */

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

const MAX_CONTENT_LENGTH = 5000;

interface CommentEditFormProps {
  commentId: string;
  content: string;
  status: string;
  moderatedBy?: string;
  moderatedAt?: number;
  onSaved: () => void;
  onTrashed: () => void;
}

export function CommentEditForm({
  commentId,
  content: initialContent,
  status: initialStatus,
  moderatedBy,
  moderatedAt,
  onSaved,
  onTrashed,
}: CommentEditFormProps) {
  const [content, setContent] = useState(initialContent);
  const [status, setStatus] = useState(initialStatus);
  const [isSaving, setIsSaving] = useState(false);
  const [isTrashing, setIsTrashing] = useState(false);

  const updateMutation = useMutation(api.comments.mutations.update);
  const approveMutation = useMutation(api.comments.mutations.approve);
  const rejectMutation = useMutation(api.comments.mutations.reject);
  const spamMutation = useMutation(api.comments.mutations.spam);
  const trashMutation = useMutation(api.comments.mutations.trash);

  async function handleUpdate() {
    if (!content.trim()) {
      toast.error("Comment content cannot be empty.");
      return;
    }
    if (content.trim().length > MAX_CONTENT_LENGTH) {
      toast.error(`Comment must be ${MAX_CONTENT_LENGTH} characters or fewer.`);
      return;
    }

    setIsSaving(true);
    try {
      // Update content if changed
      if (content.trim() !== initialContent) {
        await updateMutation({
          commentId: asId<"comments">(commentId),
          content: content.trim(),
        });
      }

      // Update status if changed
      if (status !== initialStatus) {
        if (status === "approved") {
          await approveMutation({ commentId: asId<"comments">(commentId) });
        } else if (status === "pending") {
          await rejectMutation({ commentId: asId<"comments">(commentId) });
        } else if (status === "spam") {
          await spamMutation({ commentId: asId<"comments">(commentId) });
        }
      }

      toast.success("Comment updated.");
      onSaved();
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to update comment");
      console.error("Failed to update comment:", error);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTrash() {
    setIsTrashing(true);
    try {
      await trashMutation({ commentId: asId<"comments">(commentId) });
      toast.success("Comment moved to trash.");
      onTrashed();
    } catch (error: unknown) {
      const message = getErrorMessage(error, "Failed to trash comment");
      console.error("Failed to trash comment:", error);
      toast.error(message);
    } finally {
      setIsTrashing(false);
    }
  }

  const charCount = content.trim().length;
  const isOverLimit = charCount > MAX_CONTENT_LENGTH;

  return (
    <div className="space-y-4">
      {/* Content editor */}
      <div className="border border-border bg-card p-4">
        <h3 className="text-xs font-semibold text-foreground mb-3">
          Comment Content
        </h3>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-none border bg-transparent px-2.5 py-2 text-xs transition-colors placeholder:text-muted-foreground focus-visible:ring-1 outline-hidden disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isSaving}
          aria-label="Comment content"
        />
        <div className="flex items-center justify-between mt-1">
          <span
            className={`text-[10px] ${isOverLimit ? "text-destructive" : "text-muted-foreground"}`}
          >
            {charCount} / {MAX_CONTENT_LENGTH}
          </span>
        </div>
      </div>

      {/* Status */}
      <div className="border border-border bg-card p-4">
        <h3 className="text-xs font-semibold text-foreground mb-3">Status</h3>
        <div className="flex items-center gap-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={isSaving || initialStatus === "trash"}
            className="dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 rounded-none border bg-transparent px-2 py-1.5 text-xs outline-hidden transition-colors focus-visible:ring-1"
          >
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="spam">Spam</option>
          </select>
          {initialStatus === "trash" && (
            <span className="text-xs text-destructive">
              This comment is in the trash.
            </span>
          )}
        </div>
      </div>

      {/* Moderation info */}
      {moderatedBy && moderatedAt && (
        <div className="border border-border bg-card p-4">
          <h3 className="text-xs font-semibold text-foreground mb-3">
            Moderation
          </h3>
          <p className="text-xs text-muted-foreground">
            Moderated on{" "}
            {new Date(moderatedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          onClick={handleUpdate}
          disabled={isSaving || isTrashing || isOverLimit || !content.trim()}
        >
          {isSaving && <Loader2 className="mr-1.5 size-3 animate-spin" />}
          Update
        </Button>
        {initialStatus !== "trash" && (
          <Button
            variant="destructive"
            onClick={handleTrash}
            disabled={isSaving || isTrashing}
          >
            {isTrashing && (
              <Loader2 className="mr-1.5 size-3 animate-spin" />
            )}
            Move to Trash
          </Button>
        )}
      </div>
    </div>
  );
}
