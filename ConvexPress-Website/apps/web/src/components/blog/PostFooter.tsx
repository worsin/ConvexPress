import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Tag } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PostTag } from "@/lib/blog/types";

import { ShareButtons } from "./ShareButtons";

interface PostFooterProps {
  tags?: PostTag[];
  shareUrl: string;
  shareTitle: string;
  previousPost?: { title: string; slug: string } | null;
  nextPost?: { title: string; slug: string } | null;
  className?: string;
}

/**
 * Post footer: tags, share buttons, prev/next post navigation.
 */
export function PostFooter({
  tags,
  shareUrl,
  shareTitle,
  previousPost,
  nextPost,
  className,
}: PostFooterProps) {
  return (
    <footer
      data-slot="post-footer"
      className={cn("flex flex-col gap-6", className)}
    >
      {/* Tags + Share */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag className="size-3 text-muted-foreground" aria-hidden="true" />
            {tags.map((tag) => (
              <Link
                key={tag._id}
                to="/tag/$slug"
                params={{ slug: tag.slug }}
                className="rounded-none border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {tag.name}
              </Link>
            ))}
          </div>
        )}

        {/* Share Buttons */}
        <ShareButtons url={shareUrl} title={shareTitle} />
      </div>

      {/* Separator */}
      <hr className="border-t border-border" />

      {/* Post Navigation */}
      {(previousPost || nextPost) && (
        <nav
          aria-label="Post navigation"
          className="grid grid-cols-2 gap-4"
        >
          {/* Previous */}
          {previousPost ? (
            <Link
              to="/blog/$slug"
              params={{ slug: previousPost.slug }}
              className="group/nav flex flex-col gap-1 text-left"
            >
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ChevronLeft className="size-3" aria-hidden="true" />
                Previous
              </span>
              <span className="text-xs font-medium transition-colors group-hover/nav:text-primary">
                {previousPost.title}
              </span>
            </Link>
          ) : (
            <div />
          )}

          {/* Next */}
          {nextPost ? (
            <Link
              to="/blog/$slug"
              params={{ slug: nextPost.slug }}
              className="group/nav flex flex-col gap-1 text-right"
            >
              <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                Next
                <ChevronRight className="size-3" aria-hidden="true" />
              </span>
              <span className="text-xs font-medium transition-colors group-hover/nav:text-primary">
                {nextPost.title}
              </span>
            </Link>
          ) : (
            <div />
          )}
        </nav>
      )}
    </footer>
  );
}
