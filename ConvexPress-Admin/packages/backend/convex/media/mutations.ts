/**
 * Media System - Mutations
 *
 * All write operations for the media lifecycle:
 *   create       - Create a media record after file upload to Convex storage
 *   update       - Update media metadata (title, alt text, caption, description)
 *   remove       - Permanently delete a media item, its sizes, meta, and storage files
 *   addSize      - Add a generated image size record (called by processing internals)
 *   updateStatus - Update media processing status (processing -> active/failed)
 *
 * Authorization model:
 *   - `media.upload` capability required to create media
 *   - `media.update` capability required to update own media
 *   - `media.edit_others` capability required to update others' media (Editor+)
 *   - `media.delete` capability required to delete own media
 *   - `media.delete_others` capability required to delete others' media (Editor+)
 *
 * All mutations emit events via the Event Dispatcher System for audit
 * logging and notification subscribers.
 */

import { ConvexError } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireCan , getUserIdentifier } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { MEDIA_EVENTS, SYSTEM } from "../events/constants";
import {
  createMediaArgs,
  updateMediaArgs,
  removeMediaArgs,
  restoreMediaArgs,
  permanentlyDeleteMediaArgs,
  addSizeArgs,
  updateStatusArgs,
  bulkDeleteArgs,
  bulkUpdateArgs,
} from "./validators";
import {
  categorizeMediaType,
  generateSlug,
  getMediaSettings,
  MEDIA_SETTINGS_DEFAULTS,
  titleFromFilename,
  validateFileType,
} from "./helpers";
import { checkMediaCapability, getUserRoleLevel } from "./mediaAuth";
import { findMediaReferences, clearMediaReferences } from "./references";

// ─── Default allowed MIME types ──────────────────────────────────────────────
// SECURITY DECISION: SVG (`image/svg+xml`) is intentionally excluded from the
// allowed MIME types list AND explicitly blocked with a dedicated check in the
// create mutation. SVG files can contain embedded JavaScript and external
// resource references that create XSS attack vectors. Without a server-side
// SVG sanitizer (e.g., DOMPurify), allowing SVG uploads would be a security
// vulnerability. This is a deliberate design choice, not an oversight.
// TODO: Re-evaluate when a server-side SVG sanitization pipeline is available.
const DEFAULT_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/avif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "application/gzip",
  "application/x-gzip",
  "application/x-tar",
  "application/x-rar-compressed",
  "application/vnd.rar",
  "application/x-7z-compressed",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/xml",
  "text/xml",
  "application/rtf",
];

// Default maximum file size: 50MB
// This value is used as a fallback. When the Settings System "media" section
// is available, the max upload size will be read from settings via getMediaSettings().
const MAX_FILE_SIZE_DEFAULT = 50 * 1024 * 1024;

// ─── Create ─────────────────────────────────────────────────────────────────

/**
 * Create a media record after a file has been uploaded to Convex storage.
 *
 * The upload flow:
 *   1. Client uploads file to Convex storage via `ctx.storage.generateUploadUrl()`
 *   2. Client receives a storageId
 *   3. Client calls this mutation with storageId + file metadata
 *   4. Mutation creates the media record and resolves the storage URL
 *   5. For images: status is "processing" (thumbnail generation happens later)
 *   6. For non-images: status is "active" immediately
 *
 * @returns The new media document ID
 */
