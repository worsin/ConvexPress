/**
 * Categories Widget - Website Renderer
 *
 * Displays categories as a list or dropdown with optional post counts and hierarchy.
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

interface CategoriesWidgetConfig {
  display?: "list" | "dropdown";
  showCounts?: boolean;
  showHierarchy?: boolean;
}

export function CategoriesWidget({
  config,
}: {
  config: CategoriesWidgetConfig;
}) {
  // useQuery never throws - it returns undefined while loading.
  // No try/catch needed (and wrapping hooks in try/catch is an anti-pattern).
  const categories = useQuery(api.taxonomies.queries.getCategoryTree, {});

  if (!categories || categories.length === 0) {
    return <p className="text-sm text-muted-foreground">No categories.</p>;
  }

  if (config.display === "dropdown") {
    return (
      <select
        onChange={(e) => {
          if (e.target.value) {
            window.location.href = e.target.value;
          }
        }}
        className="w-full border border-border bg-transparent px-2 py-1.5 text-sm outline-hidden focus:border-border/80 focus:ring-1 focus:ring-ring"
        defaultValue=""
      >
        <option value="">Select Category</option>
        {categories.map((cat: (typeof categories)[number]) => (
          <option key={cat._id} value={`/category/${cat.slug}`}>
            {cat.name}
            {config.showCounts && cat.count !== undefined
              ? ` (${cat.count})`
              : ""}
          </option>
        ))}
      </select>
    );
  }

  return (
    <ul className="space-y-1">
      {categories.map((cat: (typeof categories)[number]) => (
        <li key={cat._id}>
          <a
            href={`/category/${cat.slug}`}
            className="text-sm hover:underline inline-flex items-center gap-1"
          >
            {cat.name}
            {config.showCounts && cat.count !== undefined && (
              <span className="text-xs text-muted-foreground">({cat.count})</span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
