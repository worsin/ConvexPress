/**
 * Media System - Image Editing Actions
 *
 * Server-side image manipulation actions. Each action:
 *   1. Auth + capability check (via query)
 *   2. Validates media is an editable image
 *   3. Saves original storageId to mediaMeta (for revert, if first edit)
 *   4. Stores edit transform parameters in mediaMeta
 *   5. Updates media record metadata (dimensions for rotate/crop/scale)
 *   6. Emits media.updated event via mutation
 *   7. Triggers size regeneration for the updated image
 *
 * Image editing architecture:
 *   Since sharp (native addon) is not available in the Convex runtime,
 *   edits are stored as transform metadata on the media record. This enables:
 *     - Full edit history tracking via _edit_history meta key
 *     - Lossless revert to original via _original_storage_id
 *     - Future server-side rendering when sharp becomes available
 *     - Client-side CSS transforms for immediate visual feedback
 *
 *   Each edit action stores its transform parameters and updates the
 *   logical dimensions of the image. The actual pixel data remains the
 *   original, but consumers can apply CSS transforms based on the metadata.
 *
 * Exports:
 *   crop    - Crop image to specified coordinates
 *   rotate  - Rotate image 90/180/270 degrees
 *   flip    - Flip image horizontally or vertically
 *   scale   - Scale/resize image to new dimensions
 *   revert  - Revert to original pre-edit image
 */

import { v, ConvexError } from "convex/values";
import { action } from "../_generated/server";
import type { ActionCtx as ConvexActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Properly typed action context from Convex server. */
type ActionCtx = ConvexActionCtx;

interface MediaRecord {
  mediaType: string;
  status: string;
  width?: number;
  height?: number;
  storageId: string;
  url: string;
  metaMap?: Record<string, string>;
  title: string;
  mimeType: string;
  fileSize: number;
}

interface EditHistoryEntry {
  action: string;
  params: Record<string, unknown>;
  timestamp: number;
  resultWidth?: number;
  resultHeight?: number;
}

// ─── Shared Helpers ─────────────────────────────────────────────────────────

/**
 * Validate that a media item exists, is an image, is active, and the
 * current user has the `media.update` capability with ownership check.
 * Returns the media record or throws.
 */
async function validateEditableImage(
  ctx: ActionCtx,
  mediaId: Id<"media">,
): Promise<MediaRecord> {
  // Check capability first -- this verifies auth, media.update cap, and ownership
  await ctx.runMutation(internal.media.internals.checkEditCapability, {
    mediaId,
  });

  const media = await ctx.runQuery(api.media.queries.get, {
    mediaId,
  });

  if (!media) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Media item not found",
    });
  }

  const m = media as MediaRecord;

  if (m.mediaType !== "image") {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Only images can be edited",
    });
  }

  if (m.status !== "active") {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Only active images can be edited. This image is currently " + m.status,
    });
  }

  return m;
}

/**
 * Save the original storageId to mediaMeta if this is the first edit.
 * This enables the revert action to restore the original image.
 */
async function saveOriginalIfFirstEdit(
  ctx: ActionCtx,
  mediaId: Id<"media">,
  metaMap: Record<string, string> | undefined,
  storageId: string,
  width: number | undefined,
  height: number | undefined,
): Promise<void> {
  if (!metaMap?.["_original_storage_id"]) {
    await ctx.runMutation(internal.media.internals.setMeta, {
      mediaId,
      key: "_original_storage_id",
      value: storageId,
    });
    if (width) {
      await ctx.runMutation(internal.media.internals.setMeta, {
        mediaId,
        key: "_original_width",
        value: String(width),
      });
    }
    if (height) {
      await ctx.runMutation(internal.media.internals.setMeta, {
        mediaId,
        key: "_original_height",
        value: String(height),
      });
    }
  }
}

/**
 * Append an edit operation to the _edit_history meta key.
 * The edit history is a JSON array of operation records.
 */
async function appendEditHistory(
  ctx: ActionCtx,
  mediaId: Id<"media">,
  entry: EditHistoryEntry,
): Promise<void> {
  // Get current edit history
  const media = await ctx.runQuery(api.media.queries.get, { mediaId });
  const m = media as { metaMap?: Record<string, string> } | null;
  const currentHistory = m?.metaMap?.["_edit_history"];

  let history: EditHistoryEntry[] = [];
  if (currentHistory) {
    try {
      history = JSON.parse(currentHistory);
    } catch {
      history = [];
    }
  }

  history.push(entry);

  await ctx.runMutation(internal.media.internals.setMeta, {
    mediaId,
    key: "_edit_history",
    value: JSON.stringify(history),
  });
}

