/**
 * Admin Search Result Row
 *
 * Individual search result displayed in the AdminSearchOverlay command palette.
 * Shows content type icon, title, status badge, and date.
 */

import { Link } from "@tanstack/react-router";
import { FileText, Image, MessageSquare, Newspaper } from "lucide-react";

import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AdminSearchResultData {
  contentType: "post" | "page" | "media" | "comment";
  contentId: string;
  title: string;
  excerpt: string;
  url: string;
  authorName: string;
  authorId?: string;
  status: string;
  publishedAt: number | null;
  categoryNames?: string[];
  tagNames?: string[];
  mimeType?: string;
  relevanceScore?: number;
}

interface AdminSearchResultProps {
  result: AdminSearchResultData;
  isActive?: boolean;
  onSelect?: () => void;
  className?: string;
}

// ─── Status Badge ───────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  publish: "bg-success/15 text-success",
  draft: "bg-black/10 text-foreground/60 dark:bg-white/10",
  pending: "bg-warning/15 text-warning",
  trash: "bg-destructive/15 text-destructive",
  private: "bg-private/15 text-private",
  approved: "bg-success/15 text-success",
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none",
        style,
      )}
    >
      {status}
    </span>
  );
}

// ─── Content Type Icon ──────────────────────────────────────────────────────

const CONTENT_TYPE_ICONS: Record<string, typeof Newspaper> = {
  post: Newspaper,
  page: FileText,
  media: Image,
  comment: MessageSquare,
};

// ─── Admin Edit URL ─────────────────────────────────────────────────────────

function getEditUrl(result: AdminSearchResultData): string {
  switch (result.contentType) {
    case "post":
      return `/admin/posts/${result.contentId}/edit`;
    case "page":
      return `/admin/pages/${result.contentId}/edit`;
    case "media":
      return `/admin/media/${result.contentId}`;
    case "comment":
      return `/admin/comments`;
    default:
      return `/admin`;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AdminSearchResult({
  result,
  isActive = false,
  onSelect,
  className,
}: AdminSearchResultProps) {
  const Icon = CONTENT_TYPE_ICONS[result.contentType] ?? FileText;
  const editUrl = getEditUrl(result);

  return (
    <Link
      to={editUrl}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-primary/10 text-foreground"
          : "text-foreground/80 hover:bg-muted",
        className,
      )}
    >
      {/* Icon */}
      <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{result.title || "(Untitled)"}</span>
          <StatusBadge status={result.status} />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="uppercase">{result.contentType}</span>
          {result.publishedAt && (
            <>
              <span aria-hidden="true">&middot;</span>
              <time dateTime={new Date(result.publishedAt).toISOString()}>
                {new Date(result.publishedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
            </>
          )}
          {result.authorName && (
            <>
              <span aria-hidden="true">&middot;</span>
              <span>{result.authorName}</span>
            </>
          )}
        </div>
      </div>

      {/* Relevance score (debug) */}
      {result.relevanceScore != null && (
        <span className="shrink-0 text-[10px] text-muted-foreground/50">
          {result.relevanceScore.toFixed(2)}
        </span>
      )}
    </Link>
  );
}
