import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { BREADCRUMB_LABELS } from "@/lib/admin-shell/breadcrumb-labels";
import type { BreadcrumbSegment } from "@/lib/admin-shell/types";

interface BreadcrumbsProps {
  /** Optional override for breadcrumb segments */
  segments?: BreadcrumbSegment[];
}

export function Breadcrumbs({ segments: overrides }: BreadcrumbsProps) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  const segments = overrides ?? deriveBreadcrumbs(pathname);

  if (segments.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1 text-sm">
        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;

          return (
            <li key={`${segment.label}-${segment.to ?? "current"}`} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRight className="size-3 text-muted-foreground" />
              )}

              {isLast || !segment.to ? (
                <span className="text-foreground font-medium">
                  {segment.label}
                </span>
              ) : (
                <Link
                  to={segment.to}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {segment.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
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

  if (parts.length === 0 || (parts.length === 1 && parts[0] === "dashboard")) {
    // We're on the dashboard
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
