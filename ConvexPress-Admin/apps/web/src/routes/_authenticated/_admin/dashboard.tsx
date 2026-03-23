/**
 * Dashboard - /admin/dashboard
 *
 * Route configuration only. Component is lazy-loaded from dashboard.lazy.tsx.
 */

import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/_admin/dashboard")({
  pendingComponent: DashboardSkeleton,
});

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      {/* Widget grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[300px] md:col-span-2" />
        <Skeleton className="h-[300px]" />
      </div>
    </div>
  );
}
