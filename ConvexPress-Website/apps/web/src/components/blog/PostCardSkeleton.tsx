import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface PostCardSkeletonProps {
  className?: string;
  /** Number of skeleton cards to render */
  count?: number;
}

/**
 * Reusable skeleton placeholder for PostCard loading states.
 * Matches PostCard layout with aspect-video thumbnail, title, excerpt, and meta.
 */
export function PostCardSkeleton({ className, count = 1 }: PostCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={`skeleton-${i}`}
          data-slot="post-card-skeleton"
          className={cn(
            "flex flex-col overflow-hidden rounded-none border border-border bg-card",
            className,
          )}
        >
          {/* Thumbnail */}
          <Skeleton className="aspect-video w-full" />

          {/* Content */}
          <div className="flex flex-1 flex-col gap-2 p-4">
            {/* Category Badge */}
            <Skeleton className="h-4 w-16" />

            {/* Title */}
            <Skeleton className="h-4 w-3/4" />

            {/* Excerpt */}
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />

            {/* Meta */}
            <div className="mt-auto flex items-center gap-2 pt-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * Grid of PostCardSkeletons matching the standard blog grid layout.
 */
export function PostCardSkeletonGrid({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-6 sm:grid-cols-2 lg:grid-cols-3", className)}>
      <PostCardSkeleton count={count} />
    </div>
  );
}
