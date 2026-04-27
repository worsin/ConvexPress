/**
 * Upload Progress - Recently Uploaded Section
 *
 * Shows recently uploaded media items with inline quick-edit fields
 * for title and alt text. This section appears below the DropZone
 * on the upload page and loads the most recent media items.
 */

import { useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";

import { Button } from "@/components/ui/button";

/**
 * Shows recently uploaded media with inline editing for title/alt text.
 */
export function UploadProgress() {
  const recentMedia = useQuery(api.media.queries.list, {
    paginationOpts: { numItems: 10, cursor: null },
  });

  if (recentMedia === undefined) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">
          Recently Uploaded
        </h2>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-16 bg-muted animate-pulse rounded-none"
            />
          ))}
        </div>
      </div>
    );
  }

  const items = recentMedia.page ?? [];

  if (items.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          Recently Uploaded
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          No media has been uploaded yet. Use the drop zone above to upload
          files.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground mb-3">
        Recently Uploaded
      </h2>
      <div className="space-y-2">
        {items.map((item: RecentMediaItemProps["item"]) => (
          <RecentMediaItem key={item._id} item={item} />
        ))}
      </div>
    </div>
  );
}

// ─── Individual Recent Item with Inline Edit ─────────────────────────────────

interface RecentMediaItemProps {
  item: {
    _id: string;
    title: string;
    fileName: string;
    mimeType: string;
    mediaType: string;
    url: string;
    altText?: string;
    fileSize: number;
    status: string;
  };
}

function RecentMediaItem({ item }: RecentMediaItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [altText, setAltText] = useState(item.altText || "");

  const updateMedia = useMutation(api.media.mutations.update);

  const handleSave = useCallback(async () => {
    try {
      await updateMedia({
        mediaId: item._id as Id<"media">,
        title: title.trim() || item.title,
        altText: altText.trim() || undefined,
      });
      setIsEditing(false);
      toast.success("Media updated.");
    } catch (err) {
      toast.error(
        `Failed to update: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }, [item._id, item.title, title, altText, updateMedia]);

  const isImage = item.mediaType === "image";
  const isProcessing = item.status === "processing";

  return (
    <div className="flex items-start gap-3 border border-border bg-card px-3 py-2 rounded-none">
      {/* Thumbnail */}
      <div className="size-14 shrink-0 bg-muted/50 border border-border rounded-none overflow-hidden flex items-center justify-center relative">
        {isImage && item.url ? (
          <img
            src={item.url}
            alt={item.altText || item.title}
            className="size-full object-cover"
          />
        ) : (
          <span className="text-xs text-muted-foreground uppercase">
            {item.fileName.split(".").pop()}
          </span>
        )}
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}
      </div>

      {/* Info / Edit Form */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-border bg-background px-2 py-1 text-xs text-foreground rounded-none focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>
            {isImage && (
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Alt Text
                </label>
                <input
                  type="text"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder="Describe this image for accessibility"
                  className="w-full border border-border bg-background px-2 py-1 text-xs text-foreground rounded-none focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button size="xs" onClick={handleSave}>
                Save
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setTitle(item.title);
                  setAltText(item.altText || "");
                  setIsEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-sm font-medium text-foreground truncate">
              {item.title}
            </div>
            <div className="text-xs text-muted-foreground">
              {item.fileName} -- {formatBytes(item.fileSize)}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {!isEditing && (
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => setIsEditing(true)}
            aria-label="Edit"
          >
            <PencilIcon className="size-3" />
          </Button>
        )}
        <Link
          to="/media/$mediaId/edit"
          params={{ mediaId: item._id }}
        >
          <Button size="icon-xs" variant="ghost" aria-label="Full Edit">
            <ExternalLinkIcon className="size-3" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
