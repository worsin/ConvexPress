/**
 * Sitemap System - Convex Validators
 *
 * Shared argument validators for sitemap queries, mutations, and actions.
 * Also defines constants for valid changefreq values, default settings,
 * and validation helper functions.
 *
 * Usage:
 *   import { getSubSitemapArgs, sitemapTypeValidator } from "./validators";
 */

import { v } from "convex/values";
import {
  sitemapTypeValidator,
  sitemapTriggerValidator,
  searchEngineValidator,
  outcomeStatusValidator,
} from "../schema/sitemap";

// ─── Type Validators ─────────────────────────────────────────────────────────
// Canonical definitions live in schema/sitemap.ts. Re-exported here for
// use in function args across the sitemap system.

export {
  sitemapTypeValidator,
  sitemapTriggerValidator,
  searchEngineValidator,
  outcomeStatusValidator,
};

/**
 * Content-only sitemap types (excludes "index").
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const contentSitemapTypeValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("posts"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("pages"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("courses"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("categories"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("tags"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("authors"),
);

// ─── Sitemap Type Constants ──────────────────────────────────────────────────

export type SitemapType = "index" | "posts" | "pages" | "courses" | "categories" | "tags" | "authors";

export type ContentSitemapType = Exclude<SitemapType, "index">;

export const CONTENT_SITEMAP_TYPES: ContentSitemapType[] = [
  "posts",
  "pages",
  "courses",
  "categories",
  "tags",
  "authors",
];

// ─── Changefreq Constants ────────────────────────────────────────────────────

export type SitemapChangefreq =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export const VALID_CHANGEFREQ: SitemapChangefreq[] = [
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
];

// ─── Trigger Type ────────────────────────────────────────────────────────────

export type SitemapTrigger = "content_change" | "manual" | "scheduled" | "settings_change";

// ─── Default Settings ────────────────────────────────────────────────────────

/**
 * Default sitemap configuration values.
 * Stored in the SEO System's `seoSettings` table under key "sitemap".
 */
export const DEFAULT_SITEMAP_SETTINGS = {
  // Global
  enabled: true,

  // Content type inclusion
  include_posts: true,
  include_pages: true,
  include_courses: true,
  include_categories: true,
  include_tags: false,
  include_authors: false,

  // URL limits
  max_urls_per_sitemap: 1000,

  // Default changefreq per content type
  changefreq_posts: "weekly" as SitemapChangefreq,
  changefreq_pages: "monthly" as SitemapChangefreq,
  changefreq_courses: "weekly" as SitemapChangefreq,
  changefreq_categories: "weekly" as SitemapChangefreq,
  changefreq_tags: "weekly" as SitemapChangefreq,
  changefreq_authors: "monthly" as SitemapChangefreq,
  changefreq_homepage: "daily" as SitemapChangefreq,

  // Default priority per content type (0.0 - 1.0)
  priority_homepage: 1.0,
  priority_posts: 0.6,
  priority_pages: 0.6,
  priority_courses: 0.6,
  priority_categories: 0.4,
  priority_tags: 0.3,
  priority_authors: 0.3,

  // Search engine ping
  ping_google: true,
  ping_bing: true,

  // Auto-regeneration
  auto_regenerate: true,
  regeneration_debounce_ms: 30000,
};

export type SitemapSettings = {
  [K in keyof typeof DEFAULT_SITEMAP_SETTINGS]: (typeof DEFAULT_SITEMAP_SETTINGS)[K];
};

// ─── Settings Key for seoSettings Table ──────────────────────────────────────

/**
 * The key used to store sitemap settings in the seoSettings table.
 */
export const SITEMAP_SETTINGS_KEY = "sitemap";

// ─── Argument Validators ─────────────────────────────────────────────────────

/**
 * Args for the getSettings query (admin only, no args).
 */
export const getSettingsArgs = {};

/**
 * Args for the getIndex query (public, no args).
 */
export const getIndexArgs = {};

/**
 * Args for the getSubSitemap query (public).
 */
export const getSubSitemapArgs = {
  type: contentSitemapTypeValidator,
  page: v.number(),
};

/**
 * Args for the getStatus query (admin only, no args).
 */
export const getStatusArgs = {};

/**
 * Args for the getRobotsContent query (public, no args).
 */
export const getRobotsContentArgs = {};

/**
 * Args for the markStale internal mutation.
 */
export const markStaleArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  types: v.array(sitemapTypeValidator),
};

/**
 * Args for the updateSettings mutation.
 */
export const updateSettingsArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  settings: v.object({
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    enabled: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    include_posts: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    include_pages: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    include_courses: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    include_categories: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    include_tags: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    include_authors: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    max_urls_per_sitemap: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    changefreq_posts: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    changefreq_pages: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    changefreq_courses: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    changefreq_categories: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    changefreq_tags: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    changefreq_authors: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    changefreq_homepage: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    priority_homepage: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    priority_posts: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    priority_pages: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    priority_courses: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    priority_categories: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    priority_tags: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    priority_authors: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    ping_google: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    ping_bing: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    auto_regenerate: v.optional(v.boolean()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    regeneration_debounce_ms: v.optional(v.number()),
  }),
};

/**
 * Args for the generate action.
 */
export const generateArgs = {
  force: v.optional(v.boolean()),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  types: v.optional(v.array(contentSitemapTypeValidator)),
};

// ─── Validation Helpers ──────────────────────────────────────────────────────

/**
 * Validate a changefreq string value.
 */
export function isValidChangefreq(value: string): value is SitemapChangefreq {
  return (VALID_CHANGEFREQ as string[]).includes(value);
}

/**
 * Validate a priority value (0.0 to 1.0).
 */
export function isValidPriority(value: number): boolean {
  return value >= 0.0 && value <= 1.0;
}

/**
 * Validate max URLs per sitemap (1 to 50000 per sitemaps.org protocol).
 */
export function isValidMaxUrls(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 50000;
}

/**
 * Validate debounce interval (5s to 5min).
 */
export function isValidDebounceMs(value: number): boolean {
  return Number.isInteger(value) && value >= 5000 && value <= 300000;
}

/**
 * Maps content type to its settings include key.
 */
export const TYPE_TO_INCLUDE_KEY: Record<ContentSitemapType, keyof SitemapSettings> = {
  posts: "include_posts",
  pages: "include_pages",
  courses: "include_courses",
  categories: "include_categories",
  tags: "include_tags",
  authors: "include_authors",
};

/**
 * Maps content type to its changefreq settings key.
 */
export const TYPE_TO_CHANGEFREQ_KEY: Record<ContentSitemapType, keyof SitemapSettings> = {
  posts: "changefreq_posts",
  pages: "changefreq_pages",
  courses: "changefreq_courses",
  categories: "changefreq_categories",
  tags: "changefreq_tags",
  authors: "changefreq_authors",
};

/**
 * Maps content type to its priority settings key.
 */
export const TYPE_TO_PRIORITY_KEY: Record<ContentSitemapType, keyof SitemapSettings> = {
  posts: "priority_posts",
  pages: "priority_pages",
  courses: "priority_courses",
  categories: "priority_categories",
  tags: "priority_tags",
  authors: "priority_authors",
};
