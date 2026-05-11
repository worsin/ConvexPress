/**
 * MediaPicker - Inline media selection panel (NOT a modal)
 *
 * Displays a grid of media thumbnails with search and upload capabilities.
 * Renders inline within the FeaturedImageMetabox, not as a modal/dialog.
 * Wired to Convex media queries.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { Check, Loader2, Search, Upload, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface MediaPickerProps {
  onSelect: (mediaId: string) => void;
  onClose: () => void;
  selectedId?: string;
  filterType?: "image" | "video" | "audio" | "document";
}

interface MediaListItem {
  _id: string;
  url?: string;
  thumbnailUrl?: string;
  title?: string;
  filename?: string;
  altText?: string;
  mimeType?: string;
}

interface MediaListResult {
  page: MediaListItem[];
}

export function MediaPicker({
  onSelect,
  onClose,
  selectedId,
  filterType = "image",
}: MediaPickerProps) {
  const [search, setSearch] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch media from Convex with optional search and type filter
  const mediaResult = useQuery(api.media.queries.list, {
    mediaType: filterType,
    search: search.trim() || undefined,
    paginationOpts: { numItems: 24, cursor: null },
  }) as MediaListResult | undefined;

  // Map Convex media records to our display format
  const filteredMedia = useMemo(() => {
    if (!mediaResult?.page) return [];
    return mediaResult.page.map((item) => ({
      id: item._id,
      url: item.url ?? "",
      thumbnailUrl: item.thumbnailUrl ?? item.url ?? "",
      title: item.title ?? item.filename ?? "Untitled",
      altText: item.altText ?? "",
      mimeType: item.mimeType ?? "",
    }));
  }, [mediaResult]);

  // Convex mutations for file upload
  const generateUploadUrl = useMutation(api.media.mutations.generateUploadUrl);
  const createMedia = useMutation(api.media.mutations.create);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsUploading(true);
      try {
        // Step 1: Get upload URL from Convex
        const uploadUrl = await generateUploadUrl();

        // Step 2: Upload file to Convex storage
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!result.ok) {
          throw new Error("Upload failed");
        }

        const { storageId } = await result.json();

        // Step 3: Create media record
        const mediaId = await createMedia({
          storageId,
          filename: file.name,
          mimeType: file.type,
          fileSize: file.size,
          title: file.name.replace(/\.[^.]+$/, ""),
        });

        // Step 4: Select the newly uploaded media
        if (mediaId) {
          onSelect(mediaId as string);
        }
        toast.success("Image uploaded successfully.");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Upload failed";
        toast.error(message);
      } finally {
        setIsUploading(false);
        // Reset file input so the same file can be re-selected
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [generateUploadUrl, createMedia, onSelect],
  );

  return (
    <div className="border border-border bg-card mt-2">
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 py-2 border-b border-border bg-muted/50">
        <span className="text-xs font-semibold uppercase tracking-wider">
          Media Library
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Close media picker"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Search + Upload */}
      <div className="flex gap-1.5 px-2.5 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search media..."
            className="h-6 text-xs pl-6"
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />
        <Button
          variant="outline"
          size="xs"
          onClick={handleUploadClick}
          disabled={isUploading}
          className="shrink-0"
        >
          {isUploading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Upload className="size-3" />
          )}
          {isUploading ? "Uploading..." : "Upload"}
        </Button>
      </div>

      {/* Media grid */}
      <div className="grid grid-cols-3 gap-1 px-2.5 pb-2.5 max-h-[240px] overflow-y-auto">
        {filteredMedia.map((item) => {
          const isSelected = item.id === selectedId;
          const isHovered = item.id === hoveredId;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={cn(
                "relative aspect-square overflow-hidden border",
                "focus:outline-hidden focus:ring-2 focus:ring-ring/50",
                isSelected
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:border-foreground/30",
              )}
              aria-label={`Select ${item.title}`}
              aria-pressed={isSelected}
            >
              <img
                src={item.thumbnailUrl}
                alt={item.altText}
                className="w-full h-full object-cover"
              />
              {isSelected && (
                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                  <Check className="size-5 text-primary" />
                </div>
              )}
              {isHovered && !isSelected && (
                <div className="absolute inset-0 bg-black/20" />
              )}
            </button>
          );
        })}
      </div>

      {filteredMedia.length === 0 && (
        <div className="px-2.5 pb-2.5 text-xs text-muted-foreground text-center py-6">
          No media items found.
        </div>
      )}
    </div>
  );
}
