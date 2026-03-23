/**
 * SEO System - Internal Functions
 *
 * Internal queries and mutations for server-side SEO operations.
 * Not client-callable -- only invocable from other Convex functions.
 *
 * Provides:
 *   - getPostSeoInternal: Fetch SEO data for a post (used by Sitemap System, RSS System)
 *   - getSettingsInternal: Fetch global SEO settings (used by website SSR)
 *   - resolvePostSeoInternal: Full SEO resolution with fallback chain (used by website SSR)
 *   - getNoindexPostIds: Get all post IDs marked noindex (used by Sitemap System)
 *   - checkDuplicateKeyphrase: Check if a keyphrase is used by another post
 *
 * Usage (from another system's internals):
 *   import { internal } from "../_generated/api";
 *
 *   // Inside an internalQuery handler:
 *   const seoData = await ctx.runQuery(internal.seo.internals.getPostSeoInternal, {
 *     postId: somePostId,
 *   });
 */

import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import {
  parseSeoSettings,
  parseSeoSettingsValue,
  parsePostSeoFromMeta,
  resolvePostSeo,
  EMPTY_POST_SEO,
  DEFAULT_SEO_SETTINGS,
} from "../helpers/seo";
import type { PostForSeo, SeoSettings } from "../helpers/seo";
import { SEO_META_PREFIX } from "./validators";

// ─── Type Guards ────────────────────────────────────────────────────────────

/**
 * Type guard to check if a value has a `url` string property.
 * Used for safely accessing media record URLs without type assertions.
 */
function hasUrl(value: unknown): value is { url: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "url" in value &&
    typeof (value as Record<string, unknown>).url === "string"
  );
}

/**
 * Type guard to check if a string is a valid post type.
 */
function isPostType(value: string): value is "post" | "page" {
  return value === "post" || value === "page";
}

// ─── getPostSeoInternal ─────────────────────────────────────────────────────

/**
 * Internal query to fetch per-post SEO metadata.
 * Same behavior as the public getPostSeo query but not client-callable.
 *
 * Used by:
 *   - Sitemap System (to check noindex flags)
 *   - RSS/Feed System (to use SEO descriptions)
 *   - Search System (to use SEO title/description for display)
 */
export const getPostSeoInternal = internalQuery({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const post = await ctx.db.get("posts", args.postId);
    if (!post) return EMPTY_POST_SEO;

    const allMeta = await ctx.db
      .query("postMeta")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    const seoMeta = allMeta.filter((m) => m.key.startsWith(SEO_META_PREFIX));

    return parsePostSeoFromMeta(
      seoMeta.map((m) => ({ key: m.key, value: m.value })),
    );
  },
});

// ─── getSettingsInternal ────────────────────────────────────────────────────

/**
 * Internal query to fetch all global SEO settings as a complete SeoSettings object.
 * Returns defaults if no settings have been configured.
 *
 * Used by:
 *   - Website SSR route loaders (for meta tag rendering, JSON-LD)
 *   - Sitemap System (for site-wide noindex check)
 */
export const getSettingsInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allRows = await ctx.db.query("seoSettings").collect();

    if (allRows.length === 0) {
      return DEFAULT_SEO_SETTINGS;
    }

    return parseSeoSettings(
      allRows.map((r) => ({ key: r.key, value: r.value })),
    );
  },
});

// ─── resolvePostSeoInternal ─────────────────────────────────────────────────

/**
 * Internal query that fetches post data, SEO metadata, and global settings,
 * then runs the full fallback chain resolution.
 *
 * Returns a ResolvedSeoData object ready for `<head>` rendering.
 *
 * Used by:
 *   - Website SSR route loaders for single post/page routes
 *
 * @param postId - The post/page to resolve SEO for
 * @param siteUrl - The site's base URL (passed from SSR context)
 */
