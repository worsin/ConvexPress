/**
 * FeaturedImageMetabox - Featured image preview with Set/Remove controls
 *
 * Shows image thumbnail when set, "Set featured image" link when not set.
 * Opens an inline MediaPicker panel (NOT a modal) for image selection.
 * Wired to Convex media queries for real image data.
 */

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { ImageIcon } from "lucide-react";
import { MediaPicker } from "./MediaPicker";
import { cn } from "@/lib/utils";

interface FeaturedImageMetaboxProps {
  featuredImageId: string | null;
  onSelect: (mediaId: string | null) => void;
}

export function FeaturedImageMetabox({
  featuredImageId,
  onSelect,
}: FeaturedImageMetaboxProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Fetch the featured image data from Convex when an ID is set
  const mediaItem = useQuery(
    api.media.queries.get,
    featuredImageId ? { mediaId: featuredImageId as Id<"media"> } : "skip",
  );

  // Use real URL from Convex media record; no external placeholder fallback
  const imageUrl = mediaItem?.url ?? null;
  const hasImage = !!featuredImageId;
  const isLoadingImage = !!featuredImageId && mediaItem === undefined;

  return (
    <div>
      {hasImage ? (
        <div>
          {/* Image preview */}
          <div className="border border-border bg-muted/30 mb-2">
            {isLoadingImage ? (
              <div className="w-full h-32 animate-pulse bg-muted" />
            ) : imageUrl ? (
              <img
                src={imageUrl}
                alt="Featured image"
                className="w-full h-auto object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
                Image not found
              </div>
            )}
            {imageError && !isLoadingImage && imageUrl && (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
                Image not found
              </div>
            )}
          </div>

          {/* Remove link */}
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-xs text-destructive hover:underline"
          >
            Remove featured image
          </button>
        </div>
      ) : (
        <div>
          {!showPicker ? (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className={cn(
                "w-full flex flex-col items-center justify-center gap-2 py-6",
                "border border-dashed border-border",
                "text-muted-foreground hover:text-foreground hover:border-foreground/30",
                "transition-colors cursor-pointer",
              )}
            >
              <ImageIcon className="size-8 opacity-50" />
              <span className="text-xs">Set featured image</span>
            </button>
          ) : null}
        </div>
      )}

      {/* Inline MediaPicker */}
      {showPicker && (
        <MediaPicker
          onSelect={(mediaId) => {
            onSelect(mediaId);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
          selectedId={featuredImageId ?? undefined}
          filterType="image"
        />
      )}

      {/* Set featured image link when image exists */}
      {hasImage && !showPicker && (
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="text-xs text-primary hover:underline mt-1 block"
        >
          Change featured image
        </button>
      )}
    </div>
  );
}
