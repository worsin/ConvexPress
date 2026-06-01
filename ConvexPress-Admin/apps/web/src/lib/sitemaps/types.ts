/**
 * Sitemap System - Client-Side TypeScript Types
 *
 * Type definitions for sitemap data used in the admin frontend.
 * These mirror the backend types from validators.ts and the
 * return types from queries.ts.
 */

// ─── Core Types ─────────────────────────────────────────────────────────────

export type SitemapType =
  | "index"
  | "posts"
  | "pages"
  | "courses"
  | "categories"
  | "tags"
  | "authors";

export type ContentSitemapType = Exclude<SitemapType, "index">;

export type SitemapChangefreq =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export type SitemapTrigger = "content_change" | "manual" | "scheduled" | "settings_change";

// ─── Cache Entry ────────────────────────────────────────────────────────────

export interface SitemapCacheEntry {
  _id: string;
  type: SitemapType;
  page: number;
  xml: string;
  urlCount: number;
  generatedAt: number;
  generationDurationMs: number;
  contentHash: string;
  isStale: boolean;
}

// ─── Status (from getStatus query) ──────────────────────────────────────────

export interface SitemapPerTypeStats {
  urlCount: number;
  pages: number;
  lastGenerated: number | null;
}

export interface SitemapStatus {
  enabled: boolean;
  indexUrl: string | null;
  totalUrls: number;
  perType: Record<SitemapType, SitemapPerTypeStats>;
  lastGenerated: number | null;
  hasStale: boolean;
  recentGenerations: SitemapGenerationLogEntry[];
  recentPings: SitemapPingLogEntry[];
}

// ─── Log Entries ────────────────────────────────────────────────────────────

export interface SitemapGenerationLogEntry {
  _id: string;
  triggeredBy: SitemapTrigger;
  triggeredByUserId?: string;
  triggeredByEvent?: string;
  triggeredByContentId?: string;
  status: "success" | "error";
  sitemapsGenerated: number;
  totalUrls: number;
  durationMs: number;
  errorMessage?: string;
  createdAt: number;
}

export interface SitemapPingLogEntry {
  _id: string;
  engine: "google" | "bing";
  url: string;
  status: "success" | "error";
  httpStatus?: number;
  errorMessage?: string;
  createdAt: number;
}

// ─── Settings ───────────────────────────────────────────────────────────────

export interface SitemapSettings {
  enabled: boolean;
  include_posts: boolean;
  include_pages: boolean;
  include_courses: boolean;
  include_categories: boolean;
  include_tags: boolean;
  include_authors: boolean;
  max_urls_per_sitemap: number;
  changefreq_posts: SitemapChangefreq;
  changefreq_pages: SitemapChangefreq;
  changefreq_courses: SitemapChangefreq;
  changefreq_categories: SitemapChangefreq;
  changefreq_tags: SitemapChangefreq;
  changefreq_authors: SitemapChangefreq;
  changefreq_homepage: SitemapChangefreq;
  priority_homepage: number;
  priority_posts: number;
  priority_pages: number;
  priority_courses: number;
  priority_categories: number;
  priority_tags: number;
  priority_authors: number;
  ping_google: boolean;
  ping_bing: boolean;
  auto_regenerate: boolean;
  regeneration_debounce_ms: number;
}