export const create = mutation({
  args: createMediaArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "media.upload");

    // ── Validate filename ────────────────────────────────────────────────
    const fileName = args.fileName.trim();
    if (!fileName) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Filename cannot be empty",
      });
    }
    if (fileName.length > 255) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Filename must be 255 characters or fewer",
      });
    }

    // ── Validate file size (reads max from Settings System if available) ─
    const mediaSettings = await getMediaSettings(ctx);
    const maxUploadSize = mediaSettings.maxUploadSize || MAX_FILE_SIZE_DEFAULT;

    if (args.fileSize <= 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "File is empty (0 bytes)",
      });
    }
    if (args.fileSize > maxUploadSize) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `File exceeds the maximum upload size of ${maxUploadSize / (1024 * 1024)}MB`,
      });
    }

    // ── Validate file type (C1: security - prevent MIME spoofing) ──────
    // C3: SVG uploads are blocked entirely -- INTENTIONAL security decision.
    // SVG can contain embedded <script> tags and external entity references.
    // See SECURITY DECISION comment above DEFAULT_ALLOWED_TYPES.
    if (args.mimeType === "image/svg+xml") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "SVG uploads are not allowed due to security concerns",
      });
    }
    const fileTypeValidation = validateFileType(
      args.mimeType,
      fileName,
      DEFAULT_ALLOWED_TYPES,
    );
    if (!fileTypeValidation.valid) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: fileTypeValidation.error || "File type is not allowed",
      });
    }

    // ── Resolve storage URL ──────────────────────────────────────────────
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      throw new ConvexError({
        code: "STORAGE_ERROR",
        message: "Could not resolve storage URL for the uploaded file",
      });
    }

    // ── Determine media type from MIME type ──────────────────────────────
    const mediaType = categorizeMediaType(args.mimeType);

    // ── Generate title and slug ──────────────────────────────────────────
    const title = args.title?.trim() || titleFromFilename(fileName);
    if (title.length > 500) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Title must be 500 characters or fewer",
      });
    }

    const baseSlug = generateSlug(title);
    // Ensure slug uniqueness by appending a suffix if needed
    let slug = baseSlug || "media";
    let slugSuffix = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const candidate = slugSuffix === 0 ? slug : `${slug}-${slugSuffix}`;
      const existing = await ctx.db
        .query("media")
        .withIndex("by_slug", (q) => q.eq("slug", candidate))
        .unique();
      if (!existing) {
        slug = candidate;
        break;
      }
      slugSuffix++;
    }

    // ── Determine initial status ─────────────────────────────────────────
    // Images start as "processing" (thumbnail generation will happen later)
    // Non-images are "active" immediately
    const status = mediaType === "image" ? "processing" : "active";

    // ── Validate optional metadata ───────────────────────────────────────
    const altText = args.altText?.trim();
    const caption = args.caption?.trim();
    const description = args.description?.trim();

    if (altText && altText.length > 500) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Alt text must be 500 characters or fewer",
      });
    }
    if (caption && caption.length > 1000) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Caption must be 1000 characters or fewer",
      });
    }
    if (description && description.length > 5000) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Description must be 5000 characters or fewer",
      });
    }

    // ── Insert media record ──────────────────────────────────────────────
    const now = Date.now();

    // WP-style logical upload path: "YYYY/MM/slug.ext"
    const nowDate = new Date(now);
    const yearPart = String(nowDate.getUTCFullYear());
    const monthPart = String(nowDate.getUTCMonth() + 1).padStart(2, "0");
    const extMatch = /\.[A-Za-z0-9]+$/.exec(fileName);
    const ext = extMatch ? extMatch[0].toLowerCase() : "";
    const uploadPath = `${yearPart}/${monthPart}/${slug}${ext}`;

    const mediaId = await ctx.db.insert("media", {
      title,
      fileName,
      slug,
      description: description || undefined,
      caption: caption || undefined,
      altText: altText || undefined,
      storageId: args.storageId,
      url,
      mimeType: args.mimeType,
      fileSize: args.fileSize,
      mediaType,
      width: args.width,
      height: args.height,
      status,
      uploadedBy: user._id,
      uploadPath,
      createdAt: now,
      updatedAt: now,
    });

    // ── Emit event ───────────────────────────────────────────────────────
    await emitEvent(ctx, MEDIA_EVENTS.UPLOADED, SYSTEM.MEDIA, {
      mediaId,
      fileName,
      mimeType: args.mimeType,
      size: args.fileSize,
      uploadedBy: getUserIdentifier(user),
      mediaType,
    });

    // ── Schedule image processing ─────────────────────────────────────────
    // For images: schedule the sharp-based pipeline. It:
    //   1. Auto-rotates based on EXIF orientation
    //   2. Scales down images over the big-image threshold
    //   3. Generates real thumbnail/medium/medium_large/large variants
    //   4. Transitions status to "active"
    //
    // On failure, the action marks the record as "failed" with an error
    // message. The admin UI can show it and offer retry via regenerate.
    if (mediaType === "image") {
      await ctx.scheduler.runAfter(
        0,
        internal.media.imageProcessing.processImageWithSharp,
        { mediaId },
      );
    }

    return mediaId;
  },
});

