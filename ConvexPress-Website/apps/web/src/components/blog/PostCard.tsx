import { Link } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PostCard as PostCardType } from "@/lib/blog/types";

import { CategoryBadge } from "./CategoryBadge";
import { PostMeta } from "./PostMeta";

interface PostCardProps {
  post: PostCardType;
  /** Display variant: default (vertical), compact (no image), or horizontal (side-by-side) */
  variant?: "default" | "compact" | "horizontal";
  className?: string;
}

/**
 * Reusable post card for blog index, archives, search results.
 * Displays thumbnail, title, excerpt, author, date, category.
 *
 * Variants:
 *   - default: Vertical card with image on top
 *   - compact: No image, text-only compact layout
 *   - horizontal: Image on left, text on right
 */
export function PostCard({ post, variant = "default", className }: PostCardProps) {
  if (variant === "compact") {
    return (
      <article
        data-slot="post-card"
        data-variant="compact"
        className={cn(
          "group/post-card flex flex-col gap-1 rounded-none border-b border-border py-3 last:border-b-0",
          className,
        )}
      >
        {/* Category */}
        {post.primaryCategory && (
          <CategoryBadge
            name={post.primaryCategory.name}
            slug={post.primaryCategory.slug}
          />
        )}

        {/* Title */}
        <h3 className="text-sm font-medium leading-tight">
          <Link
            to="/blog/$slug"
            params={{ slug: post.slug }}
            className="transition-colors hover:text-primary"
          >
            {post.title}
          </Link>
        </h3>

        {/* Meta */}
        <PostMeta
          author={post.author}
          publishedAt={post.publishedAt}
          readingTime={post.readingTime}
        />
      </article>
    );
  }

  if (variant === "horizontal") {
    return (
      <article
        data-slot="post-card"
        data-variant="horizontal"
        className={cn(
          "group/post-card grid grid-cols-[120px_1fr] gap-4 overflow-hidden rounded-none border border-border bg-card transition-colors hover:border-foreground/20 sm:grid-cols-[180px_1fr]",
          className,
        )}
      >
        {/* Thumbnail */}
        {post.featuredImageUrl ? (
          <Link to="/blog/$slug" params={{ slug: post.slug }} className="block overflow-hidden">
            <img
              src={post.featuredImageUrl}
              alt={post.featuredImageAlt ?? post.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover/post-card:scale-[1.02]"
              loading="lazy"
            />
          </Link>
        ) : (
          <div className="bg-muted" />
        )}

        {/* Content */}
        <div className="flex flex-col gap-1.5 py-3 pr-4">
          {post.primaryCategory && (
            <CategoryBadge
              name={post.primaryCategory.name}
              slug={post.primaryCategory.slug}
            />
          )}

          <h3 className="text-sm font-medium leading-tight">
            <Link
              to="/blog/$slug"
              params={{ slug: post.slug }}
              className="transition-colors hover:text-primary"
            >
              {post.title}
            </Link>
          </h3>

          {post.excerpt && (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {post.excerpt}
            </p>
          )}

          <div className="mt-auto flex items-center justify-between pt-1">
            <PostMeta
              author={post.author}
              publishedAt={post.publishedAt}
              readingTime={post.readingTime}
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

  // Default variant: vertical card
  return (
    <article
      data-slot="post-card"
      data-variant="default"
      className={cn(
        "group/post-card flex flex-col overflow-hidden rounded-none border border-border bg-card transition-colors hover:border-foreground/20",
        className,
      )}
    >
      {/* Thumbnail */}
      {post.featuredImageUrl && (
        <Link to="/blog/$slug" params={{ slug: post.slug }} className="block overflow-hidden">
          <img
            src={post.featuredImageUrl}
            alt={post.featuredImageAlt ?? post.title}
            className="aspect-video w-full object-cover transition-transform duration-300 group-hover/post-card:scale-[1.02]"
            loading="lazy"
          />
        </Link>
      )}

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        {/* Category */}
        {post.primaryCategory && (
          <div>
            <CategoryBadge
              name={post.primaryCategory.name}
              slug={post.primaryCategory.slug}
            />
          </div>
        )}

        {/* Title */}
        <h3 className="text-sm font-medium leading-tight">
          <Link
            to="/blog/$slug"
            params={{ slug: post.slug }}
            className="transition-colors hover:text-primary"
          >
            {post.title}
          </Link>
        </h3>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {post.excerpt}
          </p>
        )}

        {/* Meta + Comment Count */}
        <div className="mt-auto flex items-center justify-between pt-2">
          <PostMeta
            author={post.author}
            publishedAt={post.publishedAt}
            readingTime={post.readingTime}
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
