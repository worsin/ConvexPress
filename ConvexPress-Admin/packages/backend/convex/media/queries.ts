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
 * All queries require authentication (all authenticated users can read media).
 * No capability check is needed for reads -- the Media Library is visible
 * to all logged-in users.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getCurrentUser } from "../helpers/permissions";
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
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    // ── Search path (full-text search on title) ──────────────────────────
    if (args.search && args.search.trim().length > 0) {
      let searchQuery = ctx.db
        .query("media")
        .withSearchIndex("search_media", (q) => {
          let sq = q.search("title", args.search!);
          if (args.mediaType) {
            sq = sq.eq("mediaType", args.mediaType);
          }
          if (args.status) {
            sq = sq.eq("status", args.status);
          }
          if (args.uploadedBy) {
            sq = sq.eq("uploadedBy", args.uploadedBy);
          }
          return sq;
        });

      // Search queries don't support .paginate(), so we collect and slice
      const allResults = await searchQuery.collect();

      // Manual pagination for search results
      const numItems = args.paginationOpts.numItems;
      const cursorIndex = args.paginationOpts.cursor
        ? parseInt(args.paginationOpts.cursor, 10)
        : 0;

      const page = allResults.slice(cursorIndex, cursorIndex + numItems);
      const nextCursor = cursorIndex + numItems;
      const isDone = nextCursor >= allResults.length;

      // Enrich with storage URLs and uploader names (M7)
      const enrichedPage = await Promise.all(
        page.map(async (item) => {
          const freshUrl = await ctx.storage.getUrl(item.storageId);
          const uploader = await ctx.db.get("users", item.uploadedBy);
          const uploaderName =
            uploader?.displayName ||
            (uploader?.firstName && uploader?.lastName
              ? `${uploader.firstName} ${uploader.lastName}`
              : null) ||
            uploader?.email ||
            "Unknown User";
          return {
            ...item,
            url: freshUrl ?? item.url,
            uploaderName,
          };
        }),
      );

      return {
        page: enrichedPage,
        isDone,
        continueCursor: isDone ? "" : String(nextCursor),
      };
    }

    // ── Determine sort direction ──────────────────────────────────────────
    const sortDir = args.orderDir === "asc" ? "asc" : "desc";

    // Trash scope. Default "active" hides trashed items (WP behavior).
    // "only" shows just the trash bin. "all" shows both.
    const trashView = args.trashView ?? "active";

    // ── Helper: post-filter results for date range, unattached, trash ────
    // Convex index queries don't support range comparisons on non-index
    // fields directly, so we apply date/unattached as post-filters.
    // Trash filtering is applied unconditionally (on "all" it's a no-op).
    const needsPostFilter =
      args.dateFrom ||
      args.dateTo ||
      args.unattached ||
      args.mimeType ||
      trashView !== "all";

    const applyPostFilters = (items: Doc<"media">[]): Doc<"media">[] => {
      return items.filter((item) => {
        if (trashView === "active" && item.status === "trashed") return false;
        if (trashView === "only" && item.status !== "trashed") return false;
        if (args.dateFrom && item.createdAt < args.dateFrom) return false;
        if (args.dateTo && item.createdAt > args.dateTo) return false;
        if (args.unattached && item.attachedTo) return false;
        if (args.mimeType && item.mimeType !== args.mimeType) return false;
        return true;
      });
    };

    // ── Filtered path (index-based queries) ──────────────────────────────
    // Choose the most selective index based on provided filters
    const results = await (async () => {

      if (args.mediaType && args.uploadedBy) {
        // Use composite index: by_uploader_type
        return await ctx.db
          .query("media")
          .withIndex("by_uploader_type", (q) =>
            q.eq("uploadedBy", args.uploadedBy!).eq("mediaType", args.mediaType!),
          )
          .order(sortDir)
          .paginate(args.paginationOpts);
      }

      if (args.mediaType) {
        // Use by_type_created for type filtering with creation date ordering
        return await ctx.db
          .query("media")
          .withIndex("by_type_created", (q) =>
            q.eq("mediaType", args.mediaType!),
          )
          .order(sortDir)
          .paginate(args.paginationOpts);
      }

      if (args.uploadedBy) {
        return await ctx.db
          .query("media")
          .withIndex("by_uploaded_by", (q) =>
            q.eq("uploadedBy", args.uploadedBy!),
          )
          .order(sortDir)
          .paginate(args.paginationOpts);
      }

      if (args.status) {
        return await ctx.db
          .query("media")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order(sortDir)
          .paginate(args.paginationOpts);
      }

      // ── Default: all media ──────────────────────────────────────────────
      return await ctx.db
        .query("media")
        .withIndex("by_created")
        .order(sortDir)
        .paginate(args.paginationOpts);
    })();

    // Apply post-filters if needed (date range, unattached)
    const filteredPage = needsPostFilter
      ? applyPostFilters(results.page)
      : results.page;

    // M7: Enrich results with uploader names for the media list table.
    // Batch-resolve unique uploaders to avoid redundant DB lookups.
    const uploaderIds = [...new Set(filteredPage.map((item) => item.uploadedBy))] as Id<"users">[];
    const uploaderMap = new Map<Id<"users">, string>();
    await Promise.all(
      uploaderIds.map(async (uid) => {
        const uploader = await ctx.db.get("users", uid);
        const name =
          uploader?.displayName ||
          (uploader?.firstName && uploader?.lastName
            ? `${uploader.firstName} ${uploader.lastName}`
            : null) ||
          uploader?.email ||
          "Unknown User";
        uploaderMap.set(uid, name);
      }),
    );

    const enrichedPage = filteredPage.map((item) => ({
      ...item,
      uploaderName: uploaderMap.get(item.uploadedBy) ?? "Unknown User",
    }));

    return {
      ...results,
      page: enrichedPage,
    };
  },
});

