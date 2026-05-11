/**
 * Edit Menu - /admin/menus/$menuId/edit
 *
 * Route configuration only. Component is lazy-loaded from edit.lazy.tsx.
 */

import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute(
  "/_authenticated/_admin/menus/$menuId/edit",
)({
  pendingComponent: MenuEditorSkeleton,
});

function MenuEditorSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
        <Skeleton className="h-[400px]" />
        <Skeleton className="h-[400px]" />
      </div>
    </div>
  );
}
