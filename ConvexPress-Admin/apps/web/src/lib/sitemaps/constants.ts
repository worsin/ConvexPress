/**
 * Sitemap System - Client-Side Constants
 *
 * Dropdown options, default values, validation rules, and display labels
 * for the sitemap settings admin UI.
 */

import type { SitemapChangefreq, ContentSitemapType, SitemapSettings } from "./types";

// ─── Content Type Labels ────────────────────────────────────────────────────

export const CONTENT_TYPE_LABELS: Record<ContentSitemapType, string> = {
  posts: "Posts",
  pages: "Pages",
  categories: "Categories",
  tags: "Tags",
  authors: "Authors",
};

export const CONTENT_TYPE_DESCRIPTIONS: Record<ContentSitemapType, string> = {
  posts: "Include published blog posts in the sitemap",
  pages: "Include published static pages in the sitemap",
  categories: "Include category archive pages in the sitemap",
  tags: "Include tag archive pages in the sitemap",
  authors: "Include author archive pages in the sitemap",
};

export const CONTENT_SITEMAP_TYPES: ContentSitemapType[] = [
  "posts",
  "pages",
  "categories",
  "tags",
  "authors",
];

// ─── Changefreq Options ─────────────────────────────────────────────────────

export const CHANGEFREQ_OPTIONS: Array<{ label: string; value: SitemapChangefreq }> = [
  { label: "Always", value: "always" },
  { label: "Hourly", value: "hourly" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Yearly", value: "yearly" },
  { label: "Never", value: "never" },
];

// ─── Default Settings ───────────────────────────────────────────────────────

export const DEFAULT_SITEMAP_SETTINGS: SitemapSettings = {
  enabled: true,
  include_posts: true,
  include_pages: true,
  include_categories: true,
  include_tags: false,
  include_authors: false,
  max_urls_per_sitemap: 1000,
  changefreq_posts: "weekly",
  changefreq_pages: "monthly",
  changefreq_categories: "weekly",
  changefreq_tags: "weekly",
  changefreq_authors: "monthly",
  changefreq_homepage: "daily",
  priority_homepage: 1.0,
  priority_posts: 0.6,
  priority_pages: 0.6,
  priority_categories: 0.4,
  priority_tags: 0.3,
  priority_authors: 0.3,
  ping_google: true,
  ping_bing: true,
  auto_regenerate: true,
  regeneration_debounce_ms: 30000,
};

// ─── Validation Rules ───────────────────────────────────────────────────────

export const VALIDATION = {
  MAX_URLS_MIN: 1,
  MAX_URLS_MAX: 50000,
  PRIORITY_MIN: 0.0,
  PRIORITY_MAX: 1.0,
  PRIORITY_STEP: 0.1,
  DEBOUNCE_MIN_MS: 5000,
  DEBOUNCE_MAX_MS: 300000,
} as const;

// ─── Status Display ─────────────────────────────────────────────────────────

export const STATUS_LABELS = {
  active: "Active",
  inactive: "Inactive",
  stale: "Stale",
  generating: "Generating...",
  noData: "No sitemap generated",
} as const;

export const TRIGGER_LABELS: Record<string, string> = {
  content_change: "Content Change",
  manual: "Manual",
  scheduled: "Scheduled",
  settings_change: "Settings Change",
};

// ─── Debounce Presets ───────────────────────────────────────────────────────

export const DEBOUNCE_PRESETS: Array<{ label: string; value: number }> = [
  { label: "5 seconds", value: 5000 },
  { label: "15 seconds", value: 15000 },
  { label: "30 seconds (default)", value: 30000 },
  { label: "1 minute", value: 60000 },
  { label: "2 minutes", value: 120000 },
  { label: "5 minutes", value: 300000 },
];
