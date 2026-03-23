/**
 * SEO System - Core Helper Functions
 *
 * Provides three essential helper functions for SEO data resolution:
 *
 *   1. `resolvePostSeo` - Applies the fallback chain to resolve per-post SEO
 *      fields from custom overrides, title templates, post content, and global
 *      defaults. This is the core rendering pipeline for `<head>` meta tags.
 *
 *   2. `applyTemplate` - Resolves Yoast-compatible template variable syntax
 *      (e.g., `%%title%% %%sep%% %%sitename%%`) into concrete strings.
 *
 *   3. `buildJsonLd` - Constructs the Schema.org JSON-LD `@graph` array for
 *      a given post/page, including WebSite, Organization/Person, Article/WebPage,
 *      and BreadcrumbList structured data.
 *
 * These functions are pure (no side effects, no database access) and operate on
 * pre-fetched data. They are used by:
 *   - Website SSR route loaders (for meta tag rendering)
 *   - Admin SEO metabox (for SERP preview)
 *   - Internal queries (for SEO overview aggregation)
 *
 * Usage:
 *   import { resolvePostSeo, applyTemplate, buildJsonLd } from "../helpers/seo";
 */

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Raw per-post SEO data as read from postMeta rows.
 * All fields are nullable (unset fields use defaults/templates).
 */
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

/**
 * Global SEO settings, parsed from seoSettings rows.
 */
export interface SeoSettings {
  titles: SeoTitleSettings;
  social: SeoSocialSettings;
  robots: SeoRobotsSettings;
  schema: SeoSchemaSettings;
  breadcrumbs: SeoBreadcrumbSettings;
  verification: SeoVerificationSettings;
  advanced: SeoAdvancedSettings;
}

export interface SeoTitleSettings {
  separator: string;
  siteTitle: string;
  tagline: string;
  homepageTitle: string;
  homepageDescription: string;
  postTitleTemplate: string;
  pageTitleTemplate: string;
  categoryTitleTemplate: string;
  tagTitleTemplate: string;
  authorTitleTemplate: string;
  searchTitleTemplate: string;
  notFoundTitleTemplate: string;
  dateArchiveTitleTemplate: string;
  postNoindex: boolean;
  pageNoindex: boolean;
  categoryNoindex: boolean;
  tagNoindex: boolean;
  authorArchiveNoindex: boolean;
  dateArchiveNoindex: boolean;
}

export interface SeoSocialSettings {
  organizationName: string;
  organizationLogo: string;
  facebookUrl: string;
  twitterUsername: string;
  instagramUrl: string;
  linkedinUrl: string;
  youtubeUrl: string;
  pinterestUrl: string;
  defaultOgImage: string;
  twitterCardType: "summary" | "summary_large_image";
  facebookAppId: string;
}

export interface SeoRobotsSettings {
  customRules: string;
  siteNoindex: boolean;
  blockAiBots: boolean;
}

export interface SeoSchemaSettings {
  representType: "organization" | "person";
  organizationName: string;
  organizationLogoUrl: string;
  personName: string;
  personImageUrl: string;
  defaultArticleType: "Article" | "BlogPosting" | "NewsArticle" | "TechArticle";
  defaultPageType: "WebPage" | "AboutPage" | "ContactPage" | "FAQPage" | "CollectionPage" | "ItemPage" | "ProfilePage" | "SearchResultsPage" | "CheckoutPage";
  sitelinksSearchBox: boolean;
}

export interface SeoBreadcrumbSettings {
  enabled: boolean;
  separator: string;
  homeAnchorText: string;
  showBlogPage: boolean;
  boldLastItem: boolean;
}

export interface SeoVerificationSettings {
  googleSiteVerification: string;
  bingSiteVerification: string;
  pinterestVerification: string;
  yandexVerification: string;
}

export interface SeoAdvancedSettings {
  stripCategoryBase: boolean;
  redirectAttachmentUrls: boolean;
  cleanPermalinkFragments: boolean;
  nofollowExternalLinks: boolean;
  openExternalLinksNewTab: boolean;
}

