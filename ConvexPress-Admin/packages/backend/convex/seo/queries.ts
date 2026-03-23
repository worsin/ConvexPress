/**
 * SEO System - Public Queries
 *
 * Four queries for reading SEO data:
 *
 *   - getSettings:   Read global SEO settings (all or single key)
 *   - getPostSeo:    Read per-post SEO metadata from postMeta
 *   - getRobotsTxt:  Generate robots.txt content (public, no auth)
 *   - getSeoOverview: Aggregate SEO statistics for admin dashboard
 *
 * Auth model:
 *   - getSettings: Public for rendering keys (titles, social, schema,
 *     breadcrumbs, verification). Admin-only for robots and advanced.
 *   - getPostSeo: Public (published posts for website), auth for drafts.
 *   - getRobotsTxt: Public (no auth, served to crawlers).
 *   - getSeoOverview: Admin only (Administrator).
 *
 * Usage:
 *   // Website SSR route loader
 *   const seo = useQuery(api.seo.queries.getPostSeo, { postId });
 *
 *   // Admin SEO settings form
 *   const settings = useQuery(api.seo.queries.getSettings, { key: "titles" });
 *
 *   // Admin SEO dashboard
 *   const overview = useQuery(api.seo.queries.getSeoOverview);
 */

import { query } from "../_generated/server";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import {
  parseSeoSettings,
  parseSeoSettingsValue,
  parsePostSeoFromMeta,
  DEFAULT_TITLE_SETTINGS,
  DEFAULT_SOCIAL_SETTINGS,
  DEFAULT_ROBOTS_SETTINGS,
  DEFAULT_SCHEMA_SETTINGS,
  DEFAULT_BREADCRUMB_SETTINGS,
  DEFAULT_VERIFICATION_SETTINGS,
  DEFAULT_ADVANCED_SETTINGS,
  DEFAULT_SEO_SETTINGS,
  EMPTY_POST_SEO,
} from "../helpers/seo";
import type { SeoSettings } from "../helpers/seo";
import {
  getSettingsArgs,
  getPostSeoArgs,
  getRobotsTxtArgs,
  getSeoOverviewArgs,
  SEO_META_PREFIX,
} from "./validators";

// ─── Defaults Map ───────────────────────────────────────────────────────────

const DEFAULTS_BY_KEY: Record<string, object> = {
  titles: DEFAULT_TITLE_SETTINGS,
  social: DEFAULT_SOCIAL_SETTINGS,
  robots: DEFAULT_ROBOTS_SETTINGS,
  schema: DEFAULT_SCHEMA_SETTINGS,
  breadcrumbs: DEFAULT_BREADCRUMB_SETTINGS,
  verification: DEFAULT_VERIFICATION_SETTINGS,
  advanced: DEFAULT_ADVANCED_SETTINGS,
};

// ─── getSettings ────────────────────────────────────────────────────────────

/**
 * Read global SEO settings.
 *
 * If `key` is provided, returns the parsed settings for that single key
 * with defaults merged. If `key` is omitted, returns all settings as a
 * complete SeoSettings object.
 *
 * Public for rendering-safe keys. Robots and advanced require authentication.
 */
