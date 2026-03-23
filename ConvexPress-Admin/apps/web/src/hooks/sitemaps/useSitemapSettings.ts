/**
 * useSitemapSettings Hook
 *
 * Reads sitemap settings from the sitemap system query and falls back to
 * local defaults while loading.
 */

import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { DEFAULT_SITEMAP_SETTINGS } from "@/lib/sitemaps/constants";
import type { SitemapSettings } from "@/lib/sitemaps/types";

export function useSitemapSettings(): {
  settings: SitemapSettings;
  isLoading: boolean;
} {
  const settings = useQuery(api.sitemaps.queries.getSettings);

  if (settings === undefined) {
    return {
      settings: { ...DEFAULT_SITEMAP_SETTINGS },
      isLoading: true,
    };
  }

  return {
    settings: settings ?? { ...DEFAULT_SITEMAP_SETTINGS },
    isLoading: false,
  };
}

