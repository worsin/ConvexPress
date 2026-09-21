/**
 * useSeoSettings - Hook for reading global SEO settings.
 *
 * Wraps useQuery(api.seo.queries.getSettings) for single or all keys.
 */

import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";

/**
 * Fetch a single SEO settings key.
 */
export function useSeoSetting(key: "titles" | "social" | "robots" | "schema" | "breadcrumbs" | "verification" | "advanced") {
  const result = useQuery(api.seo.queries.getSettings, { key });
  return result === undefined ? undefined : result && "value" in result ? result : null;
}

/**
 * Fetch all SEO settings.
 */
export function useSeoSettings() {
  return useQuery(api.seo.queries.getSettings, {});
}
