import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";

import { CommentForm } from "./CommentForm";
import { CommentPagination } from "./CommentPagination";
import { CommentThread } from "./CommentThread";

interface CommentSectionProps {
  postId: string;
  commentStatus?: "open" | "closed";
  /** Whether comments are enabled on this post. Defaults to true. */
  commentsEnabled?: boolean;
  isLoggedIn?: boolean;
  currentUserId?: string;
  className?: string;
}

/**
 * Full comment section wrapper. Fetches comments via Convex,
 * renders threaded display, and provides the comment form.
 *
 * All commenters must be authenticated in ConvexPress.
 */
export function CommentSection({
  postId,
  commentStatus = "open",
  commentsEnabled = true,
  isLoggedIn = false,
  currentUserId,
  className,
}: CommentSectionProps) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [commentPage, setCommentPage] = useState(1);

  // Fetch comments from Convex
  const result = useQuery(api.comments.queries.forPost, {
    postId: postId as Id<"posts">,
    page: commentPage,
    perPage: 50,
  });

  const comments = result?.comments;
  const totalCommentPages = result?.totalPages ?? 1;
  const totalCommentCount = result?.total ?? 0;
  const postCommentStatus = result?.commentStatus ?? commentStatus;

  function handleReply(commentId: string) {
    setReplyingTo(commentId === replyingTo ? null : commentId);
  }

  function handleCancelReply() {
    setReplyingTo(null);
  }

  function handleReplySuccess() {
    setReplyingTo(null);
  }

  // Comments not enabled on this post
  if (!commentsEnabled) {
    return null;
  }

  // Comments closed
  if (postCommentStatus === "closed") {
    return (
      <div
        data-slot="comment-section"
        className={cn("py-6 text-center", className)}
      >
        <p className="text-xs text-muted-foreground">
          Comments are closed for this post.
        </p>
      </div>
    );
  }

  return (
    <section
      data-slot="comment-section"
      id="comments"
      className={cn("flex flex-col gap-6", className)}
      aria-label="Comments"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <MessageSquare className="size-4" aria-hidden="true" />
        <h2 className="text-sm font-medium">
          {totalCommentCount > 0
            ? `${totalCommentCount} ${totalCommentCount === 1 ? "Comment" : "Comments"}`
            : "Leave a Comment"}
        </h2>
      </div>

      {/* Comment Form (top-level, only when not replying) */}
      {!replyingTo && (
        <>
          {isLoggedIn ? (
            <CommentForm postId={postId} isLoggedIn={true} />
          ) : (
            <div className="py-4 text-center border border-border bg-muted/30">
              <p className="text-xs text-muted-foreground">
                <a
                  href="/login"
                  className="text-primary hover:underline"
                >
                  Log in
                </a>{" "}
                to leave a comment.
              </p>
            </div>
          )}
        </>
      )}

      {/* Comments List */}
      {comments === undefined ? (
        /* Loading state */
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="size-8 animate-pulse rounded-none bg-muted" />
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-3 w-24 animate-pulse rounded-none bg-muted" />
                <div className="h-3 w-full animate-pulse rounded-none bg-muted" />
                <div className="h-3 w-2/3 animate-pulse rounded-none bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          No comments yet. Be the first to comment!
        </p>
      ) : (
        <>
          <CommentThread
            comments={comments}
            onReply={isLoggedIn ? handleReply : undefined}
            replyingTo={replyingTo}
            onCancelReply={handleCancelReply}
            onReplySuccess={handleReplySuccess}
            maxDepth={5}
            currentUserId={currentUserId}
          />

          {/* Pagination */}
          <CommentPagination
            currentPage={commentPage}
            totalPages={totalCommentPages}
            onPageChange={setCommentPage}
          />
        </>
      )}
    </section>
  );
}
