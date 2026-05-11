/**
 * Breadcrumbs - Hierarchical breadcrumbs for taxonomy archive pages
 *
 * For categories: Home > Parent Category > ... > Category
 * For tags: Home > Tag: [Name]
 * Links to each level. Uses category hierarchy for depth.
 */

import { Link } from "@tanstack/react-router";
import { ChevronRight, Home } from "lucide-react";

import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface TaxonomyBreadcrumbsProps {
  /** The taxonomy type. */
  type: "category" | "tag";
  /** The current term name. */
  termName: string;
  /** The current term slug. */
  termSlug: string;
  /** For categories: ancestor chain from root to immediate parent. */
  ancestors?: Array<{ name: string; slug: string }>;
  /** Optional className. */
  className?: string;
}

export function TaxonomyBreadcrumbs({
  type,
  termName,
  termSlug: _termSlug,
  ancestors = [],
  className,
}: TaxonomyBreadcrumbsProps) {
  const items: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
  ];

  if (type === "category") {
    // Add ancestor categories
    for (const ancestor of ancestors) {
      items.push({
        label: ancestor.name,
        href: `/category/${ancestor.slug}`,
      });
    }
    // Current category (no link)
    items.push({ label: termName });
  } else {
    // Tags: Home > Tag: [Name]
    items.push({ label: `Tag: ${termName}` });
  }

  return (
    <nav
      data-slot="taxonomy-breadcrumbs"
      aria-label="Breadcrumb"
      className={cn("text-xs", className)}
    >
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li
              key={`${item.label}-${item.href ?? "current"}`}
              className="flex items-center gap-1"
            >
              {index > 0 && (
                <ChevronRight
                  className="size-3 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              {isLast || !item.href ? (
                <span
                  className="text-foreground"
                  aria-current={isLast ? "page" : undefined}
                >
                  {index === 0 ? (
                    <span className="flex items-center gap-1">
                      <Home className="size-3" />
                      {item.label}
                    </span>
                  ) : (
                    item.label
                  )}
                </span>
              ) : (
                <Link
                  to={item.href}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {index === 0 ? (
                    <span className="flex items-center gap-1">
                      <Home className="size-3" />
                      {item.label}
                    </span>
                  ) : (
                    item.label
                  )}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
