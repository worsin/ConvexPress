/**
 * Image Sizes Panel
 *
 * Table of generated image size variants (thumbnail, medium, medium_large, large).
 * Shows dimensions and file size per variant, with a "View" link.
 */

import { ExternalLinkIcon } from "lucide-react";

interface SizeRecord {
  _id: string;
  sizeName: string;
  url: string;
  width: number;
  height: number;
  fileSize: number;
  mimeType: string;
  crop: boolean;
}

interface ImageSizesPanelProps {
  /** Array of mediaSizes records from the media.get query. */
  sizes: SizeRecord[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Display-friendly size names. */
const SIZE_LABELS: Record<string, string> = {
  thumbnail: "Thumbnail",
  medium: "Medium",
  medium_large: "Medium Large",
  large: "Large",
};

export function ImageSizesPanel({ sizes }: ImageSizesPanelProps) {
  if (!sizes || sizes.length === 0) {
    return (
      <div className="border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          Image Sizes
        </h3>
        <p className="text-xs text-muted-foreground">
          No generated sizes available. Thumbnail generation is pending.
        </p>
      </div>
    );
  }

  // Sort sizes by width ascending
  const sortedSizes = [...sizes].sort((a, b) => a.width - b.width);

  return (
    <div className="border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3">
        Image Sizes
      </h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left text-muted-foreground font-medium py-1.5 pr-2">
              Size
            </th>
            <th className="text-left text-muted-foreground font-medium py-1.5 pr-2">
              Dimensions
            </th>
            <th className="text-left text-muted-foreground font-medium py-1.5 pr-2">
              File Size
            </th>
            <th className="text-right text-muted-foreground font-medium py-1.5">
              &nbsp;
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedSizes.map((size) => (
            <tr key={size._id} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-2 text-foreground font-medium">
                {SIZE_LABELS[size.sizeName] || size.sizeName}
                {size.crop && (
                  <span className="ml-1 text-muted-foreground">(crop)</span>
                )}
              </td>
              <td className="py-1.5 pr-2 text-muted-foreground">
                {size.width} x {size.height}
              </td>
              <td className="py-1.5 pr-2 text-muted-foreground">
                {formatFileSize(size.fileSize)}
              </td>
              <td className="py-1.5 text-right">
                <a
                  href={size.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLinkIcon className="size-3" />
                  View
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
