/**
 * SEO System - Frontend Types
 *
 * Client-side type definitions for the SEO analysis engine,
 * readability analysis, settings tabs, and UI state.
 */

// ─── Analysis Types ──────────────────────────────────────────────────────────

export type SeoCheckStatus = "good" | "ok" | "poor";

export interface SeoCheckResult {
  id: string;
  label: string;
  status: SeoCheckStatus;
  message: string;
  weight: number;
}

export interface ReadabilityCheckResult {
  id: string;
  label: string;
  status: SeoCheckStatus;
  message: string;
  weight: number;
}

export interface AnalysisResult {
  score: number;
  checks: SeoCheckResult[];
}

export interface ReadabilityAnalysisResult {
  score: number;
  checks: ReadabilityCheckResult[];
}

// ─── Settings Types ──────────────────────────────────────────────────────────

export type SeoSettingsTab =
  | "general"
  | "content-types"
  | "social"
  | "schema"
  | "breadcrumbs"
  | "verification"
  | "robots"
  | "advanced";

export interface SeoSettingsTabDef {
  id: SeoSettingsTab;
  label: string;
  description: string;
}

// ─── Metabox Types ───────────────────────────────────────────────────────────

export type SeoMetaboxTab = "seo" | "readability" | "schema" | "social";

export interface SeoMetaboxTabDef {
  id: SeoMetaboxTab;
  label: string;
}

// ─── Score Types ─────────────────────────────────────────────────────────────

export type ScoreRange = "good" | "ok" | "poor" | "none";

export interface ScoreThresholds {
  good: number;
  ok: number;
}

// ─── Post SEO Data (mirror of backend PostSeoData) ───────────────────────────

export interface PostSeoData {
  seoTitle: string | null;
  seoDescription: string | null;
  focusKeyphrase: string | null;
  additionalKeyphrases: string[];
  canonical: string | null;
  noindex: boolean | null;
  nofollow: boolean | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  twitterTitle: string | null;
  twitterDescription: string | null;
  twitterImage: string | null;
  schemaType: string | null;
  schemaArticleType: string | null;
  seoScore: number | null;
  readabilityScore: number | null;
  cornerstone: boolean;
}

// ─── SEO Overview (from backend getSeoOverview) ──────────────────────────────

export interface SeoRecentPost {
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
}

export interface SeoOverviewData {
  totalPublished: number;
  totalIndexed: number;
  scoreDistribution: {
    good: number;
    ok: number;
    poor: number;
    noData: number;
  };
  issues: {
    missingDescription: number;
    missingKeyphrase: number;
    noindexCount: number;
  };
  cornerstoneCount: number;
  recentPosts: SeoRecentPost[];
}
