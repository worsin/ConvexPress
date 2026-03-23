import { cn } from "@/lib/utils";
import type { PostCard as PostCardType } from "@/lib/blog/types";

import { PostCard } from "./PostCard";

interface RelatedPostsProps {
  posts: PostCardType[];
  className?: string;
}

/**
 * Related posts grid displayed at the end of a single post.
 * Shows 3 posts from the same category, excluding the current post.
 */
export function RelatedPosts({ posts, className }: RelatedPostsProps) {
  if (posts.length === 0) return null;

  return (
    <section
      data-slot="related-posts"
      className={cn("flex flex-col gap-4", className)}
      aria-label="Related posts"
    >
      <h2 className="text-sm font-medium">Related Posts</h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.slice(0, 3).map((post) => (
          <PostCard key={post._id} post={post} />
        ))}
      </div>
    </section>
  );
}
