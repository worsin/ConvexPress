/**
 * What the whole site shares by default: the browser icon, the description,
 * the image a link preview shows, and the home page's title and structured
 * data. Read from public settings (title, tagline, URL, Settings › Brand ›
 * favicon) and Settings › SEO (homepage title and description, default social
 * image, schema). Pages that say something more specific override it: the
 * head keeps the deepest route's value for each meta name.
 */
import type { FunctionReturnType } from "convex/server";

import type { api } from "@convexpress-website/backend/generated/api";
import { toAbsoluteUrl } from "./head";
import { applyTemplate, buildSiteJsonLd, type SeoSettings } from "./resolve";

export interface SiteShare {
  siteName: string;
  tagline: string;
  siteUrl: string;
  faviconUrl: string;
  /** Null when the SEO settings couldn't be read. */
  seo: SeoSettings | null;
}

type HeadTag = Record<string, string>;
export type SiteShareHead = { meta: HeadTag[]; links: HeadTag[] };

const DEFAULT_HOMEPAGE_TITLE = "%%sitename%% %%sep%% %%tagline%%";

/** `seo.queries.getSettings({})` returns every section; a keyed read or a missing backend gives null. */
export function siteSeoSettings(result: FunctionReturnType<typeof api.seo.queries.getSettings> | undefined): SeoSettings | null {
  if (!result || !("titles" in result)) return null;
  return result;
}

export function siteTagline(share: SiteShare): string {
  return share.seo?.titles.tagline?.trim() || share.tagline.trim();
}

/** Settings › SEO › homepage description, else the tagline. */
export function siteDescription(share: SiteShare): string {
  return share.seo?.titles.homepageDescription?.trim() || siteTagline(share);
}

/** The home page's title from Settings › SEO › homepage title ("%%sitename%% %%sep%% %%tagline%%"). */
export function homepageTitle(share: SiteShare): string {
  const titles = share.seo?.titles;
  return (
    applyTemplate(titles?.homepageTitle || DEFAULT_HOMEPAGE_TITLE, {
      sitename: share.siteName,
      sep: titles?.separator || "|",
      tagline: siteTagline(share),
    }) ?? share.siteName
  );
}

/** Settings › SEO › Social › default image, as an absolute URL. */
export function defaultShareImage(share: SiteShare): string | null {
  const image = share.seo?.social.defaultOgImage?.trim();
  return image ? toAbsoluteUrl(image, share.siteUrl) : null;
}

function iconType(url: string): string | null {
  const path = url.split(/[?#]/)[0]?.toLowerCase() ?? "";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".ico")) return "image/x-icon";
  return null;
}

/** Site-wide head defaults for the root route. */
export function siteShareHead(share: SiteShare | null | undefined): SiteShareHead {
  const links: HeadTag[] = [{ rel: "icon", href: "/favicon.ico", sizes: "any" }];
  if (!share) return { meta: [], links };

  const favicon = share.faviconUrl.trim();
  if (favicon && favicon !== "/favicon.ico") {
    const type = iconType(favicon);
    links.push({ rel: "icon", href: favicon, ...(type ? { type } : {}) });
  }

  const meta: HeadTag[] = [];
  const description = siteDescription(share);
  if (description) {
    meta.push({ name: "description", content: description });
    meta.push({ property: "og:description", content: description });
    meta.push({ name: "twitter:description", content: description });
  }
  const image = defaultShareImage(share);
  if (image) {
    meta.push({ property: "og:image", content: image });
    meta.push({ name: "twitter:image", content: image });
  }
  const twitter = share.seo?.social.twitterUsername?.trim().replace(/^@/, "");
  if (twitter) meta.push({ name: "twitter:site", content: `@${twitter}` });
  return { meta, links };
}

/** The home page's WebSite and Organization (or Person) nodes. */
export function siteJsonLd(share: SiteShare): object[] {
  if (!share.seo) return [];
  const siteUrl = share.siteUrl.replace(/\/+$/, "");
  return siteUrl ? buildSiteJsonLd(share.seo, siteUrl, share.siteName, share.tagline) : [];
}
