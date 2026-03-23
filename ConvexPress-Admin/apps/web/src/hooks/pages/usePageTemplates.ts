/**
 * Page System - Page Templates Query Hook
 *
 * Wraps the Convex pages.getTemplates query for the template dropdown.
 */

import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";

/**
 * Hook for querying available page templates.
 *
 * Usage:
 * ```tsx
 * const { templates, isLoading } = usePageTemplates();
 * ```
 */
export function usePageTemplates() {
  const result = useQuery(api.pages.queries.getTemplates);

  return {
    templates: result ?? [],
    isLoading: result === undefined,
  };
}
