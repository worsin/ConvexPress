/**
 * SeoHead - Renders all SEO meta tags and JSON-LD in the document head.
 *
 * This component takes fully resolved SEO data and outputs:
 *   - <title> tag
 *   - <meta name="description">
 *   - <meta name="robots">
 *   - <link rel="canonical">
 *   - Open Graph meta tags (og:title, og:description, og:image, etc.)
 *   - Twitter Card meta tags (twitter:card, twitter:title, etc.)
 *   - JSON-LD structured data script tag
 *
 * Designed for use in TanStack Start SSR pages. Place this component
 * inside the page component to inject SEO tags into the <head> via
 * TanStack's HeadContent mechanism, or render it directly for
 * client-side injection.
 *
 * Usage:
 *   <SeoHead seo={resolvedSeo} siteUrl="https://example.com" jsonLdGraph={graph} />
 */

import type { SeoHeadProps } from "@/lib/seo/types";
import { serializeJsonLd, wrapJsonLdGraph } from "@/lib/seo/jsonld";

export function SeoHead({ seo, siteUrl: _siteUrl, jsonLdGraph, verification }: SeoHeadProps) {
  const jsonLdString = jsonLdGraph
    ? serializeJsonLd(wrapJsonLdGraph(jsonLdGraph))
    : null;

  return (
    <>
      {/* Primary Meta Tags */}
      <title>{seo.title}</title>

      {seo.description && (
        <meta name="description" content={seo.description} />
      )}

      <meta name="robots" content={seo.robots} />

      {/* Canonical URL */}
      {seo.canonical && (
        <link rel="canonical" href={seo.canonical} />
      )}

      {/* Search Engine Verification Tags */}
      {verification?.googleSiteVerification && (
        <meta name="google-site-verification" content={verification.googleSiteVerification} />
      )}
      {verification?.bingSiteVerification && (
        <meta name="msvalidate.01" content={verification.bingSiteVerification} />
      )}
      {verification?.pinterestVerification && (
        <meta name="p:domain_verify" content={verification.pinterestVerification} />
      )}
      {verification?.yandexVerification && (
        <meta name="yandex-verification" content={verification.yandexVerification} />
      )}

      {/* Open Graph */}
      <meta property="og:title" content={seo.ogTitle} />
      {seo.ogDescription && (
        <meta property="og:description" content={seo.ogDescription} />
      )}
      <meta property="og:type" content={seo.ogType} />
      <meta property="og:url" content={seo.ogUrl} />
      <meta property="og:site_name" content={seo.ogSiteName} />
      {seo.ogImage && (
        <meta property="og:image" content={seo.ogImage} />
      )}

      {/* Twitter Card */}
      <meta name="twitter:card" content={seo.twitterCard} />
      <meta name="twitter:title" content={seo.twitterTitle} />
      {seo.twitterDescription && (
        <meta name="twitter:description" content={seo.twitterDescription} />
      )}
      {seo.twitterImage && (
        <meta name="twitter:image" content={seo.twitterImage} />
      )}
      {seo.twitterSite && (
        <meta name="twitter:site" content={seo.twitterSite} />
      )}

      {/* JSON-LD Structured Data */}
      {jsonLdString && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString }}
        />
      )}
    </>
  );
}
