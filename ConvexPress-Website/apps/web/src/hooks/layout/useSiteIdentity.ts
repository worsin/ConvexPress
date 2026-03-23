import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import type { SiteIdentity } from "@/lib/layout/types";
import { useTheme } from "@/lib/theme-context";

/** Extended site identity fields that may be present at runtime */
interface SiteIdentityCustomizer {
  logoId?: string;
  logoWidth?: number;
  siteIcon?: string;
  displaySiteTitle?: boolean;
  displayTagline?: boolean;
  // Extended fields (may be added by theme)
  logoUrl?: string;
  logoAlt?: string;
  showTitleWithLogo?: boolean;
}

/**
 * Fetch site identity settings (title, tagline, logo).
 * Reactive: updates in real-time when admin changes settings.
 *
 * Data sources:
 *   - Site title, tagline from Settings System (api.settings.queries.getPublic)
 *   - Logo URL from Theme System customizer (via ThemeContext)
 */
export function useSiteIdentity(): SiteIdentity | undefined {
  const publicSettings = useQuery(api.settings.queries.getPublic);
  const { theme } = useTheme();

  // While settings are loading, return a static fallback to avoid layout shift
  if (publicSettings === undefined) {
    return {
      title: "SmithHarper",
      tagline: "A modern CMS",
    };
  }

  // Extract logo from theme customizer (if set)
  const customizer = theme?.customizer;
  const siteIdentity = customizer?.siteIdentity as SiteIdentityCustomizer | undefined;
  const logoUrl = siteIdentity?.logoUrl ?? undefined;
  const logoAlt = siteIdentity?.logoAlt ?? undefined;
  const showTitleWithLogo = siteIdentity?.showTitleWithLogo ?? true;

  return {
    title: (publicSettings.siteTitle as string) ?? "SmithHarper",
    tagline: (publicSettings.tagline as string) ?? "",
    logoUrl,
    logoAlt: logoAlt ?? (publicSettings.siteTitle as string) ?? "SmithHarper",
    showTitleWithLogo,
  };
}
