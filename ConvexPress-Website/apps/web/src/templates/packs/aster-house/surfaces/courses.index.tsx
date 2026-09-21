/**
 * Aster · courses.index — the course catalog as an editorial list: display
 * heading, one underline search line, filters as rows of text links under a
 * rule (access · categories · tags) with the sort select on the right, then a
 * two-column list of courses (3:2 image, small-caps meta, display title) and
 * Previous / page / Next pagination.
 *
 * Same URL contract as Core (`/courses?q=&category=&tag=&access=&sort=&page=`).
 */
import { Link } from "@tanstack/react-router";
import { ChevronDown, Search, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { CourseImageFallback } from "@/components/lms/CourseImageFallback";
import { MediaImage } from "@/components/media/MediaImage";
import { cn } from "@/lib/utils";
import { humanize, type CatalogFilter, type CourseCard, type CoursesActiveFilters, type CoursesIndexSurfaceData } from "@/templates/packs/core/surfaces/courses.index";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Container, EmptyState, LinkButton, Pagination, SectionHeading, SmallCaps, UnderlineInput } from "../parts";

function formatCents(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount / 100);
}

function accessLabel(course: CourseCard) {
  switch (course.accessMode) {
    case "open":
      return "Open access";
    case "free":
      return "Free enrollment";
    case "buy":
      return typeof course.price === "number" ? `One-time ${formatCents(course.price)}` : "Paid course";
    case "recurring":
      return typeof course.recurringPrice === "number" ? `${formatCents(course.recurringPrice)} recurring` : "Recurring access";
    case "closed":
      return "Closed";
    case "members":
    default:
      return "Members";
  }
}

export default function AsterCoursesIndex({ data }: SurfaceProps<CoursesIndexSurfaceData>) {
  const { catalog, courses, filters, activeFilters, actions } = data;
  const { q, category, tag, access, sort } = activeFilters;
  const [query, setQuery] = useState(q);
  const hasFilters = !!(q || category || tag || access);

  function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    actions.search(query.trim());
  }

  const baseSearch = {
    q: q || undefined,
    category: category || undefined,
    tag: tag || undefined,
    access: access || undefined,
    sort: sort === "newest" ? undefined : sort,
  };

  return (
    <Container data-slot="courses-index" className="flex flex-col gap-10 py-6 pb-16 md:py-10">
      <header className="flex flex-col gap-8">
        <SectionHeading
          level={1}
          eyebrow="Learning"
          title={
            q ? (
              <>
                Courses matching <span className="text-primary">“{q}”</span>
              </>
            ) : (
              "Courses"
            )
          }
          lede="Structured courses with lessons, progress tracking, membership access rules, and certificates of completion."
          action={<SmallCaps className="tabular-nums">{catalog.total === 1 ? "1 course" : `${catalog.total} courses`}</SmallCaps>}
        />

        <form onSubmit={runSearch} role="search" className="flex max-w-xl items-end gap-4">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search courses</span>
            <Search className="pointer-events-none absolute left-0 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <UnderlineInput id="course-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search courses…" className="pl-7 pr-8" />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  actions.search("");
                }}
                className="absolute right-0 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <button type="submit" className="h-11 shrink-0 text-sm font-medium text-foreground underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground">
            Search
          </button>
        </form>
      </header>

      {/* Filters: text-link rows, sort on the right */}
      <div className="flex flex-col gap-4 border-y border-border py-4" aria-label="Filters">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-col gap-3">
            <FilterRow title="Access" items={filters.accessModes} active={access} param="access" filters={activeFilters} />
            <FilterRow title="Categories" items={filters.categories} active={category} param="category" filters={activeFilters} />
            <FilterRow title="Tags" items={filters.tags} active={tag} param="tag" filters={activeFilters} />
            {hasFilters ? (
              <Link to="/courses" className="self-start text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
                Clear filters
              </Link>
            ) : null}
          </div>
          <label className="relative inline-flex shrink-0 items-center gap-2 self-start">
            <SmallCaps>Sort</SmallCaps>
            <span className="relative">
              <select
                value={sort}
                onChange={(event) => actions.changeSort(event.target.value)}
                className="h-9 appearance-none rounded-none border-0 border-b border-border bg-transparent pr-6 text-sm text-foreground focus:border-foreground focus:outline-none"
                aria-label="Sort courses"
              >
                <option value="newest">Newest</option>
                <option value="popular">Popular</option>
                <option value="title_asc">A-Z</option>
                <option value="title_desc">Z-A</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            </span>
          </label>
        </div>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          eyebrow="Nothing here"
          title={hasFilters ? "No courses match those filters." : "No courses are published yet."}
          action={
            hasFilters ? (
              <LinkButton to="/courses" variant="ghost">
                Clear filters
              </LinkButton>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-12">
          <div className="grid gap-x-10 gap-y-2 md:grid-cols-2">
            {courses.map((course) => (
              <CourseRow key={course._id} course={course} />
            ))}
          </div>
          <Pagination
            page={catalog.page}
            totalPages={catalog.totalPages}
            getLink={(target) => ({ to: "/courses", search: { ...baseSearch, page: target === 1 ? undefined : target } })}
          />
        </div>
      )}
    </Container>
  );
}

