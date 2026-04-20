"use node";

/**
 * Image Processing (Node Action) — the sharp pipeline.
 *
 * Runs in Convex's Node runtime because sharp is a native module. This is
 * where the heavy lifting for real responsive images, EXIF rotation, and
 * big-image scaling happens.
 *
 * Flow for a newly-uploaded image:
 *   1. Download original blob from Convex storage
 *   2. sharp().rotate() — bakes EXIF orientation into pixels, strips the
 *      EXIF orientation tag so browsers don't rotate again
 *   3. If long edge > bigImageThreshold, scale the original down and
 *      replace the storage blob with the scaled version
 *   4. Generate size variants (thumbnail, medium, medium_large, large),
 *      upload each to storage, register via `addSize` internal mutation
 *   5. Mark media as "active"
 *
 * Error handling: on any sharp error, transition status to "failed" with
 * the error message so the admin UI can show it. Does NOT delete the
 * original — admin can investigate and re-run the regeneration tool.
 *
 * Memory note: sharp streams most operations, but sharp's auto-rotate
 * requires decoding the full image. Very large images (50MP+) can push
 * Convex's 64MB action memory ceiling. The big-image threshold is the
 * primary mitigation — we scale down before generating variants.
 *
 * Not yet implemented (tracked as follow-up):
 *   - PDF first-page thumbnails: needs pdfjs-dist + canvas, non-trivial
 *     in the Convex Node runtime. Admins see a generic PDF icon for now.
 *   - Video poster frames: needs ffmpeg-static (~70MB binary) which
 *     strains Convex's action bundle size. Consider offloading to an
 *     external service (Cloudflare Stream, Mux) if poster frames become
 *     required.
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

// Lazy-load sharp at action runtime instead of at module-load time. The
// Convex bundler analyzes top-level imports and fails when sharp's native
// linux-arm64 binary can't be resolved during deploy ("Could not load the
// sharp module using the linux-arm64 runtime"). Convex 1.35.1+ does the
// platform-correct binary resolution at runtime, but the eager-load deploy
// check still fails. Dynamic import bypasses the eager check while
// preserving full sharp functionality at runtime.
let sharpModule: typeof import("sharp") | null = null;
async function getSharp(): Promise<typeof import("sharp")["default"]> {
  if (!sharpModule) {
    sharpModule = await import("sharp");
  }
  return (sharpModule as any).default ?? (sharpModule as any);
}

// ─── WordPress-standard size variants ───────────────────────────────────────
// WordPress historically ships these four sizes plus the original. Height
// is proportional unless crop: true (thumbnail), which matches WP behavior.
const SIZE_VARIANTS = [
  { name: "thumbnail", width: 150, height: 150, crop: true },
  { name: "medium", width: 300, height: null, crop: false },
  { name: "medium_large", width: 768, height: null, crop: false },
  { name: "large", width: 1024, height: null, crop: false },
] as const;

// Scale-down threshold for originals. Matches WP's big-image threshold.
const DEFAULT_BIG_IMAGE_THRESHOLD = 2560;

type ProcessedSize = {
  name: string;
  storageId: string;
  width: number;
  height: number;
  fileSize: number;
  mimeType: string;
  crop: boolean;
};

/**
 * Admin-callable regeneration. Iterates active image media in batches,
 * wiping old sub-sizes and re-running the sharp pipeline for each.
 *
 * Designed to be run after:
 *   - Adding sharp for the first time (backfill existing uploads)
 *   - Changing sub-size dimensions in settings
 *   - Upgrading sharp (new format support like AVIF)
 *
 * Safety: batches of 10 items per action run to stay within Convex action
 * budget. Returns cursor so the caller can keep polling until `done`.
 */