// ─── Update ─────────────────────────────────────────────────────────────────

/**
 * Update media metadata (title, alt text, caption, description).
 *
 * Authorization:
 *   - Own media: requires "media.update" capability (Author+)
 *   - Others' media: requires "media.update" capability (Editor+ via role level check)
 *
 * The knowledge doc specifies `upload_files` for own and `edit_others_media` for others',
 * but the capability system uses `media.update` as the concrete capability with
 * ownership-based resolution. We check `media.update` and then verify ownership
 * for Authors manually.
 */
export const update = mutation({
  args: updateMediaArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "media.update");

    // ── Fetch existing media ─────────────────────────────────────────────
    const media = await ctx.db.get("media", args.mediaId);
    if (!media) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Media item not found",
      });
    }

    // ── Ownership check ──────────────────────────────────────────────────
    // Authors (level < 80) can only edit their own media
    await checkMediaCapability(ctx, user, media, "edit");

    // ── Validate fields ──────────────────────────────────────────────────
    const title = args.title?.trim();
    const altText = args.altText?.trim();
    const caption = args.caption?.trim();
    const description = args.description?.trim();

    if (title !== undefined && title.length > 500) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Title must be 500 characters or fewer",
      });
    }
    if (altText !== undefined && altText.length > 500) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Alt text must be 500 characters or fewer",
      });
    }
    if (caption !== undefined && caption.length > 1000) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Caption must be 1000 characters or fewer",
      });
    }
    if (description !== undefined && description.length > 5000) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Description must be 5000 characters or fewer",
      });
    }

    // ── Build patch ──────────────────────────────────────────────────────
    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };
    const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];

    if (title !== undefined && title !== media.title) {
      patch.title = title;
      changes.push({ field: "title", oldValue: media.title, newValue: title });
    }

    // ── Slug update (H7: allow slug changes via update mutation) ────────
    if (args.slug !== undefined) {
      const newSlug = args.slug.trim();
      if (newSlug.length > 200) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Slug must be 200 characters or fewer",
        });
      }
      const normalizedSlug = generateSlug(newSlug) || "media";
      if (normalizedSlug !== media.slug) {
        // Check uniqueness
        const existingSlug = await ctx.db
          .query("media")
          .withIndex("by_slug", (q) => q.eq("slug", normalizedSlug))
          .unique();
        if (existingSlug && existingSlug._id !== args.mediaId) {
          throw new ConvexError({
            code: "CONFLICT",
            message: `Slug "${normalizedSlug}" is already in use`,
          });
        }
        patch.slug = normalizedSlug;
        changes.push({ field: "slug", oldValue: media.slug, newValue: normalizedSlug });
      }
    }
    if (altText !== undefined && altText !== media.altText) {
      patch.altText = altText || undefined;
      changes.push({ field: "altText", oldValue: media.altText, newValue: altText });
    }
    if (caption !== undefined && caption !== media.caption) {
      patch.caption = caption || undefined;
      changes.push({ field: "caption", oldValue: media.caption, newValue: caption });
    }
    if (description !== undefined && description !== media.description) {
      patch.description = description || undefined;
      changes.push({
        field: "description",
        oldValue: media.description,
        newValue: description,
      });
    }

    // ── Handle attachedTo (attach/detach from post) ─────────────────
    if (args.attachedTo !== undefined) {
      const newAttachedTo = args.attachedTo === null ? undefined : args.attachedTo;
      if (newAttachedTo !== media.attachedTo) {
        patch.attachedTo = newAttachedTo;
        changes.push({
          field: "attachedTo",
          oldValue: media.attachedTo ?? null,
          newValue: newAttachedTo ?? null,
        });
      }
    }

    // Only patch if there are actual changes
    if (changes.length > 0) {
      await ctx.db.patch("media", args.mediaId, patch);

      // ── Emit event ─────────────────────────────────────────────────────
      await emitEvent(ctx, MEDIA_EVENTS.UPDATED, SYSTEM.MEDIA, {
        mediaId: args.mediaId,
        changes,
      });
    }

    return args.mediaId;
  },
});

// ─── Remove ─────────────────────────────────────────────────────────────────

