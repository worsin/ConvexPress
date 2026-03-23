import { cn } from "@/lib/utils";
import type { PostCard as PostCardType } from "@/lib/blog/types";

import { PostCard } from "./PostCard";
import { PostCardFeatured } from "./PostCardFeatured";

interface PostGridProps {
  posts: PostCardType[];
  layout?: "grid" | "list";
  showFeatured?: boolean;
  className?: string;
}

/**
 * Grid/list layout for post cards. Optionally renders sticky posts
 * as featured cards at the top.
 */
export function PostGrid({
  posts,
  layout = "grid",
  showFeatured = false,
  className,
}: PostGridProps) {
  const stickyPosts = showFeatured ? posts.filter((p) => p.isSticky) : [];
  const regularPosts = showFeatured ? posts.filter((p) => !p.isSticky) : posts;

  if (posts.length === 0) {
    return (
      <div data-slot="post-grid-empty" className="py-12 text-center">
        <p className="text-sm text-muted-foreground">No posts found.</p>
      </div>
    );
  }

  return (
    <div data-slot="post-grid" className={cn("flex flex-col gap-6", className)}>
      {/* Featured/Sticky Posts */}
      {stickyPosts.length > 0 && (
        <div className="flex flex-col gap-6">
          {stickyPosts.map((post) => (
            <PostCardFeatured key={post._id} post={post} />
          ))}
        </div>
      )}

      {/* Regular Posts */}
      {regularPosts.length > 0 && (
        <div
          className={cn(
            layout === "grid"
              ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
              : "flex flex-col gap-4",
          )}
        >
          {regularPosts.map((post) => (
            <PostCard key={post._id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
