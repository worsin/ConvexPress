/**
 * useSitemapStatus Hook
 *
 * Wraps the sitemaps.queries.getStatus Convex query for real-time
 * reactive updates on the admin sitemap settings page.
 *
 * Returns undefined while loading, or the full SitemapStatus object.
 */

import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { SitemapStatus } from "@/lib/sitemaps/types";

export function useSitemapStatus(): SitemapStatus | undefined {
  const status = useQuery(api.sitemaps.queries.getStatus);
  return status as SitemapStatus | undefined;
}
