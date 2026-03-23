/**
 * Archives Widget - Website Renderer
 *
 * Displays a monthly or yearly archive of posts as a list or dropdown.
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

interface ArchivesWidgetConfig {
  display?: "list" | "dropdown";
  showCounts?: boolean;
  type?: "monthly" | "yearly";
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function ArchivesWidget({
  config,
}: {
  config: ArchivesWidgetConfig;
}) {
  // Use the dedicated getDateArchiveGroups query instead of fetching all posts
  const archiveGroups = useQuery(api.posts.queries.getDateArchiveGroups, {});

  if (!archiveGroups || archiveGroups.length === 0) {
    return <p className="text-sm text-muted-foreground">No archives.</p>;
  }

  // Build archive entries from the grouped data
  let archives: Array<{ label: string; url: string; count: number }>;

  if (config.type === "yearly") {
    // Aggregate months into years
    const yearMap = new Map<number, number>();
    for (const g of archiveGroups) {
      yearMap.set(g.year, (yearMap.get(g.year) ?? 0) + g.count);
    }
    archives = Array.from(yearMap.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, count]) => ({
        label: `${year}`,
        url: `/archives/${year}`,
        count,
      }));
  } else {
    // Monthly (default)
    archives = archiveGroups.map((g: (typeof archiveGroups)[number]) => ({
      label: `${MONTH_NAMES[g.month - 1]} ${g.year}`,
      url: `/archives/${g.year}/${String(g.month).padStart(2, "0")}`,
      count: g.count,
    }));
  }

  if (archives.length === 0) {
    return <p className="text-sm text-muted-foreground">No archives.</p>;
  }

  if (config.display === "dropdown") {
    return (
      <select
        onChange={(e) => {
          if (e.target.value) window.location.href = e.target.value;
        }}
        className="w-full border border-border bg-transparent px-2 py-1.5 text-sm outline-hidden focus:border-border/80 focus:ring-1 focus:ring-ring"
        defaultValue=""
      >
        <option value="">Select Month</option>
        {archives.map((a) => (
          <option key={a.url} value={a.url}>
            {a.label}
            {config.showCounts ? ` (${a.count})` : ""}
          </option>
        ))}
      </select>
    );
  }

  return (
    <ul className="space-y-1">
      {archives.map((a) => (
        <li key={a.url}>
          <a
            href={a.url}
            className="text-sm hover:underline inline-flex items-center gap-1"
          >
            {a.label}
            {config.showCounts && (
              <span className="text-xs text-muted-foreground">({a.count})</span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
