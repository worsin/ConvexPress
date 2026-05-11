/**
 * SEO System - Website-side type definitions.
 *
 * These types mirror the backend helper types needed for rendering
 * SEO meta tags, JSON-LD, and breadcrumbs on the website frontend.
 */

/**
 * Fully resolved SEO data ready for rendering in <head>.
 * Produced by resolvePostSeo() on the backend.
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
 * Breadcrumb item for rendering and JSON-LD.
 */
export interface BreadcrumbItem {
  name: string;
  url: string;
  position: number;
}

/**
 * Verification settings for rendering search engine verification meta tags.
 * Configured in admin SEO settings under the "verification" key.
 */
export interface SeoVerificationSettings {
  googleSiteVerification: string;
  bingSiteVerification: string;
  pinterestVerification: string;
  yandexVerification: string;
}

/**
 * Props for the SeoHead component.
 */
export interface SeoHeadProps {
  seo: ResolvedSeoData;
  siteUrl: string;
  jsonLdGraph?: object[];
  verification?: SeoVerificationSettings | null;
}

/**
 * Props for the JsonLd component.
 */
export interface JsonLdProps {
  graph: object[];
}

/**
 * Props for the SEO Breadcrumbs component.
 */
export interface SeoBreadcrumbsProps {
  items: BreadcrumbItem[];
  separator?: string;
  boldLast?: boolean;
  className?: string;
}
