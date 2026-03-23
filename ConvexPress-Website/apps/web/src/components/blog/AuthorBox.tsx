import { Link } from "@tanstack/react-router";
import { Globe } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AuthorData } from "@/lib/blog/types";

interface AuthorBoxProps {
  author: AuthorData;
  className?: string;
}

/**
 * Author bio box displayed at the end of a single post.
 * Shows avatar, name, bio, website link, and a link to author archive.
 */
export function AuthorBox({ author, className }: AuthorBoxProps) {
  return (
    <div
      data-slot="author-box"
      className={cn(
        "flex gap-4 rounded-none border border-border bg-card p-4",
        className,
      )}
    >
      {/* Avatar */}
      <div className="shrink-0">
        {author.avatarUrl ? (
          <img
            src={author.avatarUrl}
            alt={author.displayName}
            className="size-14 rounded-none object-cover"
          />
        ) : (
          <div className="flex size-14 items-center justify-center rounded-none bg-muted text-sm font-medium text-muted-foreground">
            {author.displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <Link
            to="/author/$slug"
            params={{ slug: author.slug }}
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            {author.displayName}
          </Link>
          {author.websiteUrl && (
            <a
              href={author.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label={`${author.displayName}'s website`}
            >
              <Globe className="size-3" />
            </a>
          )}
        </div>

        {author.bio && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {author.bio}
          </p>
        )}

        <Link
          to="/author/$slug"
          params={{ slug: author.slug }}
          className="mt-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          View all posts &rarr;
        </Link>
      </div>
    </div>
  );
}
