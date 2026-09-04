/**
 * Journal · blog.archive — posts by date. Each year is a rule-separated
 * section: the year in display type on the left, its months as a
 * rule-separated list with counts on the right. Same links as Core (every
 * month opens the blog index).
 */
import { Link } from "@tanstack/react-router";

import type { DateArchiveGroup } from "@/lib/blog/types";
import type { BlogArchiveSurfaceData } from "@/templates/packs/core/surfaces/blog.archive";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, EmptyState, LinkButton, SectionHeading, SkeletonBlock, SkeletonText } from "../parts";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function JournalBlogArchive({ data }: SurfaceProps<BlogArchiveSurfaceData>) {
  const groups = data.groups;
  return (
    <Container as="section" data-slot="archive-page" className="flex flex-col gap-14 py-6 md:gap-20 md:py-10">
      <SectionHeading level={1} eyebrow="The journal" title="Archive" lede="Browse all posts by date." />

      {groups === undefined ? (
        <div className="flex flex-col divide-y divide-border border-y border-border" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="grid gap-6 py-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,9fr)]">
              <SkeletonBlock className="h-10 w-28" />
              <SkeletonText lines={3} />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          eyebrow="Nothing yet"
          title="No posts found."
          action={
            <LinkButton to="/blog" variant="ghost">
              Back to the blog
            </LinkButton>
          }
        />
      ) : (
        <div className="flex flex-col divide-y divide-border border-y border-border">
          {groupByYear(groups).map(({ year, months }) => (
            <section key={year} className="grid gap-6 py-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,9fr)] lg:gap-12">
              <h2 className="font-display text-3xl leading-none tracking-tight text-foreground md:text-4xl">{year}</h2>
              <ul className="flex flex-col divide-y divide-border">
                {months.map(({ month, postCount }) => (
                  <li key={`${year}-${month ?? "all"}`}>
                    <Link to="/blog" search={{ page: 1 }} className="group flex items-baseline justify-between gap-6 py-3 transition-colors">
                      <span className="text-base text-foreground group-hover:text-primary md:text-[17px]">{month !== undefined ? MONTH_NAMES[month - 1] : year}</span>
                      <span className="text-[11px] font-medium uppercase tracking-[0.18em] tabular-nums text-muted-foreground">
                        {postCount} {postCount === 1 ? "post" : "posts"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Container>
  );
}

function groupByYear(groups: DateArchiveGroup[]): { year: number; months: DateArchiveGroup[] }[] {
  const byYear = new Map<number, DateArchiveGroup[]>();
  for (const group of groups) {
    const existing = byYear.get(group.year);
    if (existing) existing.push(group);
    else byYear.set(group.year, [group]);
  }
  return Array.from(byYear.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, months]) => ({ year, months: months.sort((a, b) => (b.month ?? 0) - (a.month ?? 0)) }));
}
