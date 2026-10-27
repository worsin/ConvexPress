/**
 * The help center's breadcrumb trail and page titles, named by the content
 * (a category's name, an article's title) rather than its URL. The pages
 * below the help home draw their own trail, so the marketing layout leaves
 * its URL-built one out there (routes/_marketing.tsx).
 */
import type { BreadcrumbSegment } from "@/lib/layout/types";
import { siteTitled } from "@/lib/seo/head";

/** Help pages that draw their own trail: everything below /help itself. */
export function helpRouteOwnsBreadcrumbs(pathname: string): boolean {
  return /^\/help\/[^/]/.test(pathname);
}

/** Home › Help center › …the page's own steps. */
export function helpTrail(...steps: BreadcrumbSegment[]): BreadcrumbSegment[] {
  return [{ label: "Home", to: "/" }, { label: "Help center", to: "/help" }, ...steps];
}

/** A slug as words, for a page whose content hasn't loaded ("signing-up" → "Signing Up"). */
export function slugWords(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** "<name> - Help Center | Site", from the loaded name when there is one. */
export function helpPageTitle(name: string | null | undefined, slug: string, section?: string): string {
  const heading = name?.trim() || slugWords(slug);
  return siteTitled([heading, section, "Help Center"].filter(Boolean).join(" - "));
}
