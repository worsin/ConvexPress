/**
 * Media System - Shared Helper Functions
 *
 * Reusable utilities for media operations across mutations, queries, and actions.
 *
 * Exports:
 *   validateFileType     - Validate MIME type against allowed patterns + extension match
 *   categorizeMediaType  - Convert MIME type to a MediaType category
 *   getMediaUrl          - Get URL for a media item at optional size
 *   getMediaSrc          - Get URL + dimensions for a media item at optional size
 *   buildSrcSet          - Build complete srcset string from all available sizes
 *   generateSlug         - Generate URL-safe slug from string
 *   titleFromFilename    - Generate a title from a filename
 *   formatFileSize       - Format bytes to human-readable string
 */

import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// ─── MIME Type Validation ────────────────────────────────────────────────────

/** Map of file extensions to expected MIME types for mismatch detection. */
const EXTENSION_MIME_MAP: Record<string, string[]> = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  svg: ["image/svg+xml"],
  bmp: ["image/bmp"],
  ico: ["image/x-icon", "image/vnd.microsoft.icon"],
  tiff: ["image/tiff"],
  tif: ["image/tiff"],
  avif: ["image/avif"],
  mp4: ["video/mp4"],
  webm: ["video/webm"],
  ogg: ["video/ogg", "audio/ogg"],
  mov: ["video/quicktime"],
  avi: ["video/x-msvideo"],
  mkv: ["video/x-matroska"],
  mp3: ["audio/mpeg"],
  wav: ["audio/wav", "audio/x-wav"],
  flac: ["audio/flac"],
  aac: ["audio/aac"],
  m4a: ["audio/mp4", "audio/x-m4a"],
  pdf: ["application/pdf"],
  doc: ["application/msword"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  xls: ["application/vnd.ms-excel"],
  xlsx: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  ppt: ["application/vnd.ms-powerpoint"],
  pptx: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  zip: ["application/zip", "application/x-zip-compressed"],
  gz: ["application/gzip", "application/x-gzip"],
  tar: ["application/x-tar"],
  rar: ["application/x-rar-compressed", "application/vnd.rar"],
  "7z": ["application/x-7z-compressed"],
  txt: ["text/plain"],
  csv: ["text/csv"],
  json: ["application/json"],
  xml: ["application/xml", "text/xml"],
  md: ["text/markdown"],
  rtf: ["application/rtf"],
};

/**
 * Validate a file's MIME type against allowed patterns and check that
 * the file extension matches the declared MIME type (prevents mismatch attacks).
 */
export function validateFileType(
  mimeType: string,
  fileName: string,
  allowedTypes: string[],
): { valid: boolean; error?: string } {
  // Check MIME type against allowed patterns
  const isAllowed = allowedTypes.some((pattern) => {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1); // "image/*" -> "image/"
      return mimeType.startsWith(prefix);
    }
    return mimeType === pattern;
  });

  if (!isAllowed) {
    return {
      valid: false,
      error: `File type "${mimeType}" is not allowed. Allowed types: ${allowedTypes.join(", ")}`,
    };
  }

  // Check extension matches MIME type
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext && EXTENSION_MIME_MAP[ext]) {
    const expectedMimes = EXTENSION_MIME_MAP[ext];
    if (!expectedMimes.includes(mimeType)) {
      return {
        valid: false,
        error: `File extension ".${ext}" does not match declared MIME type "${mimeType}"`,
      };
    }
  }

  return { valid: true };
}

// ─── Media Type Categorization ───────────────────────────────────────────────

/**
 * Determine the media type category from a MIME type string.
 *
 * Mapping:
 *   image/*                                    -> "image"
 *   video/*                                    -> "video"
 *   audio/*                                    -> "audio"
 *   application/pdf, application/msword, etc.  -> "document"
 *   application/zip, application/gzip, etc.    -> "archive"
 *   everything else                            -> "other"
 */
export function categorizeMediaType(
  mimeType: string,
): "image" | "video" | "audio" | "document" | "archive" | "other" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";

  const documentTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/rtf",
    "text/plain",
    "text/csv",
    "text/html",
    "text/markdown",
    "application/json",
    "application/xml",
    "text/xml",
  ];
  if (documentTypes.includes(mimeType)) return "document";

  const archiveTypes = [
    "application/zip",
    "application/x-zip-compressed",
    "application/gzip",
    "application/x-gzip",
    "application/x-tar",
    "application/x-rar-compressed",
    "application/vnd.rar",
    "application/x-7z-compressed",
    "application/x-bzip",
    "application/x-bzip2",
  ];
  if (archiveTypes.includes(mimeType)) return "archive";

  return "other";
}

// ─── URL Helpers ─────────────────────────────────────────────────────────────