/**
 * Permanently delete a media item.
 *
 * This is a destructive, non-reversible operation (no trash). It:
 *   1. Deletes the original file from Convex storage
 *   2. Deletes all generated image sizes and their storage files
 *   3. Deletes all associated mediaMeta records
 *   4. Deletes the media record itself
 *   5. Emits a media.deleted event
 *
 * Authorization:
 *   - Own media: requires "media.delete" capability (Author+)
 *   - Others' media: requires "media.delete" capability + Editor-level role (80+)
 */
export const remove = mutation({
  args: removeMediaArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "media.delete");

    const media = await ctx.db.get("media", args.mediaId);
    if (!media) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Media item not found",
      });
    }

    // Idempotency: already trashed?
    if (media.status === "trashed") {
      return { success: true, alreadyTrashed: true };
    }

    await checkMediaCapability(ctx, user, media, "delete");

    // Reference check. Refuse to trash referenced media unless force:true +
    // Editor-level role (force sweeps references across all systems).
    const references = await findMediaReferences(ctx, args.mediaId);
    if (references.length > 0 && !args.force) {
      throw new ConvexError({
        code: "MEDIA_IN_USE",
        message: `This media is referenced by ${references.length} document(s). Remove the references first, or pass force: true.`,
        data: { references },
      });
    }
    if (references.length > 0 && args.force) {
      const level = await getUserRoleLevel(ctx, user);
      if (level < 80) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Force-trashing referenced media requires Editor-level role or higher.",
          data: { references },
        });
      }
      await clearMediaReferences(ctx, args.mediaId, references);
    }

    // Soft-delete: flip status to "trashed", preserve storage + record.
    const now = Date.now();
    await ctx.db.patch("media", args.mediaId, {
      status: "trashed" as const,
      previousStatus: media.status,
      trashedAt: now,
      trashedBy: user._id,
      updatedAt: now,
    });

    await emitEvent(ctx, MEDIA_EVENTS.DELETED, SYSTEM.MEDIA, {
      mediaId: args.mediaId,
      fileName: media.fileName,
      deletedBy: getUserIdentifier(user),
      mediaType: media.mediaType,
      fileSize: media.fileSize,
      trashed: true,
    });

    return { success: true, trashed: true };
  },
});

// ─── Restore ────────────────────────────────────────────────────────────────

/**
 * Restore a trashed media item back to its previous status.
 */
export const restore = mutation({
  args: restoreMediaArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "media.delete");

    const media = await ctx.db.get("media", args.mediaId);
    if (!media) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Media item not found",
      });
    }
    if (media.status !== "trashed") {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Only trashed media can be restored.",
      });
    }

    await checkMediaCapability(ctx, user, media, "delete");

    const restoredStatus = (media.previousStatus ?? "active") as
      | "processing"
      | "active"
      | "failed";
    const now = Date.now();
    await ctx.db.patch("media", args.mediaId, {
      status: restoredStatus,
      previousStatus: undefined,
      trashedAt: undefined,
      trashedBy: undefined,
      updatedAt: now,
    });

    await emitEvent(ctx, MEDIA_EVENTS.UPDATED, SYSTEM.MEDIA, {
      mediaId: args.mediaId,
      changes: [{ field: "status", oldValue: "trashed", newValue: restoredStatus }],
      restored: true,
    });

    return { success: true, restoredStatus };
  },
});

// ─── Permanently Delete ─────────────────────────────────────────────────────

/**
 * Hard-delete a media item. Removes storage, sizes, meta, and record.
 * Works on any status (trashed, active, etc.). Reference-check still
 * applies; force: true sweeps and requires Editor-level role.
 */
