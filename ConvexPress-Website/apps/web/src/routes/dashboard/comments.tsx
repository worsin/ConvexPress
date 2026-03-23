import { createFileRoute } from "@tanstack/react-router";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCommentList } from "@/components/dashboard/comments/UserCommentList";

export const Route = createFileRoute("/dashboard/comments")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
  }),
  component: CommentsPage,
});

function CommentsPage() {
  const { user, isLoading } = useCurrentUser();

  if (isLoading || !user) {
    return <CommentsSkeleton />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-sm font-medium text-foreground">My Comments</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          View and manage your comments.
        </p>
      </div>
      <UserCommentList userId={user._id} />
    </div>
  );
}

function CommentsSkeleton() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-1 h-3 w-48" />
      </div>
      <Skeleton className="h-8 w-full" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2 border-b border-border py-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