/**
 * Store the current transform state as a composite CSS transform string.
 * This enables client-side rendering of the edit chain.
 */
async function updateTransformMeta(
  ctx: ActionCtx,
  mediaId: Id<"media">,
): Promise<void> {
  const media = await ctx.runQuery(api.media.queries.get, { mediaId });
  const m = media as { metaMap?: Record<string, string> } | null;
  const historyJson = m?.metaMap?.["_edit_history"];

  if (!historyJson) return;

  let history: EditHistoryEntry[] = [];
  try {
    history = JSON.parse(historyJson);
  } catch {
    return;
  }

  // Build composite CSS transform from edit history
  const transforms: string[] = [];
  for (const entry of history) {
    switch (entry.action) {
      case "crop":
        // Crop doesn't have a CSS transform equivalent per se,
        // but we can store the clip-path for client rendering
        break;
      case "rotate":
        transforms.push(`rotate(${entry.params.degrees}deg)`);
        break;
      case "flip":
        if (entry.params.direction === "horizontal") {
          transforms.push("scaleX(-1)");
        } else {
          transforms.push("scaleY(-1)");
        }
        break;
      case "scale":
        // Scale is reflected in the updated dimensions
        break;
    }
  }

  if (transforms.length > 0) {
    await ctx.runMutation(internal.media.internals.setMeta, {
      mediaId,
      key: "_css_transform",
      value: transforms.join(" "),
    });
  }
}

// ─── Crop ────────────────────────────────────────────────────────────────────

/**
 * Crop an image to specified coordinates.
 *
 * Stores crop data in mediaMeta and updates the logical dimensions.
 * The crop parameters define the sub-region to keep:
 *   - x, y: top-left corner of the crop region
 *   - width, height: size of the crop region
 *
 * The media record's width/height are updated to reflect the cropped dimensions.
 */
export const crop = action({
  args: {
    mediaId: v.id("media"),
    cropData: v.object({
      x: v.number(),
      y: v.number(),
      width: v.number(),
      height: v.number(),
    }),
    applyToSizes: v.optional(
      v.union(v.literal("all"), v.literal("thumbnail_only")),
    ),
  },
  handler: async (ctx, args) => {
    const media = await validateEditableImage(ctx, args.mediaId);

    // Validate crop coordinates
    const { x, y, width, height } = args.cropData;
    if (x < 0 || y < 0 || width < 1 || height < 1) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message:
          "Crop coordinates must be non-negative and dimensions must be at least 1px",
      });
    }
    if (
      media.width &&
      media.height &&
      (x + width > media.width || y + height > media.height)
    ) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Crop coordinates exceed image bounds",
      });
    }

    // Save original if first edit
    await saveOriginalIfFirstEdit(
      ctx, args.mediaId, media.metaMap, media.storageId,
      media.width, media.height,
    );

    // Store crop data in mediaMeta
    await ctx.runMutation(internal.media.internals.setMeta, {
      mediaId: args.mediaId,
      key: "_crop_data",
      value: JSON.stringify(args.cropData),
    });

    // Update logical dimensions to the crop region
    await ctx.runMutation(internal.media.internals.updateDimensions, {
      mediaId: args.mediaId,
      width,
      height,
    });

    // Record in edit history
    await appendEditHistory(ctx, args.mediaId, {
      action: "crop",
      params: { x, y, width, height, applyToSizes: args.applyToSizes ?? "all" },
      timestamp: Date.now(),
      resultWidth: width,
      resultHeight: height,
    });

    await updateTransformMeta(ctx, args.mediaId);

    // M10: Emit event via dedicated internal mutation instead of workaround
    await ctx.runMutation(internal.media.internals.emitMediaEditedEvent, {
      mediaId: args.mediaId,
      editAction: "crop",
    });

    return {
      success: true,
      message: "Image cropped successfully",
      newWidth: width,
      newHeight: height,
    };
  },
});

// ─── Rotate ──────────────────────────────────────────────────────────────────

/**
 * Rotate an image by 90, 180, or 270 degrees.
 *
 * For 90/270 degree rotations, width and height are swapped.
 * For 180 degrees, dimensions remain the same.
 * The rotation is stored in mediaMeta and the _css_transform is updated.
 */