export const getSettings = query({
  args: getSettingsArgs,
  handler: async (ctx, args) => {
    const { key } = args;

    // Robots and advanced settings require authentication (not public data)
    if (key === "robots" || key === "advanced") {
      const user = await getCurrentUser(ctx);
      if (!user) return null;
    }

    if (key) {
      // Single key lookup
      const row = await ctx.db
        .query("seoSettings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();

      const defaults = DEFAULTS_BY_KEY[key] ?? {};
      const value = row ? parseSeoSettingsValue(row.value, defaults) : { ...defaults };

      return {
        key,
        value,
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedBy ?? null,
      };
    }

    // All keys - fetch all rows and assemble
    const allRows = await ctx.db.query("seoSettings").collect();
    const settings = parseSeoSettings(
      allRows.map((r) => ({ key: r.key, value: r.value })),
    );

    return settings;
  },
});

// ─── getPostSeo ─────────────────────────────────────────────────────────────

/**
 * Read per-post SEO metadata from the postMeta table.
 *
 * Fetches all postMeta rows for the given postId that have keys starting
 * with `_seo_` and parses them into a structured PostSeoData object.
 *
 * Public for published posts (website rendering). Returns empty data for
 * non-existent posts without throwing.
 */
export const getPostSeo = query({
  args: getPostSeoArgs,
  handler: async (ctx, args) => {
    const { postId } = args;

    // Verify post exists
    const post = await ctx.db.get("posts", postId);
    if (!post) {
      return EMPTY_POST_SEO;
    }

    // Fetch all meta rows for this post
    const allMeta = await ctx.db
      .query("postMeta")
      .withIndex("by_post", (q) => q.eq("postId", postId))
      .collect();

    // Filter to SEO keys only
    const seoMeta = allMeta.filter((m) => m.key.startsWith(SEO_META_PREFIX));

    return parsePostSeoFromMeta(
      seoMeta.map((m) => ({ key: m.key, value: m.value })),
    );
  },
});

// ─── getRobotsTxt ───────────────────────────────────────────────────────────

/**
 * Generate robots.txt content dynamically.
 *
 * Public query - no authentication required.
 * Called by TanStack Start API route handler at `/robots.txt`.
 *
 * Builds content based on seoSettings "robots" key:
 *   - User-agent: *
 *   - Disallow /admin/ (unless site-wide noindex)
 *   - AI bot blocking if enabled
 *   - Custom rules appended
 *   - Sitemap URL appended
 *
 * Returns a sensible default if no settings exist.
 */
export const getRobotsTxt = query({
  args: getRobotsTxtArgs,
  handler: async (ctx) => {
    // Fetch robots settings
    const robotsRow = await ctx.db
      .query("seoSettings")
      .withIndex("by_key", (q) => q.eq("key", "robots"))
      .unique();

    const robotsSettings = parseSeoSettingsValue(
      robotsRow?.value,
      DEFAULT_ROBOTS_SETTINGS,
    );

    // Fetch site URL from the Settings System for absolute sitemap URL (RFC 9309)
    const generalSettings = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "general"))
      .unique();
    const siteUrl = (generalSettings?.values as Record<string, unknown> | null)?.siteUrl as string || "";

    const lines: string[] = [];

    // Default user-agent
    lines.push("User-agent: *");

    if (robotsSettings.siteNoindex) {
      // Site-wide noindex: block everything
      lines.push("Disallow: /");
    } else {
      // Normal: block admin, allow everything else
      lines.push("Disallow: /admin/");
      lines.push("Allow: /");
    }

    lines.push(""); // Blank line separator

    // AI bot blocking
    if (robotsSettings.blockAiBots) {
      const aiBots = ["GPTBot", "CCBot", "Google-Extended", "anthropic-ai"];
      for (const bot of aiBots) {
        lines.push(`User-agent: ${bot}`);
        lines.push("Disallow: /");
        lines.push("");
      }
    }

    // Custom rules
    if (robotsSettings.customRules && robotsSettings.customRules.trim()) {
      lines.push("# Custom rules");
      lines.push(robotsSettings.customRules.trim());
      lines.push("");
    }

    // Sitemap reference (absolute URL per RFC 9309 when site URL is available)
    if (siteUrl) {
      const cleanUrl = siteUrl.replace(/\/+$/, "");
      lines.push(`Sitemap: ${cleanUrl}/sitemap.xml`);
    } else {
      // Fallback to relative path if site URL is not configured
      lines.push("Sitemap: /sitemap.xml");
    }

    return lines.join("\n");
  },
});

// ─── getSeoOverview ─────────────────────────────────────────────────────────

/**
 * Aggregate SEO statistics for the admin dashboard.
 *
 * Requires Administrator access. Queries all published posts and their
 * SEO metadata to produce summary statistics:
 *   - Posts by SEO score range (Good, OK, Poor, No Data)
 *   - Posts missing meta description
 *   - Posts missing focus keyphrase
 *   - Posts marked noindex
 *   - Cornerstone content count
 *   - Total indexed vs total published
 *
 * Note: This query scans all published posts. For large sites, consider
 * denormalizing into a cached overview document.
 */
