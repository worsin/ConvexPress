/**
 * Edit Post - /admin/posts/$postId/edit
 *
 * Route configuration only. Component is lazy-loaded from edit.lazy.tsx.
 */

import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute(
  "/_authenticated/_admin/posts/$postId/edit",
)({
  pendingComponent: EditorSkeleton,
});

function EditorSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-6 w-96" />
          <Skeleton className="h-[400px] w-full" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="h-[150px] w-full" />
          <Skeleton className="h-[100px] w-full" />
        </div>
      </div>
    </div>
  );
}
