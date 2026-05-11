/**
 * Edit Field Group - /admin/custom-fields/$groupId/edit
 *
 * Route configuration only. Component is lazy-loaded from edit.lazy.tsx.
 */

import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute(
  "/_authenticated/_admin/custom-fields/$groupId/edit",
)({
  pendingComponent: FieldGroupSkeleton,
});

function FieldGroupSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-32" />
      </div>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-[400px] w-full" />
      <Skeleton className="h-[200px] w-full" />
    </div>
  );
}
