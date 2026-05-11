/**
 * SEO Resolve - Website-side wrapper for SEO data resolution.
 *
 * This module provides helper functions for working with the resolved
 * SEO data that comes from Convex backend queries. It handles the
 * fallback logic for building head meta tags from partial data.
 *
 * Key functions:
 *   - resolvePostSeoFromQueries: Client-side resolution using raw query data
 *   - buildMetaTags / buildHeadLinks: Convert resolved data to head() format
 *   - createFallbackSeo: Generate sensible defaults while data loads
 *   - buildArticleJsonLd: Build Schema.org Article structured data
 */

import type { ResolvedSeoData } from "./types";
import { extractSeoText } from "@/lib/schemas/content";

// ─── Types for raw query data ────────────────────────────────────────────────

/**
 * Raw per-post SEO data as returned by seo.queries.getPostSeo.
 * Matches the backend PostSeoData interface.
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
 * Global SEO settings as returned by seo.queries.getSettings (no key arg).
 * Mirrors the backend SeoSettings interface.
 */
export interface SeoSettings {
  titles: {
    separator: string;
    siteTitle: string;
    tagline: string;
    postTitleTemplate: string;
    pageTitleTemplate: string;
    postNoindex: boolean;
    pageNoindex: boolean;
    [key: string]: unknown;
  };
  social: {
    twitterUsername: string;
    defaultOgImage: string;
    twitterCardType: string;
    organizationName: string;
    organizationLogo: string;
    [key: string]: unknown;
  };
  schema: {
    representType: string;
    organizationName: string;
    organizationLogoUrl: string;
    personName: string;
    personImageUrl: string;
    defaultArticleType: string;
    defaultPageType: string;
    sitelinksSearchBox: boolean;
    [key: string]: unknown;
  };
  breadcrumbs: {
    enabled: boolean;
    homeAnchorText: string;
    showBlogPage: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Minimal post data needed for client-side SEO resolution.
 */
export interface PostForSeoResolution {
  title: string;
  slug: string;
  type: "post" | "page";
  excerpt?: string | null;
  content?: string | null;
  featuredImageUrl?: string | null;
  publishedAt?: string | number | null;
}

/**
 * Author data for JSON-LD generation.
 */
export interface AuthorForJsonLd {
  name: string;
  url: string;
  imageUrl?: string;
}

// ─── Template Variable Resolution ────────────────────────────────────────────

/**
 * Resolve Yoast-compatible template variables.
 * Mirrors the backend applyTemplate() function.
 */
function applyTemplate(
  template: string | undefined | null,
  variables: Record<string, string>,
): string | null {
  if (!template || template.trim() === "") return null;

  let result = template;

  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`%%${key}%%`, "g");
    result = result.replace(pattern, value);
  }

  // Remove unresolved variables
  result = result.replace(/%%[a-z_]+%%/gi, "");
  result = result.replace(/\s+/g, " ").trim();

  // Remove leading/trailing separators
  const sep = variables.sep ?? "|";
  const escapedSep = sep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  result = result.replace(new RegExp(`^\\s*${escapedSep}\\s*`), "");
  result = result.replace(new RegExp(`\\s*${escapedSep}\\s*$`), "");

  return result || null;
}

// extractPlainText is now handled by extractSeoText from @/lib/schemas/content
// which uses Zod validation for safe JSON parsing
// ─── Client-Side SEO Resolution ──────────────────────────────────────────────

/**
 * Resolve all SEO fields for a post/page using query data and the fallback chain.
 *
 * This is the client-side equivalent of the backend resolvePostSeo() helper.
 * It applies the same resolution order:
 *   title:       custom SEO title -> title template -> "{post.title} {sep} {siteName}"
 *   description: custom SEO description -> post excerpt -> first 160 chars of content
 *   canonical:   custom canonical -> "{siteUrl}/blog/{slug}" or "{siteUrl}/{slug}"
 *   og/twitter:  custom overrides -> resolved primary fields -> defaults
 *
 * @param post - Minimal post data
 * @param postSeo - Raw per-post SEO data from getPostSeo query
 * @param settings - Global SEO settings from getSettings query
 * @param siteUrl - The site's base URL
 * @returns Fully resolved SEO data ready for SeoHead component
 */
