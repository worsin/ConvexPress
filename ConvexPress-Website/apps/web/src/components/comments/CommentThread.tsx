import { useState } from "react";

import { cn } from "@/lib/utils";
import type { CommentData } from "@/lib/blog/types";

import { CommentItem } from "./CommentItem";
import { CommentReplyForm } from "./CommentReplyForm";

interface CommentThreadProps {
  comments: CommentData[];
  onReply?: (commentId: string) => void;
  replyingTo?: string | null;
  onCancelReply?: () => void;
  onReplySuccess?: () => void;
  maxDepth?: number;
  currentUserId?: string;
  className?: string;
  /** ID of the comment currently being edited (managed by parent or internal state) */
  editingId?: string | null;
  /** Callback when a user starts editing a comment */
  onEditStart?: (commentId: string) => void;
  /** Callback when editing is cancelled */
  onEditCancel?: () => void;
  /** Callback when editing is saved */
  onEditSave?: () => void;
}

/**
 * Recursive threaded comment display.
 * Renders comments and their nested replies up to maxDepth levels.
 * Inline reply form appears directly below the comment being replied to.
 * Supports inline editing with edit form replacing comment content.
 */
export function CommentThread({
  comments,
  onReply,
  replyingTo,
  onCancelReply,
  onReplySuccess,
  maxDepth = 5,
  currentUserId,
  className,
  editingId: externalEditingId,
  onEditStart: externalOnEditStart,
  onEditCancel: externalOnEditCancel,
  onEditSave: externalOnEditSave,
}: CommentThreadProps) {
  // Internal editing state (used when no external control is provided)
  const [internalEditingId, setInternalEditingId] = useState<string | null>(null);

  // Use external state if provided, otherwise use internal state
  const editingId = externalEditingId !== undefined ? externalEditingId : internalEditingId;
  const onEditStart = externalOnEditStart ?? ((id: string) => setInternalEditingId(id));
  const onEditCancel = externalOnEditCancel ?? (() => setInternalEditingId(null));
  const onEditSave = externalOnEditSave ?? (() => setInternalEditingId(null));

  if (comments.length === 0) return null;

  return (
    <div
      data-slot="comment-thread"
      className={cn("flex flex-col gap-4", className)}
    >
      {comments.map((comment) => (
        <div key={comment._id} className="flex flex-col gap-4">
          <CommentItem
            comment={comment}
            onReply={comment.depth < maxDepth ? onReply : undefined}
            currentUserId={currentUserId}
            isEditing={editingId === comment._id}
            onEdit={onEditStart}
            onCancelEdit={onEditCancel}
            onSaveEdit={onEditSave}
          />

          {/* Inline reply form (appears directly below the comment being replied to) */}
          {replyingTo === comment._id && onCancelReply && (
            <div className="ml-6 border-l border-border pl-4 md:ml-8 md:pl-6">
              <CommentReplyForm
                parentCommentId={comment._id}
                onCancel={onCancelReply}
                onSuccess={onReplySuccess}
              />
            </div>
          )}

          {/* Nested replies */}
          {comment.replies && comment.replies.length > 0 && (
            <div className="ml-6 border-l border-border pl-4 md:ml-8 md:pl-6">
              <CommentThread
                comments={comment.replies}
                onReply={onReply}
                replyingTo={replyingTo}
                onCancelReply={onCancelReply}
                onReplySuccess={onReplySuccess}
                maxDepth={maxDepth}
                currentUserId={currentUserId}
                editingId={editingId}
                onEditStart={onEditStart}
                onEditCancel={onEditCancel}
                onEditSave={onEditSave}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
