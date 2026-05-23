import { buildJsonLdString } from "@/lib/seo/jsonld";

const FALLBACK_SITE_NAME = "ConvexPress";
const DEFAULT_LOCAL_SITE_URL = "http://localhost:4106";

export interface SeoHeadInput {
  title: string;
  description?: string | null;
  canonical?: string | null;
  robots?: string;
  siteName?: string | null;
  ogType?: string;
  image?: string | null;
  twitterCard?: string;
  twitterSite?: string | null;
  locale?: string;
  alternates?: Array<Record<string, string>>;
  jsonLdGraph?: object[];
}

export interface RouteSeoInput extends Omit<SeoHeadInput, "canonical" | "robots"> {
  path?: string | null;
  siteUrl?: string | null;
  robots?: string;
}

export function normalizeSiteUrl(siteUrl?: string | null): string | null {
  if (!siteUrl) return null;

  const trimmed = siteUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return null;

  try {
    return new URL(trimmed).toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function toAbsoluteUrl(path: string, siteUrl?: string | null): string | null {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  if (!normalizedSiteUrl) return null;

  try {
    return new URL(path, `${normalizedSiteUrl}/`).toString();
  } catch {
    return null;
  }
}

export function getRouteSiteUrl(): string {
  return (
    import.meta.env.VITE_APP_URL ||
    import.meta.env.VITE_PUBLIC_APP_URL ||
    DEFAULT_LOCAL_SITE_URL
  );
}

export function humanizeSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

export function buildSeoHead(input: SeoHeadInput) {
  const siteName = input.siteName?.trim() || FALLBACK_SITE_NAME;
  const meta: Array<Record<string, string>> = [{ title: input.title }];
  const links: Array<Record<string, string>> = [];
  const scripts: Array<Record<string, string>> = [];

  if (input.description) {
    meta.push({ name: "description", content: input.description });
  }

  meta.push({ name: "robots", content: input.robots || "index, follow" });

  if (input.canonical) {
    links.push({ rel: "canonical", href: input.canonical });
  }

  meta.push({ property: "og:title", content: input.title });
  meta.push({ property: "og:type", content: input.ogType || "website" });
  meta.push({ property: "og:site_name", content: siteName });
  meta.push({ property: "og:locale", content: input.locale || "en_US" });

  if (input.description) {
    meta.push({ property: "og:description", content: input.description });
  }

  if (input.canonical) {
    meta.push({ property: "og:url", content: input.canonical });
  }

  if (input.image) {
    meta.push({ property: "og:image", content: input.image });
  }

  meta.push({ name: "twitter:card", content: input.twitterCard || "summary_large_image" });
  meta.push({ name: "twitter:title", content: input.title });

  if (input.description) {
    meta.push({ name: "twitter:description", content: input.description });
  }

  if (input.image) {
    meta.push({ name: "twitter:image", content: input.image });
  }

  if (input.twitterSite) {
    meta.push({ name: "twitter:site", content: input.twitterSite });
  }

  if (input.alternates?.length) {
    links.push(...input.alternates);
  }

  if (input.jsonLdGraph?.length) {
    scripts.push({
      type: "application/ld+json",
      children: buildJsonLdString(input.jsonLdGraph),
    });
  }

  return { meta, links, scripts };
}

export function buildIndexablePageHead(input: RouteSeoInput) {
  const siteUrl = input.siteUrl ?? getRouteSiteUrl();
  return buildSeoHead({
    ...input,
    canonical:
      input.path ? toAbsoluteUrl(input.path, siteUrl) : undefined,
    robots: input.robots ?? "index, follow",
  });
}

export function buildRestrictedPageHead(input: RouteSeoInput) {
  const siteUrl = input.siteUrl ?? getRouteSiteUrl();
  return buildSeoHead({
    ...input,
    canonical:
      input.path ? toAbsoluteUrl(input.path, siteUrl) : undefined,
    robots: input.robots ?? "noindex, nofollow",
  });
}
