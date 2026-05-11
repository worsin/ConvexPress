/**
 * Drag-and-Drop Upload Zone
 *
 * Large dashed-border drag-and-drop area for file uploads.
 * Multi-file support, file validation, visual drag-over feedback.
 * Uses Convex storage upload flow: generateUploadUrl -> upload -> create record.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloudIcon } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "@backend/convex/_generated/api";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Max 50MB per file
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Allowed MIME type patterns
const ALLOWED_TYPES = [
  "image/*",
  "video/*",
  "audio/*",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "text/csv",
];

interface UploadingFile {
  id: string;
  file: File;
  status: "pending" | "uploading" | "processing" | "done" | "failed";
  progress: number;
  error?: string;
  mediaId?: string;
}

function isTypeAllowed(mimeType: string): boolean {
  return ALLOWED_TYPES.some((pattern) => {
    if (pattern.endsWith("/*")) {
      return mimeType.startsWith(pattern.slice(0, -1));
    }
    return mimeType === pattern;
  });
}

export function DropZone() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploads, setUploads] = useState<UploadingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.media.mutations.generateUploadUrl);
  const createMedia = useMutation(api.media.mutations.create);

  const processFile = useCallback(
    async (uploadFile: UploadingFile) => {
      const { file } = uploadFile;

      // Update status to uploading
      setUploads((prev) =>
        prev.map((u) =>
          u.id === uploadFile.id
            ? { ...u, status: "uploading" as const, progress: 10 }
            : u,
        ),
      );

      try {
        // Step 1: Get upload URL from Convex
        const uploadUrl = await generateUploadUrl();

        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadFile.id ? { ...u, progress: 30 } : u,
          ),
        );

        // Step 2: Upload file to Convex storage
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!result.ok) {
          throw new Error(`Upload failed: ${result.statusText}`);
        }

        const { storageId } = await result.json();

        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadFile.id
              ? { ...u, status: "processing" as const, progress: 70 }
              : u,
          ),
        );

        // Step 3: Get image dimensions (for images)
        let width: number | undefined;
        let height: number | undefined;
        if (file.type.startsWith("image/")) {
          try {
            const dims = await getImageDimensions(file);
            width = dims.width;
            height = dims.height;
          } catch {
            // Non-critical, continue without dimensions
          }
        }

        // Step 4: Create media record
        const mediaId = await createMedia({
          storageId,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          width,
          height,
        });

        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadFile.id
              ? {
                  ...u,
                  status: "done" as const,
                  progress: 100,
                  mediaId: mediaId as string,
                }
              : u,
          ),
        );
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Upload failed";
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadFile.id
              ? { ...u, status: "failed" as const, error: errorMsg }
              : u,
          ),
        );
        toast.error(`Failed to upload "${file.name}": ${errorMsg}`);
      }
    },
    [generateUploadUrl, createMedia],
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const validFiles: UploadingFile[] = [];

      for (const file of fileArray) {
        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          toast.error(
            `"${file.name}" exceeds the 50MB maximum file size.`,
          );
          continue;
        }

        // Validate file size > 0
        if (file.size === 0) {
          toast.error(`"${file.name}" is empty (0 bytes).`);
          continue;
        }

        // Validate MIME type
        if (!isTypeAllowed(file.type)) {
          toast.error(
            `"${file.name}" has an unsupported file type (${file.type || "unknown"}).`,
          );
          continue;
        }

        validFiles.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          status: "pending",
          progress: 0,
        });
      }

      if (validFiles.length === 0) return;

      setUploads((prev) => [...validFiles, ...prev]);

      // Process files (max 3 concurrent)
      const queue = [...validFiles];
      let active = 0;
      const maxConcurrent = 3;

      function processNext() {
        if (queue.length === 0 || active >= maxConcurrent) return;
        active++;
        const next = queue.shift()!;
        processFile(next).finally(() => {
          active--;
          processNext();
        });
        processNext();
      }

      processNext();

      toast.success(
        `${validFiles.length} file${validFiles.length === 1 ? "" : "s"} queued for upload.`,
      );
    },
    [processFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
        // Reset input so the same file can be uploaded again
        e.target.value = "";
      }
    },
    [handleFiles],
  );

  // M5: Track object URLs for cleanup to prevent memory leaks.
  // Create stable URLs for upload thumbnails, revoke on unmount or when uploads change.
  const objectUrlsRef = useRef<Map<string, string>>(new Map());

  const getObjectUrl = useCallback((uploadId: string, file: File): string => {
    const existing = objectUrlsRef.current.get(uploadId);
    if (existing) return existing;
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.set(uploadId, url);
    return url;
  }, []);

  // Cleanup object URLs when uploads are removed or component unmounts
  useEffect(() => {
    const currentIds = new Set(uploads.map((u) => u.id));
    // Revoke URLs for uploads that are no longer in the list
    for (const [id, url] of objectUrlsRef.current) {
      if (!currentIds.has(id)) {
        URL.revokeObjectURL(url);
        objectUrlsRef.current.delete(id);
      }
    }
  }, [uploads]);

  // Cleanup all object URLs on unmount
  useEffect(() => {
    return () => {
      for (const url of objectUrlsRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      objectUrlsRef.current.clear();
    };
  }, []);

  const completedCount = uploads.filter((u) => u.status === "done").length;
  const failedCount = uploads.filter((u) => u.status === "failed").length;
  const activeCount = uploads.filter(
    (u) => u.status === "uploading" || u.status === "processing",
  ).length;

  return (
    <div>
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={cn(
          "relative flex flex-col items-center justify-center gap-4 border-2 border-dashed p-12 cursor-pointer transition-colors",
          isDragOver
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-muted-foreground hover:bg-muted/30",
        )}
      >
        <UploadCloudIcon
          className={cn(
            "size-12",
            isDragOver ? "text-primary" : "text-muted-foreground",
          )}
        />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            {isDragOver ? "Drop files here" : "Drag files here to upload"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            or click to select files
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
        >
          Select Files
        </Button>
        <p className="text-xs text-muted-foreground">
          Maximum upload file size: 50 MB
        </p>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
          accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,.csv"
        />
      </div>

      {/* Upload Status Summary */}
      {uploads.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {activeCount > 0 && (
              <span>Uploading {activeCount} file{activeCount !== 1 ? "s" : ""}...</span>
            )}
            {completedCount > 0 && (
              <span className="text-success">
                {completedCount} completed
              </span>
            )}
            {failedCount > 0 && (
              <span className="text-destructive">{failedCount} failed</span>
            )}
          </div>

          {/* Individual file progress */}
          <div className="space-y-1">
            {uploads.map((upload) => (
              <div
                key={upload.id}
                className="flex items-center gap-3 rounded-none border border-border bg-card px-3 py-2"
              >
                {/* File icon or mini thumbnail */}
                <div className="size-8 shrink-0 flex items-center justify-center bg-muted/50 rounded-none overflow-hidden">
                  {upload.file.type.startsWith("image/") ? (
                    <img
                      src={getObjectUrl(upload.id, upload.file)}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {upload.file.name.split(".").pop()?.toUpperCase()}
                    </span>
                  )}
                </div>

                {/* File info */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground truncate">
                    {upload.file.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatBytes(upload.file.size)}
                    {upload.status === "failed" && upload.error && (
                      <span className="text-destructive ml-2">
                        {upload.error}
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress / Status */}
                <div className="shrink-0 w-20">
                  {upload.status === "done" ? (
                    <span className="text-xs text-success font-medium">
                      Done
                    </span>
                  ) : upload.status === "failed" ? (
                    <span className="text-xs text-destructive font-medium">
                      Failed
                    </span>
                  ) : (
                    <div className="w-full bg-muted rounded-none h-1.5">
                      <div
                        className="bg-primary h-1.5 rounded-none transition-all"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
