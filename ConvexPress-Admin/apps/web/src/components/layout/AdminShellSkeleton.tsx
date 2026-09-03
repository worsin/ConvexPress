import { Skeleton } from "@/components/ui/skeleton";
import { BrandLockup } from "@/components/brand/BrandLockup";

/**
 * Full-page skeleton shown while shell data is loading.
 * Mimics the admin shell layout: sidebar + topbar + content area.
 */
export function AdminShellSkeleton() {
  return (
    <div className="flex h-svh bg-background">
      {/* Sidebar skeleton */}
      <div className="hidden w-60 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-[52px] items-center px-3.5">
          <BrandLockup size={28} />
        </div>
        <div className="px-3 pb-2">
          <Skeleton className="h-11 rounded-xl" />
        </div>
        <div className="mt-2 space-y-2 px-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-1">
              <Skeleton className="size-4" />
              <Skeleton className="h-3 flex-1" />
            </div>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[52px] items-center justify-between border-b border-border px-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-[340px] rounded-lg" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-40 rounded-lg" />
            <Skeleton className="size-7 rounded-full" />
          </div>
        </div>

        <div className="flex-1 px-8 py-6">
          <Skeleton className="mb-2 h-3 w-40" />
          <Skeleton className="mb-6 h-9 w-72" />
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[116px] rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