function CourseRow({ course }: { course: CourseCard }) {
  const labels = [...(course.categoryIds ?? []), ...(course.tagIds ?? [])].slice(0, 5);
  return (
    <article data-slot="aster-course-card" className="group flex flex-col gap-4 border-b border-border pb-8">
      <Link to="/courses/$slug" params={{ slug: course.slug }} className="block overflow-hidden rounded-2xl bg-muted" tabIndex={-1} aria-hidden="true">
        <div className="aspect-[3/2] w-full">
          {course.featuredImageId ? (
            <MediaImage
              mediaId={course.featuredImageId as any}
              alt={course.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              preferredSize="large"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          ) : (
            <CourseImageFallback title={course.title} subtitle={accessLabel(course)} />
          )}
        </div>
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">{accessLabel(course)}</span>
        <span className="text-muted-foreground/60" aria-hidden="true">
          ·
        </span>
        <SmallCaps className="tabular-nums">{course.lessonCount ?? 0} lessons</SmallCaps>
        <span className="text-muted-foreground/60" aria-hidden="true">
          ·
        </span>
        <SmallCaps className="tabular-nums">{course.topicCount ?? 0} topics</SmallCaps>
      </div>
      <h2 className="font-display text-2xl leading-snug tracking-tight text-foreground text-balance md:text-[1.75rem]">
        <Link to="/courses/$slug" params={{ slug: course.slug }} className="transition-colors hover:text-primary">
          {course.title}
        </Link>
      </h2>
      {course.excerpt ? <p className="line-clamp-3 text-base leading-7 text-muted-foreground">{course.excerpt}</p> : null}
      {labels.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Topics">
          {labels.map((label) => (
            <li key={label} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              {humanize(label)}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function FilterRow({
  title,
  items,
  active,
  param,
  filters,
}: {
  title: string;
  items: CatalogFilter[];
  active?: string;
  param: "access" | "category" | "tag";
  filters: CoursesActiveFilters;
}) {
  const { q, category, tag, access, sort } = filters;
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
      <SmallCaps as="h2" className="w-20 shrink-0">
        {title}
      </SmallCaps>
      <ul className="flex flex-wrap items-baseline gap-x-6 gap-y-2" aria-label={title}>
        {items.map((item) => {
          const isActive = active === item.slug;
          return (
            <li key={item.slug}>
              <Link
                to="/courses"
                search={{
                  q: q || undefined,
                  category: param === "category" ? (isActive ? undefined : item.slug) : category || undefined,
                  tag: param === "tag" ? (isActive ? undefined : item.slug) : tag || undefined,
                  access: param === "access" ? (isActive ? undefined : item.slug) : access || undefined,
                  sort: sort === "newest" ? undefined : sort,
                  page: undefined,
                }}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "inline-flex items-baseline gap-1.5 text-sm tracking-wide transition-colors",
                  isActive ? "text-foreground underline decoration-foreground underline-offset-[6px]" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                <span className="text-[11px] tabular-nums text-muted-foreground">{item.count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
