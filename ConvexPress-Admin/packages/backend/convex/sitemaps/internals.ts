/**
 * Sitemap System - Internal Functions
 *
 * Internal mutations and actions for server-side sitemap operations.
 * Not client-callable -- only invocable from other Convex functions
 * (event subscribers, scheduler, or the generate action).
 *
 * Provides:
 *   - regenerateStale:        Debounced regeneration of stale sitemaps
 *   - generatePostsSitemap:   Generate XML for published posts
 *   - generatePagesSitemap:   Generate XML for published pages
 *   - generateCategoriesSitemap: Generate XML for categories
 *   - generateTagsSitemap:    Generate XML for tags
 *   - generateAuthorsSitemap: Generate XML for authors
 *   - generateSitemapIndex:   Generate the sitemap index XML
 *   - upsertCache:            Insert or update a sitemapCache entry
 *   - logGeneration:          Write a sitemapGenerationLog entry
 *   - logPing:                Write a sitemapPingLog entry
 *
 * Usage:
 *   import { internal } from "../_generated/api";
 *
 *   // Scheduled by markStale mutation
 *   await ctx.scheduler.runAfter(30000, internal.sitemaps.internals.regenerateStale, {
 *     triggeredBy: "content_change",
 *   });
 */

import {
  internalMutation,
  internalAction,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  buildUrlSetXml,
  buildSitemapIndexXml,
  buildContentUrl,
  buildCategoryUrl,
  buildTagUrl,
  buildAuthorUrl,
  buildHomepageUrl,
  buildSubSitemapUrl,
  toW3CDatetime,
  computeContentHashAsync,
  paginate,
} from "../helpers/sitemap";
import type { SitemapUrlEntry, SitemapIndexEntry } from "../helpers/sitemap";
import {
  CONTENT_SITEMAP_TYPES,
  VALID_CHANGEFREQ,
  sitemapTypeValidator,
  sitemapTriggerValidator,
  searchEngineValidator,
  outcomeStatusValidator,
  contentSitemapTypeValidator,
} from "./validators";
import type {
  SitemapChangefreq,
  SitemapTrigger,
} from "./validators";
import {
  readSitemapSettings,
  readSiteUrl,
  getNoindexPostIds,
} from "./helpers/settings";

// ─── Local Helpers ────────────────────────────────────────────────────────────

/**
 * Safely coerce a string to SitemapChangefreq, returning a fallback if invalid.
 * Eliminates unsafe `as SitemapChangefreq` casts by validating at runtime.
 */
function toChangefreq(value: string | undefined, fallback: SitemapChangefreq): SitemapChangefreq {
  if (value && (VALID_CHANGEFREQ as string[]).includes(value)) {
    return value as SitemapChangefreq;
  }
  return fallback;
}

// ─── Internal Query: Gather Data for Generation ──────────────────────────────

/**
 * Gather all data needed for sitemap generation.
 * Returns posts, pages, terms, and author info in a single query.
 */
/**
 * Data shape returned by gatherSitemapData.
 */
