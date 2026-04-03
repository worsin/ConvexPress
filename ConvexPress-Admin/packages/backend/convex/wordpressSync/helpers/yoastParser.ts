/**
 * Yoast SEO Parser
 *
 * Maps Yoast SEO meta fields from WordPress to ConvexPress's SEO system.
 *
 * Yoast stores SEO data in postmeta with the `_yoast_wpseo_` prefix.
 * This parser extracts and normalizes that data for ConvexPress.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface YoastData {
  /** SEO title (with template variables resolved if possible) */
  title?: string;
  /** Meta description */
  description?: string;
  /** Focus keyword for content analysis */
  focusKeyword?: string;
  /** Canonical URL */
  canonical?: string;
  /** Open Graph title */
  ogTitle?: string;
  /** Open Graph description */
  ogDescription?: string;
  /** Open Graph image URL */
  ogImage?: string;
  /** Twitter/X title */
  twitterTitle?: string;
  /** Twitter/X description */
  twitterDescription?: string;
  /** Twitter/X image URL */
  twitterImage?: string;
  /** Whether to set noindex */
  noIndex?: boolean;
  /** Whether to set nofollow */
  noFollow?: boolean;
  /** Schema.org page type */
  schemaPageType?: string;
  /** Schema.org article type */
  schemaArticleType?: string;
  /** Primary category ID */
  primaryCategory?: number;
  /** Breadcrumb title */
  breadcrumbTitle?: string;
  /** Meta robots advanced settings */
  robotsAdvanced?: string[];
  /** Estimated reading time in minutes */
  readingTime?: number;
  /** Word count */
  wordCount?: number;
  /** Link count */
  linkCount?: number;
  /** SEO score (0-100) */
  seoScore?: number;
  /** Readability score (0-100) */
  readabilityScore?: number;
}

export interface WPMetaItem {
  key: string;
  value: string | number | boolean | Record<string, unknown>;
}

// ─── Yoast Meta Field Mapping ──────────────────────────────────────────────

const YOAST_FIELD_MAP: Record<string, keyof YoastData> = {
  // Core SEO fields
  "_yoast_wpseo_title": "title",
  "_yoast_wpseo_metadesc": "description",
  "_yoast_wpseo_focuskw": "focusKeyword",
  "_yoast_wpseo_canonical": "canonical",

  // Open Graph fields
  "_yoast_wpseo_opengraph-title": "ogTitle",
  "_yoast_wpseo_opengraph-description": "ogDescription",
  "_yoast_wpseo_opengraph-image": "ogImage",

  // Twitter/X fields
  "_yoast_wpseo_twitter-title": "twitterTitle",
  "_yoast_wpseo_twitter-description": "twitterDescription",
  "_yoast_wpseo_twitter-image": "twitterImage",

  // Robots meta
  "_yoast_wpseo_meta-robots-noindex": "noIndex",
  "_yoast_wpseo_meta-robots-nofollow": "noFollow",
  "_yoast_wpseo_meta-robots-adv": "robotsAdvanced",

  // Schema settings
  "_yoast_wpseo_schema_page_type": "schemaPageType",
  "_yoast_wpseo_schema_article_type": "schemaArticleType",

  // Other settings
  "_yoast_wpseo_primary_category": "primaryCategory",
  "_yoast_wpseo_bctitle": "breadcrumbTitle",

  // Analysis data
  "_yoast_wpseo_estimated-reading-time-minutes": "readingTime",
  "_yoast_wpseo_wordcount": "wordCount",
  "_yoast_wpseo_linkdex": "seoScore",
  "_yoast_wpseo_content_score": "readabilityScore",
};

// ─── Parsing ───────────────────────────────────────────────────────────────

/**
 * Parse Yoast SEO meta fields from WordPress post meta.
 *
 * @param metaItems - Array of meta key/value pairs from WordPress
 * @returns Parsed Yoast SEO data
 */
export function parseYoastMeta(metaItems: WPMetaItem[]): YoastData {
  const yoast: YoastData = {};

  for (const meta of metaItems) {
    const field = YOAST_FIELD_MAP[meta.key];
    if (!field) continue;

    const value = meta.value;

    switch (field) {
      // Boolean fields
      case "noIndex":
      case "noFollow":
        yoast[field] = value === "1" || value === 1 || value === true;
        break;

      // Numeric fields
      case "primaryCategory":
      case "readingTime":
      case "wordCount":
      case "linkCount":
      case "seoScore":
      case "readabilityScore":
        if (typeof value === "number") {
          yoast[field] = value;
        } else if (typeof value === "string") {
          const parsed = parseInt(value, 10);
          if (!isNaN(parsed)) {
            yoast[field] = parsed;
          }
        }
        break;

      // Array fields
      case "robotsAdvanced":
        if (typeof value === "string") {
          yoast[field] = value.split(",").map((s) => s.trim()).filter(Boolean);
        } else if (Array.isArray(value)) {
          yoast[field] = value.map(String);
        }
        break;

      // String fields (default)
      default:
        if (typeof value === "string" && value.trim()) {
          yoast[field] = value;
        }
    }
  }

  return yoast;
}

/**
 * Check if any Yoast SEO fields exist in the meta.
 */
export function hasYoastMeta(metaItems: WPMetaItem[]): boolean {
  for (const meta of metaItems) {
    if (meta.key.startsWith("_yoast_wpseo_")) {
      return true;
    }
  }
  return false;
}

