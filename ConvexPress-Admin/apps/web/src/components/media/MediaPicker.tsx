/**
 * Media Picker - Inline Panel
 *
 * An inline expandable panel (NOT a modal) for selecting media within
 * post/page editors. Used for featured images, image blocks, etc.
 *
 * Features:
 *   - Mini media library with search/filter
 *   - Upload new tab
 *   - Selection with checkmark
 *   - "Use This Media" confirmation button
 */

import { useState, useCallback, useRef } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  FileIcon,
  ImageIcon,
  MusicIcon,
  SearchIcon,
  UploadCloudIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MediaType = "image" | "video" | "audio" | "document" | "archive" | "other";

interface MediaPickerProps {
  /** Called when a media item is selected and confirmed. */
  onSelect: (mediaId: Id<"media">) => void;
  /** Restrict to specific media types. */
  allowedTypes?: MediaType[];
  /** Currently selected media ID (for highlighting). */
  selectedId?: Id<"media">;
  /** Button label. Default: "Select Media" */
  label?: string;
  /** Called when selection is cleared. */
  onClear?: () => void;
}

export function MediaPicker({
  onSelect,
  allowedTypes,
  selectedId,
  label = "Select Media",
  onClear,
}: MediaPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"library" | "upload">("library");
  const [search, setSearch] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<Id<"media"> | null>(
    selectedId || null,
  );

  // ── Convex Queries ────────────────────────────────────────────────────
  const mediaResult = useQuery(api.media.queries.list, {
    mediaType:
      allowedTypes && allowedTypes.length === 1 ? allowedTypes[0] : undefined,
    search: search.trim() || undefined,
    paginationOpts: { numItems: 20, cursor: null },
  });

  // Get the selected media details for preview
  const selectedMedia = useQuery(
    api.media.queries.get,
    selectedId ? { mediaId: selectedId } : "skip",
  );

  const generateUploadUrl = useMutation(api.media.mutations.generateUploadUrl);
  const createMedia = useMutation(api.media.mutations.create);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleConfirm = useCallback(() => {
    if (pendingId) {
      onSelect(pendingId);
      setIsOpen(false);
    }
  }, [pendingId, onSelect]);

  // Upload one file. Returns the new mediaId or throws.
  const uploadOne = useCallback(
    async (file: File): Promise<Id<"media">> => {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!result.ok) throw new Error("Upload failed");
      const { storageId } = await result.json();

      let width: number | undefined;
      let height: number | undefined;
      if (file.type.startsWith("image/")) {
        try {
          const dims = await getImageDimensions(file);
          width = dims.width;
          height = dims.height;
        } catch {
          // Continue without dimensions
        }
      }

      return (await createMedia({
        storageId,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        width,
        height,
      })) as Id<"media">;
    },
    [generateUploadUrl, createMedia],
  );

  // Upload one or many files with bounded parallelism. The last successful
  // upload wins the selection slot.
  const handleUpload = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files) return;
      const fileList = Array.from(files);
      if (fileList.length === 0) return;

      const CONCURRENCY = 3;
      let lastSuccessId: Id<"media"> | null = null;
      let successCount = 0;
      let failCount = 0;

      // Simple bounded-parallel worker pool.
      const queue = [...fileList];
      const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length > 0) {
          const file = queue.shift();
          if (!file) break;
          try {
            const id = await uploadOne(file);
            lastSuccessId = id;
            successCount++;
          } catch (err) {
            failCount++;
            toast.error(
              `"${file.name}": ${err instanceof Error ? err.message : "upload failed"}`,
            );
          }
        }
      });
      await Promise.all(workers);

      if (lastSuccessId) {
        setPendingId(lastSuccessId);
        setActiveTab("library");
      }
      if (successCount > 0) {
        toast.success(
          successCount === 1
            ? "Upload complete."
            : `Uploaded ${successCount} file${failCount > 0 ? ` (${failCount} failed)` : ""}.`,
        );
      }
    },
    [uploadOne],
  );

  const items = mediaResult?.page ?? [];

  return (
    <div className="border border-border bg-card rounded-none">
      {/* Header / Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="text-xs font-medium text-foreground">{label}</span>
        {isOpen ? (
          <ChevronUpIcon className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        )}
      </button>

      {/* Selected Preview (when collapsed) */}
      {!isOpen && selectedMedia && (
        <div className="flex items-center gap-2 px-3 pb-2">
          <div className="size-10 shrink-0 bg-muted/50 border border-border rounded-none overflow-hidden">
            {selectedMedia.mediaType === "image" ? (
              <img
                src={selectedMedia.url}
                alt={selectedMedia.altText || selectedMedia.title}
                className="size-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center size-full">
                <FileIcon className="size-4 text-muted-foreground" />
              </div>
            )}
          </div>
          <span className="text-xs text-muted-foreground truncate flex-1">
            {selectedMedia.title}
          </span>
          {onClear && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
            >
              <XIcon className="size-3" />
            </Button>
          )}
        </div>
      )}

      {/* Expanded Panel */}
      {isOpen && (
        <div className="border-t border-border">
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setActiveTab("library")}
              className={cn(
                "flex-1 px-3 py-2 text-xs font-medium transition-colors",
                activeTab === "library"
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Media Library
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={cn(
                "flex-1 px-3 py-2 text-xs font-medium transition-colors",
                activeTab === "upload"
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Upload New
            </button>
          </div>

          {activeTab === "library" ? (
            <div>
              {/* Search */}
              <div className="px-3 py-2 border-b border-border">
                <div className="relative">
                  <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search media..."
                    className="w-full pl-7 pr-2 py-1 border border-border bg-background text-xs rounded-none focus:outline-hidden focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Grid */}
              <div className="max-h-[240px] overflow-y-auto p-2">
                {mediaResult === undefined ? (
                  <div className="grid grid-cols-4 gap-1">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={i}
                        className="aspect-square bg-muted animate-pulse"
                      />
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-muted-foreground">
                      No media found.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-1">
                    {items.map((item: { _id: string; mediaType: string; url?: string; altText?: string; title: string }) => {
                      const isSelected = pendingId === item._id;
                      const isImage = item.mediaType === "image";
                      return (
                        <button
                          key={item._id}
                          type="button"
                          onClick={() => setPendingId(item._id)}
                          onMouseEnter={() => setHoveredId(item._id)}
                          onMouseLeave={() => setHoveredId(null)}
                          className={cn(
                            "relative aspect-square border transition-all",
                            isSelected
                              ? "border-primary ring-2 ring-primary/50"
                              : "border-border hover:border-muted-foreground",
                          )}
                        >
                          {isImage && item.url ? (
                            <img
                              src={item.url}
                              alt={item.altText || item.title}
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="flex items-center justify-center size-full bg-muted/50">
                              {item.mediaType === "video" ? (
                                <VideoIcon className="size-4 text-muted-foreground" />
                              ) : item.mediaType === "audio" ? (
                                <MusicIcon className="size-4 text-muted-foreground" />
                              ) : (
                                <FileIcon className="size-4 text-muted-foreground" />
                              )}
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute top-0.5 right-0.5 size-4 bg-primary rounded-full flex items-center justify-center">
                              <svg
                                className="size-2.5 text-primary-foreground"
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
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Confirm Button */}
              <div className="px-3 py-2 border-t border-border">
                <Button
                  size="sm"
                  className="w-full"
                  disabled={!pendingId}
                  onClick={handleConfirm}
                >
                  Use This Media
                </Button>
              </div>
            </div>
          ) : (
            /* Upload Tab */
            <div className="p-3">
              <div
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border p-6 cursor-pointer hover:border-muted-foreground hover:bg-muted/30 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.add("border-primary", "bg-primary/5");
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove("border-primary", "bg-primary/5");
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove("border-primary", "bg-primary/5");
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleUpload(e.dataTransfer.files);
                  }
                }}
              >
                <UploadCloudIcon className="size-8 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Click to select files, or drop them here
                </p>
                <p className="text-[10px] text-muted-foreground/70">
                  Multiple files supported
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept={
                    allowedTypes
                      ? allowedTypes.map((t) => `${t}/*`).join(",")
                      : "image/*,video/*,audio/*,application/pdf"
                  }
                  onChange={(e) => {
                    handleUpload(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function getImageDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Failed to read image dimensions"));
    };
    img.src = URL.createObjectURL(file);
  });
}