/**
 * Fully resolved SEO data ready for rendering in `<head>`.
 */
export interface ResolvedSeoData {
  title: string;
  description: string;
  canonical: string;
  noindex: boolean;
  nofollow: boolean;
  robots: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string | null;
  ogType: string;
  ogUrl: string;
  ogSiteName: string;
  twitterCard: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string | null;
  twitterSite: string | null;
  schemaType: string;
  schemaArticleType: string | null;
  cornerstone: boolean;
  focusKeyphrase: string | null;
  seoScore: number | null;
  readabilityScore: number | null;
}

/**
 * Minimal post data needed for SEO resolution.
 */
export interface PostForSeo {
  title: string;
  slug: string;
  type: "post" | "page";
  content?: string | null;
  excerpt?: string | null;
  featuredImageUrl?: string | null;
  publishedAt?: number | null;
  updatedAt: number;
}

/**
 * Author information for JSON-LD generation.
 */
export interface AuthorInfo {
  name: string;
  url: string;
  imageUrl?: string;
}

// ─── Default Settings ───────────────────────────────────────────────────────

export const DEFAULT_TITLE_SETTINGS: SeoTitleSettings = {
  separator: "|",
  siteTitle: "",
  tagline: "",
  homepageTitle: "%%sitename%% %%sep%% %%tagline%%",
  homepageDescription: "",
  postTitleTemplate: "%%title%% %%sep%% %%sitename%%",
  pageTitleTemplate: "%%title%% %%sep%% %%sitename%%",
  categoryTitleTemplate: "%%term_title%% Archives %%sep%% %%sitename%%",
  tagTitleTemplate: "%%term_title%% Archives %%sep%% %%sitename%%",
  authorTitleTemplate: "%%name%% - Author %%sep%% %%sitename%%",
  searchTitleTemplate: "Search Results for %%searchphrase%% %%sep%% %%sitename%%",
  notFoundTitleTemplate: "Page not found %%sep%% %%sitename%%",
  dateArchiveTitleTemplate: "Archives %%sep%% %%sitename%%",
  postNoindex: false,
  pageNoindex: false,
  categoryNoindex: false,
  tagNoindex: false,
  authorArchiveNoindex: false,
  dateArchiveNoindex: true,
};

export const DEFAULT_SOCIAL_SETTINGS: SeoSocialSettings = {
  organizationName: "",
  organizationLogo: "",
  facebookUrl: "",
  twitterUsername: "",
  instagramUrl: "",
  linkedinUrl: "",
  youtubeUrl: "",
  pinterestUrl: "",
  defaultOgImage: "",
  twitterCardType: "summary_large_image",
  facebookAppId: "",
};

export const DEFAULT_ROBOTS_SETTINGS: SeoRobotsSettings = {
  customRules: "",
  siteNoindex: false,
  blockAiBots: false,
};

export const DEFAULT_SCHEMA_SETTINGS: SeoSchemaSettings = {
  representType: "organization",
  organizationName: "",
  organizationLogoUrl: "",
  personName: "",
  personImageUrl: "",
  defaultArticleType: "Article",
  defaultPageType: "WebPage",
  sitelinksSearchBox: true,
};

export const DEFAULT_BREADCRUMB_SETTINGS: SeoBreadcrumbSettings = {
  enabled: true,
  separator: ">",
  homeAnchorText: "Home",
  showBlogPage: true,
  boldLastItem: true,
};

export const DEFAULT_VERIFICATION_SETTINGS: SeoVerificationSettings = {
  googleSiteVerification: "",
  bingSiteVerification: "",
  pinterestVerification: "",
  yandexVerification: "",
};

export const DEFAULT_ADVANCED_SETTINGS: SeoAdvancedSettings = {
  stripCategoryBase: false,
  redirectAttachmentUrls: true,
  cleanPermalinkFragments: true,
  nofollowExternalLinks: false,
  openExternalLinksNewTab: false,
};

