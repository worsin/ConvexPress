import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";

import { Button } from "@/components/ui/button";

interface PostFilterBarProps {
  /** Currently selected date range (e.g., "2026-01"). */
  dateRange?: string;
  /** Currently selected category ID. */
  categoryId?: string;
  /** Filter change handler. */
  onFilter: (filters: { dateRange?: string; categoryId?: string }) => void;
}

/**
 * Post-specific filter dropdowns: date range + category.
 * These appear in the toolbar between bulk actions and search.
 *
 * Categories are populated from the Convex taxonomies.list query.
 * Date options are generated from the post data.
 */
export function PostFilterBar({
  dateRange,
  categoryId,
  onFilter,
}: PostFilterBarProps) {
  const [selectedDate, setSelectedDate] = useState(dateRange ?? "");
  const [selectedCategory, setSelectedCategory] = useState(categoryId ?? "");

  // Fetch categories from Convex
  const categoriesResult = useQuery(api.taxonomies.queries.list, {
    taxonomy: "category",
    perPage: 100,
    hideEmpty: false,
  });

  const categories = categoriesResult?.terms ?? [];

  // Generate month options for the last 12 months
  const dateOptions = generateDateOptions();

  return (
    <div className="flex items-center gap-2">
      {/* Date range filter */}
      <select
        value={selectedDate}
        onChange={(e) => setSelectedDate(e.target.value)}
        className="h-8 rounded-none border border-input bg-transparent px-2 text-xs text-foreground outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
        aria-label="Filter by date"
      >
        <option value="">All Dates</option>
        {dateOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Category filter */}
      <select
        value={selectedCategory}
        onChange={(e) => setSelectedCategory(e.target.value)}
        className="h-8 rounded-none border border-input bg-transparent px-2 text-xs text-foreground outline-hidden focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
        aria-label="Filter by category"
      >
        <option value="">All Categories</option>
        {categories.map((cat: { _id: string; name: string }) => (
          <option key={cat._id} value={cat._id}>
            {cat.name}
          </option>
        ))}
      </select>

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          onFilter({
            dateRange: selectedDate || undefined,
            categoryId: selectedCategory || undefined,
          })
        }
      >
        Filter
      </Button>
    </div>
  );
}

/**
 * Generate date options for the last 12 months.
 * Returns an array of { value: "YYYY-MM", label: "Month YYYY" } objects.
 */
function generateDateOptions() {
  const options: { value: string; label: string }[] = [];
  const now = new Date();

  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const label = date.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    options.push({ value: `${year}-${month}`, label });
  }

  return options;
}