/**
 * Get the URL for a media item, optionally at a specific size.
 *
 * If sizeName is provided and exists, returns that size's URL.
 * Otherwise returns the original (full) URL.
 * URLs are resolved fresh from Convex storage.
 */
export async function getMediaUrl(
  ctx: QueryCtx,
  mediaId: Id<"media">,
  size?: string,
): Promise<string | null> {
  const media = await ctx.db.get("media", mediaId);
  if (!media) return null;

  if (size) {
    const sizeRecord = await ctx.db
      .query("mediaSizes")
      .withIndex("by_media_size", (q) =>
        q.eq("mediaId", mediaId).eq("sizeName", size),
      )
      .unique();

    if (sizeRecord) {
      const sizeUrl = (sizeRecord.storageId ? await ctx.storage.getUrl(sizeRecord.storageId) : null);
      return sizeUrl ?? sizeRecord.url;
    }
  }

  const freshUrl = (media.storageId ? await ctx.storage.getUrl(media.storageId) : null);
  return freshUrl ?? media.url;
}

/**
 * Get URL + dimensions for a media item at a specific size.
 */
export async function getMediaSrc(
  ctx: QueryCtx,
  mediaId: Id<"media">,
  size?: string,
): Promise<{ url: string; width: number; height: number } | null> {
  const media = await ctx.db.get("media", mediaId);
  if (!media) return null;

  if (size) {
    const sizeRecord = await ctx.db
      .query("mediaSizes")
      .withIndex("by_media_size", (q) =>
        q.eq("mediaId", mediaId).eq("sizeName", size),
      )
      .unique();

    if (sizeRecord) {
      const sizeUrl = (sizeRecord.storageId ? await ctx.storage.getUrl(sizeRecord.storageId) : null);
      return {
        url: sizeUrl ?? sizeRecord.url,
        width: sizeRecord.width,
        height: sizeRecord.height,
      };
    }
  }

  const freshUrl = (media.storageId ? await ctx.storage.getUrl(media.storageId) : null);
  return {
    url: freshUrl ?? media.url,
    width: media.width ?? 0,
    height: media.height ?? 0,
  };
}

/**
 * Build a complete srcset string from all available sizes for an image media item.
 *
 * Returns a string like:
 *   "https://url/thumb.jpg 150w, https://url/medium.jpg 300w, https://url/large.jpg 1024w"
 *
 * Returns empty string if no sizes are available.
 */
export async function buildSrcSet(
  ctx: QueryCtx,
  mediaId: Id<"media">,
): Promise<string> {
  const sizes = await ctx.db
    .query("mediaSizes")
    .withIndex("by_media", (q) => q.eq("mediaId", mediaId))
    .collect();

  if (sizes.length === 0) return "";

  const parts: string[] = [];
  for (const size of sizes) {
    const url = (size.storageId ? await ctx.storage.getUrl(size.storageId) : null);
    if (url) {
      parts.push(`${url} ${size.width}w`);
    }
  }

  // Also include the original/full size
  const media = await ctx.db.get("media", mediaId);
  if (media && media.width) {
    const fullUrl = (media.storageId ? await ctx.storage.getUrl(media.storageId) : null);
    if (fullUrl) {
      parts.push(`${fullUrl} ${media.width}w`);
    }
  }

  return parts.join(", ");
}

// ─── Slug & Title Helpers ────────────────────────────────────────────────────

/**
 * Generate a URL-safe slug from a string.
 * Lowercase, alphanumeric + hyphens, no consecutive hyphens, no leading/trailing hyphens.
 */
export function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 200);
}

/**
 * Generate a title from a filename by stripping the extension
 * and converting hyphens/underscores to spaces.
 */
export function titleFromFilename(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  const base = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  return base.replace(/[-_]+/g, " ").trim() || "Untitled";
}

/**
 * Format file size in bytes to a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ─── Attachment Tracking ────────────────────────────────────────────────────

/**
 * Set `media.attachedTo` to `postId` — but only when the media is not
 * already attached. WordPress semantics: first-use wins. Call sites
 * (post featured-image set, structured content image assignment, etc.)
 * can invoke this freely; it's a no-op when the media is already
 * attached or the id is missing.
 */
export async function setMediaAttachment(
  ctx: { db: any },
  mediaId: Id<"media"> | string | undefined | null,
  postId: Id<"posts"> | string,
): Promise<void> {
  if (!mediaId) return;
  const media = await ctx.db.get(mediaId);
  if (!media) return;
  if (media.attachedTo) return; // first-use wins
  if (media.status === "trashed") return;
  await ctx.db.patch(mediaId, {
    attachedTo: postId,
    updatedAt: Date.now(),
  });
}

