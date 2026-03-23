/**
 * SeoBreadcrumbs - Schema-annotated breadcrumb trail with JSON-LD.
 *
 * Renders a semantic <nav> breadcrumb trail with:
 *   - Proper aria-label and aria-current attributes
 *   - Schema.org BreadcrumbList JSON-LD structured data
 *   - Configurable separator and bold last item styling
 *
 * This component is separate from the layout/Breadcrumbs component.
 * It is specifically designed for SEO-driven breadcrumbs using the
 * SEO system's breadcrumb settings and item builders.
 *
 * Usage:
 *   const items = buildBreadcrumbItems({ ... });
 *   <SeoBreadcrumbs items={items} separator=">" boldLast />
 */

import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { SeoBreadcrumbsProps } from "@/lib/seo/types";
import { serializeJsonLd } from "@/lib/seo/jsonld";

export function SeoBreadcrumbs({
  items,
  separator = ">",
  boldLast = true,
  className,
}: SeoBreadcrumbsProps) {
  if (!items || items.length === 0) return null;

  // Don't render if only Home is present
  if (items.length <= 1) return null;

  // Build JSON-LD BreadcrumbList
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item) => ({
      "@type": "ListItem",
      position: item.position,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <>
      <nav
        data-slot="seo-breadcrumbs"
        aria-label="Breadcrumb"
        className={cn("text-xs", className)}
      >
        <ol className="flex flex-wrap items-center gap-1">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;

            return (
              <li key={`${item.name}-${item.position}`} className="flex items-center gap-1">
                {index > 0 && (
                  <span
                    className="text-muted-foreground mx-0.5"
                    aria-hidden="true"
                  >
                    {separator}
                  </span>
                )}
                {isLast ? (
                  <span
                    className={cn(
                      "text-foreground",
                      boldLast && "font-semibold",
                    )}
                    aria-current="page"
                  >
                    {item.name}
                  </span>
                ) : (
                  <Link
                    to={item.url}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* JSON-LD BreadcrumbList */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
    </>
  );
}
