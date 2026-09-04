/**
 * Depot · blog.archive — posts by date. The archive data is year/month
 * buckets with counts (no post rows), so each year is a card with a dense
 * table of months and counts; every month links into the blog list, as in
 * Core.
 */
import { Link } from "@tanstack/react-router";

import type { DateArchiveGroup } from "@/lib/blog/types";
import type { BlogArchiveSurfaceData } from "@/templates/packs/core/surfaces/blog.archive";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Card, Container, EmptyState, Label, Skeleton, Td, Th } from "../parts";
import { PageHeader } from "../parts/extra";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function DepotBlogArchive({ data }: SurfaceProps<BlogArchiveSurfaceData>) {
  const groups = data.groups;
  const total = groups?.reduce((sum, group) => sum + group.postCount, 0) ?? 0;

  return (
    <Container padded={false} data-slot="archive-page" className="flex flex-col gap-4 py-6 md:py-8">
      <PageHeader label="Blog" title="Archive" description="Browse all posts by date." meta={groups && total > 0 ? `${total} ${total === 1 ? "post" : "posts"}` : undefined} />

      {groups === undefined ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-48" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState title="No posts found." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groupByYear(groups).map(({ year, months, count }) => (
            <Card key={year} as="section" aria-labelledby={`archive-${year}`} className="flex flex-col">
              <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2">
                <h2 id={`archive-${year}`} className="text-lg font-semibold tabular-nums text-foreground">
                  {year}
                </h2>
                <Label>
                  {count} {count === 1 ? "post" : "posts"}
                </Label>
              </div>
              <table className="w-full border-collapse text-[13px] text-foreground">
                <caption className="sr-only">Posts in {year} by month</caption>
                <thead className="sr-only">
                  <tr>
                    <Th>Month</Th>
                    <Th className="text-right">Posts</Th>
                  </tr>
                </thead>
                <tbody>
                  {months.map(({ month, postCount }) => (
                    <tr key={`${year}-${month ?? "all"}`} className="border-t border-border first:border-t-0">
                      <Td className="p-0">
                        <Link to="/blog" search={{ page: 1 }} className="flex items-center justify-between gap-2 px-3 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                          <span>{month !== undefined ? MONTH_NAMES[month - 1] : year}</span>
                          <span className="tabular-nums">{postCount}</span>
                        </Link>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
    </Container>
  );
}

function groupByYear(groups: DateArchiveGroup[]): Array<{ year: number; months: DateArchiveGroup[]; count: number }> {
  const byYear = new Map<number, DateArchiveGroup[]>();
  for (const group of groups) {
    const existing = byYear.get(group.year);
    if (existing) existing.push(group);
    else byYear.set(group.year, [group]);
  }
  return Array.from(byYear.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, months]) => ({
      year,
      months: months.sort((a, b) => (b.month ?? 0) - (a.month ?? 0)),
      count: months.reduce((sum, month) => sum + month.postCount, 0),
    }));
}
