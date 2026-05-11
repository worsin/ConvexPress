import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import type { SiteIdentity } from "@/lib/layout/types";

/**
 * Fetch site identity settings (title, tagline, logo).
 * Reactive: updates in real-time when admin changes settings.
 *
 * Data source: Settings System (api.settings.queries.getPublic)
 */
export function useSiteIdentity(): SiteIdentity | undefined {
  const publicSettings = useQuery(api.settings.queries.getPublic);

  // While settings are loading, return a static fallback to avoid layout shift
  if (publicSettings === undefined) {
    return {
      title: "ConvexPress",
      tagline: "A modern CMS",
    };
  }

  return {
    title: (publicSettings.siteTitle as string) ?? "ConvexPress",
    tagline: (publicSettings.tagline as string) ?? "",
    logoUrl: (publicSettings.logoUrl as string) ?? undefined,
    logoAlt: (publicSettings.siteTitle as string) ?? "ConvexPress",
    showTitleWithLogo: true,
  };
}