export const getSeoOverview = query({
  args: getSeoOverviewArgs,
  handler: async (ctx) => {
    // Require Administrator access (seo.update_global = Administrator only)
    const user = await requireCan(ctx, "seo.update_global");

    // Fetch all published posts
    const publishedPosts = await ctx.db
      .query("posts")
      .withIndex("by_type_status", (q) => q.eq("type", "post").eq("status", "publish"))
      .collect();

    // Fetch all published pages
    const publishedPages = await ctx.db
      .query("posts")
      .withIndex("by_type_status", (q) => q.eq("type", "page").eq("status", "publish"))
      .collect();

    const allPublished = [...publishedPosts, ...publishedPages];

    // Score distribution buckets
    let good = 0; // 70-100
    let ok = 0; // 40-69
    let poor = 0; // 0-39
    let noData = 0;

    // Issue counts
    let missingDescription = 0;
    let missingKeyphrase = 0;
    let noindexCount = 0;
    let cornerstoneCount = 0;

    // Collect per-post SEO info for the recent table
    const postSeoEntries: Array<{
      postId: string;
      title: string;
      type: string;
      slug: string;
      seoScore: number | null;
      readabilityScore: number | null;
      hasKeyphrase: boolean;
      hasDescription: boolean;
      noindex: boolean;
      cornerstone: boolean;
      updatedAt: number;
    }> = [];

    // Batch-fetch all SEO meta rows in a single query to avoid N+1 pattern.
    // We fetch all postMeta rows with SEO-relevant keys and group by postId in memory.
    const seoKeys = [
      "_seo_score",
      "_seo_readability_score",
      "_seo_description",
      "_seo_focus_keyphrase",
      "_seo_noindex",
      "_seo_cornerstone",
    ];

    // Fetch all rows for each SEO key in parallel, then flatten
    const allSeoMetaArrays = await Promise.all(
      seoKeys.map((key) =>
        ctx.db
          .query("postMeta")
          .withIndex("by_key", (q) => q.eq("key", key))
          .collect(),
      ),
    );
    const allSeoMeta = allSeoMetaArrays.flat();

    // Group SEO meta by postId for O(1) lookups
    const metaByPostId = new Map<string, Map<string, string>>();
    for (const row of allSeoMeta) {
      const postId = row.postId as string;
      if (!metaByPostId.has(postId)) {
        metaByPostId.set(postId, new Map());
      }
      metaByPostId.get(postId)!.set(row.key, row.value);
    }

    // Process each published item using the pre-fetched meta maps
    for (const post of allPublished) {
      const metaMap = metaByPostId.get(post._id as string) ?? new Map<string, string>();

      // SEO score
      const scoreStr = metaMap.get("_seo_score");
      const readabilityStr = metaMap.get("_seo_readability_score");
      const hasDescription = !!(metaMap.has("_seo_description") && metaMap.get("_seo_description"));
      const hasKeyphrase = !!(metaMap.has("_seo_focus_keyphrase") && metaMap.get("_seo_focus_keyphrase"));
      const isNoindex = metaMap.get("_seo_noindex") === "true";
      const isCornerstone = metaMap.get("_seo_cornerstone") === "true";

      if (scoreStr) {
        const score = Number(scoreStr);
        if (score >= 70) good++;
        else if (score >= 40) ok++;
        else poor++;
      } else {
        noData++;
      }

      // Missing description
      if (!hasDescription) {
        missingDescription++;
      }

      // Missing keyphrase
      if (!hasKeyphrase) {
        missingKeyphrase++;
      }

      // Noindex
      if (isNoindex) {
        noindexCount++;
      }

      // Cornerstone
      if (isCornerstone) {
        cornerstoneCount++;
      }

      // Collect for recent table
      postSeoEntries.push({
        postId: post._id,
        title: post.title,
        type: post.type as string,
        slug: post.slug,
        seoScore: scoreStr ? Number(scoreStr) : null,
        readabilityScore: readabilityStr ? Number(readabilityStr) : null,
        hasKeyphrase,
        hasDescription,
        noindex: isNoindex,
        cornerstone: isCornerstone,
        updatedAt: post.updatedAt ?? post._creationTime,
      });
    }

    const totalPublished = allPublished.length;
    const totalIndexed = totalPublished - noindexCount;

    // Sort by updatedAt descending and take the 10 most recent
    const recentPosts = postSeoEntries
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 10);

    return {
      totalPublished,
      totalIndexed,
      scoreDistribution: {
        good,
        ok,
        poor,
        noData,
      },
      issues: {
        missingDescription,
        missingKeyphrase,
        noindexCount,
      },
      cornerstoneCount,
      recentPosts,
    };
  },
});
