import { useRouterState } from "@tanstack/react-router";
import { BREADCRUMB_LABELS } from "@/lib/admin-shell/breadcrumb-labels";
import type { BreadcrumbSegment } from "@/lib/admin-shell/types";

/**
 * Auto-generate or override breadcrumb segments for the current route.
 *
 * When called without arguments, derives breadcrumbs from the current pathname
 * using the BREADCRUMB_LABELS mapping. Dynamic segments ($param) are skipped.
 *
 * When called with override segments, returns those instead.
 *
 * The first segment is always "Dashboard" linking to "/dashboard".
 * The last segment has no link (current page).
 *
 * @param overrides - Optional breadcrumb segments to use instead of auto-derived
 * @returns Array of BreadcrumbSegment objects
 */
export function useBreadcrumbs(
  overrides?: BreadcrumbSegment[],
): BreadcrumbSegment[] {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  if (overrides) return overrides;

  return deriveBreadcrumbs(pathname);
}

/**
 * Auto-derive breadcrumb segments from the current pathname.
 * Strips the admin prefix and maps segments to labels.
 */
function deriveBreadcrumbs(pathname: string): BreadcrumbSegment[] {
  const segments: BreadcrumbSegment[] = [
    { label: "Dashboard", to: "/dashboard" },
  ];

  // Remove leading slash and split
  const parts = pathname.replace(/^\//, "").split("/").filter(Boolean);

  if (
    parts.length === 0 ||
    (parts.length === 1 && parts[0] === "dashboard")
  ) {
    // We're on the dashboard - return just the label without a link
    return [{ label: "Dashboard" }];
  }

  let currentPath = "";
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    currentPath += `/${part}`;

    // Skip dynamic segments (start with $) - they would be resolved by the page
    if (part.startsWith("$")) continue;

    const label = BREADCRUMB_LABELS[part] ?? formatSegment(part);
    const isLast = i === parts.length - 1;

    segments.push({
      label,
      to: isLast ? undefined : currentPath,
    });
  }

  return segments;
}

/**
 * Format a URL segment into a human-readable label.
 * Converts kebab-case to Title Case.
 */
function formatSegment(segment: string): string {
  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