interface SitemapGatheredData {
  settings: Awaited<ReturnType<typeof readSitemapSettings>>;
  siteUrl: string;
  posts?: Array<{ id: string; slug: string; publishedAt: number; updatedAt: number }>;
  pages?: Array<{ id: string; slug: string; path?: string; publishedAt: number; updatedAt: number; menuOrder: number; title: string }>;
  categories?: Array<{ id: string; slug: string; updatedAt: number; count: number }>;
  tags?: Array<{ id: string; slug: string; updatedAt: number; count: number }>;
  authors?: Array<{ id: string; slug: string; latestPublishedAt: number }>;
  existingHashes: Record<string, string>;
}

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const gatherSitemapData = internalQuery({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    types: v.array(contentSitemapTypeValidator),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args): Promise<SitemapGatheredData> => {
    const settings = await readSitemapSettings(ctx);
    const siteUrl = await readSiteUrl(ctx);
    const noindexIds = await getNoindexPostIds(ctx);
    const typesSet = new Set(args.types);

    const result: SitemapGatheredData = {
      settings,
      siteUrl,
      existingHashes: {},
    };

    // Posts
    if (typesSet.has("posts") && settings.include_posts) {
      const posts = await ctx.db
        .query("posts")
        .withIndex("by_type_status", (q: ConvexQueryBuilder) =>
          q.eq("type", "post").eq("status", "publish"),
        )
        .collect();

      // Filter: public visibility, not noindexed, not password-protected
      result.posts = posts
        .filter(
          // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
          (p) =>
            p.visibility === "public" &&
            !noindexIds.has(p._id) &&
            !p.password,
        )
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        .map((p) => ({
          id: p._id,
          slug: p.slug,
          publishedAt: p.publishedAt ?? p.createdAt,
          updatedAt: p.updatedAt,
        }));
    }

    // Pages
    if (typesSet.has("pages") && settings.include_pages) {
      const pages = await ctx.db
        .query("posts")
        .withIndex("by_type_status", (q: ConvexQueryBuilder) =>
          q.eq("type", "page").eq("status", "publish"),
        )
        .collect();

      // Filter: not noindexed, not password-protected
      result.pages = pages
        .filter(
          // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
          (p) => !noindexIds.has(p._id) && !p.password,
        )
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        .map((p) => {
          // Pages may have optional `path` and `menuOrder` fields
          // depending on schema evolution. Use safe property access.
          const pageRecord = p as Record<string, unknown>;
          const path = typeof pageRecord.path === "string" ? pageRecord.path : undefined;
          const menuOrder = typeof pageRecord.menuOrder === "number" ? pageRecord.menuOrder : 0;

          return {
            id: p._id,
            slug: p.slug,
            path,
            publishedAt: p.publishedAt ?? p.createdAt,
            updatedAt: p.updatedAt,
            menuOrder,
            title: p.title,
          };
        });
    }

    // Categories
    if (typesSet.has("categories") && settings.include_categories) {
      const categories = await ctx.db
        .query("terms")
        .withIndex("by_taxonomy", (q: ConvexQueryBuilder) => q.eq("taxonomy", "category"))
        .collect();

      // Only include categories with at least 1 published post
      result.categories = categories
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        .filter((t) => (t.count ?? 0) > 0)
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        .map((t) => ({
          id: t._id,
          slug: t.slug,
          updatedAt: t.updatedAt,
          count: t.count ?? 0,
        }));
    }

    // Tags
    if (typesSet.has("tags") && settings.include_tags) {
      const tags = await ctx.db
        .query("terms")
        .withIndex("by_taxonomy", (q: ConvexQueryBuilder) => q.eq("taxonomy", "post_tag"))
        .collect();

      // Only include tags with at least 1 published post
      result.tags = tags
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        .filter((t) => (t.count ?? 0) > 0)
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        .map((t) => ({
          id: t._id,
          slug: t.slug,
          updatedAt: t.updatedAt,
          count: t.count ?? 0,
        }));
    }

    // Authors
    if (typesSet.has("authors") && settings.include_authors) {
      // Get unique author IDs from published posts
      const publishedPosts = await ctx.db
        .query("posts")
        .withIndex("by_type_status", (q: ConvexQueryBuilder) =>
          q.eq("type", "post").eq("status", "publish"),
        )
        .collect();

      const authorPostCounts = new Map<string, { count: number; latestPublishedAt: number }>();

      for (const post of publishedPosts) {
        if (post.visibility !== "public") continue;
        // authorId may be a string (Convex ID) or undefined
        const authorId = post.authorId;
        if (!authorId || typeof authorId !== "string") continue;

        const existing = authorPostCounts.get(authorId);
        if (existing) {
          existing.count++;
          const postPublishedAt = post.publishedAt ?? post.createdAt;
          if (postPublishedAt > existing.latestPublishedAt) {
            existing.latestPublishedAt = postPublishedAt;
          }
        } else {
          authorPostCounts.set(authorId, {
            count: 1,
            latestPublishedAt: post.publishedAt ?? post.createdAt,
          });
        }
      }

      // Look up author info
      const authors: Array<{ id: string; slug: string; latestPublishedAt: number }> = [];
      for (const [authorId, stats] of authorPostCounts) {
        if (stats.count === 0) continue;
        try {
          // Validate the ID format before passing to db.get
          const user = await ctx.db.get("users", authorId as Id<"users">);
          if (user) {
            // Safely extract username with runtime check
            const userRecord = user as Record<string, unknown>;
            const username = typeof userRecord.username === "string"
              ? userRecord.username
              : authorId;

            authors.push({
              id: authorId,
              slug: username,
              latestPublishedAt: stats.latestPublishedAt,
            });
          }
        } catch {
          // Invalid ID or user not found - skip
        }
      }

      result.authors = authors;
    }

    // Existing cache hashes (for change detection)
    const existingCache = await ctx.db.query("sitemapCache").collect();
    result.existingHashes = Object.fromEntries(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      existingCache.map((c) => [`${c.type}:${c.page}`, c.contentHash]),
    );

    return result;
  },
});