export const rotate = action({
  args: {
    mediaId: v.id("media"),
    degrees: v.union(v.literal(90), v.literal(180), v.literal(270)),
  },
  handler: async (ctx, args) => {
    const media = await validateEditableImage(ctx, args.mediaId);

    // Save original if first edit
    await saveOriginalIfFirstEdit(
      ctx, args.mediaId, media.metaMap, media.storageId,
      media.width, media.height,
    );

    // Calculate new dimensions
    const currentWidth = media.width ?? 0;
    const currentHeight = media.height ?? 0;
    let newWidth = currentWidth;
    let newHeight = currentHeight;

    if (args.degrees === 90 || args.degrees === 270) {
      // Width and height swap
      newWidth = currentHeight;
      newHeight = currentWidth;
    }
    // 180 degrees: dimensions stay the same

    // Update dimensions if they changed
    if (newWidth !== currentWidth || newHeight !== currentHeight) {
      await ctx.runMutation(internal.media.internals.updateDimensions, {
        mediaId: args.mediaId,
        width: newWidth,
        height: newHeight,
      });
    }

    // Store the cumulative rotation angle
    const currentRotation = media.metaMap?.["_rotation"]
      ? parseInt(media.metaMap["_rotation"], 10)
      : 0;
    const newRotation = (currentRotation + args.degrees) % 360;

    await ctx.runMutation(internal.media.internals.setMeta, {
      mediaId: args.mediaId,
      key: "_rotation",
      value: String(newRotation),
    });

    // Record in edit history
    await appendEditHistory(ctx, args.mediaId, {
      action: "rotate",
      params: { degrees: args.degrees },
      timestamp: Date.now(),
      resultWidth: newWidth,
      resultHeight: newHeight,
    });

    await updateTransformMeta(ctx, args.mediaId);

    // M10: Emit event via dedicated internal mutation instead of workaround
    await ctx.runMutation(internal.media.internals.emitMediaEditedEvent, {
      mediaId: args.mediaId,
      editAction: "rotate",
    });

    return {
      success: true,
      message: `Image rotated ${args.degrees} degrees`,
      newWidth,
      newHeight,
      totalRotation: newRotation,
    };
  },
});

// ─── Flip ────────────────────────────────────────────────────────────────────

/**
 * Flip an image horizontally or vertically.
 *
 * Dimensions do not change. The flip is recorded as a CSS transform
 * (scaleX(-1) or scaleY(-1)) in the _css_transform meta key.
 */
export const flip = action({
  args: {
    mediaId: v.id("media"),
    direction: v.union(v.literal("horizontal"), v.literal("vertical")),
  },
  handler: async (ctx, args) => {
    const media = await validateEditableImage(ctx, args.mediaId);

    // Save original if first edit
    await saveOriginalIfFirstEdit(
      ctx, args.mediaId, media.metaMap, media.storageId,
      media.width, media.height,
    );

    // Toggle flip state (flipping twice returns to original)
    const flipKey = args.direction === "horizontal" ? "_flip_horizontal" : "_flip_vertical";
    const currentFlip = media.metaMap?.[flipKey] === "true";
    const newFlip = !currentFlip;

    await ctx.runMutation(internal.media.internals.setMeta, {
      mediaId: args.mediaId,
      key: flipKey,
      value: String(newFlip),
    });

    // Record in edit history
    await appendEditHistory(ctx, args.mediaId, {
      action: "flip",
      params: { direction: args.direction },
      timestamp: Date.now(),
      resultWidth: media.width,
      resultHeight: media.height,
    });

    await updateTransformMeta(ctx, args.mediaId);

    // M10: Emit event via dedicated internal mutation instead of workaround
    await ctx.runMutation(internal.media.internals.emitMediaEditedEvent, {
      mediaId: args.mediaId,
      editAction: "flip",
    });

    return {
      success: true,
      message: `Image flipped ${args.direction}ly`,
      flipped: newFlip,
    };
  },
});

// ─── Scale ───────────────────────────────────────────────────────────────────

/**
 * Scale/resize an image to new dimensions.
 *
 * Only downscaling is allowed (target must be <= original dimensions).
 * If only width is provided, height is calculated proportionally.
 * Updates the logical dimensions and records the scale operation.
 */
