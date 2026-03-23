/**
 * Pages Widget - Website Renderer
 *
 * Displays a list of published pages.
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

interface PagesWidgetConfig {
  sortBy?: string;
  excludePageIds?: string;
}

export function PagesWidget({ config }: { config: PagesWidgetConfig }) {
  // useQuery never throws - it returns undefined while loading.
  // No try/catch needed (and wrapping hooks in try/catch is an anti-pattern).
  // Optional chaining on api.pages?.queries?.listPublished is kept for safety
  // because the ConvexPress-Website's Convex codegen types may not include page system paths.
  const pages = useQuery(api.pages?.queries?.listPublished as any, {});

  if (!pages || pages.length === 0) {
    return <p className="text-sm text-muted-foreground">No pages.</p>;
  }

  // Apply exclusions
  let displayPages = [...pages];
  if (config.excludePageIds) {
    const excludeIds = config.excludePageIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    displayPages = displayPages.filter(
      (p) => !excludeIds.includes(p._id),
    );
  }

  // Sort
  if (config.sortBy === "title") {
    displayPages.sort((a, b) =>
      (a.title || "").localeCompare(b.title || ""),
    );
  } else if (config.sortBy === "date") {
    displayPages.sort(
      (a, b) =>
        (b.publishedAt || b.createdAt || 0) -
        (a.publishedAt || a.createdAt || 0),
    );
  }

  return (
    <ul className="space-y-1">
      {displayPages.map((page) => (
        <li key={page._id}>
          <a
            href={`/${page.slug}`}
            className="text-sm hover:underline"
          >
            {page.title}
          </a>
        </li>
      ))}
    </ul>
  );
}