export const DEFAULT_SEO_SETTINGS: SeoSettings = {
  titles: DEFAULT_TITLE_SETTINGS,
  social: DEFAULT_SOCIAL_SETTINGS,
  robots: DEFAULT_ROBOTS_SETTINGS,
  schema: DEFAULT_SCHEMA_SETTINGS,
  breadcrumbs: DEFAULT_BREADCRUMB_SETTINGS,
  verification: DEFAULT_VERIFICATION_SETTINGS,
  advanced: DEFAULT_ADVANCED_SETTINGS,
};

// ─── Empty PostSeoData ──────────────────────────────────────────────────────

export const EMPTY_POST_SEO: PostSeoData = {
  seoTitle: null,
  seoDescription: null,
  focusKeyphrase: null,
  additionalKeyphrases: [],
  canonical: null,
  noindex: null,
  nofollow: null,
  ogTitle: null,
  ogDescription: null,
  ogImage: null,
  twitterTitle: null,
  twitterDescription: null,
  twitterImage: null,
  schemaType: null,
  schemaArticleType: null,
  seoScore: null,
  readabilityScore: null,
  cornerstone: false,
};

// ─── Template Variable Resolution ───────────────────────────────────────────

/**
 * Resolve Yoast-compatible template variables in a title/description template.
 *
 * Supported variables:
 *   %%title%%         - Post/page title
 *   %%sitename%%      - Site name
 *   %%sep%%           - Title separator
 *   %%excerpt%%       - Post excerpt
 *   %%date%%          - Post published date (locale string)
 *   %%modified%%      - Post modified date (locale string)
 *   %%name%%          - Author display name
 *   %%term_title%%    - Taxonomy term name
 *   %%searchphrase%%  - Search query
 *   %%page%%          - Page number (pagination)
 *   %%currentyear%%   - Current year (4-digit)
 *   %%currentmonth%%  - Current month name
 *   %%tagline%%       - Site tagline
 *
 * Unresolved variables are removed. Multiple spaces are collapsed.
 *
 * @param template - The template string with %%variable%% placeholders
 * @param variables - Record of variable names (without %% delimiters) to values
 * @returns Resolved string with variables replaced, or null if template is undefined/empty
 */
export function applyTemplate(
  template: string | undefined | null,
  variables: Record<string, string>,
): string | null {
  if (!template || template.trim() === "") return null;

  let result = template;

  // Replace all known variables
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`%%${key}%%`, "g");
    result = result.replace(pattern, value);
  }

  // Remove any unresolved %%variable%% patterns
  result = result.replace(/%%[a-z_]+%%/gi, "");

  // Collapse multiple spaces and trim
  result = result.replace(/\s+/g, " ").trim();

  // Remove leading/trailing separators that result from empty variable removal
  const sep = variables.sep ?? "|";
  result = result.replace(new RegExp(`^\\s*${escapeRegex(sep)}\\s*`), "");
  result = result.replace(new RegExp(`\\s*${escapeRegex(sep)}\\s*$`), "");

  return result || null;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract the first N characters of plain text from block editor JSON content.
 * Strips HTML tags and returns plain text.
 */
export function extractPlainText(
  content: string | null | undefined,
  maxLength: number = 160,
): string {
  if (!content) return "";

  // Try parsing as JSON (block editor format)
  let text = content;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      // Block editor format: array of blocks
      text = parsed
        .map((block: { text?: string; content?: string }) => block.text || block.content || "")
        .join(" ");
    } else if (typeof parsed === "object" && parsed.content) {
      text = typeof parsed.content === "string" ? parsed.content : "";
    }
  } catch {
    // Not JSON - treat as raw text/HTML
  }

  // Strip HTML tags
  text = text.replace(/<[^>]*>/g, "");

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse whitespace and trim
  text = text.replace(/\s+/g, " ").trim();

  // Truncate to maxLength, break at word boundary
  if (text.length > maxLength) {
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");
    text = lastSpace > maxLength * 0.7 ? truncated.substring(0, lastSpace) : truncated;
    // Don't add ellipsis for meta descriptions - search engines handle truncation
  }

  return text;
}