// ─── Internal Mutation: Upsert Cache ─────────────────────────────────────────

/**
 * Insert or update a sitemapCache entry.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const upsertCache = internalMutation({
  args: {
    type: sitemapTypeValidator,
    page: v.number(),
    xml: v.string(),
    urlCount: v.number(),
    generatedAt: v.number(),
    generationDurationMs: v.number(),
    contentHash: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sitemapCache")
      .withIndex("by_type_page", (q: ConvexQueryBuilder) =>
        q.eq("type", args.type).eq("page", args.page),
      )
      .unique();

    if (existing) {
      await ctx.db.patch("sitemapCache", existing._id, {
        xml: args.xml,
        urlCount: args.urlCount,
        generatedAt: args.generatedAt,
        generationDurationMs: args.generationDurationMs,
        contentHash: args.contentHash,
        isStale: false,
      });
    } else {
      await ctx.db.insert("sitemapCache", {
        type: args.type,
        page: args.page,
        xml: args.xml,
        urlCount: args.urlCount,
        generatedAt: args.generatedAt,
        generationDurationMs: args.generationDurationMs,
        contentHash: args.contentHash,
        isStale: false,
      });
    }
  },
});

// ─── Internal Mutation: Delete Cache by Type ─────────────────────────────────

/**
 * Delete all sitemapCache entries for a given type.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const deleteCacheByType = internalMutation({
  args: { type: sitemapTypeValidator },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("sitemapCache")
      .withIndex("by_type", (q: ConvexQueryBuilder) => q.eq("type", args.type))
      .collect();

    for (const entry of entries) {
      await ctx.db.delete("sitemapCache", entry._id);
    }

    return { deleted: entries.length };
  },
});

// ─── Internal Mutation: Log Generation ───────────────────────────────────────

/**
 * Write a sitemapGenerationLog entry.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const logGeneration = internalMutation({
  args: {
    triggeredBy: sitemapTriggerValidator,
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    triggeredByUserId: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    triggeredByEvent: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    triggeredByContentId: v.optional(v.string()),
    status: outcomeStatusValidator,
    sitemapsGenerated: v.number(),
    totalUrls: v.number(),
    durationMs: v.number(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    errorMessage: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await ctx.db.insert("sitemapGenerationLog", {
      triggeredBy: args.triggeredBy,
      triggeredByUserId: args.triggeredByUserId,
      triggeredByEvent: args.triggeredByEvent,
      triggeredByContentId: args.triggeredByContentId,
      status: args.status,
      sitemapsGenerated: args.sitemapsGenerated,
      totalUrls: args.totalUrls,
      durationMs: args.durationMs,
      errorMessage: args.errorMessage,
      createdAt: Date.now(),
    });
  },
});

// ─── Internal Mutation: Log Ping ─────────────────────────────────────────────

/**
 * Write a sitemapPingLog entry.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const logPing = internalMutation({
  args: {
    engine: searchEngineValidator,
    url: v.string(),
    status: outcomeStatusValidator,
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    httpStatus: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    errorMessage: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await ctx.db.insert("sitemapPingLog", {
      engine: args.engine,
      url: args.url,
      status: args.status,
      httpStatus: args.httpStatus,
      errorMessage: args.errorMessage,
      createdAt: Date.now(),
    });
  },
});

// ─── Internal Mutation: Emit Generation Event ────────────────────────────────

/**
 * Emit the seo.sitemap_generated event after regeneration.
 * Must be a mutation (emitEvent requires MutationCtx for db writes).
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const emitGeneratedEvent = internalMutation({
  args: {
    siteUrl: v.string(),
    totalUrls: v.number(),
    sitemapsGenerated: v.number(),
    durationMs: v.number(),
    triggeredBy: sitemapTriggerValidator,
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    triggeredByUserId: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const { SEO_EVENTS, SYSTEM } = await import("../events/constants");
    const { emitEvent } = await import("../helpers/events");

    await emitEvent(ctx, SEO_EVENTS.SITEMAP_GENERATED, SYSTEM.SITEMAP, {
      url: `${args.siteUrl}/sitemap.xml`,
      pageCount: args.totalUrls,
      sitemapsGenerated: args.sitemapsGenerated,
      durationMs: args.durationMs,
      triggeredBy: args.triggeredBy,
      triggeredByUserId: args.triggeredByUserId,
    });
  },
});

// ─── regenerateStale (Internal Action) ───────────────────────────────────────

/**
 * Debounced regeneration of stale sitemaps.
 *
 * This is the main regeneration entry point, scheduled by markStale.
 * It runs as an Action (not Mutation) because:
 *   - It may take longer than mutation limits
 *   - It calls multiple internal mutations sequentially
 *   - It may make external HTTP requests (search engine pings)
 *
 * Flow:
 *   1. Gather all content data via internal query
 *   2. For each enabled content type, generate URLs and XML
 *   3. Compare content hashes to skip unchanged sitemaps
 *   4. Upsert changed sitemaps into cache
 *   5. Generate sitemap index
 *   6. Delete cache for disabled types
 *   7. Ping search engines if configured
 *   8. Log results
 *   9. Emit event
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const regenerateStale = internalAction({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    triggeredBy: v.optional(sitemapTriggerValidator),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    triggeredByUserId: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    triggeredByEvent: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    force: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    types: v.optional(v.array(contentSitemapTypeValidator)),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const triggeredBy: SitemapTrigger = args.triggeredBy || "content_change";
    const force = args.force === true;

    try {
      // Determine which types to regenerate
      const requestedTypes = args.types || [...CONTENT_SITEMAP_TYPES];

      // Gather all data
      const data = await ctx.runQuery(
        internal.sitemaps.internals.gatherSitemapData,
        { types: requestedTypes },
      ) as SitemapGatheredData;

      const settings = data.settings;
      const siteUrl = data.siteUrl;

      if (!settings.enabled || !siteUrl) {
        // Sitemaps disabled or no site URL configured
        await ctx.runMutation(internal.sitemaps.internals.logGeneration, {
          triggeredBy,
          triggeredByUserId: args.triggeredByUserId,
          triggeredByEvent: args.triggeredByEvent,
          status: "success",
          sitemapsGenerated: 0,
          totalUrls: 0,
          durationMs: Date.now() - startTime,
        });
        return;
      }

      const existingHashes: Record<string, string> = data.existingHashes || {};
      const maxUrlsPerSitemap = settings.max_urls_per_sitemap || 1000;

      let sitemapsGenerated = 0;
      let totalUrls = 0;
      const indexEntries: SitemapIndexEntry[] = [];

      // ── Generate Posts Sitemap ────────────────────────────────────────
      if (settings.include_posts && data.posts) {
        // data.posts is already typed by SitemapGatheredData interface
        const posts = data.posts;

        // Sort by publishedAt desc
        posts.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));

        // Build URL entries (homepage first)
        const urlEntries: SitemapUrlEntry[] = [];

        // Homepage as first entry
        urlEntries.push({
          loc: buildHomepageUrl(siteUrl),
          lastmod: toW3CDatetime(Date.now()),
          changefreq: toChangefreq(settings.changefreq_homepage, "daily"),
          priority: settings.priority_homepage || 1.0,
        });

        // Post URLs
        for (const post of posts) {
          urlEntries.push({
            loc: buildContentUrl(siteUrl, post.slug, "post"),
            lastmod: toW3CDatetime(post.updatedAt || post.publishedAt),
            changefreq: toChangefreq(settings.changefreq_posts, "weekly"),
            priority: settings.priority_posts || 0.6,
          });
        }

        // Paginate and generate XML
        const pages = paginate(urlEntries, maxUrlsPerSitemap);
        if (pages.length === 0) {
          // Still generate homepage-only sitemap
          const xml = buildUrlSetXml([urlEntries[0]]);
          const hash = await computeContentHashAsync(["homepage"]);

          if (force || existingHashes["posts:1"] !== hash) {
            await ctx.runMutation(internal.sitemaps.internals.upsertCache, {
              type: "posts",
              page: 1,
              xml,
              urlCount: 1,
              generatedAt: Date.now(),
              generationDurationMs: Date.now() - startTime,
              contentHash: hash,
            });
            sitemapsGenerated++;
          }
          totalUrls += 1;

          indexEntries.push({
            loc: buildSubSitemapUrl(siteUrl, "posts", 1),
            lastmod: toW3CDatetime(Date.now()),
          });
        } else {
          for (let i = 0; i < pages.length; i++) {
            const pageNum = i + 1;
            const pageUrls = pages[i];
            const xml = buildUrlSetXml(pageUrls);
            const hashData = pageUrls.map((u) => `${u.loc}:${u.lastmod}`);
            const hash = await computeContentHashAsync(hashData);

            if (force || existingHashes[`posts:${pageNum}`] !== hash) {
              await ctx.runMutation(internal.sitemaps.internals.upsertCache, {
                type: "posts",
                page: pageNum,
                xml,
                urlCount: pageUrls.length,
                generatedAt: Date.now(),
                generationDurationMs: Date.now() - startTime,
                contentHash: hash,
              });
              sitemapsGenerated++;
            }
            totalUrls += pageUrls.length;

            indexEntries.push({
              loc: buildSubSitemapUrl(siteUrl, "posts", pageNum),
              lastmod: toW3CDatetime(Date.now()),
            });
          }
        }
      } else {
        // Posts disabled: clean up cache
        await ctx.runMutation(internal.sitemaps.internals.deleteCacheByType, {
          type: "posts",
        });
      }

      // ── Generate Pages Sitemap ────────────────────────────────────────
      if (settings.include_pages && data.pages) {
        // data.pages is already typed by SitemapGatheredData interface
        const pagesList = data.pages;

        // Sort by menuOrder then title
        pagesList.sort((a, b) => (a.menuOrder - b.menuOrder) || a.title.localeCompare(b.title));

        const urlEntries: SitemapUrlEntry[] = pagesList.map((p) => ({
          loc: p.path
            ? `${siteUrl}${p.path}`
            : buildContentUrl(siteUrl, p.slug, "page"),
          lastmod: toW3CDatetime(p.updatedAt || p.publishedAt),
          changefreq: toChangefreq(settings.changefreq_pages, "monthly"),
          priority: settings.priority_pages || 0.6,
        }));

        if (urlEntries.length > 0) {
          const pagesChunks = paginate(urlEntries, maxUrlsPerSitemap);
          for (let i = 0; i < pagesChunks.length; i++) {
            const pageNum = i + 1;
            const pageUrls = pagesChunks[i];
            const xml = buildUrlSetXml(pageUrls);
            const hashData = pageUrls.map((u) => `${u.loc}:${u.lastmod}`);
            const hash = await computeContentHashAsync(hashData);

            if (force || existingHashes[`pages:${pageNum}`] !== hash) {
              await ctx.runMutation(internal.sitemaps.internals.upsertCache, {
                type: "pages",
                page: pageNum,
                xml,
                urlCount: pageUrls.length,
                generatedAt: Date.now(),
                generationDurationMs: Date.now() - startTime,
                contentHash: hash,
              });
              sitemapsGenerated++;
            }
            totalUrls += pageUrls.length;

            indexEntries.push({
              loc: buildSubSitemapUrl(siteUrl, "pages", pageNum),
              lastmod: toW3CDatetime(Date.now()),
            });
          }
        }
      } else {
        await ctx.runMutation(internal.sitemaps.internals.deleteCacheByType, {
          type: "pages",
        });
      }

      // ── Generate Categories Sitemap ───────────────────────────────────
      if (settings.include_categories && data.categories) {
        // data.categories is already typed by SitemapGatheredData interface
        const categories = data.categories;

        const urlEntries: SitemapUrlEntry[] = categories.map((c) => ({
          loc: buildCategoryUrl(siteUrl, c.slug),
          lastmod: toW3CDatetime(c.updatedAt),
          changefreq: toChangefreq(settings.changefreq_categories, "weekly"),
          priority: settings.priority_categories || 0.4,
        }));

        if (urlEntries.length > 0) {
          const catChunks = paginate(urlEntries, maxUrlsPerSitemap);
          for (let i = 0; i < catChunks.length; i++) {
            const pageNum = i + 1;
            const pageUrls = catChunks[i];
            const xml = buildUrlSetXml(pageUrls);
            const hashData = pageUrls.map((u) => `${u.loc}:${u.lastmod}`);
            const hash = await computeContentHashAsync(hashData);

            if (force || existingHashes[`categories:${pageNum}`] !== hash) {
              await ctx.runMutation(internal.sitemaps.internals.upsertCache, {
                type: "categories",
                page: pageNum,
                xml,
                urlCount: pageUrls.length,
                generatedAt: Date.now(),
                generationDurationMs: Date.now() - startTime,
                contentHash: hash,
              });
              sitemapsGenerated++;
            }
            totalUrls += pageUrls.length;

            indexEntries.push({
              loc: buildSubSitemapUrl(siteUrl, "categories", pageNum),
              lastmod: toW3CDatetime(Date.now()),
            });
          }
        }
      } else {
        await ctx.runMutation(internal.sitemaps.internals.deleteCacheByType, {
          type: "categories",
        });
      }

      // ── Generate Tags Sitemap ─────────────────────────────────────────
      if (settings.include_tags && data.tags) {
        // data.tags is already typed by SitemapGatheredData interface
        const tags = data.tags;

        const urlEntries: SitemapUrlEntry[] = tags.map((t) => ({
          loc: buildTagUrl(siteUrl, t.slug),
          lastmod: toW3CDatetime(t.updatedAt),
          changefreq: toChangefreq(settings.changefreq_tags, "weekly"),
          priority: settings.priority_tags || 0.3,
        }));

        if (urlEntries.length > 0) {
          const tagChunks = paginate(urlEntries, maxUrlsPerSitemap);
          for (let i = 0; i < tagChunks.length; i++) {
            const pageNum = i + 1;
            const pageUrls = tagChunks[i];
            const xml = buildUrlSetXml(pageUrls);
            const hashData = pageUrls.map((u) => `${u.loc}:${u.lastmod}`);
            const hash = await computeContentHashAsync(hashData);

            if (force || existingHashes[`tags:${pageNum}`] !== hash) {
              await ctx.runMutation(internal.sitemaps.internals.upsertCache, {
                type: "tags",
                page: pageNum,
                xml,
                urlCount: pageUrls.length,
                generatedAt: Date.now(),
                generationDurationMs: Date.now() - startTime,
                contentHash: hash,
              });
              sitemapsGenerated++;
            }
            totalUrls += pageUrls.length;

            indexEntries.push({
              loc: buildSubSitemapUrl(siteUrl, "tags", pageNum),
              lastmod: toW3CDatetime(Date.now()),
            });
          }
        }
      } else {
        await ctx.runMutation(internal.sitemaps.internals.deleteCacheByType, {
          type: "tags",
        });
      }

      // ── Generate Authors Sitemap ──────────────────────────────────────
      if (settings.include_authors && data.authors) {
        // data.authors is already typed by SitemapGatheredData interface
        const authors = data.authors;

        const urlEntries: SitemapUrlEntry[] = authors.map((a) => ({
          loc: buildAuthorUrl(siteUrl, a.slug),
          lastmod: toW3CDatetime(a.latestPublishedAt),
          changefreq: toChangefreq(settings.changefreq_authors, "monthly"),
          priority: settings.priority_authors || 0.3,
        }));

        if (urlEntries.length > 0) {
          const authorChunks = paginate(urlEntries, maxUrlsPerSitemap);
          for (let i = 0; i < authorChunks.length; i++) {
            const pageNum = i + 1;
            const pageUrls = authorChunks[i];
            const xml = buildUrlSetXml(pageUrls);
            const hashData = pageUrls.map((u) => `${u.loc}:${u.lastmod}`);
            const hash = await computeContentHashAsync(hashData);

            if (force || existingHashes[`authors:${pageNum}`] !== hash) {
              await ctx.runMutation(internal.sitemaps.internals.upsertCache, {
                type: "authors",
                page: pageNum,
                xml,
                urlCount: pageUrls.length,
                generatedAt: Date.now(),
                generationDurationMs: Date.now() - startTime,
                contentHash: hash,
              });
              sitemapsGenerated++;
            }
            totalUrls += pageUrls.length;

            indexEntries.push({
              loc: buildSubSitemapUrl(siteUrl, "authors", pageNum),
              lastmod: toW3CDatetime(Date.now()),
            });
          }
        }
      } else {
        await ctx.runMutation(internal.sitemaps.internals.deleteCacheByType, {
          type: "authors",
        });
      }

      // ── Generate Sitemap Index ────────────────────────────────────────
      if (indexEntries.length > 0) {
        const indexXml = buildSitemapIndexXml(indexEntries);
        const indexHash = await computeContentHashAsync(
          indexEntries.map((e) => `${e.loc}:${e.lastmod}`),
        );

        await ctx.runMutation(internal.sitemaps.internals.upsertCache, {
          type: "index",
          page: 0,
          xml: indexXml,
          urlCount: totalUrls,
          generatedAt: Date.now(),
          generationDurationMs: Date.now() - startTime,
          contentHash: indexHash,
        });
        sitemapsGenerated++;
      } else {
        // No content at all - delete index cache
        await ctx.runMutation(internal.sitemaps.internals.deleteCacheByType, {
          type: "index",
        });
      }

      const durationMs = Date.now() - startTime;

      // ── Log Generation ────────────────────────────────────────────────
      await ctx.runMutation(internal.sitemaps.internals.logGeneration, {
        triggeredBy,
        triggeredByUserId: args.triggeredByUserId,
        triggeredByEvent: args.triggeredByEvent,
        status: "success",
        sitemapsGenerated,
        totalUrls,
        durationMs,
      });

      // ── Ping Search Engines ───────────────────────────────────────────
      if (sitemapsGenerated > 0 && siteUrl) {
        const sitemapUrl = `${siteUrl}/sitemap.xml`;

        if (settings.ping_google) {
          try {
            const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
            const response = await fetch(pingUrl);
            await ctx.runMutation(internal.sitemaps.internals.logPing, {
              engine: "google",
              url: pingUrl,
              status: response.ok ? "success" : "error",
              httpStatus: response.status,
              errorMessage: response.ok ? undefined : `HTTP ${response.status}`,
            });
          } catch (error: unknown) {
            await ctx.runMutation(internal.sitemaps.internals.logPing, {
              engine: "google",
              url: `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
              status: "error",
              errorMessage: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        if (settings.ping_bing) {
          try {
            const pingUrl = `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
            const response = await fetch(pingUrl);
            await ctx.runMutation(internal.sitemaps.internals.logPing, {
              engine: "bing",
              url: pingUrl,
              status: response.ok ? "success" : "error",
              httpStatus: response.status,
              errorMessage: response.ok ? undefined : `HTTP ${response.status}`,
            });
          } catch (error: unknown) {
            await ctx.runMutation(internal.sitemaps.internals.logPing, {
              engine: "bing",
              url: `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
              status: "error",
              errorMessage: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }
      }

      // ── Emit Event ────────────────────────────────────────────────────
      if (sitemapsGenerated > 0) {
        await ctx.runMutation(internal.sitemaps.internals.emitGeneratedEvent, {
          siteUrl,
          totalUrls,
          sitemapsGenerated,
          durationMs,
          triggeredBy,
          triggeredByUserId: args.triggeredByUserId,
        });
      }
    } catch (error: unknown) {
      // Log error
      const durationMs = Date.now() - startTime;
      await ctx.runMutation(internal.sitemaps.internals.logGeneration, {
        triggeredBy,
        triggeredByUserId: args.triggeredByUserId,
        triggeredByEvent: args.triggeredByEvent,
        status: "error",
        sitemapsGenerated: 0,
        totalUrls: 0,
        durationMs,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});
