import {SHOWCASE_META_PREFIX} from "./showcasePolicy";
/**
 * Media System - Queries
 *
 * Read operations for the Media Library and media consumption:
 *   list     - List media with filters, search, and pagination
 *   get      - Get a single media item with all sizes and meta
 *   getByIds - Batch lookup of multiple media items by ID
 *   counts   - Count media by type for the Media Library filter tabs
 *   getUrl   - Get the storage URL for a media item (optionally at a specific size)
 *
 * Library queries require an active account with media.read. Public asset
 * rendering uses the separate getPublic/getSrcSet projections below.
 */

import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { readMediaList, readMediaCountPage, countMediaDocuments, mediaListPageValidator, mediaCountPageValidator, mediaCountsValidator } from "./libraryRead";
import { query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import {
  listMediaArgs,
  getMediaArgs,
  getByIdsArgs,
  getUrlArgs,
  getSrcSetArgs,
} from "./validators";

// ─── List ───────────────────────────────────────────────────────────────────

/**
 * List media items with filtering, search, and cursor-based pagination.
 *
 * Supports the Media Library's filter tabs (type), search bar, and uploader
 * filter. Uses Convex's search index for title-based search, and regular
 * indexes for type/status/uploader filtering.
 *
 * Default sort: createdAt descending (newest first).
 *
 * @returns Paginated result with items, cursor, and isDone flag
 */
export const list = query({
  args: listMediaArgs,
  returns: mediaListPageValidator,
  handler: async (ctx, args) => {
    await requireCan(ctx, "media.read");
    return readMediaList(ctx, args);
  },
});

// ─── Get ────────────────────────────────────────────────────────────────────

/**
 * Get a single media item with all its generated sizes and metadata.
 *
 * Returns null if the media does not exist. Unauthorized or inactive readers are refused.
 *
 * Enriches the media item with:
 *   - `sizes`: Array of all generated image size records
 *   - `meta`: Array of all mediaMeta key-value pairs
 *   - `uploaderName`: Display name of the uploader (for the UI)
 */
export const get = query({
  args: getMediaArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "media.read");

    const media = await ctx.db.get("media", args.mediaId);
    if (!media) return null;

    // ── Fetch generated sizes ────────────────────────────────────────────
    const sizes = await ctx.db
      .query("mediaSizes")
      .withIndex("by_media", (q) => q.eq("mediaId", args.mediaId))
      .collect();

    // ── Fetch metadata ───────────────────────────────────────────────────
    const meta = await ctx.db
      .query("mediaMeta")
      .withIndex("by_media", (q) => q.eq("mediaId", args.mediaId))
      .collect();
    // Rights evidence is restricted to the moderator endpoint, including for
    // otherwise authorized Media Library readers.
    const visibleMeta=meta.filter(entry=>!entry.key.startsWith(SHOWCASE_META_PREFIX));

    // ── Resolve uploader info ────────────────────────────────────────────
    const uploader = await ctx.db.get("users", media.uploadedBy);
    const uploaderName =
      uploader?.displayName ||
      (uploader?.firstName && uploader?.lastName
        ? `${uploader.firstName} ${uploader.lastName}`
        : null) ||
      uploader?.email ||
      "Unknown User";

    // ── Build sizes map for convenience ──────────────────────────────────
    const sizesMap: Record<
      string,
      { url: string; width: number; height: number; fileSize: number }
    > = {};
    for (const size of sizes) {
      sizesMap[size.sizeName] = {
        url: size.url,
        width: size.width,
        height: size.height,
        fileSize: size.fileSize,
      };
    }

    // ── Build meta map for convenience ───────────────────────────────────
    const metaMap: Record<string, string> = {};
    for (const m of visibleMeta) {
      metaMap[m.key] = m.value;
    }

    // ── Refresh URL from storage (in case cached URL is stale) ───────────
    const freshUrl = (media.storageId ? await ctx.storage.getUrl(media.storageId) : null);

    return {
      ...media,
      url: freshUrl ?? media.url,
      sizes,
      sizesMap,
      meta: visibleMeta,
      metaMap,
      uploaderName,
    };
  },
});

// ─── Get Public ─────────────────────────────────────────────────────────────

/**
 * Public-safe media lookup for visitor-facing chrome and content renderers.
 * Returns only fields needed to render an asset; no uploader or private meta.
 */
