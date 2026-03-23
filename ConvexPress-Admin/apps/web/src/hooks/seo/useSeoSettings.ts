/**
 * useSeoSettings - Hook for reading global SEO settings.
 *
 * Wraps useQuery(api.seo.queries.getSettings) for single or all keys.
 */

import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";

/**
 * Fetch a single SEO settings key.
 */
export function useSeoSetting(key: "titles" | "social" | "robots" | "schema" | "breadcrumbs" | "verification" | "advanced") {
  return useQuery(api.seo.queries.getSettings, { key });
}

/**
 * Fetch all SEO settings.
 */
export function useSeoSettings() {
  return useQuery(api.seo.queries.getSettings, {});
}
