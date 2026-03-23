/**
 * Image Placeholder - Website Component
 *
 * Skeleton placeholder displayed while a media image is loading
 * from Convex. Prevents CLS (Cumulative Layout Shift) by
 * reserving the correct aspect ratio space.
 *
 * Used internally by MediaImage during the loading state,
 * and can be used standalone wherever a media image placeholder
 * is needed.
 */

import { cn } from "@/lib/utils";

interface ImagePlaceholderProps {
  /** Width in pixels (for aspect ratio calculation). */
  width?: number;
  /** Height in pixels (for aspect ratio calculation). */
  height?: number;
  /** CSS class for the placeholder container. */
  className?: string;
  /** Optional label for accessibility. Default: "Loading image..." */
  label?: string;
}

/**
 * Animated placeholder skeleton for images.
 *
 * If width and height are provided, the placeholder maintains
 * the correct aspect ratio to prevent layout shift. Otherwise,
 * it renders a 16:9 default aspect ratio.
 *
 * Usage:
 * ```tsx
 * <ImagePlaceholder width={1200} height={800} className="w-full" />
 * ```
 */
export function ImagePlaceholder({
  width,
  height,
  className,
  label = "Loading image...",
}: ImagePlaceholderProps) {
  // Calculate aspect ratio for the padding-bottom technique
  // This reserves the exact space the image will occupy
  const hasAspectRatio = width && height && width > 0 && height > 0;
  const paddingBottom = hasAspectRatio
    ? `${(height / width) * 100}%`
    : "56.25%"; // 16:9 default

  return (
    <div
      data-slot="image-placeholder"
      role="img"
      aria-label={label}
      className={cn("relative w-full overflow-hidden bg-muted", className)}
    >
      {/* Aspect ratio spacer */}
      <div style={{ paddingBottom }} />

      {/* Pulse animation overlay */}
      <div className="absolute inset-0 animate-pulse bg-muted" />

      {/* Subtle icon hint */}
      <div className="absolute inset-0 flex items-center justify-center">
        <svg
          className="size-8 text-muted-foreground/20"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      </div>
    </div>
  );
}
