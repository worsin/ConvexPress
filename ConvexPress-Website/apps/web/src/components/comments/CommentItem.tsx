import DOMPurify from "isomorphic-dompurify";
import { MessageSquare, Pencil } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";
import type { CommentData } from "@/lib/blog/types";

import { CommentLikeButton } from "./CommentLikeButton";
import { CommentFlagDialog } from "./CommentFlagDialog";
import { CommentEditForm } from "./CommentEditForm";

interface CommentItemProps {
  comment: CommentData;
  onReply?: (commentId: string) => void;
  currentUserId?: string;
  className?: string;
  /** Whether this comment is currently being edited */
  isEditing?: boolean;
  /** Callback when the user clicks the Edit button */
  onEdit?: (commentId: string) => void;
  /** Callback when editing is cancelled */
  onCancelEdit?: () => void;
  /** Callback when editing is saved */
  onSaveEdit?: () => void;
}

/** Allowed HTML tags for comment content sanitization (defense-in-depth) */
const ALLOWED_TAGS = ["b", "i", "strong", "em", "a", "code", "pre", "br"];

/**
 * Formats a timestamp to a relative "time ago" string.
 */
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years}y ago`;
  if (months > 0) return `${months}mo ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

/**
 * Single comment with avatar, meta, content, and action buttons.
 * Wired to Convex mutations for like, flag, and edit actions.
 */
export function CommentItem({
  comment,
  onReply,
  currentUserId,
  className,
  isEditing,
  onEdit,
  onCancelEdit,
  onSaveEdit,
}: CommentItemProps) {
  const formattedDate = new Date(comment.createdAt).toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  );

  const isPending = comment.status === "pending";
  const isOwnComment = currentUserId && comment.authorId === currentUserId;

  // Sanitize HTML content client-side as defense-in-depth (backend also sanitizes)
  const sanitizedContent = useMemo(
    () => DOMPurify.sanitize(comment.content, { ALLOWED_TAGS }),
    [comment.content],
  );

  return (
    <div
      data-slot="comment-item"
      id={`comment-${comment._id}`}
      className={cn("flex gap-3", className)}
    >
      {/* Avatar */}
      <div className="shrink-0">
        {comment.authorAvatarUrl ? (
          <img
            src={comment.authorAvatarUrl}
            alt={comment.authorName}
            className="size-8 rounded-none object-cover"
          />
        ) : (
          <div className="flex size-8 items-center justify-center rounded-none bg-muted text-xs font-medium text-muted-foreground">
            {comment.authorName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{comment.authorName}</span>
          <time
            dateTime={new Date(comment.createdAt).toISOString()}
            className="text-xs text-muted-foreground"
            title={formattedDate}
            suppressHydrationWarning
          >
            {formatTimeAgo(comment.createdAt)}
          </time>
          {/* Edited indicator */}
          {comment.isEdited && (
            <span
              className="flex items-center gap-0.5 text-[10px] text-muted-foreground"
              title={
                comment.editedAt
                  ? `Edited ${new Date(comment.editedAt).toLocaleString()}`
                  : "Edited"
              }
            >
              <Pencil className="size-2.5" aria-hidden="true" />
              <span>edited</span>
            </span>
          )}
        </div>

        {/* Pending notice (only visible to comment author) */}
        {isPending && isOwnComment && (
          <div className="bg-primary/10 px-2 py-1 text-[10px] text-primary">
            Your comment is awaiting moderation.
          </div>
        )}

        {/* Content - shows edit form when editing, otherwise sanitized content */}
        {isEditing && onCancelEdit && onSaveEdit ? (
          <CommentEditForm
            commentId={comment._id}
            initialContent={comment.content}
            onCancel={onCancelEdit}
            onSave={onSaveEdit}
          />
        ) : (
          <>
            {/* Content - sanitized client-side with DOMPurify (defense-in-depth) */}
            <div
              className="text-xs leading-relaxed text-foreground/90"
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              {/* Like */}
              <CommentLikeButton
                commentId={comment._id}
                likeCount={comment.likeCount}
                isLiked={comment.isLikedByMe}
              />

              {/* Reply */}
              {onReply && (
                <button
                  type="button"
                  onClick={() => onReply(comment._id)}
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Reply to comment"
                >
                  <MessageSquare className="size-3" aria-hidden="true" />
                  <span>Reply</span>
                </button>
              )}

              {/* Edit (only visible if canEdit and handler provided) */}
              {comment.canEdit && onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(comment._id)}
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Edit comment"
                >
                  <Pencil className="size-3" aria-hidden="true" />
                  <span>Edit</span>
                </button>
              )}

              {/* Flag (cannot flag own comments) */}
              {!isOwnComment && currentUserId && (
                <CommentFlagDialog commentId={comment._id} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
