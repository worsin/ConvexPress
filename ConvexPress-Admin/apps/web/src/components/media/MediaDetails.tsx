/**
 * Media Details Panel
 *
 * Read-only panel showing file details: filename, type, size, dimensions,
 * uploaded date, uploaded by, and file URL with "Copy" button.
 */

import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface MediaDetailsProps {
  media: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    mediaType: string;
    width?: number;
    height?: number;
    url: string;
    slug: string;
    createdAt: number;
    updatedAt: number;
    uploaderName?: string;
    status: string;
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MediaDetails({ media }: MediaDetailsProps) {
  const handleCopyUrl = () => {
    navigator.clipboard.writeText(media.url);
    toast.success("URL copied to clipboard.");
  };

  const details = [
    { label: "File name", value: media.fileName },
    { label: "File type", value: media.mimeType },
    { label: "File size", value: formatFileSize(media.fileSize) },
    ...(media.width && media.height
      ? [{ label: "Dimensions", value: `${media.width} x ${media.height}` }]
      : []),
    { label: "Uploaded on", value: formatDate(media.createdAt) },
    ...(media.uploaderName
      ? [{ label: "Uploaded by", value: media.uploaderName }]
      : []),
    { label: "Slug", value: media.slug },
    { label: "Status", value: media.status },
  ];

  return (
    <div className="border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3">
        File Details
      </h3>
      <dl className="space-y-2">
        {details.map((detail) => (
          <div key={detail.label} className="flex justify-between text-xs">
            <dt className="text-muted-foreground">{detail.label}:</dt>
            <dd className="text-foreground font-medium text-right max-w-[60%] truncate">
              {detail.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* File URL */}
      <div className="mt-3 pt-3 border-t border-border">
        <label className="text-xs text-muted-foreground block mb-1">
          File URL
        </label>
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={media.url}
            readOnly
            className="flex-1 border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground rounded-none"
          />
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleCopyUrl}
            aria-label="Copy URL"
          >
            <CopyIcon className="size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
