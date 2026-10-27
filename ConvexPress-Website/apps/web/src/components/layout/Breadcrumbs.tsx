import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { getRouteSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";
import { serializeJsonLd } from "@/lib/seo/jsonld";
import { useBreadcrumbs } from "@/hooks/layout/useBreadcrumbs";
import type { BreadcrumbSegment } from "@/lib/layout/types";

interface BreadcrumbsProps {
  segments?: BreadcrumbSegment[];
  className?: string;
}

/**
 * The trail as schema.org BreadcrumbList data. Each crumb's `item` is its
 * absolute URL on the site's configured address, as search engines ask.
 */
export function breadcrumbJsonLd(segments: BreadcrumbSegment[], siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: segments.map((segment, index) => {
      const item = segment.to ? (toAbsoluteUrl(segment.to, siteUrl) ?? segment.to) : undefined;
      return { "@type": "ListItem", position: index + 1, name: segment.label, ...(item ? { item } : {}) };
    }),
  };
}

/**
 * Breadcrumb trail showing the navigation hierarchy for the current page.
 * Includes JSON-LD structured data for SEO.
 */
export function Breadcrumbs({ segments: overrides, className }: BreadcrumbsProps) {
  const segments = useBreadcrumbs(overrides);

  // Don't render if only "Home" is present (we're on the homepage)
  if (segments.length <= 1) return null;

  // Build JSON-LD structured data
  const jsonLd = breadcrumbJsonLd(segments, getRouteSiteUrl());

  return (
    <>
      <nav
        data-slot="breadcrumbs"
        aria-label="Breadcrumb"
        className={cn("text-xs", className)}
      >
        <ol className="flex flex-wrap items-center gap-1">
          {segments.map((segment, index) => {
            const isLast = index === segments.length - 1;

            return (
              <li key={`${segment.label}-${segment.to ?? "current"}`} className="flex items-center gap-1">
                {index > 0 && (
                  <ChevronRight
                    className="size-3 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                {isLast || !segment.to ? (
                  <span
                    className="text-foreground"
                    aria-current={isLast ? "page" : undefined}
                  >
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
      {/* JSON-LD structured data for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
    </>
  );
}
