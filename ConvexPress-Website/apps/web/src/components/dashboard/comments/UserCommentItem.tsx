import { useCallback, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import type { UserComment } from "@/lib/dashboard/types";
import { extractErrorMessage, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "../StatusBadge";

interface UserCommentItemProps {
  comment: UserComment;
}

/** Grace period for comment editing (5 minutes in milliseconds) */
const EDIT_GRACE_PERIOD_MS = 5 * 60 * 1000;

/**
 * Single comment item with inline edit, view, and delete actions.
 * Wired to Convex mutations for edit and trash operations.
 *
 * Enforces a 5-minute client-side edit grace period with visual countdown (#113).
 */
export function UserCommentItem({ comment }: UserCommentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editTimeRemaining, setEditTimeRemaining] = useState<number | null>(null);

  const updateMutation = useMutation(api.comments.mutations.update);
  const trashMutation = useMutation(api.comments.mutations.trash);

  // Client-side grace period check and countdown timer (#113)
  useEffect(() => {
    if (!comment.isEditable) {
      setEditTimeRemaining(null);
      return;
    }

    const updateRemaining = () => {
      const elapsed = Date.now() - comment.createdAt;
      const remaining = EDIT_GRACE_PERIOD_MS - elapsed;
      if (remaining <= 0) {
        setEditTimeRemaining(0);
      } else {
        setEditTimeRemaining(remaining);
      }
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [comment.isEditable, comment.createdAt]);

  // Derived: whether the edit window is still open based on client time
  const isEditWindowOpen = editTimeRemaining !== null && editTimeRemaining > 0;

  // Format remaining time as "Xm Xs"
  const editCountdownText = (() => {
    if (editTimeRemaining === null || editTimeRemaining <= 0) return null;
    const totalSeconds = Math.ceil(editTimeRemaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  })();

  const handleSaveEdit = useCallback(async () => {
    if (!editContent.trim()) return;

    // Check client-side grace period before saving (#113)
    if (!isEditWindowOpen) {
      toast.error("Edit window has expired.");
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await updateMutation({
        commentId: comment._id as Id<"comments">,
        content: editContent.trim(),
      });
      toast.success("Comment updated");
      setIsEditing(false);
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, "Failed to update comment"));
    } finally {
      setIsSaving(false);
    }
  }, [editContent, comment._id, updateMutation, isEditWindowOpen]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await trashMutation({
        commentId: comment._id as Id<"comments">,
      });
      toast.success("Comment deleted");
      setShowDeleteConfirm(false);
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, "Failed to delete comment"));
    } finally {
      setIsDeleting(false);
    }
  }, [comment._id, trashMutation]);

  return (
    <div
      data-slot="user-comment-item"
      className="border-b border-border py-3 last:border-b-0"
    >
      {isEditing ? (
        /* Inline Edit Mode */
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={3}
            maxLength={5000}
            disabled={isSaving}
            className={cn(
              "dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50",
              "w-full resize-y rounded-none border bg-transparent px-2.5 py-2 text-xs",
              "placeholder:text-muted-foreground outline-hidden transition-colors focus-visible:ring-1",
              "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
            )}
            aria-label="Edit comment"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {editContent.trim().length} / 5000
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="xs"
                onClick={handleSaveEdit}
                disabled={isSaving || !editContent.trim()}
              >
                {isSaving && <Loader2 className="size-3 animate-spin" />}
                <span>Save</span>
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(comment.content);
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* View Mode */
        <div className="space-y-1.5">
          <p className="text-xs text-foreground">{comment.excerpt}</p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>
              On:{" "}
              <Link
                // @ts-expect-error - Dynamic route string
                to={`/blog/${comment.postSlug}`}
                className="text-primary hover:underline"
              >
                {comment.postTitle}
              </Link>
            </span>
            <StatusBadge status={comment.status} />
            <span>{formatRelativeTime(comment.createdAt)}</span>
            {comment.likeCount > 0 && (
              <span>{comment.likeCount} like{comment.likeCount !== 1 ? "s" : ""}</span>
            )}
          </div>

          {/* Pending notice */}
          {comment.status === "pending" && (
            <p className="text-[10px] text-primary/80">
              Your comment is awaiting moderation.
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Link
            // @ts-expect-error - Dynamic route string
              to={`/blog/${comment.postSlug}#comment-${comment._id}`}
              className="text-[10px] text-primary hover:underline"
            >
              View
            </Link>

            {comment.isEditable && isEditWindowOpen && (
              <span className="inline-flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="text-[10px] text-primary hover:underline"
                >
                  Edit
                </button>
                {editCountdownText && (
                  <span className="text-[9px] tabular-nums text-muted-foreground">
                    ({editCountdownText})
                  </span>
                )}
              </span>
            )}

            {showDeleteConfirm ? (
              <span className="flex items-center gap-1 text-[10px]">
                <span className="text-muted-foreground">Are you sure?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-destructive hover:underline"
                >
                  {isDeleting ? "..." : "Yes"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-muted-foreground hover:underline"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-[10px] text-destructive hover:underline"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