// ─── resolvePostSeo ─────────────────────────────────────────────────────────

/**
 * Resolve all SEO fields for a post/page using the fallback chain.
 *
 * Resolution order for each field:
 *   title:        custom _seo_title -> title template -> "{post.title} {sep} {siteName}"
 *   description:  custom _seo_description -> post.excerpt -> first 160 chars of content
 *   canonical:    custom _seo_canonical -> "{siteUrl}/blog/{post.slug}"
 *   noindex:      custom _seo_noindex -> content type default -> false
 *   ogTitle:      custom _seo_og_title -> resolved title -> post.title
 *   ogImage:      custom _seo_og_image -> post.featuredImageUrl -> defaultOgImage -> null
 *   twitterTitle: custom _seo_twitter_title -> resolved ogTitle -> resolved title
 *   etc.
 *
 * @param post - Minimal post data for fallback resolution
 * @param postSeo - Raw SEO metadata from postMeta rows
 * @param globalSettings - Parsed global SEO settings
 * @param siteUrl - The site's base URL (e.g., "https://example.com")
 * @returns Fully resolved SEO data ready for rendering
 */
export function resolvePostSeo(
  post: PostForSeo,
  postSeo: PostSeoData,
  globalSettings: SeoSettings,
  siteUrl: string,
): ResolvedSeoData {
  const { titles, social, schema } = globalSettings;
  const sep = titles.separator || "|";
  const siteName = titles.siteTitle || "Site";

  // Build template variables
  const templateVars: Record<string, string> = {
    title: post.title,
    sitename: siteName,
    sep,
    excerpt: post.excerpt || "",
    tagline: titles.tagline || "",
    currentyear: new Date().getFullYear().toString(),
    currentmonth: new Date().toLocaleString("en-US", { month: "long" }),
  };

  if (post.publishedAt) {
    templateVars.date = new Date(post.publishedAt).toLocaleDateString();
  }
  templateVars.modified = new Date(post.updatedAt).toLocaleDateString();

  // ── Title Resolution ──────────────────────────────────────────────────
  const titleTemplate = post.type === "post"
    ? titles.postTitleTemplate
    : titles.pageTitleTemplate;

  const resolvedTitle =
    postSeo.seoTitle ||
    applyTemplate(titleTemplate, templateVars) ||
    `${post.title} ${sep} ${siteName}`;

  // ── Description Resolution ────────────────────────────────────────────
  const resolvedDescription =
    postSeo.seoDescription ||
    post.excerpt ||
    extractPlainText(post.content, 160) ||
    "";

  // ── Canonical URL Resolution ──────────────────────────────────────────
  const defaultPath = post.type === "post" ? `/blog/${post.slug}` : `/${post.slug}`;
  const resolvedCanonical = postSeo.canonical || `${siteUrl}${defaultPath}`;

  // ── Noindex / Nofollow Resolution ─────────────────────────────────────
  const typeNoindex = post.type === "post" ? titles.postNoindex : titles.pageNoindex;
  const resolvedNoindex = postSeo.noindex ?? typeNoindex ?? false;
  const resolvedNofollow = postSeo.nofollow ?? false;

  // Build robots directive string
  const robotsParts: string[] = [];
  if (resolvedNoindex) robotsParts.push("noindex");
  else robotsParts.push("index");
  if (resolvedNofollow) robotsParts.push("nofollow");
  else robotsParts.push("follow");
  const robotsString = robotsParts.join(", ");

  // ── OG Resolution ────────────────────────────────────────────────────
  const resolvedOgTitle = postSeo.ogTitle || resolvedTitle;
  const resolvedOgDescription = postSeo.ogDescription || resolvedDescription;
  const resolvedOgImage =
    postSeo.ogImage ||
    post.featuredImageUrl ||
    (social.defaultOgImage || null);
  const resolvedOgType = post.type === "post" ? "article" : "website";
  const resolvedOgUrl = resolvedCanonical;

  // ── Twitter Resolution ───────────────────────────────────────────────
  const resolvedTwitterTitle = postSeo.twitterTitle || resolvedOgTitle;
  const resolvedTwitterDescription = postSeo.twitterDescription || resolvedOgDescription;
  const resolvedTwitterImage = postSeo.twitterImage || resolvedOgImage;
  const resolvedTwitterSite = social.twitterUsername
    ? `@${social.twitterUsername}`
    : null;

  // ── Schema Type Resolution ───────────────────────────────────────────
  const resolvedSchemaType =
    postSeo.schemaType ||
    (post.type === "post" ? schema.defaultArticleType : schema.defaultPageType) ||
    (post.type === "post" ? "Article" : "WebPage");

  const resolvedSchemaArticleType = post.type === "post"
    ? (postSeo.schemaArticleType || schema.defaultArticleType || "Article")
    : null;

  return {
    title: resolvedTitle,
    description: resolvedDescription,
    canonical: resolvedCanonical,
    noindex: resolvedNoindex,
    nofollow: resolvedNofollow,
    robots: robotsString,
    ogTitle: resolvedOgTitle,
    ogDescription: resolvedOgDescription,
    ogImage: resolvedOgImage,
    ogType: resolvedOgType,
    ogUrl: resolvedOgUrl,
    ogSiteName: siteName,
    twitterCard: social.twitterCardType || "summary_large_image",
    twitterTitle: resolvedTwitterTitle,
    twitterDescription: resolvedTwitterDescription,
    twitterImage: resolvedTwitterImage,
    twitterSite: resolvedTwitterSite,
    schemaType: resolvedSchemaType,
    schemaArticleType: resolvedSchemaArticleType,
    cornerstone: postSeo.cornerstone,
    focusKeyphrase: postSeo.focusKeyphrase,
    seoScore: postSeo.seoScore,
    readabilityScore: postSeo.readabilityScore,
  };
}

