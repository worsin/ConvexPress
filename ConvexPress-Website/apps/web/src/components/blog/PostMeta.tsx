import { Link } from "@tanstack/react-router";
import { Calendar, Clock, User } from "lucide-react";

import { cn } from "@/lib/utils";

interface PostMetaProps {
  author: {
    displayName: string;
    slug: string;
    avatarUrl?: string;
  };
  publishedAt?: string;
  readingTime?: number;
  className?: string;
  showAvatar?: boolean;
}

/**
 * Author + date + reading time display for post cards and headers.
 */
export function PostMeta({
  author,
  publishedAt,
  readingTime,
  className,
  showAvatar = false,
}: PostMetaProps) {
  const formattedDate = publishedAt
    ? new Date(publishedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div
      data-slot="post-meta"
      className={cn("flex flex-wrap items-center gap-3 text-xs text-muted-foreground", className)}
    >
      {/* Author */}
      <Link
        to="/author/$slug"
        params={{ slug: author.slug }}
        className="flex items-center gap-1.5 transition-colors hover:text-foreground"
      >
        {showAvatar && author.avatarUrl ? (
          <img
            src={author.avatarUrl}
            alt={author.displayName}
            className="size-5 rounded-none object-cover"
          />
        ) : (
          <User className="size-3" aria-hidden="true" />
        )}
        <span>{author.displayName}</span>
      </Link>

      {/* Date */}
      {formattedDate && (
        <span className="flex items-center gap-1">
          <Calendar className="size-3" aria-hidden="true" />
          <time dateTime={publishedAt}>{formattedDate}</time>
        </span>
      )}

      {/* Reading Time */}
      {readingTime !== undefined && readingTime > 0 && (
        <span className="flex items-center gap-1">
          <Clock className="size-3" aria-hidden="true" />
          <span>{readingTime} min read</span>
        </span>
      )}
    </div>
  );
}
