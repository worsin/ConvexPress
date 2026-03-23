import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PostCard as PostCardType } from "@/lib/blog/types";

import { CategoryBadge } from "./CategoryBadge";
import { PostMeta } from "./PostMeta";

interface PostCardFeaturedProps {
  post: PostCardType;
  className?: string;
}

/**
 * Larger featured/sticky post card for the top of the blog index.
 * Horizontal layout on desktop, stacked on mobile.
 */
export function PostCardFeatured({ post, className }: PostCardFeaturedProps) {
  return (
    <article
      data-slot="post-card-featured"
      className={cn(
        "group/featured overflow-hidden rounded-none border border-border bg-card transition-colors hover:border-foreground/20",
        "grid grid-cols-1 md:grid-cols-2",
        className,
      )}
    >
      {/* Thumbnail */}
      {post.featuredImageUrl && (
        <Link to="/blog/$slug" params={{ slug: post.slug }} className="block overflow-hidden">
          <img
            src={post.featuredImageUrl}
            alt={post.featuredImageAlt ?? post.title}
            className="aspect-video h-full w-full object-cover transition-transform duration-300 group-hover/featured:scale-[1.02] md:aspect-auto md:min-h-[280px]"
            loading="lazy"
          />
        </Link>
      )}

      {/* Content */}
      <div className="flex flex-col gap-3 p-6">
        {/* Category + Sticky Badge */}
        <div className="flex items-center gap-2">
          {post.isSticky && (
            <span className="inline-block rounded-none bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
              Featured
            </span>
          )}
          {post.primaryCategory && (
            <CategoryBadge
              name={post.primaryCategory.name}
              slug={post.primaryCategory.slug}
            />
          )}
        </div>

        {/* Title */}
        <h2 className="text-sm font-semibold leading-tight md:text-base">
          <Link
            to="/blog/$slug"
            params={{ slug: post.slug }}
            className="transition-colors hover:text-primary"
          >
            {post.title}
          </Link>
        </h2>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
            {post.excerpt}
          </p>
        )}

        {/* Meta */}
        <div className="mt-auto flex items-center justify-between pt-2">
          <PostMeta
            author={post.author}
            publishedAt={post.publishedAt}
            readingTime={post.readingTime}
            showAvatar
          />

          {post.commentCount > 0 && (
            <Link
              to="/blog/$slug"
              params={{ slug: post.slug }}
              hash="comments"
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <MessageSquare className="size-3" aria-hidden="true" />
              <span>{post.commentCount}</span>
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
