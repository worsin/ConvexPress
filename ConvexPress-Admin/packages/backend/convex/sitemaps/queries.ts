/**
 * Sitemap System - Public Queries
 *
 * Five queries for serving sitemaps and status information:
 *
 *   - getSettings:       Read sitemap settings for admin UI (auth required)
 *   - getIndex:          Serve the sitemap index XML (public, no auth)
 *   - getSubSitemap:     Serve a sub-sitemap by type and page (public, no auth)
 *   - getStatus:         Get sitemap status for admin dashboard (auth required)
 *   - getRobotsContent:  Get robots.txt content with Sitemap directive (public, no auth)
 *
 * Auth model:
 *   - getSettings: Admin only (requires seo.generate_sitemap capability)
 *   - getIndex: Public (served to search engine crawlers)
 *   - getSubSitemap: Public (served to search engine crawlers)
 *   - getStatus: Admin only (requires seo.generate_sitemap capability)
 *   - getRobotsContent: Public (served to crawlers at /robots.txt)
 *
 * Serving performance is O(1) - single Convex query returning cached XML.
 * No computation happens at serve time; all XML is pre-generated.
 *
 * Usage:
 *   // Website SSR route (/sitemap.xml)
 *   const index = useQuery(api.sitemaps.queries.getIndex);
 *
 *   // Admin sitemap settings page
 *   const settings = useQuery(api.sitemaps.queries.getSettings);
 *   const status = useQuery(api.sitemaps.queries.getStatus);
 */

import { query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import {
  getSettingsArgs,
  getIndexArgs,
  getSubSitemapArgs,
  getStatusArgs,
  getRobotsContentArgs,
  CONTENT_SITEMAP_TYPES,
} from "./validators";
import type { SitemapType } from "./validators";
import { readSitemapSettings } from "./helpers/settings";

// ─── getSettings ─────────────────────────────────────────────────────────────

/**
 * Read sitemap settings for the admin settings form.
 *
 * Returns defaults merged with stored seoSettings["sitemap"] values.
 */
export const getSettings = query({
  args: getSettingsArgs,
  handler: async (ctx) => {
    await requireCan(ctx, "seo.generate_sitemap");
    return await readSitemapSettings(ctx);
  },
});

// ─── getIndex ────────────────────────────────────────────────────────────────

/**
 * Serve the cached sitemap index XML.
 *
 * Returns the pre-generated sitemap index XML content for the
 * `/sitemap.xml` website route. Returns null if sitemaps are disabled
 * or no cached index exists (API route should respond with 404).
 *
 * Public query - no authentication required.
 */
export const getIndex = query({
  args: getIndexArgs,
  handler: async (ctx) => {
    // Check if sitemaps are enabled
    const settings = await readSitemapSettings(ctx);
    if (!settings.enabled) return null;

    // Query cached index (type = "index", page = 0)
    const cached = await ctx.db
      .query("sitemapCache")
      .withIndex("by_type_page", (q) => q.eq("type", "index").eq("page", 0))
      .unique();

    if (!cached) return null;

    return {
      xml: cached.xml,
      generatedAt: cached.generatedAt,
      urlCount: cached.urlCount,
    };
  },
});

// ─── getSubSitemap ───────────────────────────────────────────────────────────

/**
 * Serve a cached sub-sitemap by content type and page number.
 *
 * Returns the pre-generated XML for routes like `/sitemap-posts-1.xml`.
 * Returns null if the content type is disabled, page is out of range,
 * or no cached data exists (API route should respond with 404).
 *
 * Public query - no authentication required.
 *
 * @param type - Content type (posts, pages, categories, tags, authors)
 * @param page - Page number (1-based)
 */
export const getSubSitemap = query({
  args: getSubSitemapArgs,
  handler: async (ctx, args) => {
    // Validate page number
    if (args.page < 1) return null;

    // Check if sitemaps are enabled
    const settings = await readSitemapSettings(ctx);
    if (!settings.enabled) return null;

    // Check if this content type is included
    const includeKey = `include_${args.type}` as keyof typeof settings;
    if (!settings[includeKey]) return null;

    // Query cached sub-sitemap
    const cached = await ctx.db
      .query("sitemapCache")
      .withIndex("by_type_page", (q) =>
        q.eq("type", args.type).eq("page", args.page),
      )
      .unique();

    if (!cached) return null;

    return {
      xml: cached.xml,
    };
  },
});

// ─── getStatus ───────────────────────────────────────────────────────────────

/**
 * Get comprehensive sitemap status for the admin settings page.
 *
 * Returns aggregated information about all cached sitemaps, including
 * per-type URL counts, page counts, last generation timestamps,
 * stale status, and recent generation/ping logs.
 *
 * Requires `seo.generate_sitemap` capability (Administrator only).
 * The admin settings page subscribes to this query for real-time updates.
 */
export const getStatus = query({
  args: getStatusArgs,
  handler: async (ctx) => {
    // Require admin access
    await requireCan(ctx, "seo.generate_sitemap");

    // Read settings
    const settings = await readSitemapSettings(ctx);

    // Query all cached sitemaps
    const allCached = await ctx.db.query("sitemapCache").collect();

    // Aggregate per-type stats
    const perType: Record<string, { urlCount: number; pages: number; lastGenerated: number | null }> = {};

    for (const type of CONTENT_SITEMAP_TYPES) {
      perType[type] = { urlCount: 0, pages: 0, lastGenerated: null };
    }
    perType["index"] = { urlCount: 0, pages: 0, lastGenerated: null };

    let totalUrls = 0;
    let lastGenerated: number | null = null;
    let hasStale = false;

    for (const entry of allCached) {
      const typeStat = perType[entry.type];
      if (typeStat) {
        typeStat.urlCount += entry.urlCount;
        typeStat.pages += 1;
        if (typeStat.lastGenerated === null || entry.generatedAt > typeStat.lastGenerated) {
          typeStat.lastGenerated = entry.generatedAt;
        }
      }

      if (entry.type !== "index") {
        totalUrls += entry.urlCount;
      }

      if (lastGenerated === null || entry.generatedAt > lastGenerated) {
        lastGenerated = entry.generatedAt;
      }

      if (entry.isStale) {
        hasStale = true;
      }
    }

    // Read site URL from general settings to build index URL
    const generalSettings = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "general"))
      .unique();

    let siteUrl = "";
    if (generalSettings && generalSettings.values) {
      const vals = generalSettings.values as Record<string, unknown>;
      siteUrl = (vals.siteUrl as string) || "";
    }

    const indexUrl = settings.enabled && siteUrl
      ? `${siteUrl.replace(/\/+$/, "")}/sitemap.xml`
      : null;

    // Query recent generation logs (last 10)
    const recentGenerations = await ctx.db
      .query("sitemapGenerationLog")
      .withIndex("by_created")
      .order("desc")
      .take(10);

    // Query recent ping logs (last 10)
    const recentPings = await ctx.db
      .query("sitemapPingLog")
      .withIndex("by_created")
      .order("desc")
      .take(10);

    return {
      enabled: settings.enabled,
      indexUrl,
      totalUrls,
      perType: perType as Record<SitemapType, { urlCount: number; pages: number; lastGenerated: number | null }>,
      lastGenerated,
      hasStale,
      recentGenerations,
      recentPings,
    };
  },
});