// ─── buildJsonLd ────────────────────────────────────────────────────────────

/**
 * Build the Schema.org JSON-LD `@graph` array for a post or page.
 *
 * Generates a structured data graph containing:
 *   1. WebSite schema (always) - with optional SearchAction for sitelinks
 *   2. Organization or Person schema (based on schema settings)
 *   3. Article/BlogPosting or WebPage schema (based on content type)
 *   4. BreadcrumbList schema
 *
 * The returned array should be wrapped in:
 *   { "@context": "https://schema.org", "@graph": [...] }
 *
 * @param post - Minimal post data
 * @param resolved - Resolved SEO data (from resolvePostSeo)
 * @param globalSettings - Global SEO settings
 * @param siteUrl - Site base URL
 * @param authorInfo - Author name, URL, and optional image
 * @returns Array of Schema.org JSON-LD objects for the @graph
 */
export function buildJsonLd(
  post: PostForSeo,
  resolved: ResolvedSeoData,
  globalSettings: SeoSettings,
  siteUrl: string,
  authorInfo: AuthorInfo,
): object[] {
  const { schema: schemaSettings, social } = globalSettings;
  const graph: object[] = [];

  // ── 1. WebSite Schema ─────────────────────────────────────────────────
  const webSite: Record<string, unknown> = {
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    url: siteUrl,
    name: resolved.ogSiteName,
    description: globalSettings.titles.tagline || "",
    inLanguage: "en-US",
  };

  if (schemaSettings.sitelinksSearchBox) {
    webSite.potentialAction = {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    };
  }

  graph.push(webSite);

  // ── 2. Organization or Person Schema ──────────────────────────────────
  if (schemaSettings.representType === "organization") {
    const org: Record<string, unknown> = {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: schemaSettings.organizationName || resolved.ogSiteName,
      url: siteUrl,
    };
    if (schemaSettings.organizationLogoUrl) {
      org.logo = {
        "@type": "ImageObject",
        "@id": `${siteUrl}/#logo`,
        url: schemaSettings.organizationLogoUrl,
        contentUrl: schemaSettings.organizationLogoUrl,
      };
      org.image = { "@id": `${siteUrl}/#logo` };
    }
    // Add social profiles as sameAs
    const sameAs = [
      social.facebookUrl,
      social.twitterUsername ? `https://twitter.com/${social.twitterUsername}` : "",
      social.instagramUrl,
      social.linkedinUrl,
      social.youtubeUrl,
      social.pinterestUrl,
    ].filter(Boolean);
    if (sameAs.length > 0) {
      org.sameAs = sameAs;
    }
    graph.push(org);
  } else {
    const person: Record<string, unknown> = {
      "@type": "Person",
      "@id": `${siteUrl}/#person`,
      name: schemaSettings.personName || resolved.ogSiteName,
      url: siteUrl,
    };
    if (schemaSettings.personImageUrl) {
      person.image = {
        "@type": "ImageObject",
        url: schemaSettings.personImageUrl,
      };
    }
    graph.push(person);
  }

  // ── 3. Article/WebPage Schema ─────────────────────────────────────────
  const publisherRef = schemaSettings.representType === "organization"
    ? { "@id": `${siteUrl}/#organization` }
    : { "@id": `${siteUrl}/#person` };

  if (post.type === "post") {
    const article: Record<string, unknown> = {
      "@type": resolved.schemaArticleType || "Article",
      "@id": `${resolved.canonical}#article`,
      isPartOf: { "@id": `${resolved.canonical}#webpage` },
      headline: resolved.title,
      description: resolved.description,
      url: resolved.canonical,
      mainEntityOfPage: { "@id": `${resolved.canonical}#webpage` },
      author: {
        "@type": "Person",
        name: authorInfo.name,
        url: authorInfo.url,
      },
      publisher: publisherRef,
      inLanguage: "en-US",
    };

    if (post.publishedAt) {
      article.datePublished = new Date(post.publishedAt).toISOString();
    }
    article.dateModified = new Date(post.updatedAt).toISOString();

    if (resolved.ogImage) {
      article.image = {
        "@type": "ImageObject",
        url: resolved.ogImage,
      };
    }

    if (authorInfo.imageUrl) {
      (article.author as Record<string, unknown>).image = {
        "@type": "ImageObject",
        url: authorInfo.imageUrl,
      };
    }

    graph.push(article);
  }

  // WebPage schema (for both posts and pages)
  const webPage: Record<string, unknown> = {
    "@type": resolved.schemaType === "Article" || resolved.schemaType === "BlogPosting"
      ? "WebPage"
      : resolved.schemaType,
    "@id": `${resolved.canonical}#webpage`,
    url: resolved.canonical,
    name: resolved.title,
    description: resolved.description,
    isPartOf: { "@id": `${siteUrl}/#website` },
    inLanguage: "en-US",
  };

  if (post.publishedAt) {
    webPage.datePublished = new Date(post.publishedAt).toISOString();
  }
  webPage.dateModified = new Date(post.updatedAt).toISOString();

  if (post.type === "post") {
    webPage.primaryImageOfPage = resolved.ogImage
      ? { "@type": "ImageObject", url: resolved.ogImage }
      : undefined;
  }

  graph.push(webPage);

  // ── 4. BreadcrumbList Schema ──────────────────────────────────────────
  if (globalSettings.breadcrumbs.enabled) {
    const breadcrumbItems: object[] = [
      {
        "@type": "ListItem",
        position: 1,
        name: globalSettings.breadcrumbs.homeAnchorText || "Home",
        item: siteUrl,
      },
    ];

    let position = 2;

    if (post.type === "post" && globalSettings.breadcrumbs.showBlogPage) {
      breadcrumbItems.push({
        "@type": "ListItem",
        position,
        name: "Blog",
        item: `${siteUrl}/blog`,
      });
      position++;
    }

    breadcrumbItems.push({
      "@type": "ListItem",
      position,
      name: post.title,
      item: resolved.canonical,
    });

    graph.push({
      "@type": "BreadcrumbList",
      "@id": `${resolved.canonical}#breadcrumb`,
      itemListElement: breadcrumbItems,
    });
  }

  return graph;
}