// ─── Get ────────────────────────────────────────────────────────────────────

/**
 * Get a single media item with all its generated sizes and metadata.
 *
 * Returns null if the media doesn't exist or the caller isn't authenticated.
 *
 * Enriches the media item with:
 *   - `sizes`: Array of all generated image size records
 *   - `meta`: Array of all mediaMeta key-value pairs
 *   - `uploaderName`: Display name of the uploader (for the UI)
 */
export const get = query({
  args: getMediaArgs,
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

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
    for (const m of meta) {
      metaMap[m.key] = m.value;
    }

    // ── Refresh URL from storage (in case cached URL is stale) ───────────
    const freshUrl = await ctx.storage.getUrl(media.storageId);

    return {
      ...media,
      url: freshUrl ?? media.url,
      sizes,
      sizesMap,
      meta,
      metaMap,
      uploaderName,
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
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const results = await Promise.all(
      args.mediaIds.map(async (mediaId) => {
        const media = await ctx.db.get("media", mediaId);
        if (!media) return null;

        // Refresh URL
        const freshUrl = await ctx.storage.getUrl(media.storageId);
        return {
          ...media,
          url: freshUrl ?? media.url,
        };
      }),
    );

    return results;
  },
});

// ─── Counts ─────────────────────────────────────────────────────────────────

/**
 * Count media by type for the Media Library filter tabs.
 *
 * Returns counts for: all, images, video, audio, documents, mine, unattached.
 *
 * This is a separate query (not part of list) so the tab counts can
 * update independently of the list contents, avoiding unnecessary
 * re-renders when switching between tabs.
 *
 * Optimization (H3): Uses targeted index queries per type instead of
 * loading all records. Each type count uses its own index query with
 * .collect().length, avoiding a single full-table scan. While Convex
 * doesn't have native COUNT, per-index queries are more efficient than
 * loading the entire table when only counts are needed.
 *
 * Performance note (#21): This is O(n) in the total number of media items
 * since Convex lacks a native COUNT aggregate. For typical CMS workloads
 * (< 10,000 media items), this is acceptable and completes well within
 * Convex query limits. For larger datasets (50k+), consider migrating to
 * `@convex-dev/aggregate` for O(log n) counts, or maintaining denormalized
 * count documents updated by mutations.
 */
export const counts = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return {
        all: 0,
        images: 0,
        video: 0,
        audio: 0,
        documents: 0,
        mine: 0,
        unattached: 0,
        trashed: 0,
      };
    }

    const [
      imageItems,
      videoItems,
      audioItems,
      docItems,
      archiveItems,
      otherItems,
      mineItems,
      trashedItems,
    ] = await Promise.all([
      ctx.db.query("media").withIndex("by_type", (q) => q.eq("mediaType", "image")).collect(),
      ctx.db.query("media").withIndex("by_type", (q) => q.eq("mediaType", "video")).collect(),
      ctx.db.query("media").withIndex("by_type", (q) => q.eq("mediaType", "audio")).collect(),
      ctx.db.query("media").withIndex("by_type", (q) => q.eq("mediaType", "document")).collect(),
      ctx.db.query("media").withIndex("by_type", (q) => q.eq("mediaType", "archive")).collect(),
      ctx.db.query("media").withIndex("by_type", (q) => q.eq("mediaType", "other")).collect(),
      ctx.db.query("media").withIndex("by_uploaded_by", (q) => q.eq("uploadedBy", user._id)).collect(),
      ctx.db.query("media").withIndex("by_status", (q) => q.eq("status", "trashed")).collect(),
    ]);

    // Exclude trashed items from the type/mine/unattached counts (WP behavior).
    const active = (it: { status: string }) => it.status !== "trashed";
    const images = imageItems.filter(active).length;
    const video = videoItems.filter(active).length;
    const audio = audioItems.filter(active).length;
    const documents = docItems.filter(active).length;
    const archive = archiveItems.filter(active).length;
    const other = otherItems.filter(active).length;
    const all = images + video + audio + documents + archive + other;
    const mine = mineItems.filter(active).length;

    let unattached = 0;
    for (const item of [...imageItems, ...videoItems, ...audioItems, ...docItems, ...archiveItems, ...otherItems]) {
      if (active(item) && !item.attachedTo) unattached++;
    }

    return {
      all,
      images,
      video,
      audio,
      documents,
      mine,
      unattached,
      trashed: trashedItems.length,
    };
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
    const user = await getCurrentUser(ctx);
    if (!user) return null;

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
        const sizeUrl = await ctx.storage.getUrl(size.storageId);
        return sizeUrl ?? size.url;
      }
      // Size not found, fall through to original
    }

    // Return original URL
    const freshUrl = await ctx.storage.getUrl(media.storageId);
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
      const url = await ctx.storage.getUrl(size.storageId);
      if (url) {
        parts.push(`${url} ${size.width}w`);
      }
    }

    // Include the original/full size
    if (media.width) {
      const fullUrl = await ctx.storage.getUrl(media.storageId);
      if (fullUrl) {
        parts.push(`${fullUrl} ${media.width}w`);
      }
    }

    return parts.join(", ");
  },
});
