/**
 * Media Image - Website Component
 *
 * Responsive image component that renders an <img> with srcset
 * from all available generated sizes. Used by post content,
 * featured images, page content, and anywhere images appear
 * on the public-facing website.
 *
 * Features:
 *   - Reactive srcset from Convex media sizes
 *   - Lazy loading by default
 *   - Width/height attributes for CLS prevention
 *   - Graceful fallback when media data is loading or missing
 *   - Customizable sizes attribute for art direction
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";

import { cn } from "@/lib/utils";
import { ImagePlaceholder } from "./ImagePlaceholder";

interface MediaImageProps {
  /** The media record ID from Convex. */
  mediaId: Id<"media">;
  /** Override alt text (falls back to media's altText, then title). */
  alt?: string;
  /** CSS class for the <img> element. */
  className?: string;
  /**
   * The `sizes` attribute for responsive image selection.
   * Example: "(max-width: 768px) 100vw, 50vw"
   * Default: "100vw"
   */
  sizes?: string;
  /** Loading strategy. Default: "lazy". */
  loading?: "lazy" | "eager";
  /** Desired size name to use as the src (fallback to original). */
  preferredSize?: "thumbnail" | "medium" | "medium_large" | "large";
  /** Width override (for CLS prevention). Falls back to media width. */
  width?: number;
  /** Height override (for CLS prevention). Falls back to media height. */
  height?: number;
  /** Aspect ratio CSS class to apply while loading. */
  aspectRatio?: string;
  /** Called when the image loads successfully. */
  onLoad?: () => void;
  /** Called when the image fails to load. */
  onError?: () => void;
}

/**
 * Responsive image component that pulls srcset data from all
 * available Convex media sizes.
 *
 * Usage:
 * ```tsx
 * <MediaImage
 *   mediaId={post.featuredImageId}
 *   alt={post.title}
 *   sizes="(max-width: 768px) 100vw, 50vw"
 *   className="w-full object-cover"
 * />
 * ```
 */
export function MediaImage({
  mediaId,
  alt,
  className,
  sizes = "100vw",
  loading = "lazy",
  preferredSize,
  width,
  height,
  aspectRatio,
  onLoad,
  onError,
}: MediaImageProps) {
  // Fetch the full media record with all sizes
  const media = useQuery(api.media.queries.get, { mediaId });

  // Fetch the srcset string for responsive images
  const srcSet = useQuery(api.media.queries.getSrcSet, { mediaId });

  // ── Loading state ─────────────────────────────────────────────────────────
  if (media === undefined) {
    return (
      <ImagePlaceholder
        width={width}
        height={height}
        className={cn(aspectRatio, className)}
      />
    );
  }

  // ── Missing media ─────────────────────────────────────────────────────────
  if (media === null) {
    return null;
  }

  // ── Determine src URL ─────────────────────────────────────────────────────
  // If a preferred size is specified and exists, use it; otherwise use original
  let src = media.url;
  let imgWidth = width ?? media.width;
  let imgHeight = height ?? media.height;

  if (preferredSize && media.sizesMap && media.sizesMap[preferredSize]) {
    const preferred = media.sizesMap[preferredSize];
    src = preferred.url;
    if (!width) imgWidth = preferred.width;
    if (!height) imgHeight = preferred.height;
  }

  // ── Determine alt text ────────────────────────────────────────────────────
  const altText = alt ?? media.altText ?? media.title ?? "";

  return (
    <img
      src={src}
      srcSet={srcSet || undefined}
      sizes={srcSet ? sizes : undefined}
      alt={altText}
      width={imgWidth ?? undefined}
      height={imgHeight ?? undefined}
      loading={loading}
      decoding="async"
      className={cn(aspectRatio, className)}
      onLoad={onLoad}
      onError={onError}
    />
  );
}
