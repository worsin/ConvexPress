import { useMatches } from "@tanstack/react-router";

import { ROUTE_LABEL_MAP } from "@/lib/layout/constants";
import type { BreadcrumbSegment } from "@/lib/layout/types";

/**
 * Auto-generate or override breadcrumb segments for the current route.
 * Always starts with "Home" linking to "/".
 */
export function useBreadcrumbs(
  overrides?: BreadcrumbSegment[],
): BreadcrumbSegment[] {
  const matches = useMatches();

  // If overrides are provided, use them directly
  if (overrides && overrides.length > 0) {
    return overrides;
  }

  const segments: BreadcrumbSegment[] = [{ label: "Home", to: "/" }];

  for (const match of matches) {
    const routeId = String(match.routeId);

    // Skip root route
    if (routeId === "__root__") continue;

    // Remove internal layout segments (e.g. "_marketing") from breadcrumb generation
    const parts = routeId.split("/").filter(Boolean);
    const publicParts = parts.filter((part: string) => !part.startsWith("_"));
    const lastPart = publicParts[publicParts.length - 1];

    if (!lastPart || lastPart === "index") continue;

    // Check if it's a dynamic segment ($slug, $postId, etc.)
    if (lastPart.startsWith("$")) {
      // Try to get a label from loader data
      const loaderData = match.loaderData as Record<string, unknown> | undefined;
      const title =
        loaderData?.title || loaderData?.name || loaderData?.slug;
      if (title && typeof title === "string") {
        segments.push({ label: title });
      } else {
        // Use the param value as fallback
        const paramName = lastPart.slice(1);
        const paramValue = (match.params as Record<string, string | undefined>)?.[paramName];
        if (paramValue && typeof paramValue === "string") {
          segments.push({
            label: paramValue.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
          });
        }
      }
    } else {
      // Static segment - look up in the label map
      const label =
        ROUTE_LABEL_MAP[lastPart] ||
        lastPart.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

      const to = `/${publicParts.join("/")}`;

      // Avoid duplicate crumb labels from nested layout/index route matches.
      if (segments[segments.length - 1]?.label !== label) {
        segments.push({ label, to });
      }
    }
  }

  // Last segment should not have a link (it's the current page)
  if (segments.length > 1) {
    const last = segments[segments.length - 1];
    segments[segments.length - 1] = { label: last.label };
  }

  return segments;
}