export const permanentlyDelete = mutation({
  args: permanentlyDeleteMediaArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "media.delete");

    const media = await ctx.db.get("media", args.mediaId);
    if (!media) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Media item not found",
      });
    }

    await checkMediaCapability(ctx, user, media, "delete");

    const references = await findMediaReferences(ctx, args.mediaId);
    if (references.length > 0 && !args.force) {
      throw new ConvexError({
        code: "MEDIA_IN_USE",
        message: `This media is referenced by ${references.length} document(s). Pass force: true to clear references.`,
        data: { references },
      });
    }
    if (references.length > 0 && args.force) {
      const level = await getUserRoleLevel(ctx, user);
      if (level < 80) {
        throw new ConvexError({
          code: "FORBIDDEN",
          message: "Force-deleting referenced media requires Editor-level role or higher.",
          data: { references },
        });
      }
      await clearMediaReferences(ctx, args.mediaId, references);
    }

    // Delete original storage blob
    try {
      await ctx.storage.delete(media.storageId);
    } catch {
      // Orphaned; continue
    }

    // Delete all sub-size storage blobs + records
    const sizes = await ctx.db
      .query("mediaSizes")
      .withIndex("by_media", (q) => q.eq("mediaId", args.mediaId))
      .collect();
    for (const size of sizes) {
      try {
        await ctx.storage.delete(size.storageId);
      } catch {
        // Orphaned
      }
      await ctx.db.delete("mediaSizes", size._id);
    }

    // Delete all meta rows
    const metaRecords = await ctx.db
      .query("mediaMeta")
      .withIndex("by_media", (q) => q.eq("mediaId", args.mediaId))
      .collect();
    for (const meta of metaRecords) {
      await ctx.db.delete("mediaMeta", meta._id);
    }

    const eventPayload = {
      mediaId: args.mediaId,
      fileName: media.fileName,
      deletedBy: getUserIdentifier(user),
      mediaType: media.mediaType,
      fileSize: media.fileSize,
      permanent: true,
    };

    await ctx.db.delete("media", args.mediaId);
    await emitEvent(ctx, MEDIA_EVENTS.DELETED, SYSTEM.MEDIA, eventPayload);

    return { success: true, permanent: true };
  },
});

// ─── Add Size (Internal) ─────────────────────────────────────────────────────

/**
 * Add a generated image size record.
 *
 * Called by the image processing pipeline after generating a variant.
 * This is an internalMutation -- not client-callable -- to prevent
 * unauthorized modification of media size records.
 *
 * Called from processImageAction via ctx.runMutation(internal.media.mutations.addSize, ...).
 */
export const addSize = internalMutation({
  args: addSizeArgs,
  handler: async (ctx, args) => {
    // Validate the parent media exists
    const media = await ctx.db.get("media", args.mediaId);
    if (!media) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Parent media item not found",
      });
    }

    // Check for existing size with same name (prevent duplicates)
    const existing = await ctx.db
      .query("mediaSizes")
      .withIndex("by_media_size", (q) =>
        q.eq("mediaId", args.mediaId).eq("sizeName", args.sizeName),
      )
      .unique();

    if (existing) {
      // Replace existing size: delete old storage file and record
      try {
        await ctx.storage.delete(existing.storageId);
      } catch {
        // Orphaned storage file
      }
      await ctx.db.delete("mediaSizes", existing._id);
    }

    // Insert the new size record
    const sizeId = await ctx.db.insert("mediaSizes", {
      mediaId: args.mediaId,
      sizeName: args.sizeName,
      storageId: args.storageId,
      url: args.url,
      width: args.width,
      height: args.height,
      fileSize: args.fileSize,
      mimeType: args.mimeType,
      crop: args.crop,
    });

    return sizeId;
  },
});

// ─── Update Status (Internal) ────────────────────────────────────────────────

/**
 * Update the processing status of a media item.
 *
 * Called after image processing completes (status -> "active")
 * or fails (status -> "failed" with error message).
 *
 * This is an internalMutation -- not client-callable -- to prevent
 * unauthorized status manipulation of media records.
 */
export const updateStatus = internalMutation({
  args: updateStatusArgs,
  handler: async (ctx, args) => {
    const media = await ctx.db.get("media", args.mediaId);
    if (!media) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Media item not found",
      });
    }

    const now = Date.now();
    const patch: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    if (args.processingError !== undefined) {
      patch.processingError = args.processingError;
    }

    // Clear processing error when transitioning to active
    if (args.status === "active") {
      patch.processingError = undefined;
    }

    await ctx.db.patch("media", args.mediaId, patch);

    return args.mediaId;
  },
});

// ─── Generate Upload URL ────────────────────────────────────────────────────

