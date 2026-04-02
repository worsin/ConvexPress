/**
 * Page SEO Tab - /admin/pages/$pageId/seo
 *
 * Route configuration only. Component is lazy-loaded from seo.lazy.tsx.
 */

import { createFileRoute } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute(
  "/_authenticated/_admin/pages/$pageId/seo",
)({
  pendingComponent: SeoTabSkeleton,
});

function SeoTabSkeleton() {
  return (
    <div className="space-y-6 px-6">
      {/* Score cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[200px] w-full" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-[120px] w-full" />
          <Skeleton className="h-[250px] w-full" />
          <Skeleton className="h-[250px] w-full" />
        </div>
      </div>
    </div>
  );
}
