/**
 * Media Grid View
 *
 * Thumbnail grid for the Media Library. Alternative to the list table view.
 * Uses real Convex media data (no mock interfaces).
 */

import { FileIcon, ImageIcon, MusicIcon, VideoIcon } from "lucide-react";

import { cn } from "@/lib/utils";

// ─── Media Item Type ─────────────────────────────────────────────────────────

interface MediaItem {
  _id: string;
  title: string;
  fileName: string;
  mimeType: string;
  mediaType: "image" | "video" | "audio" | "document" | "archive" | "other";
  url: string;
  altText?: string;
  status: "processing" | "active" | "failed";
}

interface MediaGridProps {
  /** Media items to display. */
  items: MediaItem[];
  /** Whether the grid is loading. */
  isLoading: boolean;
  /** Selected item IDs. */
  selectedIds: Set<string>;
  /** Toggle selection of an item. */
  onToggle: (id: string) => void;
  /** Open item detail / navigate to edit page. */
  onOpen: (item: MediaItem) => void;
}

/**
 * Grid view for the Media Library. Shows thumbnail cards for media items.
 * Alternative to the list table view, toggled via a view mode switch.
 */
export function MediaGrid({
  items,
  isLoading,
  selectedIds,
  onToggle,
  onOpen,
}: MediaGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 p-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square bg-muted animate-pulse rounded-none"
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ImageIcon className="size-12 text-muted-foreground/50" />
        <p className="mt-4 text-sm text-muted-foreground">No media found.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 p-2">
      {items.map((item) => {
        const isSelected = selectedIds.has(item._id);
        const isImage = item.mediaType === "image";
        const isVideo = item.mediaType === "video";
        const isAudio = item.mediaType === "audio";
        const isProcessing = item.status === "processing";
        const isFailed = item.status === "failed";

        return (
          <button
            key={item._id}
            type="button"
            onClick={() => onOpen(item)}
            className={cn(
              "group relative aspect-square overflow-hidden rounded-none border transition-all",
              isSelected
                ? "border-primary ring-2 ring-primary/50"
                : "border-border hover:border-muted-foreground",
            )}
          >
            {/* Thumbnail or icon */}
            {isImage && item.url ? (
              <img
                src={item.url}
                alt={item.altText || item.title}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center bg-muted/50">
                {isVideo ? (
                  <VideoIcon className="size-8 text-muted-foreground" />
                ) : isAudio ? (
                  <MusicIcon className="size-8 text-muted-foreground" />
                ) : (
                  <FileIcon className="size-8 text-muted-foreground" />
                )}
              </div>
            )}

            {/* Processing spinner overlay */}
            {isProcessing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <div className="size-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              </div>
            )}

            {/* Failed error overlay */}
            {isFailed && (
              <div className="absolute inset-0 flex items-center justify-center bg-destructive/20">
                <span className="text-xs font-medium text-destructive">Error</span>
              </div>
            )}

            {/* Selection checkbox overlay */}
            <div
              className={cn(
                "absolute inset-0 bg-black/30 transition-opacity",
                isSelected
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
              )}
            >
              <div
                className="absolute top-1 left-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(item._id);
                }}
              >
                <div
                  className={cn(
                    "size-5 border-2 flex items-center justify-center",
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-white/80 bg-black/20",
                  )}
                >
                  {isSelected && (
                    <svg
                      className="size-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </div>
              </div>
            </div>

            {/* File name tooltip on hover */}
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[10px] text-[#ccc] truncate block">
                {item.fileName}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
