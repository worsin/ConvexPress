/**
 * SEO System - Constants
 *
 * Tab definitions, schema type arrays, separator presets,
 * template variable definitions, and score thresholds.
 */

import type {
  SeoSettingsTabDef,
  SeoMetaboxTabDef,
  ScoreThresholds,
} from "./types";

// ─── Settings Tabs ───────────────────────────────────────────────────────────

export const SEO_SETTINGS_TABS: SeoSettingsTabDef[] = [
  { id: "general", label: "General", description: "Title separator, site title, homepage defaults" },
  { id: "content-types", label: "Content Types", description: "Title templates and indexing defaults per content type" },
  { id: "social", label: "Social", description: "Organization info, social profiles, Open Graph defaults" },
  { id: "schema", label: "Schema", description: "Schema.org structured data configuration" },
  { id: "breadcrumbs", label: "Breadcrumbs", description: "Breadcrumb trail display settings" },
  { id: "verification", label: "Verification", description: "Search engine verification codes" },
  { id: "robots", label: "Robots", description: "Robots.txt configuration and search engine access" },
  { id: "advanced", label: "Advanced", description: "URL cleanup and link behavior settings" },
];

// ─── Metabox Tabs ────────────────────────────────────────────────────────────

export const SEO_METABOX_TABS: SeoMetaboxTabDef[] = [
  { id: "seo", label: "SEO" },
  { id: "readability", label: "Readability" },
  { id: "schema", label: "Schema" },
  { id: "social", label: "Social" },
];

// ─── Schema.org Types ────────────────────────────────────────────────────────

export const SCHEMA_ARTICLE_TYPES = [
  { value: "Article", label: "Article" },
  { value: "BlogPosting", label: "Blog Posting" },
  { value: "NewsArticle", label: "News Article" },
  { value: "TechArticle", label: "Tech Article" },
  { value: "ScholarlyArticle", label: "Scholarly Article" },
] as const;

export const SCHEMA_PAGE_TYPES = [
  { value: "WebPage", label: "Web Page" },
  { value: "AboutPage", label: "About Page" },
  { value: "ContactPage", label: "Contact Page" },
  { value: "FAQPage", label: "FAQ Page" },
  { value: "CollectionPage", label: "Collection Page" },
  { value: "CheckoutPage", label: "Checkout Page" },
  { value: "ProfilePage", label: "Profile Page" },
  { value: "SearchResultsPage", label: "Search Results Page" },
  { value: "ItemPage", label: "Item Page" },
] as const;

// ─── Title Separator Presets ─────────────────────────────────────────────────

export const SEPARATOR_OPTIONS = [
  { value: "|", label: "|" },
  { value: "-", label: "-" },
  { value: "–", label: "\u2013" },
  { value: "—", label: "\u2014" },
  { value: ">", label: ">" },
  { value: ">>", label: ">>" },
  { value: "//", label: "//" },
  { value: "\u00b7", label: "\u00b7" },
  { value: "\u2022", label: "\u2022" },
] as const;

// ─── Template Variables ──────────────────────────────────────────────────────

export const TEMPLATE_VARIABLES = [
  { variable: "%%title%%", label: "Title", description: "Post/page title" },
  { variable: "%%sitename%%", label: "Site Name", description: "Site name from settings" },
  { variable: "%%sep%%", label: "Separator", description: "Title separator character" },
  { variable: "%%excerpt%%", label: "Excerpt", description: "Post excerpt" },
  { variable: "%%date%%", label: "Date", description: "Post published date" },
  { variable: "%%modified%%", label: "Modified", description: "Post modified date" },
  { variable: "%%name%%", label: "Author", description: "Author display name" },
  { variable: "%%term_title%%", label: "Term Title", description: "Taxonomy term name" },
  { variable: "%%searchphrase%%", label: "Search Phrase", description: "Search query" },
  { variable: "%%page%%", label: "Page", description: "Page number (pagination)" },
  { variable: "%%currentyear%%", label: "Current Year", description: "Current year" },
  { variable: "%%currentmonth%%", label: "Current Month", description: "Current month name" },
  { variable: "%%tagline%%", label: "Tagline", description: "Site tagline" },
] as const;

// ─── Score Thresholds ────────────────────────────────────────────────────────

export const SCORE_THRESHOLDS: ScoreThresholds = {
  good: 70,
  ok: 40,
};

// ─── Character Limits ────────────────────────────────────────────────────────

export const SEO_TITLE_MAX = 200;
export const SEO_TITLE_RECOMMENDED_MIN = 50;
export const SEO_TITLE_RECOMMENDED_MAX = 60;

export const META_DESCRIPTION_MAX = 500;
export const META_DESCRIPTION_RECOMMENDED_MIN = 120;
export const META_DESCRIPTION_RECOMMENDED_MAX = 156;

export const FOCUS_KEYPHRASE_MAX = 100;

// ─── Twitter Card Types ──────────────────────────────────────────────────────

export const TWITTER_CARD_TYPES = [
  { value: "summary", label: "Summary" },
  { value: "summary_large_image", label: "Summary with Large Image" },
] as const;

// ─── Content Type Configs ────────────────────────────────────────────────────

export const CONTENT_TYPE_CONFIGS = [
  {
    key: "post" as const,
    label: "Posts",
    templateField: "postTitleTemplate" as const,
    noindexField: "postNoindex" as const,
    defaultTemplate: "%%title%% %%sep%% %%sitename%%",
  },
  {
    key: "page" as const,
    label: "Pages",
    templateField: "pageTitleTemplate" as const,
    noindexField: "pageNoindex" as const,
    defaultTemplate: "%%title%% %%sep%% %%sitename%%",
  },
  {
    key: "category" as const,
    label: "Categories",
    templateField: "categoryTitleTemplate" as const,
    noindexField: "categoryNoindex" as const,
    defaultTemplate: "%%term_title%% Archives %%sep%% %%sitename%%",
  },
  {
    key: "tag" as const,
    label: "Tags",
    templateField: "tagTitleTemplate" as const,
    noindexField: "tagNoindex" as const,
    defaultTemplate: "%%term_title%% Archives %%sep%% %%sitename%%",
  },
  {
    key: "author" as const,
    label: "Author Archives",
    templateField: "authorTitleTemplate" as const,
    noindexField: "authorArchiveNoindex" as const,
    defaultTemplate: "%%name%% - Author %%sep%% %%sitename%%",
  },
  {
    key: "date" as const,
    label: "Date Archives",
    templateField: "dateArchiveTitleTemplate" as const,
    noindexField: "dateArchiveNoindex" as const,
    defaultTemplate: "Archives %%sep%% %%sitename%%",
  },
] as const;