// ─── Conversion to ConvexPress Format ──────────────────────────────────────

/**
 * Convert Yoast data to ConvexPress SEO postMeta format.
 *
 * @param yoast - Parsed Yoast data
 * @param urlMapping - Optional URL mapping for remapping image URLs
 * @returns Array of key-value pairs for postMeta storage
 */
export function yoastToSEOMeta(
  yoast: YoastData,
  urlMapping?: Map<string, string>
): Array<{ key: string; value: string }> {
  const result: Array<{ key: string; value: string }> = [];

  // Map Yoast fields to ConvexPress SEO meta keys
  if (yoast.title) {
    result.push({ key: "_seo_title", value: yoast.title });
  }

  if (yoast.description) {
    result.push({ key: "_seo_description", value: yoast.description });
  }

  if (yoast.canonical) {
    result.push({ key: "_seo_canonical", value: yoast.canonical });
  }

  // Handle OG image with optional URL remapping
  if (yoast.ogImage) {
    const remappedUrl = urlMapping?.get(yoast.ogImage) ?? yoast.ogImage;
    result.push({ key: "_seo_og_image", value: remappedUrl });
  }

  // Robots meta
  if (yoast.noIndex) {
    result.push({ key: "_seo_noindex", value: "true" });
  }

  if (yoast.noFollow) {
    result.push({ key: "_seo_nofollow", value: "true" });
  }

  // Store focus keyword for reference
  if (yoast.focusKeyword) {
    result.push({ key: "_yoast_focus_keyword", value: yoast.focusKeyword });
  }

  // Store full Yoast data as JSON for potential future use
  result.push({
    key: "_yoast_seo_data",
    value: JSON.stringify(yoast),
  });

  return result;
}

/**
 * Extract image URLs from Yoast data for media import.
 */
export function extractYoastImageUrls(yoast: YoastData): string[] {
  const urls: string[] = [];

  if (yoast.ogImage && isImageUrl(yoast.ogImage)) {
    urls.push(yoast.ogImage);
  }

  if (yoast.twitterImage && isImageUrl(yoast.twitterImage)) {
    urls.push(yoast.twitterImage);
  }

  return [...new Set(urls)]; // Deduplicate
}

/**
 * Remap image URLs in Yoast data after media import.
 */
export function remapYoastImageUrls(
  yoast: YoastData,
  urlMapping: Map<string, string>
): YoastData {
  const remapped = { ...yoast };

  if (remapped.ogImage && urlMapping.has(remapped.ogImage)) {
    remapped.ogImage = urlMapping.get(remapped.ogImage)!;
  }

  if (remapped.twitterImage && urlMapping.has(remapped.twitterImage)) {
    remapped.twitterImage = urlMapping.get(remapped.twitterImage)!;
  }

  return remapped;
}

// ─── Template Variable Resolution ──────────────────────────────────────────

/**
 * Yoast SEO title templates can contain variables like:
 *   %%title%%, %%sitename%%, %%sep%%, %%page%%, etc.
 *
 * This function resolves common variables given the post and site context.
 */
export function resolveYoastTemplate(
  template: string,
  context: {
    title?: string;
    siteName?: string;
    separator?: string;
    page?: number;
    excerpt?: string;
    date?: string;
    author?: string;
    category?: string;
  }
): string {
  if (!template) return "";

  let result = template;

  // Common Yoast template variables
  const replacements: Record<string, string> = {
    "%%title%%": context.title ?? "",
    "%%sitename%%": context.siteName ?? "",
    "%%sep%%": context.separator ?? "-",
    "%%page%%": context.page ? String(context.page) : "",
    "%%excerpt%%": context.excerpt ?? "",
    "%%date%%": context.date ?? "",
    "%%author%%": context.author ?? "",
    "%%category%%": context.category ?? "",
    "%%primary_category%%": context.category ?? "",
  };

  for (const [variable, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(escapeRegex(variable), "gi"), value);
  }

  // Clean up remaining unresolved variables
  result = result.replace(/%%[^%]+%%/g, "");

  // Clean up extra separators and whitespace
  result = result
    .replace(/\s+/g, " ")
    .replace(/^\s*[-|]\s*/, "")
    .replace(/\s*[-|]\s*$/, "")
    .trim();

  return result;
}

// ─── Utility Functions ─────────────────────────────────────────────────────

function isImageUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;

  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i;
  if (imageExtensions.test(url)) return true;

  if (url.includes("/wp-content/uploads/")) return true;

  return false;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Get a summary of Yoast SEO data for preview purposes.
 */
export function getYoastSummary(yoast: YoastData): {
  hasTitle: boolean;
  hasDescription: boolean;
  hasFocusKeyword: boolean;
  hasOgImage: boolean;
  isNoIndex: boolean;
  seoScore: number | null;
  readabilityScore: number | null;
} {
  return {
    hasTitle: Boolean(yoast.title),
    hasDescription: Boolean(yoast.description),
    hasFocusKeyword: Boolean(yoast.focusKeyword),
    hasOgImage: Boolean(yoast.ogImage),
    isNoIndex: Boolean(yoast.noIndex),
    seoScore: yoast.seoScore ?? null,
    readabilityScore: yoast.readabilityScore ?? null,
  };
}