export const getPublic = query({
  args: { mediaId: v.id("media") },
  handler: async (ctx, args) => {
    const media = await ctx.db.get(args.mediaId);
    if (!media || media.status === "trashed") return null;

    const freshUrl = media.storageId ? await ctx.storage.getUrl(media.storageId) : null;
    const sizes = await ctx.db.query("mediaSizes").withIndex("by_media", q => q.eq("mediaId", args.mediaId)).collect();
    const sizesMap: Record<string, { url: string; width: number; height: number }> = {};
    for (const size of sizes) {
      sizesMap[size.sizeName] = { url: (size.storageId ? await ctx.storage.getUrl(size.storageId) : null) ?? size.url, width: size.width, height: size.height };
    }
    return {
      _id: media._id,
      sizesMap,
      title: media.title,
      altText: media.altText,
      mediaType: media.mediaType,
      mimeType: media.mimeType,
      width: media.width,
      height: media.height,
      url: freshUrl ?? media.url,
    };
  },
});

// ─── Get By IDs ─────────────────────────────────────────────────────────────

/**
 * Get multiple media items by their IDs.
 *
 * Used for batch lookups, e.g., fetching featured images for a list of posts.
 * Returns items in the same order as the input IDs. Missing items are null.
 *
 * Does NOT include sizes/meta for performance -- use `get` for full detail.
 */
export const getByIds = query({
  args: getByIdsArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "media.read");

    if (args.mediaIds.length > 100) {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Request at most 100 media IDs at once" });
    }

    const results = await Promise.all(
      args.mediaIds.map(async (mediaId) => {
        const media = await ctx.db.get("media", mediaId);
        if (!media) return null;

        // Refresh URL
        const freshUrl = (media.storageId ? await ctx.storage.getUrl(media.storageId) : null);
        return {
          ...media,
          url: freshUrl ?? media.url,
        };
      }),
    );

    return results;
  },
});

// Compact paginated evidence for exact counts once every page is loaded.
export const countDocuments = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: mediaCountPageValidator,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "media.read");
    return readMediaCountPage(ctx, args.paginationOpts, user._id);
  },
});

/** Legacy exact counts: intentionally refuses rather than silently truncating. */
export const counts = query({
  args: {},
  returns: mediaCountsValidator,
  handler: async (ctx) => {
    const user = await requireCan(ctx, "media.read");
    const result = await readMediaCountPage(ctx, { numItems: 100, cursor: null }, user._id);
    if (!result.isDone || result.pageStatus != null || result.splitCursor != null) {
      throw new ConvexError({ code: "PAGINATION_REQUIRED", message: "Media counts exceed one bounded page. Use media/queries:countDocuments and continue until complete." });
    }
    return countMediaDocuments(result.page);
  },
});

// ─── Get URL ────────────────────────────────────────────────────────────────

/**
 * Get the storage URL for a media item, optionally at a specific size.
 *
 * If sizeName is provided and exists, returns that size's URL.
 * Otherwise returns the original (full) URL.
 *
 * URLs are resolved fresh from Convex storage to ensure they haven't expired.
 */
export const getUrl = query({
  args: getUrlArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "media.read");

    const media = await ctx.db.get("media", args.mediaId);
    if (!media) return null;

    // If a specific size is requested, look it up
    if (args.sizeName) {
      const size = await ctx.db
        .query("mediaSizes")
        .withIndex("by_media_size", (q) =>
          q.eq("mediaId", args.mediaId).eq("sizeName", args.sizeName!),
        )
        .unique();

      if (size) {
        const sizeUrl = (size.storageId ? await ctx.storage.getUrl(size.storageId) : null);
        return sizeUrl ?? size.url;
      }
      // Size not found, fall through to original
    }

    // Return original URL
    const freshUrl = (media.storageId ? await ctx.storage.getUrl(media.storageId) : null);
    return freshUrl ?? media.url;
  },
});

// ─── Get SrcSet ──────────────────────────────────────────────────────────────

/**
 * Build a srcset string from all available sizes for an image media item.
 *
 * Returns a string like:
 *   "https://url/thumb.jpg 150w, https://url/medium.jpg 300w, https://url/large.jpg 1024w"
 *
 * Public query (no auth required) -- used by website for rendering images.
 */
export const getSrcSet = query({
  args: getSrcSetArgs,
  handler: async (ctx, args) => {
    const media = await ctx.db.get("media", args.mediaId);
    if (!media) return "";

    const sizes = await ctx.db
      .query("mediaSizes")
      .withIndex("by_media", (q) => q.eq("mediaId", args.mediaId))
      .collect();

    if (sizes.length === 0) return "";

    const parts: string[] = [];
    for (const size of sizes) {
      const url = (size.storageId ? await ctx.storage.getUrl(size.storageId) : null);
      if (url) {
        parts.push(`${url} ${size.width}w`);
      }
    }

    // Include the original/full size
    if (media.width) {
      const fullUrl = (media.storageId ? await ctx.storage.getUrl(media.storageId) : null);
      if (fullUrl) {
        parts.push(`${fullUrl} ${media.width}w`);
      }
    }

    return parts.join(", ");
  },
});