export function resolvePostSeoFromQueries(
  post: PostForSeoResolution,
  postSeo: PostSeoData,
  settings: SeoSettings,
  siteUrl: string,
): ResolvedSeoData {
  const { titles, social, schema } = settings;
  const sep = titles.separator || "|";
  const siteName = titles.siteTitle || "ConvexPress";

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
    const pubDate = typeof post.publishedAt === "string"
      ? new Date(post.publishedAt)
      : new Date(post.publishedAt);
    templateVars.date = pubDate.toLocaleDateString();
  }

  // Title resolution
  const titleTemplate = post.type === "post"
    ? titles.postTitleTemplate
    : titles.pageTitleTemplate;

  const resolvedTitle =
    postSeo.seoTitle ||
    applyTemplate(titleTemplate, templateVars) ||
    `${post.title} ${sep} ${siteName}`;

  // Description resolution
  const resolvedDescription =
    postSeo.seoDescription ||
    post.excerpt ||
    extractSeoText(post.content, 160) ||
    "";

  // Canonical URL resolution
  const defaultPath = post.type === "post" ? `/blog/${post.slug}` : `/${post.slug}`;
  const resolvedCanonical = postSeo.canonical || `${siteUrl}${defaultPath}`;

  // Noindex / Nofollow
  const typeNoindex = post.type === "post" ? titles.postNoindex : titles.pageNoindex;
  const resolvedNoindex = postSeo.noindex ?? typeNoindex ?? false;
  const resolvedNofollow = postSeo.nofollow ?? false;

  const robotsParts: string[] = [];
  if (resolvedNoindex) robotsParts.push("noindex");
  else robotsParts.push("index");
  if (resolvedNofollow) robotsParts.push("nofollow");
  else robotsParts.push("follow");

  // OG resolution
  const resolvedOgTitle = postSeo.ogTitle || resolvedTitle;
  const resolvedOgDescription = postSeo.ogDescription || resolvedDescription;
  const resolvedOgImage =
    postSeo.ogImage ||
    post.featuredImageUrl ||
    social.defaultOgImage ||
    null;
  const resolvedOgType = post.type === "post" ? "article" : "website";

  // Twitter resolution
  const resolvedTwitterTitle = postSeo.twitterTitle || resolvedOgTitle;
  const resolvedTwitterDescription = postSeo.twitterDescription || resolvedOgDescription;
  const resolvedTwitterImage = postSeo.twitterImage || resolvedOgImage;
  const resolvedTwitterSite = social.twitterUsername
    ? `@${social.twitterUsername}`
    : null;

  // Schema type resolution
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
    robots: robotsParts.join(", "),
    ogTitle: resolvedOgTitle,
    ogDescription: resolvedOgDescription,
    ogImage: resolvedOgImage,
    ogType: resolvedOgType,
    ogUrl: resolvedCanonical,
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

// ─── JSON-LD Builder ─────────────────────────────────────────────────────────

/**
 * Build Schema.org JSON-LD @graph array for a blog post.
 *
 * Generates:
 *   1. WebSite schema (with optional SearchAction)
 *   2. Organization or Person schema
 *   3. Article/BlogPosting schema (for posts)
 *   4. WebPage schema
 *   5. BreadcrumbList schema
 *
 * @param post - Post data
 * @param resolved - Resolved SEO data
 * @param settings - Global SEO settings
 * @param siteUrl - Site base URL
 * @param author - Author info for JSON-LD
 * @returns Array of Schema.org objects for the @graph
 */
