import { Link } from "@tanstack/react-router";
import { FileText, Image, MessageSquare, Newspaper } from "lucide-react";
import DOMPurify from "isomorphic-dompurify";

import { cn } from "@/lib/utils";
import type { SearchResult } from "@/lib/blog/types";

interface SearchResultCardProps {
  result: SearchResult;
  className?: string;
  onClick?: () => void;
}

// ─── Content Type Config ─────────────────────────────────────────────────────

const CONTENT_TYPE_CONFIG: Record<
  string,
  { icon: typeof Newspaper; label: string }
> = {
  post: { icon: Newspaper, label: "Post" },
  page: { icon: FileText, label: "Page" },
  media: { icon: Image, label: "Media" },
  comment: { icon: MessageSquare, label: "Comment" },
};

function getResultUrl(result: SearchResult): string {
  // If the search index provides a URL, use it
  if (result.url) return result.url;

  switch (result.contentType) {
    case "post":
      return `/blog/${result.slug}`;
    case "page":
      return `/${result.slug}`;
    case "media":
      return `/media/${result.slug}`;
    case "comment":
      // Comments link to parent post with anchor
      return result.slug ? `/blog/${result.slug}#comments` : "#";
    default:
      return `/${result.slug}`;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Search result card with content type indicator and highlighted excerpt.
 * Supports post, page, media, and comment result types.
 */
export function SearchResultCard({
  result,
  className,
  onClick,
}: SearchResultCardProps) {
  const typeConfig = CONTENT_TYPE_CONFIG[result.contentType] ?? {
    icon: FileText,
    label: result.contentType,
  };
  const Icon = typeConfig.icon;
  const linkTo = getResultUrl(result);

  return (
    <article
      data-slot="search-result-card"
      className={cn(
        "flex gap-3 border-b border-border py-4 last:border-b-0",
        className,
      )}
    >
      {/* Content Type Icon */}
      <div className="flex size-8 shrink-0 items-center justify-center rounded-none bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Title */}
        <h3 className="text-sm font-medium">
          <Link
            to={linkTo}
            className="transition-colors hover:text-primary"
            onClick={onClick}
          >
            {result.title}
          </Link>
        </h3>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="uppercase">{typeConfig.label}</span>
          {result.mimeType && (
            <>
              <span aria-hidden="true">&middot;</span>
              <span>{result.mimeType}</span>
            </>
          )}
          {result.publishedAt && (
            <>
              <span aria-hidden="true">&middot;</span>
              <time dateTime={result.publishedAt}>
                {new Date(result.publishedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </time>
            </>
          )}
          {result.author && (
            <>
              <span aria-hidden="true">&middot;</span>
              <Link
                to="/author/$slug"
                params={{ slug: result.author.slug }}
                className="transition-colors hover:text-foreground"
              >
                {result.author.displayName}
              </Link>
            </>
          )}
          {result.primaryCategory && (
            <>
              <span aria-hidden="true">&middot;</span>
              <Link
                to="/category/$slug"
                params={{ slug: result.primaryCategory.slug }}
                className="transition-colors hover:text-foreground"
              >
                {result.primaryCategory.name}
              </Link>
            </>
          )}
        </div>

        {/* Category/Tag badges (if provided from search index) */}
        {(result.categoryNames?.length || result.tagNames?.length) && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {result.categoryNames?.map((name) => (
              <span
                key={`cat:${name}`}
                className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {name}
              </span>
            ))}
            {result.tagNames?.map((name) => (
              <span
                key={`tag:${name}`}
                className="rounded-sm bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {name}
              </span>
            ))}
          </div>
        )}

        {/* Excerpt */}
        {result.highlightedExcerpt ? (
          <p
            className="line-clamp-2 text-xs leading-relaxed text-muted-foreground [&_mark]:bg-primary/20 [&_mark]:text-foreground"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(result.highlightedExcerpt, {
                ALLOWED_TAGS: ["mark", "em", "strong", "b", "i"],
                ALLOWED_ATTR: [],
              }),
            }}
          />
        ) : result.excerpt ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {result.excerpt}
          </p>
        ) : null}
      </div>
    </article>
  );
}
