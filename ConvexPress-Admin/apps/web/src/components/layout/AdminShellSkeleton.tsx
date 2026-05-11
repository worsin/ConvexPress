import { Skeleton } from "@/components/ui/skeleton";

/**
 * Full-page skeleton shown while shell data is loading.
 * Mimics the admin shell layout: sidebar + admin bar + content area.
 */
export function AdminShellSkeleton() {
  return (
    <div className="flex h-svh">
      {/* Sidebar skeleton */}
      <div className="hidden md:flex w-60 flex-col border-r border-border bg-sidebar p-3 gap-3">
        {/* Header */}
        <div className="flex items-center gap-2 h-12">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>

        {/* Nav items */}
        <div className="space-y-2 mt-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 px-1">
              <Skeleton className="size-4" />
              <Skeleton className="h-3 flex-1" />
            </div>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Admin bar skeleton */}
        <div className="flex h-12 items-center justify-between border-b border-border px-4">
          <Skeleton className="h-4 w-32" />
          <div className="flex items-center gap-2">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>

        {/* Content skeleton */}
        <div className="flex-1 p-6">
          <Skeleton className="h-6 w-48 mb-6" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