export const regenerateBatch = internalAction({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);
    const result = await ctx.runQuery(
      internal.media.internals.listImagesForRegeneration,
      {
        cursor: args.cursor ?? null,
        numItems: limit,
      },
    );

    let processed = 0;
    let failed = 0;
    for (const item of result.page as any[]) {
      try {
        // Wipe existing sub-size records + storage for this item
        await ctx.runMutation(
          internal.media.internals.wipeMediaSizes,
          { mediaId: item._id },
        );
        // Reset to processing so processImageWithSharp will pick it up
        await ctx.runMutation(internal.media.mutations.updateStatus, {
          mediaId: item._id,
          status: "processing",
        });
        // Re-run inline (we're already in a Node action)
        await ctx.scheduler.runAfter(0, internal.media.imageProcessing.processImageWithSharp, {
          mediaId: item._id,
        });
        processed++;
      } catch {
        failed++;
      }
    }

    return {
      processed,
      failed,
      done: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const processImageWithSharp = internalAction({
  args: {
    mediaId: v.id("media"),
  },
  handler: async (ctx, args) => {
    const media = await ctx.runQuery(
      internal.media.internals.getMediaInternal,
      { mediaId: args.mediaId },
    );
    if (!media || media.mediaType !== "image") return;
    if (media.status !== "processing") return;

    try {
      const blob = await ctx.storage.get(media.storageId);
      if (!blob) {
        await ctx.runMutation(internal.media.mutations.updateStatus, {
          mediaId: args.mediaId,
          status: "failed",
          processingError: "Original file missing from storage",
        });
        return;
      }

      const inputBuffer = Buffer.from(await blob.arrayBuffer());

      // Big-image threshold: fixed default. Could become a setting later.
      const bigImageThreshold = DEFAULT_BIG_IMAGE_THRESHOLD;

      // ── EXIF-aware rotate + strip EXIF ─────────────────────────────────
      // .rotate() with no arg auto-applies EXIF orientation.
      // .withMetadata({ orientation: undefined }) strips the orientation tag.
      const sharp = await getSharp();
      let rotated = sharp(inputBuffer).rotate();
      const rotatedMeta = await rotated.metadata();
      let baseWidth = rotatedMeta.width ?? 0;
      let baseHeight = rotatedMeta.height ?? 0;

      if (baseWidth === 0 || baseHeight === 0) {
        await ctx.runMutation(internal.media.mutations.updateStatus, {
          mediaId: args.mediaId,
          status: "failed",
          processingError: "Could not decode image dimensions",
        });
        return;
      }

      // ── Big-image threshold: scale down if original is too large ──────
      const longEdge = Math.max(baseWidth, baseHeight);
      const needsDownscale = longEdge > bigImageThreshold;
      if (needsDownscale) {
        rotated = sharp(inputBuffer)
          .rotate()
          .resize({
            width: baseWidth >= baseHeight ? bigImageThreshold : undefined,
            height: baseHeight > baseWidth ? bigImageThreshold : undefined,
            fit: "inside",
            withoutEnlargement: true,
          });
        const downscaledMeta = await rotated.metadata();
        baseWidth = downscaledMeta.width ?? baseWidth;
        baseHeight = downscaledMeta.height ?? baseHeight;
      }

      // Re-encode the (rotated, possibly downscaled) original and replace
      // the storage blob. We always re-encode so EXIF is stripped and the
      // orientation baked in — serving the original file would otherwise
      // still rely on browsers honoring the EXIF tag.
      const newOriginalBuffer = await rotated.toBuffer();
      const newOriginalStorageId = await ctx.storage.store(
        new Blob([newOriginalBuffer as unknown as Uint8Array], {
          type: media.mimeType,
        }),
      );
      const newOriginalUrl = await ctx.storage.getUrl(newOriginalStorageId);

      // Swap storageId on the media record, then delete the old blob.
      await ctx.runMutation(internal.media.internals.updateStorageId, {
        mediaId: args.mediaId,
        storageId: newOriginalStorageId,
        url: newOriginalUrl ?? "",
        width: baseWidth,
        height: baseHeight,
        fileSize: newOriginalBuffer.byteLength,
      });
      try {
        await ctx.storage.delete(media.storageId);
      } catch {
        // Original may already be gone; ignore
      }

      // ── Generate variants ────────────────────────────────────────────
      const processed: ProcessedSize[] = [];
      for (const variant of SIZE_VARIANTS) {
        // Skip sizes larger than the (possibly downscaled) base
        if (variant.width > baseWidth && variant.width > baseHeight) continue;

        const pipeline = sharp(newOriginalBuffer);
        if (variant.crop && variant.height) {
          pipeline.resize({
            width: variant.width,
            height: variant.height,
            fit: "cover",
            position: "center",
          });
        } else {
          pipeline.resize({
            width: variant.width,
            height: variant.height ?? undefined,
            fit: "inside",
            withoutEnlargement: true,
          });
        }

        const variantBuffer = await pipeline.toBuffer({
          resolveWithObject: true,
        });

        const variantStorageId = await ctx.storage.store(
          new Blob([variantBuffer.data as unknown as Uint8Array], {
            type: media.mimeType,
          }),
        );
        const variantUrl = await ctx.storage.getUrl(variantStorageId);

        processed.push({
          name: variant.name,
          storageId: variantStorageId,
          width: variantBuffer.info.width,
          height: variantBuffer.info.height,
          fileSize: variantBuffer.info.size,
          mimeType: media.mimeType,
          crop: variant.crop,
        });

        await ctx.runMutation(internal.media.mutations.addSize, {
          mediaId: args.mediaId,
          sizeName: variant.name,
          storageId: variantStorageId as any,
          url: variantUrl ?? "",
          width: variantBuffer.info.width,
          height: variantBuffer.info.height,
          fileSize: variantBuffer.info.size,
          mimeType: media.mimeType,
          crop: variant.crop,
        });
      }

      // ── Transition to active ──────────────────────────────────────────
      await ctx.runMutation(internal.media.mutations.updateStatus, {
        mediaId: args.mediaId,
        status: "active",
      });
    } catch (err) {
      await ctx.runMutation(internal.media.mutations.updateStatus, {
        mediaId: args.mediaId,
        status: "failed",
        processingError:
          err instanceof Error ? err.message : "Unknown processing error",
      });
    }
  },
});
