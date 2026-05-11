/**
 * Sitemap System - Settings Helper
 *
 * Shared helper for reading sitemap settings from the seoSettings table.
 * Extracted to avoid duplication across queries.ts, mutations.ts, and internals.ts.
 *
 * Usage:
 *   import { readSitemapSettings, isSitemapEnabled } from "./helpers/settings";
 *   const settings = await readSitemapSettings(ctx);
 */

import type { QueryCtx } from "../../_generated/server";
import {
  SITEMAP_SETTINGS_KEY,
  DEFAULT_SITEMAP_SETTINGS,
} from "../validators";
import type { SitemapSettings } from "../validators";

type ReadCtx = Pick<QueryCtx, "db">;

/**
 * Read sitemap settings from the seoSettings table.
 * Returns defaults merged with stored values.
 *
 * @param ctx - Query or mutation context (NOT action context)
 * @returns Merged settings with defaults applied
 */
export async function readSitemapSettings(
  ctx: ReadCtx,
): Promise<SitemapSettings> {
  const row = await ctx.db
    .query("seoSettings")
    .withIndex("by_key", (q: ConvexQueryBuilder) => q.eq("key", SITEMAP_SETTINGS_KEY))
    .unique();

  if (!row) return { ...DEFAULT_SITEMAP_SETTINGS };

  try {
    const parsed = JSON.parse(row.value);
    return { ...DEFAULT_SITEMAP_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SITEMAP_SETTINGS };
  }
}

/**
 * Quick check if sitemaps are enabled (used by event subscribers).
 *
 * @param ctx - Query or mutation context
 * @returns True if sitemaps are enabled (defaults to true)
 */
export async function isSitemapEnabled(
  ctx: ReadCtx,
): Promise<boolean> {
  const settings = await readSitemapSettings(ctx);
  return Boolean(settings.enabled);
}

/**
 * Read the site URL from general settings.
 *
 * @param ctx - Query or mutation context
 * @returns Site URL string, or empty string if not configured
 */
export async function readSiteUrl(
  ctx: ReadCtx,
): Promise<string> {
  const generalSettings = await ctx.db
    .query("settings")
    .withIndex("by_section", (q: ConvexQueryBuilder) => q.eq("section", "general"))
    .unique();

  if (generalSettings && generalSettings.values) {
    const vals = generalSettings.values as Record<string, unknown>;
    return ((vals.siteUrl as string) || "").replace(/\/+$/, "");
  }

  return "";
}

/**
 * Get post IDs that have _seo_noindex = "true" in postMeta.
 *
 * @param ctx - Query or mutation context
 * @returns Set of post IDs that should be excluded from sitemaps
 */
export async function getNoindexPostIds(
  ctx: ReadCtx,
): Promise<Set<string>> {
  const noindexRows = await ctx.db
    .query("postMeta")
    .withIndex("by_key", (q: ConvexQueryBuilder) => q.eq("key", "_seo_noindex"))
    .collect();

  return new Set(
    noindexRows
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      .filter((row) => row.value === "true")
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      .map((row) => row.postId as string),
  );
}
