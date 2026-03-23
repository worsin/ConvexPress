/**
 * Recent Posts Widget - Website Renderer
 *
 * Displays a list of recent blog posts with optional dates and thumbnails.
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

interface RecentPostsWidgetConfig {
  number?: number;
  showDate?: boolean;
  showThumbnail?: boolean;
  categoryId?: string;
}

export function RecentPostsWidget({
  config,
}: {
  config: RecentPostsWidgetConfig;
}) {
  const count = config.number ?? 5;
  const posts = useQuery(api.posts.queries.listPublished, {
    limit: count,
  });

  if (!posts || posts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No recent posts.</p>
    );
  }

  // Use the posts array, limited to count
  const displayPosts = posts.slice(0, count);

  return (
    <ul className="space-y-2">
      {displayPosts.map((post: (typeof displayPosts)[number]) => (
        <li key={post._id}>
          <a
            href={`/blog/${post.slug}`}
            className="group flex items-start gap-2 text-sm hover:text-foreground transition-colors"
          >
            {config.showThumbnail && post.featuredImage && (
              <img
                src={post.featuredImage}
                alt=""
                className="size-10 object-cover shrink-0"
                loading="lazy"
              />
            )}
            <div className="min-w-0">
              <span className="block text-sm leading-snug group-hover:underline truncate">
                {post.title}
              </span>
              {config.showDate && post.publishedAt && (
                <time
                  dateTime={new Date(post.publishedAt).toISOString()}
                  className="text-xs text-muted-foreground"
                >
                  {new Date(post.publishedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </time>
              )}
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