/**
 * Batch version: attach every media ID in the list that isn't already
 * attached to `postId`. Used for galleries / structured content arrays.
 */
export async function setMediaAttachmentBatch(
  ctx: { db: any },
  mediaIds: Array<Id<"media"> | string | undefined | null>,
  postId: Id<"posts"> | string,
): Promise<void> {
  const seen = new Set<string>();
  for (const id of mediaIds) {
    if (!id) continue;
    const key = id as string;
    if (seen.has(key)) continue;
    seen.add(key);
    await setMediaAttachment(ctx, id, postId);
  }
}

// ─── Media Settings Integration ──────────────────────────────────────────────

/**
 * Default media settings. Used when no "media" settings section exists
 * in the Settings System or when specific keys are not configured.
 *
 * DEPENDENCY NOTE: The Settings System currently has 6 sections
 * (general, reading, writing, discussion, permalinks, privacy).
 * A "media" section needs to be added to the Settings System for
 * these settings to be configurable via the admin UI. Until then,
 * these code-defined defaults are used.
 *
 * WordPress equivalent: Settings > Media page.
 */
export interface MediaSettings {
  maxUploadSize: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
  thumbnailCrop: boolean;
  mediumWidth: number;
  mediumMaxHeight: number;
  mediumLargeWidth: number;
  mediumLargeMaxHeight: number;
  largeWidth: number;
  largeMaxHeight: number;
}

export const MEDIA_SETTINGS_DEFAULTS: MediaSettings = {
  /** Maximum file upload size in bytes (default: 50MB) */
  maxUploadSize: 50 * 1024 * 1024,
  /** WordPress-standard image sizes (configurable dimensions) */
  thumbnailWidth: 150,
  thumbnailHeight: 150,
  thumbnailCrop: true,
  mediumWidth: 300,
  mediumMaxHeight: 0, // 0 = proportional
  mediumLargeWidth: 768,
  mediumLargeMaxHeight: 0,
  largeWidth: 1024,
  largeMaxHeight: 0,
};

/**
 * Read media settings from the Settings System with fallback to defaults.
 *
 * Attempts to read from the "media" settings section. If the section doesn't
 * exist yet (it needs to be added to the Settings System), returns defaults.
 *
 * @param ctx - Convex query or mutation context
 * @returns Merged media settings (stored values override defaults)
 */
export async function getMediaSettings(
  ctx: QueryCtx,
): Promise<MediaSettings> {
  try {
    // Attempt to read from Settings System
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "media"))
      .unique();

    if (doc && doc.values && typeof doc.values === "object") {
      const stored = doc.values as Record<string, unknown>;
      return {
        maxUploadSize: typeof stored.maxUploadSize === "number"
          ? stored.maxUploadSize
          : MEDIA_SETTINGS_DEFAULTS.maxUploadSize,
        thumbnailWidth: typeof stored.thumbnailWidth === "number"
          ? stored.thumbnailWidth
          : MEDIA_SETTINGS_DEFAULTS.thumbnailWidth,
        thumbnailHeight: typeof stored.thumbnailHeight === "number"
          ? stored.thumbnailHeight
          : MEDIA_SETTINGS_DEFAULTS.thumbnailHeight,
        thumbnailCrop: typeof stored.thumbnailCrop === "boolean"
          ? stored.thumbnailCrop
          : MEDIA_SETTINGS_DEFAULTS.thumbnailCrop,
        mediumWidth: typeof stored.mediumWidth === "number"
          ? stored.mediumWidth
          : MEDIA_SETTINGS_DEFAULTS.mediumWidth,
        mediumMaxHeight: typeof stored.mediumMaxHeight === "number"
          ? stored.mediumMaxHeight
          : MEDIA_SETTINGS_DEFAULTS.mediumMaxHeight,
        mediumLargeWidth: typeof stored.mediumLargeWidth === "number"
          ? stored.mediumLargeWidth
          : MEDIA_SETTINGS_DEFAULTS.mediumLargeWidth,
        mediumLargeMaxHeight: typeof stored.mediumLargeMaxHeight === "number"
          ? stored.mediumLargeMaxHeight
          : MEDIA_SETTINGS_DEFAULTS.mediumLargeMaxHeight,
        largeWidth: typeof stored.largeWidth === "number"
          ? stored.largeWidth
          : MEDIA_SETTINGS_DEFAULTS.largeWidth,
        largeMaxHeight: typeof stored.largeMaxHeight === "number"
          ? stored.largeMaxHeight
          : MEDIA_SETTINGS_DEFAULTS.largeMaxHeight,
      };
    }
  } catch {
    // Settings section doesn't exist yet - use defaults
  }

  return { ...MEDIA_SETTINGS_DEFAULTS };
}
