import { useMatches, useRouter } from "@tanstack/react-router";

import { ROUTE_LABEL_MAP } from "@/lib/layout/constants";
import type { BreadcrumbSegment } from "@/lib/layout/types";

const CREDENTIAL_ROUTE_LABELS: Record<string, string> = {
  "/_marketing/track/$token": "Track order",
  "/_marketing/wishlist/$token": "Shared wishlist",
  "/_marketing/cart/shared/$shareToken": "Shared cart",
};

interface BreadcrumbMatch {
  routeId: unknown;
  params?: unknown;
  loaderData?: unknown;
}

function labelFor(part: string): string {
  return ROUTE_LABEL_MAP[part] || part.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
}

/**
 * The breadcrumb trail for the matched routes, starting with "Home" ("/").
 *
 * A page shown by a dynamic route is named by its loader's `title` (else its
 * `name`, else the URL's value). The listing it sits under, such as /blog for
 * a post at /blog/$slug, is a crumb of its own when `isPage` says that address
 * is a page.
 */
export function breadcrumbSegments(
  matches: readonly BreadcrumbMatch[],
  isPage: (path: string) => boolean,
): BreadcrumbSegment[] {
  const segments: BreadcrumbSegment[] = [{ label: "Home", to: "/" }];

  for (const match of matches) {
    const routeId = String(match.routeId);

    // Skip root route
    if (routeId === "__root__") continue;

    // Bearer credentials are not page names, including a loader's slug fallback.
    if (Object.hasOwn(CREDENTIAL_ROUTE_LABELS, routeId)) {
      segments.push({ label: CREDENTIAL_ROUTE_LABELS[routeId] });
      continue;
    }

    // Remove internal layout segments (e.g. "_marketing") from breadcrumb generation
    const parts = routeId.split("/").filter(Boolean);
    const publicParts = parts.filter((part: string) => !part.startsWith("_"));
    const lastPart = publicParts[publicParts.length - 1];

    if (!lastPart || lastPart === "index") continue;

    // Check if it's a dynamic segment ($slug, $postId, or the "$" splat)
    if (lastPart.startsWith("$")) {
      publicParts.slice(0, -1).forEach((part, index) => {
        if (part.startsWith("$")) return;
        const to = `/${publicParts.slice(0, index + 1).join("/")}`;
        if (isPage(to) && !segments.some((segment) => segment.to === to)) {
          segments.push({ label: labelFor(part), to });
        }
      });
      // Try to get a label from loader data
      const loaderData = match.loaderData as Record<string, unknown> | undefined;
      const title =
        loaderData?.title || loaderData?.name || loaderData?.slug;
      if (title && typeof title === "string") {
        segments.push({ label: title });
      } else {
        // Use the param value as fallback
        const paramName = lastPart === "$" ? "_splat" : lastPart.slice(1);
        const paramValue = (match.params as Record<string, string | undefined>)?.[paramName];
        if (paramValue && typeof paramValue === "string") {
          segments.push({
            label: paramValue.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
          });
        }
      }
    } else {
      // Static segment - look up in the label map
      const label = labelFor(lastPart);

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

/**
 * Auto-generate or override breadcrumb segments for the current route.
 * Always starts with "Home" linking to "/".
 */
export function useBreadcrumbs(
  overrides?: BreadcrumbSegment[],
): BreadcrumbSegment[] {
  const matches = useMatches();
  const router = useRouter();

  // If overrides are provided, use them directly
  if (overrides && overrides.length > 0) {
    return overrides;
  }

  return breadcrumbSegments(matches, (path) => Object.hasOwn(router.routesByPath, path));
}
