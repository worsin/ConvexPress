/** Core · blog.archive — posts by date, grouped by year then month. */
import { Link } from "@tanstack/react-router";
import { Calendar } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { DateArchiveGroup } from "@/lib/blog/types";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface BlogArchiveSurfaceData {
  /** Year/month buckets with post counts; `undefined` while loading. */
  groups: DateArchiveGroup[] | undefined;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function CoreBlogArchive({ data }: SurfaceProps<BlogArchiveSurfaceData>) {
  const archiveGroups = data.groups;
  return (
    <div data-slot="archive-page" className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-border pb-6">
        <h1 className="text-lg font-bold">Archive</h1>
        <p className="text-xs text-muted-foreground">
          Browse all posts by date
        </p>
      </div>

      {/* Archive Groups */}
      {archiveGroups === undefined ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-5 w-24" />
              <div className="flex flex-col gap-1 pl-4">
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-44" />
              </div>
            </div>
          ))}
        </div>
      ) : archiveGroups.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-xs text-muted-foreground">No posts found.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Group by year */}
          {groupByYear(archiveGroups).map(({ year, months }) => (
            <div key={year} className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Calendar className="size-4 text-muted-foreground" aria-hidden="true" />
                {year}
              </h2>
              <ul className="flex flex-col gap-1.5 pl-6">
                {months.map(({ month, postCount }) => (
                  <li key={`${year}-${month}`}>
                    <Link
                      to="/blog"
                      search={{ page: 1 }}
                      className="flex items-center justify-between text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <span>
                        {month !== undefined ? MONTH_NAMES[month - 1] : year}
                      </span>
                      <span className="text-muted-foreground/60">
                        ({postCount})
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Group flat archive data into year -> months hierarchy.
 */
function groupByYear(
  groups: DateArchiveGroup[],
): { year: number; months: DateArchiveGroup[] }[] {
  const yearMap = new Map<number, DateArchiveGroup[]>();

  for (const group of groups) {
    const existing = yearMap.get(group.year);
    if (existing) {
      existing.push(group);
    } else {
      yearMap.set(group.year, [group]);
    }
  }

  return Array.from(yearMap.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, months]) => ({
      year,
      months: months.sort((a, b) => (b.month ?? 0) - (a.month ?? 0)),
    }));
}