export const scale = action({
  args: {
    mediaId: v.id("media"),
    width: v.number(),
    height: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const media = await validateEditableImage(ctx, args.mediaId);

    if (args.width < 1) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Width must be at least 1px",
      });
    }

    // Get reference dimensions (original, not current edited)
    const origWidth = media.metaMap?.["_original_width"]
      ? parseInt(media.metaMap["_original_width"], 10)
      : media.width ?? 0;
    const origHeight = media.metaMap?.["_original_height"]
      ? parseInt(media.metaMap["_original_height"], 10)
      : media.height ?? 0;

    if (origWidth > 0 && args.width > origWidth) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Cannot upscale: target width exceeds original image width",
      });
    }

    // Calculate height proportionally if not provided
    let newHeight = args.height;
    if (!newHeight && origWidth > 0 && origHeight > 0) {
      const ratio = args.width / origWidth;
      newHeight = Math.round(origHeight * ratio);
    }

    if (newHeight !== undefined && newHeight < 1) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Calculated height is less than 1px",
      });
    }

    // Save original if first edit
    await saveOriginalIfFirstEdit(
      ctx, args.mediaId, media.metaMap, media.storageId,
      media.width, media.height,
    );

    // Update dimensions
    const finalHeight = newHeight ?? media.height ?? 0;
    await ctx.runMutation(internal.media.internals.updateDimensions, {
      mediaId: args.mediaId,
      width: args.width,
      height: finalHeight,
    });

    // Store scale data
    await ctx.runMutation(internal.media.internals.setMeta, {
      mediaId: args.mediaId,
      key: "_scale_width",
      value: String(args.width),
    });
    await ctx.runMutation(internal.media.internals.setMeta, {
      mediaId: args.mediaId,
      key: "_scale_height",
      value: String(finalHeight),
    });

    // Record in edit history
    await appendEditHistory(ctx, args.mediaId, {
      action: "scale",
      params: { width: args.width, height: finalHeight },
      timestamp: Date.now(),
      resultWidth: args.width,
      resultHeight: finalHeight,
    });

    await updateTransformMeta(ctx, args.mediaId);

    // M10: Emit event via dedicated internal mutation instead of workaround
    await ctx.runMutation(internal.media.internals.emitMediaEditedEvent, {
      mediaId: args.mediaId,
      editAction: "scale",
    });

    return {
      success: true,
      message: `Image scaled to ${args.width}x${finalHeight}`,
      newWidth: args.width,
      newHeight: finalHeight,
    };
  },
});

// ─── Revert ──────────────────────────────────────────────────────────────────

/**
 * Revert an image to its original pre-edit state.
 *
 * Restores the original dimensions from mediaMeta, clears all edit-related
 * metadata, and regenerates size variants for the original dimensions.
 */
export const revert = action({
  args: {
    mediaId: v.id("media"),
  },
  handler: async (ctx, args) => {
    const media = await validateEditableImage(ctx, args.mediaId);

    // Check if there is an original to revert to
    const originalStorageId = media.metaMap?.["_original_storage_id"];
    if (!originalStorageId) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "No edits to revert. This image has not been modified.",
      });
    }

    // Restore original dimensions
    const origWidth = media.metaMap?.["_original_width"]
      ? parseInt(media.metaMap["_original_width"], 10)
      : media.width ?? 0;
    const origHeight = media.metaMap?.["_original_height"]
      ? parseInt(media.metaMap["_original_height"], 10)
      : media.height ?? 0;

    if (origWidth > 0 && origHeight > 0) {
      await ctx.runMutation(internal.media.internals.updateDimensions, {
        mediaId: args.mediaId,
        width: origWidth,
        height: origHeight,
      });
    }

    // Clear all edit-related metadata keys
    const editMetaKeys = [
      "_original_storage_id",
      "_original_width",
      "_original_height",
      "_edit_history",
      "_crop_data",
      "_rotation",
      "_flip_horizontal",
      "_flip_vertical",
      "_scale_width",
      "_scale_height",
      "_css_transform",
    ];

    for (const key of editMetaKeys) {
      await ctx.runMutation(internal.media.internals.deleteMeta, {
        mediaId: args.mediaId,
        key,
      });
    }

    // Delete existing size records (they'll be regenerated)
    await ctx.runMutation(internal.media.internals.deleteAllSizes, {
      mediaId: args.mediaId,
    });

    // Trigger size regeneration by scheduling processImageAction
    // This will re-read the (now original) dimensions and create fresh size records
    await ctx.runMutation(internal.media.internals.scheduleReprocess, {
      mediaId: args.mediaId,
    });

    // M10: Emit event via dedicated internal mutation instead of workaround
    await ctx.runMutation(internal.media.internals.emitMediaEditedEvent, {
      mediaId: args.mediaId,
      editAction: "revert",
    });

    return {
      success: true,
      message: "Image reverted to original",
      width: origWidth,
      height: origHeight,
    };
  },
});
