/**
 * Widget System - useWidgetArea Hook
 *
 * Fetches active widgets for a specific widget area by slug.
 * Used by the <WidgetArea> component on the website.
 *
 * Each area runs its own independent Convex query for isolation.
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

export function useWidgetArea(areaSlug: string) {
  const widgets = useQuery(api.widgets.queries.getAreaWidgets, {
    areaSlug,
  });

  return {
    widgets: widgets ?? [],
    isLoading: widgets === undefined,
    isEmpty: widgets !== undefined && widgets.length === 0,
  };
}
