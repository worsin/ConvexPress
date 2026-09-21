import { useState } from "react";
import { usePaginatedQuery } from "convex/react";
import { MediaContinuation, MediaReadBoundary } from "../media/MediaPagination";
import { useQuery } from "convex-helpers/react/cache";
import { ImageIcon, Search, Video, X } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

type MediaType = "image" | "video" | "audio" | "document";

interface MediaSummary {
  _id: Id<"media">;
  title: string;
  fileName?: string;
  url?: string | null;
  mediaType: MediaType | "archive" | "other";
}

type MediaSelectorProps = {
  value: Id<"media"> | null;
  onChange: (value: Id<"media"> | null) => void;
  mediaType: MediaType;
  placeholder?: string;
  disabled?: boolean;
};

export function MediaSelector(props: MediaSelectorProps) { return <MediaReadBoundary><MediaSelectorContent {...props} /></MediaReadBoundary>; }

function MediaSelectorContent({ value, onChange, mediaType, placeholder = "Search media", disabled = false }: MediaSelectorProps) {
  const [search, setSearch] = useState("");
  const selected = useQuery(
    api.media.queries.get,
    value ? { mediaId: value } : "skip",
  ) as MediaSummary | null | undefined;
  const mediaPages = usePaginatedQuery(api.media.queries.list, {
    mediaType,
    search: search.trim() || undefined,
    trashView: "active",
  }, { initialNumItems: 8 });
  const items = mediaPages.results;
  const Icon = mediaType === "video" ? Video : ImageIcon;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={256}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
        />
      </div>

      {selected && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-2">
          <MediaThumb media={selected} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{selected.title}</div>
            <div className="truncate text-xs text-muted-foreground">{selected.fileName}</div>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(null)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Clear selected media"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const active = value === item._id;
          return (
            <button
              key={item._id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(active ? null : item._id)}
              className={cn(
                "flex min-w-0 items-center gap-3 rounded-md border p-2 text-left text-sm transition-colors",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <MediaThumb media={item} fallbackIcon={Icon} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.fileName}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <MediaContinuation status={mediaPages.status} count={items.length} loadMore={mediaPages.loadMore} pageSize={8} disabled={disabled} />
    </div>
  );
}

function MediaThumb({
  media,
  fallbackIcon: FallbackIcon = ImageIcon,
}: {
  media: MediaSummary;
  fallbackIcon?: typeof ImageIcon;
}) {
  if (media.mediaType === "image" && media.url) {
    return (
      <img
        src={media.url}
        alt={media.title}
        className="h-12 w-16 shrink-0 rounded-md border border-border object-cover"
      />
    );
  }
  return (
    <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
      <FallbackIcon className="h-5 w-5 text-muted-foreground" />
    </span>
  );
}
