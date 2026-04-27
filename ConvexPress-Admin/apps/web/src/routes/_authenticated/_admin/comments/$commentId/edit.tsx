/**
 * Edit Comment - /admin/comments/$commentId/edit
 *
 * Full-page comment editor for moderators.
 * Loads comment data via Convex query and provides
 * content editor, status dropdown, moderation info, and flag display.
 */

import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { ArrowLeftIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { asId } from "@/lib/utils";
import { CommentEditForm } from "@/components/comments/CommentEditForm";
import { CommentAuthorInfo } from "@/components/comments/CommentAuthorInfo";
import { CommentFlagsList } from "@/components/comments/CommentFlagsList";

export const Route = createFileRoute(
  "/_authenticated/_admin/comments/$commentId/edit",
)({
  component: EditCommentPage,
});

function EditCommentPage() {
  const { commentId } = useParams({
    from: "/_authenticated/_admin/comments/$commentId/edit",
  });
  const navigate = useNavigate();

  const comment = useQuery(api.comments.queries.get, {
    commentId: asId<"comments">(commentId),
  });

  // Loading state
  if (comment === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
          <div className="space-y-4">
            <Skeleton className="h-[200px] w-full" />
            <Skeleton className="h-[100px] w-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-[150px] w-full" />
            <Skeleton className="h-[100px] w-full" />
          </div>
        </div>
      </div>
    );
  }

  // Not found
  if (comment === null) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-lg font-semibold text-foreground mb-2">
          Comment Not Found
        </h1>
        <p className="text-sm text-muted-foreground mb-4">
          The comment you are looking for does not exist or has been deleted.
        </p>
        <Link
          to="/comments"
          className="text-sm text-primary hover:underline"
        >
          Back to All Comments
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/comments"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="size-4" />
          </Link>
          <h1 className="text-lg font-semibold text-foreground">
            Edit Comment
          </h1>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        {/* Main column */}
        <CommentEditForm
          commentId={commentId}
          content={comment.content}
          status={comment.status}
          moderatedBy={comment.moderatedBy}
          moderatedAt={comment.moderatedAt}
          onSaved={() => navigate({ to: "/comments" })}
          onTrashed={() => navigate({ to: "/comments" })}
        />

        {/* Sidebar column */}
        <div className="space-y-4">
          {/* Author info */}
          <CommentAuthorInfo
            authorName={comment.authorName}
            authorAvatarUrl={comment.authorAvatarUrl}
            authorId={comment.authorId}
            createdAt={comment.createdAt}
          />

          {/* In Response To */}
          <div className="border border-border bg-card p-4">
            <h3 className="text-xs font-semibold text-foreground mb-3">
              In Response To
            </h3>
            <Link
              to="/posts/$postId/edit"
              params={{ postId: comment.postId as string }}
              className="text-xs text-primary hover:underline"
            >
              {comment.postTitle}
            </Link>
            {comment.parentPreview && (
              <div className="mt-2 border-l-2 border-border pl-2">
                <p className="text-[10px] text-muted-foreground">
                  Reply to {comment.parentPreview.authorName}:
                </p>
                <p className="text-xs text-muted-foreground italic mt-0.5">
                  "{comment.parentPreview.content}"
                </p>
              </div>
            )}
          </div>

          {/* Flags */}
          <CommentFlagsList
            flagCount={comment.flagCount}
            flaggedReasons={comment.flaggedReasons}
          />
        </div>
      </div>
    </div>
  );
}
