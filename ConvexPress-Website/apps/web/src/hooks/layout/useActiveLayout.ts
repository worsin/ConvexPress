import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";

import { usePageOverrides } from "@/contexts/PageOverridesContext";

/**
 * Resolves the current page/post layout from the per-route overrides context.
 * Public pages only need a presentation-safe subset of the layout document.
 */
export function useActiveLayout() {
  const { overrides } = usePageOverrides();
  const layoutId = overrides.layoutId;

  return useQuery(
    api.layouts.queries.getPublic,
    layoutId ? { id: layoutId as Id<"layouts"> } : "skip",
  );
}
