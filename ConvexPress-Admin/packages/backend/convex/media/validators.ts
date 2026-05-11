/**
 * Media System - Shared Argument Validators
 *
 * Reusable Convex argument validators for media mutations and queries.
 * Centralizes validation logic so mutations and queries stay clean.
 *
 * Convention: each exported object is an args shape (Record<string, Validator>)
 * ready to spread into a Convex function's `args` field.
 */

import { v } from "convex/values";
import {
  mediaStatusValidator,
  mediaTypeValidator,
} from "../schema/media";

// ─── Mutation Args ──────────────────────────────────────────────────────────

/**
 * Arguments for creating a media record after file upload.
 *
 * The client uploads the file to Convex storage first (getting a storageId),
 * then calls this mutation with the storageId and file metadata.
 */
export const createMediaArgs = {
  storageId: v.id("_storage"),
  fileName: v.string(),
  mimeType: v.string(),
  fileSize: v.number(),
  title: v.optional(v.string()),
  altText: v.optional(v.string()),
  caption: v.optional(v.string()),
  description: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
};

/**
 * Arguments for updating media metadata.
 *
 * All fields except mediaId are optional -- only provided fields are updated.
 */
export const updateMediaArgs = {
  mediaId: v.id("media"),
  title: v.optional(v.string()),
  slug: v.optional(v.string()),
  altText: v.optional(v.string()),
  caption: v.optional(v.string()),
  description: v.optional(v.string()),
  /** Attach or detach media from a post. Pass null to detach. */
  attachedTo: v.optional(v.union(v.id("posts"), v.null())),
};

/**
 * Arguments for deleting a single media item (soft-delete to trash).
 *
 * By default the mutation refuses to trash media that is still referenced
 * by other documents. Pass `force: true` to sweep every reference across
 * all systems before trashing. `force: true` also requires Editor-level role.
 */
export const removeMediaArgs = {
  mediaId: v.id("media"),
  force: v.optional(v.boolean()),
};

/**
 * Arguments for restoring a trashed media item back to its previous status.
 */
export const restoreMediaArgs = {
  mediaId: v.id("media"),
};

/**
 * Arguments for permanently deleting a media item (bypassing trash, or
 * hard-deleting an already-trashed item). Reference-check still applies
 * unless `force: true`.
 */
export const permanentlyDeleteMediaArgs = {
  mediaId: v.id("media"),
  force: v.optional(v.boolean()),
};

/**
 * Arguments for adding a generated image size record.
 *
 * Called by image processing internals after generating a thumbnail/variant.
 */
export const addSizeArgs = {
  mediaId: v.id("media"),
  sizeName: v.string(),
  storageId: v.id("_storage"),
  url: v.string(),
  width: v.number(),
  height: v.number(),
  fileSize: v.number(),
  mimeType: v.string(),
  crop: v.boolean(),
};

/**
 * Arguments for updating media processing status.
 *
 * Called after image processing completes (or fails).
 */
export const updateStatusArgs = {
  mediaId: v.id("media"),
  status: mediaStatusValidator,
  processingError: v.optional(v.string()),
};

// ─── Query Args ─────────────────────────────────────────────────────────────

/**
 * Arguments for listing media with filters and pagination.
 *
 * Supports the Media Library's filter tabs, search bar, and sort options.
 * Uses cursor-based pagination via Convex's `.paginate()`.
 */
export const listMediaArgs = {
  mediaType: v.optional(mediaTypeValidator),
  /** Filter by exact MIME type (e.g., "image/jpeg", "application/pdf") */
  mimeType: v.optional(v.string()),
  status: v.optional(mediaStatusValidator),
  uploadedBy: v.optional(v.id("users")),
  search: v.optional(v.string()),
  /** Filter by date range: only include items created at or after this timestamp */
  dateFrom: v.optional(v.number()),
  /** Filter by date range: only include items created at or before this timestamp */
  dateTo: v.optional(v.number()),
  /** Sort field. Default: "createdAt". Future: "title", "fileSize" */
  orderBy: v.optional(v.union(v.literal("createdAt"), v.literal("title"), v.literal("fileSize"))),
  /** Sort direction. Default: "desc" */
  orderDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
  /** If true, only return media items that are NOT attached to a post */
  unattached: v.optional(v.boolean()),
  /**
   * Trash scope. "active" (default) hides trashed items — matches WP's
   * library view. "only" shows just the trash bin. "all" shows both.
   */
  trashView: v.optional(
    v.union(v.literal("active"), v.literal("only"), v.literal("all")),
  ),
  paginationOpts: v.object({
    numItems: v.number(),
    cursor: v.union(v.string(), v.null()),
  }),
};

/**
 * Arguments for getting a single media item by ID.
 */
export const getMediaArgs = {
  mediaId: v.id("media"),
};

/**
 * Arguments for getting multiple media items by IDs.
 *
 * Used for batch lookups (e.g., featured images for a list of posts).
 */
export const getByIdsArgs = {
  mediaIds: v.array(v.id("media")),
};

/**
 * Arguments for getting the storage URL for a media item.
 */
export const getUrlArgs = {
  mediaId: v.id("media"),
  sizeName: v.optional(v.string()),
};

/**
 * Arguments for building a srcset string for a media item.
 */
export const getSrcSetArgs = {
  mediaId: v.id("media"),
};

/**
 * Arguments for bulk deleting media items.
 */
export const bulkDeleteArgs = {
  mediaIds: v.array(v.id("media")),
  force: v.optional(v.boolean()),
};

/**
 * Arguments for bulk-editing media metadata. Each provided field is
 * applied to every selected item. Fields left undefined are untouched.
 * An explicit empty string clears the field (WP's bulk-edit behavior).
 */
export const bulkUpdateArgs = {
  mediaIds: v.array(v.id("media")),
  title: v.optional(v.string()),
  altText: v.optional(v.string()),
  caption: v.optional(v.string()),
  description: v.optional(v.string()),
};