export const resolvePostSeoInternal = internalQuery({
  args: {
    postId: v.id("posts"),
    siteUrl: v.string(),
  },
  handler: async (ctx, args) => {
    // Fetch the post
    const post = await ctx.db.get("posts", args.postId);
    if (!post) return null;

    // Fetch author info
    const author = post.authorId ? await ctx.db.get("users", post.authorId) : null;
    const authorName = author
      ? (author.displayName || `${author.firstName || ""} ${author.lastName || ""}`.trim() || author.email)
      : "Unknown Author";

    // Fetch featured image URL if we have an ID
    let featuredImageUrl: string | null = null;
    if (post.featuredImageId) {
      const media = await ctx.db.get("media", post.featuredImageId);
      if (hasUrl(media)) {
        featuredImageUrl = media.url;
      }
    }

    // Build PostForSeo
    const postType = typeof post.type === "string" && isPostType(post.type) ? post.type : "post";
    const postForSeo: PostForSeo = {
      title: post.title,
      slug: post.slug,
      type: postType,
      content: post.content,
      excerpt: post.excerpt,
      featuredImageUrl,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
    };

    // Fetch SEO metadata
    const allMeta = await ctx.db
      .query("postMeta")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    const seoMeta = allMeta.filter((m) => m.key.startsWith(SEO_META_PREFIX));
    const postSeo = parsePostSeoFromMeta(
      seoMeta.map((m) => ({ key: m.key, value: m.value })),
    );

    // Fetch global settings
    const settingsRows = await ctx.db.query("seoSettings").collect();
    const globalSettings = parseSeoSettings(
      settingsRows.map((r) => ({ key: r.key, value: r.value })),
    );

    // Resolve with fallback chain
    const resolved = resolvePostSeo(postForSeo, postSeo, globalSettings, args.siteUrl);

    // Include author info for JSON-LD generation
    return {
      ...resolved,
      authorName,
      authorUrl: `${args.siteUrl}/author/${author?.username || author?._id || "unknown"}`,
      authorImageUrl: author?.profilePictureUrl || undefined,
    };
  },
});

// ─── getNoindexPostIds ──────────────────────────────────────────────────────

/**
 * Internal query that returns the IDs of all posts/pages marked as noindex.
 *
 * Used by the Sitemap System to exclude noindexed content from the sitemap.
 *
 * Returns an array of post IDs that should be excluded.
 */
export const getNoindexPostIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Query all postMeta rows with key "_seo_noindex"
    const noindexRows = await ctx.db
      .query("postMeta")
      .withIndex("by_key", (q) => q.eq("key", "_seo_noindex"))
      .collect();

    // Filter to only those set to "true"
    const noindexPostIds = noindexRows
      .filter((row) => row.value === "true")
      .map((row) => row.postId);

    return noindexPostIds;
  },
});

// ─── checkDuplicateKeyphrase ────────────────────────────────────────────────

/**
 * Internal query to check if a focus keyphrase is already used by another post.
 *
 * Used by the admin SEO metabox to show a "duplicate keyphrase" warning.
 *
 * @param keyphrase - The keyphrase to check
 * @param excludePostId - The current post to exclude from the check
 * @returns Array of { postId, postTitle } that use the same keyphrase
 */
export const checkDuplicateKeyphrase = internalQuery({
  args: {
    keyphrase: v.string(),
    excludePostId: v.optional(v.id("posts")),
  },
  handler: async (ctx, args) => {
    if (!args.keyphrase || args.keyphrase.trim() === "") {
      return [];
    }

    const normalizedKeyphrase = args.keyphrase.trim().toLowerCase();

    // Find all postMeta rows with the focus keyphrase key
    const keyphraseRows = await ctx.db
      .query("postMeta")
      .withIndex("by_key", (q) => q.eq("key", "_seo_focus_keyphrase"))
      .collect();

    // Filter to matching keyphrases (case-insensitive), excluding current post
    const matches = keyphraseRows.filter(
      (row) =>
        row.value.trim().toLowerCase() === normalizedKeyphrase &&
        row.postId !== args.excludePostId,
    );

    // Look up post titles for the matches
    const results: Array<{ postId: string; postTitle: string }> = [];
    for (const match of matches) {
      const post = await ctx.db.get("posts", match.postId);
      if (post) {
        results.push({
          postId: match.postId,
          postTitle: post.title,
        });
      }
    }

    return results;
  },
});
