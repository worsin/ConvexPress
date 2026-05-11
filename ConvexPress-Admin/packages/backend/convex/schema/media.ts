/**
 * Media System - Schema
 *
 * Three tables supporting the full media lifecycle:
 *   - `media`      - Primary table for all uploaded media items
 *   - `mediaSizes` - Generated image variants (thumbnail, medium, medium_large, large)
 *   - `mediaMeta`  - Extensible key-value metadata (EXIF, crop data, edit history)
 *
 * This mirrors WordPress's `wp_posts` (attachment post type) + `wp_postmeta`
 * (attachment metadata) but with typed, structured documents and Convex
 * file storage instead of filesystem paths.
 *
 * Storage model:
 *   - Original files are stored via Convex file storage (v.id("_storage"))
 *   - Each generated image size is a separate Convex storage entry
 *   - URLs are resolved from storageId and cached in the `url` field
 *   - The `storageId` is the source of truth; `url` is a convenience cache
 *
 * Ownership:
 *   - `uploadedBy` is the Convex users table ID (v.id("users"))
 *   - Authors can only modify their own uploads
 *   - Editors and Administrators can modify all uploads
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators (used by schema and functions) ───────────────────────

export const mediaStatusValidator = v.union(
  v.literal("processing"),
  v.literal("active"),
  v.literal("failed"),
  v.literal("trashed"),
);

export const mediaTypeValidator = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
  v.literal("document"),
  v.literal("archive"),
  v.literal("other"),
);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const mediaTables = {
  /**
   * Primary media table - one record per uploaded file.
   *
   * Indexes support the Media Library's filtering, sorting, and search
   * patterns. The search index enables full-text title search with
   * type/status/uploader faceting.
   */
  media: defineTable({
    // ── Core Fields ──────────────────────────────────────────────────────
    title: v.string(),
    fileName: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    caption: v.optional(v.string()),
    altText: v.optional(v.string()),

    // ── File Storage ─────────────────────────────────────────────────────
    // Convex storage ID. Optional because URL-only imports (used during
    // WordPress migration before UploadThing is wired) preserve only the
    // source URL — no Convex blob exists for those rows. Once the file
    // is downloaded to Convex (or migrated to UploadThing), this is set.
    storageId: v.optional(v.id("_storage")),
    url: v.string(),
    mimeType: v.string(),
    fileSize: v.number(),
    mediaType: mediaTypeValidator,

    // ── Image-Specific Fields ────────────────────────────────────────────
    width: v.optional(v.number()),
    height: v.optional(v.number()),

    // ── Processing ───────────────────────────────────────────────────────
    status: mediaStatusValidator,
    processingError: v.optional(v.string()),

    // ── Ownership ────────────────────────────────────────────────────────
    uploadedBy: v.id("users"),

    // ── Attachment ────────────────────────────────────────────────────────
    attachedTo: v.optional(v.id("posts")),

    // ── Logical upload path ──────────────────────────────────────────────
    /**
     * WP-style year/month path: "2026/04/my-image-slug.jpg". Convex storage
     * itself is flat and uses opaque IDs, but we persist this logical path
     * for admin readability, export/migration parity, and for naming
     * sub-size records consistently (e.g., "2026/04/my-image-slug-medium.jpg").
     * Set on create from `createdAt`.
     */
    uploadPath: v.optional(v.string()),

    // ── Trash ────────────────────────────────────────────────────────────
    /** Timestamp when the media was moved to trash. Present iff status === "trashed". */
    trashedAt: v.optional(v.number()),
    /** Status before trashing, used to restore back to the correct state. */
    previousStatus: v.optional(v.string()),
    /** User who performed the trash action. */
    trashedBy: v.optional(v.id("users")),

    // ── Timestamps ───────────────────────────────────────────────────────
    createdAt: v.number(),
    updatedAt: v.number(),

    // ── WordPress Import Fields ─────────────────────────────────────────
    wpAttachmentId: v.optional(v.number()), // Original WordPress attachment ID
    wpSourceUrl: v.optional(v.string()), // Original WordPress URL for deduplication
    wpSourceSiteId: v.optional(v.id("wordpressSites")), // Source WordPress site
  })
    .index("by_status", ["status"])
    .index("by_type", ["mediaType"])
    .index("by_uploaded_by", ["uploadedBy"])
    .index("by_uploader_type", ["uploadedBy", "mediaType"])
    .index("by_slug", ["slug"])
    .index("by_mime_type", ["mimeType"])
    .index("by_created", ["createdAt"])
    .index("by_type_created", ["mediaType", "createdAt"])
    .index("by_attached", ["attachedTo"])
    .index("by_wpSourceUrl", ["wpSourceUrl"]) // For WordPress import deduplication
    .index("by_wpSourceSiteId", ["wpSourceSiteId"]) // For querying imports by source site
    .searchIndex("search_media", {
      searchField: "title",
      filterFields: ["mediaType", "status", "uploadedBy"],
    }),

  /**
   * Generated image variants table.
   *
   * Each image media item can have up to 4 size variants:
   *   - thumbnail    (150x150 hard crop)
   *   - medium       (300px max width, proportional)
   *   - medium_large (768px max width, proportional)
   *   - large        (1024px max width, proportional)
   *
   * Each size is stored as a separate Convex storage entry.
   */
  mediaSizes: defineTable({
    mediaId: v.id("media"),
    sizeName: v.string(),
    storageId: v.id("_storage"),
    url: v.string(),
    width: v.number(),
    height: v.number(),
    fileSize: v.number(),
    mimeType: v.string(),
    crop: v.boolean(),
  })
    .index("by_media", ["mediaId"])
    .index("by_media_size", ["mediaId", "sizeName"]),

  /**
   * Extensible key-value metadata table.
   *
   * Used for EXIF data, crop coordinates, edit history, and any
   * other metadata that doesn't justify a schema field. Values
   * are stored as strings (JSON-encoded for complex values).
   *
   * Known meta key prefixes:
   *   - `_exif_*`            - EXIF camera/image data
   *   - `_crop_data`         - Last crop coordinates
   *   - `_original_storage_id` - Original file before edits (for revert)
   *   - `_edit_history`      - Array of edit operations
   */
  mediaMeta: defineTable({
    mediaId: v.id("media"),
    key: v.string(),
    value: v.string(),
  })
    .index("by_media", ["mediaId"])
    .index("by_media_key", ["mediaId", "key"])
    .index("by_key", ["key"]),
};