export function buildArticleJsonLd(
  post: PostForSeoResolution,
  resolved: ResolvedSeoData,
  settings: SeoSettings,
  siteUrl: string,
  author: AuthorForJsonLd,
): object[] {
  const { schema: schemaSettings, social } = settings;
  const graph: object[] = [];

  // 1. WebSite
  const webSite: Record<string, unknown> = {
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    url: siteUrl,
    name: resolved.ogSiteName,
    description: settings.titles.tagline || "",
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

  // 2. Organization or Person
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
    const sameAs = [
      (social as Record<string, unknown>).facebookUrl,
      social.twitterUsername ? `https://twitter.com/${social.twitterUsername}` : "",
      (social as Record<string, unknown>).instagramUrl,
      (social as Record<string, unknown>).linkedinUrl,
      (social as Record<string, unknown>).youtubeUrl,
      (social as Record<string, unknown>).pinterestUrl,
    ].filter(Boolean) as string[];
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
      person.image = { "@type": "ImageObject", url: schemaSettings.personImageUrl };
    }
    graph.push(person);
  }

  // 3. Article schema (for posts)
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
        name: author.name,
        url: author.url,
      },
      publisher: publisherRef,
      inLanguage: "en-US",
    };

    if (post.publishedAt) {
      const pubDate = typeof post.publishedAt === "string"
        ? new Date(post.publishedAt)
        : new Date(post.publishedAt);
      article.datePublished = pubDate.toISOString();
    }

    if (resolved.ogImage) {
      article.image = { "@type": "ImageObject", url: resolved.ogImage };
    }

    if (author.imageUrl) {
      (article.author as Record<string, unknown>).image = {
        "@type": "ImageObject",
        url: author.imageUrl,
      };
    }

    graph.push(article);
  }

  // 4. WebPage schema
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
    const pubDate = typeof post.publishedAt === "string"
      ? new Date(post.publishedAt)
      : new Date(post.publishedAt);
    webPage.datePublished = pubDate.toISOString();
  }

  if (post.type === "post" && resolved.ogImage) {
    webPage.primaryImageOfPage = { "@type": "ImageObject", url: resolved.ogImage };
  }

  graph.push(webPage);

  // 5. BreadcrumbList
  if (settings.breadcrumbs.enabled) {
    const breadcrumbItems: object[] = [
      {
        "@type": "ListItem",
        position: 1,
        name: settings.breadcrumbs.homeAnchorText || "Home",
        item: siteUrl,
      },
    ];

    let position = 2;

    if (post.type === "post" && settings.breadcrumbs.showBlogPage) {
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

/**
 * Build an array of <meta> tag objects from resolved SEO data.
 * Compatible with TanStack Start's `head()` return format.
 *
 * @param seo - Fully resolved SEO data from the backend
 * @param siteUrl - The site's base URL
 * @returns Array of meta tag objects for TanStack Start head()
 */
export function buildMetaTags(
  seo: ResolvedSeoData,
  _siteUrl: string,
): Array<Record<string, string>> {
  const tags: Array<Record<string, string>> = [];

  // Title
  tags.push({ title: seo.title });

  // Description
  if (seo.description) {
    tags.push({ name: "description", content: seo.description });
  }

  // Robots
  tags.push({ name: "robots", content: seo.robots });

  // Canonical is handled via <link> not <meta>, but include for reference
  // The canonical link should be added separately in the head() links array

  // Open Graph
  tags.push({ property: "og:title", content: seo.ogTitle });
  if (seo.ogDescription) {
    tags.push({ property: "og:description", content: seo.ogDescription });
  }
  tags.push({ property: "og:type", content: seo.ogType });
  tags.push({ property: "og:url", content: seo.ogUrl });
  tags.push({ property: "og:site_name", content: seo.ogSiteName });
  if (seo.ogImage) {
    tags.push({ property: "og:image", content: seo.ogImage });
  }

  // Twitter Card
  tags.push({ name: "twitter:card", content: seo.twitterCard });
  tags.push({ name: "twitter:title", content: seo.twitterTitle });
  if (seo.twitterDescription) {
    tags.push({ name: "twitter:description", content: seo.twitterDescription });
  }
  if (seo.twitterImage) {
    tags.push({ name: "twitter:image", content: seo.twitterImage });
  }
  if (seo.twitterSite) {
    tags.push({ name: "twitter:site", content: seo.twitterSite });
  }

  return tags;
}

/**
 * Build head link objects from resolved SEO data.
 * Returns canonical URL as a link rel.
 *
 * @param seo - Resolved SEO data
 * @returns Array of link objects for TanStack Start head()
 */
export function buildHeadLinks(
  seo: ResolvedSeoData,
): Array<Record<string, string>> {
  const links: Array<Record<string, string>> = [];

  // Canonical URL
  if (seo.canonical) {
    links.push({ rel: "canonical", href: seo.canonical });
  }

  return links;
}

/**
 * Create a default/fallback ResolvedSeoData object for use when
 * real SEO data hasn't loaded yet.
 *
 * @param title - Page title fallback
 * @param siteUrl - Site base URL
 * @param siteName - Site name
 * @returns Minimal ResolvedSeoData with sensible defaults
 */
export function createFallbackSeo(
  title: string,
  siteUrl: string,
  siteName: string = "ConvexPress",
): ResolvedSeoData {
  return {
    title: `${title} | ${siteName}`,
    description: "",
    canonical: siteUrl,
    noindex: false,
    nofollow: false,
    robots: "index, follow",
    ogTitle: title,
    ogDescription: "",
    ogImage: null,
    ogType: "website",
    ogUrl: siteUrl,
    ogSiteName: siteName,
    twitterCard: "summary_large_image",
    twitterTitle: title,
    twitterDescription: "",
    twitterImage: null,
    twitterSite: null,
    schemaType: "WebPage",
    schemaArticleType: null,
    cornerstone: false,
    focusKeyphrase: null,
    seoScore: null,
    readabilityScore: null,
  };
}