/**
 * Generate a Convex storage upload URL.
 *
 * The client calls this to get a URL for uploading a file directly
 * to Convex storage. After the upload completes, the client calls
 * `create` with the resulting storageId.
 *
 * Requires authentication with media.upload capability.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "media.upload");
    return await ctx.storage.generateUploadUrl();
  },
});

// ─── Bulk Delete ─────────────────────────────────────────────────────────────

/**
 * Permanently delete multiple media items at once.
 *
 * Authorization: Requires Editor-level role (80+) for bulk operations,
 * since bulk delete always operates on mixed-ownership items.
 *
 * Limits: Max 100 items per request to avoid mutation timeouts.
 *
 * @returns { deleted: number, errors: Array<{ mediaId, error }> }
 */
export const bulkDelete = mutation({
  args: bulkDeleteArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "media.delete");

    // Validate array bounds
    if (args.mediaIds.length === 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "No media items specified for deletion",
      });
    }
    if (args.mediaIds.length > 100) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Cannot delete more than 100 items at once",
      });
    }

    // Check user has Editor-level role for bulk operations
    const level = await getUserRoleLevel(ctx, user);
    if (level < 80) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Bulk delete requires Editor or Administrator role",
      });
    }

    let trashed = 0;
    const errors: Array<{ mediaId: string; error: string; references?: unknown }> = [];
    const now = Date.now();

    for (const mediaId of args.mediaIds) {
      try {
        const media = await ctx.db.get("media", mediaId);
        if (!media) {
          errors.push({ mediaId: mediaId as string, error: "Not found" });
          continue;
        }
        if (media.status === "trashed") {
          trashed++;
          continue;
        }

        const references = await findMediaReferences(ctx, mediaId);
        if (references.length > 0 && !args.force) {
          errors.push({
            mediaId: mediaId as string,
            error: `In use by ${references.length} document(s)`,
            references,
          });
          continue;
        }
        if (references.length > 0 && args.force) {
          await clearMediaReferences(ctx, mediaId, references);
        }

        await ctx.db.patch("media", mediaId, {
          status: "trashed" as const,
          previousStatus: media.status,
          trashedAt: now,
          trashedBy: user._id,
          updatedAt: now,
        });

        await emitEvent(ctx, MEDIA_EVENTS.DELETED, SYSTEM.MEDIA, {
          mediaId,
          fileName: media.fileName,
          deletedBy: getUserIdentifier(user),
          mediaType: media.mediaType,
          fileSize: media.fileSize,
          trashed: true,
        });

        trashed++;
      } catch (err) {
        errors.push({
          mediaId: mediaId as string,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return { trashed, errors };
  },
});

// ─── Bulk Restore ───────────────────────────────────────────────────────────

export const bulkRestore = mutation({
  args: bulkDeleteArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "media.delete");

    if (args.mediaIds.length === 0 || args.mediaIds.length > 100) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Restore between 1 and 100 items at once",
      });
    }
    const level = await getUserRoleLevel(ctx, user);
    if (level < 80) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Bulk restore requires Editor or Administrator role",
      });
    }

    let restored = 0;
    const errors: Array<{ mediaId: string; error: string }> = [];
    const now = Date.now();
    for (const mediaId of args.mediaIds) {
      try {
        const media = await ctx.db.get("media", mediaId);
        if (!media) {
          errors.push({ mediaId: mediaId as string, error: "Not found" });
          continue;
        }
        if (media.status !== "trashed") continue;
        const restoredStatus = (media.previousStatus ?? "active") as
          | "processing"
          | "active"
          | "failed";
        await ctx.db.patch("media", mediaId, {
          status: restoredStatus,
          previousStatus: undefined,
          trashedAt: undefined,
          trashedBy: undefined,
          updatedAt: now,
        });
        await emitEvent(ctx, MEDIA_EVENTS.UPDATED, SYSTEM.MEDIA, {
          mediaId,
          changes: [{ field: "status", oldValue: "trashed", newValue: restoredStatus }],
          restored: true,
        });
        restored++;
      } catch (err) {
        errors.push({
          mediaId: mediaId as string,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
    return { restored, errors };
  },
});

// ─── Bulk Permanently Delete ────────────────────────────────────────────────

export const bulkPermanentlyDelete = mutation({
  args: bulkDeleteArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "media.delete");

    if (args.mediaIds.length === 0 || args.mediaIds.length > 100) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Delete between 1 and 100 items at once",
      });
    }
    const level = await getUserRoleLevel(ctx, user);
    if (level < 80) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Bulk permanent delete requires Editor or Administrator role",
      });
    }

    let deleted = 0;
    const errors: Array<{ mediaId: string; error: string; references?: unknown }> = [];

    for (const mediaId of args.mediaIds) {
      try {
        const media = await ctx.db.get("media", mediaId);
        if (!media) {
          errors.push({ mediaId: mediaId as string, error: "Not found" });
          continue;
        }
        const references = await findMediaReferences(ctx, mediaId);
        if (references.length > 0 && !args.force) {
          errors.push({
            mediaId: mediaId as string,
            error: `In use by ${references.length} document(s)`,
            references,
          });
          continue;
        }
        if (references.length > 0 && args.force) {
          await clearMediaReferences(ctx, mediaId, references);
        }

        try { await ctx.storage.delete(media.storageId); } catch { /* orphaned */ }

        const sizes = await ctx.db
          .query("mediaSizes")
          .withIndex("by_media", (q) => q.eq("mediaId", mediaId))
          .collect();
        for (const size of sizes) {
          try { await ctx.storage.delete(size.storageId); } catch { /* orphaned */ }
          await ctx.db.delete("mediaSizes", size._id);
        }

        const metaRecords = await ctx.db
          .query("mediaMeta")
          .withIndex("by_media", (q) => q.eq("mediaId", mediaId))
          .collect();
        for (const meta of metaRecords) {
          await ctx.db.delete("mediaMeta", meta._id);
        }

        await ctx.db.delete("media", mediaId);
        await emitEvent(ctx, MEDIA_EVENTS.DELETED, SYSTEM.MEDIA, {
          mediaId,
          fileName: media.fileName,
          deletedBy: getUserIdentifier(user),
          mediaType: media.mediaType,
          fileSize: media.fileSize,
          permanent: true,
        });
        deleted++;
      } catch (err) {
        errors.push({
          mediaId: mediaId as string,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
    return { deleted, errors };
  },
});

// ─── Bulk Update (metadata) ─────────────────────────────────────────────────

/**
 * Bulk-edit metadata on up to 100 media items. Any field left undefined
 * is untouched; an explicit empty string clears the field (WP's
 * bulk-edit behavior). Ownership/capability check runs per-item so a
 * Contributor can bulk-edit only their own uploads.
 */
export const bulkUpdate = mutation({
  args: bulkUpdateArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "media.update");

    if (args.mediaIds.length === 0 || args.mediaIds.length > 100) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Edit between 1 and 100 items at once",
      });
    }

    let updated = 0;
    const errors: Array<{ mediaId: string; error: string }> = [];
    const now = Date.now();

    // Length caps — match the single-item `update` constraints.
    if (args.title !== undefined && args.title.length > 500) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Title must be 500 characters or fewer",
      });
    }
    if (args.altText !== undefined && args.altText.length > 500) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Alt text must be 500 characters or fewer",
      });
    }
    if (args.caption !== undefined && args.caption.length > 1000) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Caption must be 1000 characters or fewer",
      });
    }
    if (args.description !== undefined && args.description.length > 5000) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Description must be 5000 characters or fewer",
      });
    }

    for (const mediaId of args.mediaIds) {
      try {
        const media = await ctx.db.get("media", mediaId);
        if (!media) {
          errors.push({ mediaId: mediaId as string, error: "Not found" });
          continue;
        }

        await checkMediaCapability(ctx, user, media, "edit");

        const patch: Record<string, unknown> = { updatedAt: now };
        if (args.title !== undefined) {
          patch.title = args.title.trim() || media.title;
        }
        if (args.altText !== undefined) {
          patch.altText = args.altText.trim() || undefined;
        }
        if (args.caption !== undefined) {
          patch.caption = args.caption.trim() || undefined;
        }
        if (args.description !== undefined) {
          patch.description = args.description.trim() || undefined;
        }

        // Skip if only updatedAt would change
        if (Object.keys(patch).length === 1) continue;

        await ctx.db.patch("media", mediaId, patch);
        updated++;
      } catch (err) {
        errors.push({
          mediaId: mediaId as string,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return { updated, errors };
  },
});
