import { convexQuery } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { api } from "@convexpress-website/backend/generated/api";
import { resolveSiteName } from "./head";
import { siteSeoSettings, type SiteShare } from "./siteShare";

/** The site's sharing defaults (lib/seo/siteShare.ts), read through the route's query cache. */
export async function loadSiteShare(queryClient: QueryClient): Promise<SiteShare | null> {
  const settings = await queryClient.ensureQueryData(convexQuery(api.settings.queries.getPublic, {}));
  if (!settings) return null;
  const seo = await queryClient.ensureQueryData(convexQuery(api.seo.queries.getSettings, {})).catch(() => null);
  return {
    siteName: resolveSiteName(settings.siteTitle),
    tagline: settings.tagline,
    siteUrl: settings.siteUrl,
    faviconUrl: settings.brandConfig.faviconUrl,
    seo: siteSeoSettings(seo),
  };
}