// ─── Utility: Parse seoSettings row value ───────────────────────────────────

/**
 * Safely parse a JSON-encoded seoSettings value and merge with defaults.
 *
 * @param value - JSON string from the seoSettings table
 * @param defaults - Default values to merge with
 * @returns Parsed and merged settings object
 */
export function parseSeoSettingsValue<T extends object>(
  value: string | undefined | null,
  defaults: T,
): T {
  if (!value) return { ...defaults };

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") {
      return { ...defaults };
    }
    return { ...defaults, ...(parsed as Partial<T>) };
  } catch {
    return { ...defaults };
  }
}

/**
 * Parse all seoSettings rows into a complete SeoSettings object.
 *
 * @param rows - Array of { key, value } rows from the seoSettings table
 * @returns Complete SeoSettings with defaults merged
 */
export function parseSeoSettings(
  rows: Array<{ key: string; value: string }>,
): SeoSettings {
  const rowMap = new Map(rows.map((r) => [r.key, r.value]));

  return {
    titles: parseSeoSettingsValue(rowMap.get("titles"), DEFAULT_TITLE_SETTINGS),
    social: parseSeoSettingsValue(rowMap.get("social"), DEFAULT_SOCIAL_SETTINGS),
    robots: parseSeoSettingsValue(rowMap.get("robots"), DEFAULT_ROBOTS_SETTINGS),
    schema: parseSeoSettingsValue(rowMap.get("schema"), DEFAULT_SCHEMA_SETTINGS),
    breadcrumbs: parseSeoSettingsValue(rowMap.get("breadcrumbs"), DEFAULT_BREADCRUMB_SETTINGS),
    verification: parseSeoSettingsValue(rowMap.get("verification"), DEFAULT_VERIFICATION_SETTINGS),
    advanced: parseSeoSettingsValue(rowMap.get("advanced"), DEFAULT_ADVANCED_SETTINGS),
  };
}

