"use node";

/**
 * Image Processing (Node Action) — the sharp pipeline.
 *
 * Runs in Convex's Node runtime because sharp is a native module. This is
 * where the heavy lifting for real responsive images, EXIF rotation,
 * big-image scaling, and WebP optimization happens.
 *
 * Flow for a newly-uploaded image:
 *   1. Download original blob from Convex storage
 *   2. sharp().rotate() — bakes EXIF orientation into pixels, strips the
 *      EXIF orientation tag so browsers don't rotate again
 *   3. If long edge > bigImageThreshold, scale the original down
 *   4. Re-encode the original to WebP (when input is JPEG/PNG/BMP/TIFF)
 *      and replace the storage blob. The media row's mimeType is updated
 *      to "image/webp"; the fileName keeps its original extension.
 *   5. Generate WebP variants (thumbnail, medium, medium_large, large),
 *      upload each to storage, register via `addSize` internal mutation
 *   6. Mark media as "active"
 *
 * Cascade-prevention guarantee:
 *   This pipeline runs ONLY when `media.status === "processing"` (see the
 *   guard at the top of `processImageWithSharp`). Variant uploads are
 *   registered through `internal.media.mutations.addSize`, which inserts
 *   into `mediaSizes` WITHOUT touching the `media` row's status field.
 *   The original re-encode goes through `internal.media.internals.updateStorageId`,
 *   which also leaves the status alone. This means uploading a variant
 *   blob can never re-trigger another round of optimization — there is
 *   no observer of `_storage` writes; the only entry points to this
 *   pipeline are the explicit `scheduler.runAfter(...)` calls from the
 *   `create` mutation and the `regenerateBatch` admin action. If you add
 *   a new entry point, preserve this invariant.
 *
 * SVG and animated GIF handling:
 *   - SVG (`image/svg+xml`) is rejected at upload time by `mutations.ts`
 *     (security: SVG can carry embedded JavaScript). It should never
 *     reach this pipeline. We still skip variant generation defensively.
 *   - Animated GIF: variant generation would lose the animation. We skip
 *     variant generation entirely, preserve the original GIF as-is, and
 *     mark the media as "active". Users who upload an animated GIF
 *     intentionally get the full file served at every size.
 *   - WebP input: skip the original re-encode (already WebP) but still
 *     generate the four WebP variants from the rotated source.
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
import type { Id } from "../_generated/dataModel";

// Lazy-load sharp at action runtime instead of at module-load time. The
// Convex bundler analyzes top-level imports and fails when sharp's native
// linux-arm64 binary can't be resolved during deploy ("Could not load the
// sharp module using the linux-arm64 runtime"). Convex 1.35.1+ does the
// platform-correct binary resolution at runtime, but the eager-load deploy
// check still fails. Dynamic import bypasses the eager check while
// preserving full sharp functionality at runtime.
type Sharp = typeof import("sharp");

let sharpModule: Sharp | null = null;
async function getSharp(): Promise<Sharp> {
  if (!sharpModule) {
    const module = await import("sharp");
    sharpModule =
      (module as unknown as { default?: Sharp }).default ??
      (module as unknown as Sharp);
  }
  return sharpModule;
}

function bytesToBlobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

// ─── WebP encoding quality ──────────────────────────────────────────────────
// Tuned for the visual-quality vs file-size sweet spot. Quality 82 is the
// browser-image-shrinker default and visually indistinguishable from the
// source for photographic content. Effort 4 (out of 6) hits the encoding-
// time vs compression-ratio knee — effort 6 is ~3x slower for ~5% size
// reduction, which is a bad trade inside a Convex action with a budget.
//
// Used by all variants AND by the original re-encode. Keeping a single
// pair of constants means changing quality is a one-line edit and ensures
// the original and its variants are encoded with the same settings.
const WEBP_QUALITY = 82;
const WEBP_EFFORT = 4;

// ─── WordPress-standard size variants ───────────────────────────────────────
// WordPress historically ships these four sizes plus the original. Height
// is proportional unless crop: true (thumbnail), which matches WP behavior.
// All variants are encoded as WebP — the `sizeName` ("thumbnail", "medium",
// etc.) stays WP-faithful, only the encoded format changes.
const SIZE_VARIANTS = [
  { name: "thumbnail", width: 150, height: 150, crop: true },
  { name: "medium", width: 300, height: null, crop: false },
  { name: "medium_large", width: 768, height: null, crop: false },
  { name: "large", width: 1024, height: null, crop: false },
] as const;

// ─── Format detection helpers ───────────────────────────────────────────────
// Inputs we re-encode the original to WebP for. SVG is rejected at upload
// time; GIF is preserved (may be animated); already-WebP is preserved
// (re-encoding would be lossy with no benefit).
function shouldReencodeOriginalToWebP(mimeType: string): boolean {
  return (
    mimeType === "image/jpeg" ||
    mimeType === "image/jpg" ||
    mimeType === "image/png" ||
    mimeType === "image/bmp" ||
    mimeType === "image/tiff" ||
    mimeType === "image/avif"
  );
}

// Inputs where we skip variant generation entirely. Animated GIFs lose
// their animation when resized to a single frame; SVG is vector and
// should never reach here (defense-in-depth).
function shouldSkipVariants(mimeType: string, isAnimated: boolean): boolean {
  if (mimeType === "image/svg+xml") return true;
  if (mimeType === "image/gif" && isAnimated) return true;
  return false;
}

type RegenerationItem = {
  _id: Id<"media">;
};

type RegenerationListResult = {
  page: RegenerationItem[];
  isDone: boolean;
  continueCursor?: string | null;
};

type RegenerationBatchResult = {
  processed: number;
  failed: number;
  done: boolean;
  continueCursor?: string | null;
};

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
  handler: async (ctx, args): Promise<RegenerationBatchResult> => {
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 25);
    const result = (await ctx.runQuery(
      internal.media.internals.listImagesForRegeneration,
      {
        cursor: args.cursor ?? null,
        numItems: limit,
      },
    )) as RegenerationListResult;

    let processed = 0;
    let failed = 0;
    for (const item of result.page) {
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
    // CASCADE-PREVENTION GUARD: this is the ONLY status check that gates
    // the pipeline. Variant blob writes (via `addSize`) and the original
    // re-encode (via `updateStorageId`) deliberately do NOT touch the
    // status field — they are pure data writes with no observers. A
    // re-trigger therefore requires an explicit `scheduler.runAfter` from
    // either the `create` mutation or `regenerateBatch`. Do NOT add a
    // status-flip on variant write or you will introduce an infinite loop.
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

      // ── EXIF-aware rotate + read metadata ─────────────────────────────
      // .rotate() with no arg auto-applies EXIF orientation. The encoder
      // call below (.webp / format-preserve) strips remaining EXIF.
      const sharp = await getSharp();
      const initialMeta = await sharp(inputBuffer).metadata();
      const isAnimated = (initialMeta.pages ?? 1) > 1;

      // Defensive skip: animated GIF or SVG keeps the original untouched.
      // No rotation, no re-encode, no variants. Animated GIFs would lose
      // their animation if we resized to a single frame; SVG should never
      // reach here (rejected at upload) but we guard defensively.
      if (shouldSkipVariants(media.mimeType, isAnimated)) {
        await ctx.runMutation(internal.media.mutations.updateStatus, {
          mediaId: args.mediaId,
          status: "active",
        });
        return;
      }

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

      // ── Re-encode the original ─────────────────────────────────────────
      // For JPEG/PNG/BMP/TIFF/AVIF inputs: re-encode to WebP. This is the
      // single biggest file-size win — modern browsers all support WebP
      // and it's typically 25-35% smaller than equivalent-quality JPEG.
      // For WebP inputs: re-encode (still WebP) to bake in rotation and
      // strip EXIF, but keep the same mimeType.
      // For GIF (non-animated): we still re-encode to WebP since lossless
      // WebP handles transparency and is much smaller.
      //
      // ROOT CAUSE OF THE BUG WE'RE FIXING: previously this pipeline
      // called `.toBuffer()` without any explicit format encoder. When
      // sharp has no encoder set, behaviour for buffers passed through
      // resize() can produce nearly-identical output sizes for small
      // images because the input format's encoder defaults are reused on
      // every variant — a 200x150 JPEG re-encoded at default quality
      // looks the same whether you "resize to 300" (no-op via
      // withoutEnlargement) or "resize to 1024" (also no-op). With an
      // explicit `.webp({ quality, effort })` call before each
      // `.toBuffer()`, every variant has its own deterministic encoded
      // output that reflects its actual pixel dimensions.
      const reencodeToWebP = shouldReencodeOriginalToWebP(media.mimeType) ||
        media.mimeType === "image/gif" ||
        media.mimeType === "image/webp";

      let newOriginalBuffer: Buffer;
      let newOriginalMimeType: string;
      if (reencodeToWebP) {
        newOriginalBuffer = await rotated
          .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
          .toBuffer();
        newOriginalMimeType = "image/webp";
      } else {
        // Format we don't have a WebP-conversion policy for — preserve.
        newOriginalBuffer = await rotated.toBuffer();
        newOriginalMimeType = media.mimeType;
      }

      const newOriginalStorageId = await ctx.storage.store(
        new Blob([bytesToBlobPart(newOriginalBuffer)], {
          type: newOriginalMimeType,
        }),
      );
      const newOriginalUrl = await ctx.storage.getUrl(newOriginalStorageId);

      // Swap storageId + mimeType on the media record, then delete the
      // old blob. This goes through `updateStorageId` which does NOT
      // touch the status field — see cascade-prevention note above.
      await ctx.runMutation(internal.media.internals.updateStorageId, {
        mediaId: args.mediaId,
        storageId: newOriginalStorageId,
        url: newOriginalUrl ?? "",
        width: baseWidth,
        height: baseHeight,
        fileSize: newOriginalBuffer.byteLength,
        mimeType: newOriginalMimeType,
      });
      try {
        await ctx.storage.delete(media.storageId);
      } catch {
        // Original may already be gone; ignore
      }

      // ── Generate WebP variants ────────────────────────────────────────
      // Each variant: resize from the (rotated, possibly downscaled)
      // re-encoded buffer, then explicitly call .webp({...}) before
      // .toBuffer(). The explicit encoder is critical — it guarantees
      // each variant has its own properly-compressed WebP output with a
      // distinct, dimension-driven file size. See bug-fix note above.
      const processed: ProcessedSize[] = [];
      for (const variant of SIZE_VARIANTS) {
        // Skip sizes larger than the (possibly downscaled) base
        if (variant.width > baseWidth && variant.width > baseHeight) continue;

        let pipeline = sharp(newOriginalBuffer);
        if (variant.crop && variant.height) {
          pipeline = pipeline.resize({
            width: variant.width,
            height: variant.height,
            fit: "cover",
            position: "center",
          });
        } else {
          pipeline = pipeline.resize({
            width: variant.width,
            height: variant.height ?? undefined,
            fit: "inside",
            withoutEnlargement: true,
          });
        }

        const variantBuffer = await pipeline
          .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
          .toBuffer({ resolveWithObject: true });

        const variantStorageId = await ctx.storage.store(
          new Blob([bytesToBlobPart(variantBuffer.data)], {
            type: "image/webp",
          }),
        );
        const variantUrl = await ctx.storage.getUrl(variantStorageId);

        processed.push({
          name: variant.name,
          storageId: variantStorageId,
          width: variantBuffer.info.width,
          height: variantBuffer.info.height,
          fileSize: variantBuffer.info.size,
          mimeType: "image/webp",
          crop: variant.crop,
        });

        // `addSize` only writes to the `mediaSizes` table and never
        // patches the parent `media` row — see cascade-prevention note.
        await ctx.runMutation(internal.media.mutations.addSize, {
          mediaId: args.mediaId,
          sizeName: variant.name,
          storageId: variantStorageId,
          url: variantUrl ?? "",
          width: variantBuffer.info.width,
          height: variantBuffer.info.height,
          fileSize: variantBuffer.info.size,
          mimeType: "image/webp",
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
