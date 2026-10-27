import { getSiteRuntime } from "@/lib/site-runtime";
import { buildJsonLdString } from "@/lib/seo/jsonld";

const FALLBACK_SITE_NAME = "ConvexPress";

/**
 * Site name learned from public settings. One storefront process serves one
 * site (the runtime config pins the deployment), so a process-level value is
 * correct on the server; the client remembers it from the settings provider.
 */
let knownSiteName: string | null = null;

/**
 * Settings › Reading › "Discourage search engines": every page is noindex,
 * nofollow while it's set (staging and preview copies). Process-level like
 * the site name; the client learns it from `SiteNameBootstrap`.
 */
let discourageSearchEngines = false;

export function rememberSearchVisibility(visible?: boolean | null): void {
  if (typeof visible === "boolean") discourageSearchEngines = !visible;
}

export function searchEnginesDiscouraged(): boolean {
  if (typeof window !== "undefined") {
    const flag: unknown = Reflect.get(window, "__CONVEXPRESS_NOINDEX__");
    if (typeof flag === "boolean") return flag;
  }
  return discourageSearchEngines;
}

/** The robots value a page asks for, unless the site discourages search engines. */
export function effectiveRobots(requested: string | undefined): string {
  return searchEnginesDiscouraged() ? "noindex, nofollow" : requested || "index, follow";
}

export function rememberSiteName(name?: string | null): void {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed) knownSiteName = trimmed;
}

/** The name the server rendered with, handed to the client before hydration (see __root.tsx). */
function bootstrappedSiteName(): string | null {
  if (typeof window === "undefined") return null;
  const value = (window as { __CONVEXPRESS_SITE_NAME__?: unknown }).__CONVEXPRESS_SITE_NAME__;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveSiteName(explicit?: string | null): string {
  const trimmed = typeof explicit === "string" ? explicit.trim() : "";
  return trimmed || knownSiteName || bootstrappedSiteName() || FALLBACK_SITE_NAME;
}

/**
 * "Shop" → "Shop – Northstar Coffee". Never repeats the site name: a title
 * that already names the site ("Contact Northstar Coffee") is used as it is.
 */
export function siteTitled(base: string, siteName?: string | null): string {
  const name = resolveSiteName(siteName);
  const trimmed = base.trim();
  if (!trimmed) return name;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(trimmed) ? trimmed : `${trimmed} – ${name}`;
}
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
  return getSiteRuntime().siteUrl || DEFAULT_LOCAL_SITE_URL;
}

export function humanizeSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

export function buildSeoHead(input: SeoHeadInput) {
  const siteName = resolveSiteName(input.siteName);
  const meta: Array<Record<string, string>> = [{ title: input.title }];
  const links: Array<Record<string, string>> = [];
  const scripts: Array<Record<string, string>> = [];

  if (input.description) {
    meta.push({ name: "description", content: input.description });
  }

  meta.push({ name: "robots", content: effectiveRobots(input.robots) });

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