/**
 * Parse postMeta rows (filtered to _seo_* keys) into a PostSeoData object.
 *
 * @param rows - Array of { key, value } from postMeta, pre-filtered to _seo_ prefix
 * @returns Structured PostSeoData with all fields populated
 */
export function parsePostSeoFromMeta(
  rows: Array<{ key: string; value: string }>,
): PostSeoData {
  const map = new Map(rows.map((r) => [r.key, r.value]));

  let additionalKeyphrases: string[] = [];
  const additionalRaw = map.get("_seo_additional_keyphrases");
  if (additionalRaw) {
    try {
      const parsed = JSON.parse(additionalRaw);
      if (Array.isArray(parsed)) {
        additionalKeyphrases = parsed;
      }
    } catch {
      // Invalid JSON, leave empty
    }
  }

  return {
    seoTitle: map.get("_seo_title") ?? null,
    seoDescription: map.get("_seo_description") ?? null,
    focusKeyphrase: map.get("_seo_focus_keyphrase") ?? null,
    additionalKeyphrases,
    canonical: map.get("_seo_canonical") ?? null,
    noindex: map.has("_seo_noindex") ? map.get("_seo_noindex") === "true" : null,
    nofollow: map.has("_seo_nofollow") ? map.get("_seo_nofollow") === "true" : null,
    ogTitle: map.get("_seo_og_title") ?? null,
    ogDescription: map.get("_seo_og_description") ?? null,
    ogImage: map.get("_seo_og_image") ?? null,
    twitterTitle: map.get("_seo_twitter_title") ?? null,
    twitterDescription: map.get("_seo_twitter_description") ?? null,
    twitterImage: map.get("_seo_twitter_image") ?? null,
    schemaType: map.get("_seo_schema_type") ?? null,
    schemaArticleType: map.get("_seo_schema_article_type") ?? null,
    seoScore: map.has("_seo_score") ? Number(map.get("_seo_score")) : null,
    readabilityScore: map.has("_seo_readability_score") ? Number(map.get("_seo_readability_score")) : null,
    cornerstone: map.get("_seo_cornerstone") === "true",
  };
}