// ─── getRobotsContent ────────────────────────────────────────────────────────

/**
 * Get robots.txt content with the Sitemap directive.
 *
 * Reads the robots.txt configuration from the SEO System and appends
 * or removes the Sitemap directive based on whether sitemaps are enabled.
 *
 * This query works alongside the SEO System's getRobotsTxt query.
 * The website route handler can call either one - this version specifically
 * ensures the Sitemap directive is correct.
 *
 * Public query - no authentication required.
 */
export const getRobotsContent = query({
  args: getRobotsContentArgs,
  handler: async (ctx) => {
    // Read sitemap settings
    const settings = await readSitemapSettings(ctx);

    // Read SEO robots settings
    const robotsRow = await ctx.db
      .query("seoSettings")
      .withIndex("by_key", (q) => q.eq("key", "robots"))
      .unique();

    // Read site URL from general settings
    const generalSettings = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "general"))
      .unique();

    let siteUrl = "";
    if (generalSettings && generalSettings.values) {
      const vals = generalSettings.values as Record<string, unknown>;
      siteUrl = (vals.siteUrl as string) || "";
    }

    // Parse robots settings
    let robotsSettings: Record<string, unknown> = {};
    if (robotsRow) {
      try {
        robotsSettings = JSON.parse(robotsRow.value);
      } catch {
        // Use defaults
      }
    }

    const siteNoindex = robotsSettings.siteNoindex === true;
    const blockAiBots = robotsSettings.blockAiBots === true;
    const customRules = (robotsSettings.customRules as string) || "";

    // Build robots.txt content
    const lines: string[] = [];

    lines.push("User-agent: *");

    if (siteNoindex) {
      lines.push("Disallow: /");
    } else {
      lines.push("Disallow: /admin/");
      lines.push("Disallow: /api/");
      lines.push("Allow: /");
    }

    lines.push("");

    // AI bot blocking
    if (blockAiBots) {
      const aiBots = ["GPTBot", "CCBot", "Google-Extended", "anthropic-ai"];
      for (const bot of aiBots) {
        lines.push(`User-agent: ${bot}`);
        lines.push("Disallow: /");
        lines.push("");
      }
    }

    // Custom rules
    if (customRules.trim()) {
      lines.push("# Custom rules");
      lines.push(customRules.trim());
      lines.push("");
    }

    // Sitemap directive
    if (settings.enabled && siteUrl) {
      const sitemapUrl = `${siteUrl.replace(/\/+$/, "")}/sitemap.xml`;
      lines.push(`Sitemap: ${sitemapUrl}`);
    }

    return lines.join("\n");
  },
});
