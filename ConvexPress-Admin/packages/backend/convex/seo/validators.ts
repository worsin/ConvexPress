/**
 * SEO System - Convex Validators
 *
 * Shared argument validators for SEO mutations and queries.
 * These enforce type safety at the Convex argument level.
 *
 * Validators cover:
 *   - Global settings key union
 *   - Per-post SEO update arguments
 *   - Schema.org type enums
 *   - Robots.txt update arguments
 *
 * Usage:
 *   import { updatePostSeoArgs, settingsKeyValidator } from "./validators";
 */

import { v } from "convex/values";

// ─── Settings Key Validator ─────────────────────────────────────────────────

/**
 * Validator for the global SEO settings key field.
 * One of the 7 known settings keys.
 */
export const settingsKeyValidator = v.union(
  v.literal("titles"),
  v.literal("social"),
  v.literal("robots"),
  v.literal("schema"),
  v.literal("breadcrumbs"),
  v.literal("verification"),
  v.literal("advanced"),
);

/**
 * Known settings keys as a type and constant array.
 */
export const SETTINGS_KEYS = [
  "titles",
  "social",
  "robots",
  "schema",
  "breadcrumbs",
  "verification",
  "advanced",
] as const;

export type SeoSettingsKey = (typeof SETTINGS_KEYS)[number];

/**
 * Validate a string is a known settings key.
 */
export function isValidSettingsKey(key: string): key is SeoSettingsKey {
  return (SETTINGS_KEYS as readonly string[]).includes(key);
}

// ─── Schema.org Type Validators ─────────────────────────────────────────────

/**
 * Valid Schema.org article types for posts.
 */
export const VALID_ARTICLE_TYPES = [
  "Article",
  "BlogPosting",
  "NewsArticle",
  "TechArticle",
  "ScholarlyArticle",
] as const;

export type ArticleType = (typeof VALID_ARTICLE_TYPES)[number];

/**
 * Valid Schema.org page types for pages.
 */
export const VALID_PAGE_TYPES = [
  "WebPage",
  "AboutPage",
  "ContactPage",
  "FAQPage",
  "CollectionPage",
  "ItemPage",
  "ProfilePage",
  "SearchResultsPage",
  "CheckoutPage",
] as const;

export type PageType = (typeof VALID_PAGE_TYPES)[number];

// ─── Per-Post SEO Field Mapping ─────────────────────────────────────────────

/**
 * Maps friendly argument names to their `_seo_*` postMeta keys.
 */
export const SEO_FIELD_TO_META_KEY: Record<string, string> = {
  seoTitle: "_seo_title",
  seoDescription: "_seo_description",
  focusKeyphrase: "_seo_focus_keyphrase",
  additionalKeyphrases: "_seo_additional_keyphrases",
  canonical: "_seo_canonical",
  noindex: "_seo_noindex",
  nofollow: "_seo_nofollow",
  ogTitle: "_seo_og_title",
  ogDescription: "_seo_og_description",
  ogImage: "_seo_og_image",
  twitterTitle: "_seo_twitter_title",
  twitterDescription: "_seo_twitter_description",
  twitterImage: "_seo_twitter_image",
  schemaType: "_seo_schema_type",
  schemaArticleType: "_seo_schema_article_type",
  seoScore: "_seo_score",
  readabilityScore: "_seo_readability_score",
  cornerstone: "_seo_cornerstone",
};

/**
 * All known SEO meta key prefixes.
 */
export const SEO_META_PREFIX = "_seo_";

// ─── Argument Validators ────────────────────────────────────────────────────

/**
 * Args for the updatePostSeo mutation.
 * All SEO fields are optional since partial updates are the norm.
 */
export const updatePostSeoArgs = {
  postId: v.id("posts"),
  seoTitle: v.optional(v.string()),
  seoDescription: v.optional(v.string()),
  focusKeyphrase: v.optional(v.string()),
  additionalKeyphrases: v.optional(v.array(v.string())),
  canonical: v.optional(v.string()),
  noindex: v.optional(v.boolean()),
  nofollow: v.optional(v.boolean()),
  ogTitle: v.optional(v.string()),
  ogDescription: v.optional(v.string()),
  ogImage: v.optional(v.string()),
  twitterTitle: v.optional(v.string()),
  twitterDescription: v.optional(v.string()),
  twitterImage: v.optional(v.string()),
  schemaType: v.optional(v.string()),
  schemaArticleType: v.optional(v.string()),
  seoScore: v.optional(v.number()),
  readabilityScore: v.optional(v.number()),
  cornerstone: v.optional(v.boolean()),
};

/**
 * Args for the updateGlobal mutation.
 */
export const updateGlobalArgs = {
  key: settingsKeyValidator,
  value: v.string(), // JSON-encoded setting object
};

/**
 * Args for the updateRobots mutation.
 */
export const updateRobotsArgs = {
  customRules: v.optional(v.string()),
  siteNoindex: v.optional(v.boolean()),
  blockAiBots: v.optional(v.boolean()),
};

/**
 * Args for the getPostSeo query.
 */
export const getPostSeoArgs = {
  postId: v.id("posts"),
};

/**
 * Args for the getSettings query.
 */
export const getSettingsArgs = {
  key: v.optional(settingsKeyValidator),
};

/**
 * Args for the getRobotsTxt query (public, no args).
 */
export const getRobotsTxtArgs = {};

/**
 * Args for the getSeoOverview query (admin only, no args).
 */
export const getSeoOverviewArgs = {};

// ─── Validation Helpers ─────────────────────────────────────────────────────

/**
 * Validates a URL string is a valid absolute URL.
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates a Schema.org article type string.
 */
export function isValidArticleType(type: string): type is ArticleType {
  return (VALID_ARTICLE_TYPES as readonly string[]).includes(type);
}

/**
 * Validates a Schema.org page type string.
 */
export function isValidPageType(type: string): type is PageType {
  return (VALID_PAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Validates an SEO/readability score is an integer between 0-100.
 */
export function isValidScore(score: number): boolean {
  return Number.isInteger(score) && score >= 0 && score <= 100;
}
