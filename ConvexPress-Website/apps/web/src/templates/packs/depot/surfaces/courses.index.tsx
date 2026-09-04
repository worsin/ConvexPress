/**
 * Depot · courses.index — the course catalog as a dense card grid: a search
 * bar in the page header, a toolbar of access / category / tag chips with the
 * sort select on the right, four-up cards, numbered pagination. Same filters,
 * links and empty states as Core.
 */
import { Link } from "@tanstack/react-router";
import { Award, BookOpen, GraduationCap, Search, X } from "lucide-react";
import { useState } from "react";

import { CourseImageFallback } from "@/components/lms/CourseImageFallback";
import { MediaImage } from "@/components/media/MediaImage";
import type { CatalogFilter, CourseCard, CoursesActiveFilters, CoursesIndexSurfaceData } from "@/templates/packs/core/surfaces/courses.index";
import { humanize } from "@/templates/packs/core/surfaces/courses.index";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Button, Card, Container, EmptyState, Label, Pagination, Select, Toolbar } from "../parts";
import { ChipLink, Input } from "../parts/extra-plugins";

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

function priceLabel(course: CourseCard): string {
  switch (course.accessMode) {
    case "open":
    case "free":
      return "Free";
    case "buy":
      return typeof course.price === "number" ? formatCents(course.price) : "Paid";
    case "recurring":
      return typeof course.recurringPrice === "number" ? `${formatCents(course.recurringPrice)}/mo` : "Subscription";
    case "closed":
      return "Closed";
    default:
      return "Members";
  }
}

function baseSearch(filters: CoursesActiveFilters) {
  return {
    q: filters.q || undefined,
    category: filters.category || undefined,
    tag: filters.tag || undefined,
    access: filters.access || undefined,
    sort: filters.sort === "newest" ? undefined : filters.sort,
  };
}

export default function DepotCoursesIndex({ data }: SurfaceProps<CoursesIndexSurfaceData>) {
  const { catalog, courses, filters, activeFilters, actions } = data;
  const { q, category, tag, access, sort } = activeFilters;
  const [query, setQuery] = useState(q);
  const hasFilters = Boolean(q || category || tag || access);
  const hasChips = filters.accessModes.length + filters.categories.length + filters.tags.length > 0;

  function runSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    actions.search(query.trim());
  }

  return (
    <Container padded={false} data-slot="courses-index" data-pack="depot" className="flex flex-col gap-4 py-6 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex flex-col gap-1">
          <Label>Learning</Label>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Courses</h1>
          <p className="max-w-2xl text-[13px] leading-5 text-muted-foreground">Structured courses with lessons, progress tracking, membership access rules and certificates of completion.</p>
        </div>
        <form onSubmit={runSearch} role="search" className="flex w-full gap-2 md:w-auto md:min-w-96">
          <label className="sr-only" htmlFor="course-search">
            Search courses
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="course-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search courses" className="pl-9" />
          </div>
          <Button type="submit">Search</Button>
        </form>
      </div>

      <Toolbar
        label="Course filters"
        end={
          <>
            <span className="text-[13px] tabular-nums text-muted-foreground">{catalog.total === 1 ? "1 course" : `${catalog.total} courses`}</span>
            <Select value={sort} onChange={(event) => actions.changeSort(event.target.value)} aria-label="Sort courses">
              <option value="newest">Newest</option>
              <option value="popular">Popular</option>
              <option value="title_asc">A-Z</option>
              <option value="title_desc">Z-A</option>
            </Select>
          </>
        }
      >
        {hasChips ? (
          <>
            <FilterChips param="access" items={filters.accessModes} active={access} filters={activeFilters} />
            <FilterChips param="category" items={filters.categories} active={category} filters={activeFilters} />
            <FilterChips param="tag" items={filters.tags} active={tag} filters={activeFilters} />
          </>
        ) : (
          <span className="text-[13px] text-muted-foreground">All courses</span>
        )}
        {hasFilters ? (
          <Link to="/courses" className="inline-flex h-8 items-center gap-1 px-2 text-[13px] font-medium text-muted-foreground hover:text-foreground">
            <X className="size-3.5" aria-hidden="true" />
            Clear filters
          </Link>
        ) : null}
      </Toolbar>

      {courses.length === 0 ? (
        <EmptyState
          title={
            <span className="inline-flex items-center gap-2">
              <GraduationCap className="size-4 text-muted-foreground" aria-hidden="true" />
              {hasFilters ? "No courses match those filters." : "No courses are published yet."}
            </span>
          }
          action={hasFilters ? <Link to="/courses" className="text-[13px] font-medium text-primary hover:underline">Clear filters</Link> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {courses.map((course) => (
            <CourseTile key={course._id} course={course} />
          ))}
        </div>
      )}

      <Pagination page={catalog.page} totalPages={catalog.totalPages} linkFor={(page) => ({ to: "/courses", search: { ...baseSearch(activeFilters), page: page === 1 ? undefined : page } })} />
    </Container>
  );
}

function FilterChips({ param, items, active, filters }: { param: "access" | "category" | "tag"; items: CatalogFilter[]; active?: string; filters: CoursesActiveFilters }) {
  if (!items.length) return null;
  const { q, category, tag, access, sort } = filters;
  return (
    <>
      {items.map((item) => {
        const on = active === item.slug;
        return (
          <ChipLink
            key={`${param}-${item.slug}`}
            to="/courses"
            active={on}
            search={{
              q: q || undefined,
              category: param === "category" ? (on ? undefined : item.slug) : category || undefined,
              tag: param === "tag" ? (on ? undefined : item.slug) : tag || undefined,
              access: param === "access" ? (on ? undefined : item.slug) : access || undefined,
              sort: sort === "newest" ? undefined : sort,
              page: undefined,
            }}
          >
            {item.label}
            <span className="tabular-nums text-muted-foreground">{item.count}</span>
          </ChipLink>
        );
      })}
    </>
  );
}

function CourseTile({ course }: { course: CourseCard }) {
  const labels = [...(course.categoryIds ?? []), ...(course.tagIds ?? [])].slice(0, 3);
  return (
    <Card as="article" className="flex flex-col overflow-hidden">
      <Link to="/courses/$slug" params={{ slug: course.slug }} className="relative block aspect-[4/3] bg-muted/40">
        {course.featuredImageId ? (
          <MediaImage mediaId={course.featuredImageId as any} alt={course.title} className="h-full w-full object-cover" preferredSize="large" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" />
        ) : (
          <CourseImageFallback title={course.title} subtitle={accessLabel(course)} />
        )}
        {course.accessMode === "open" || course.accessMode === "free" ? (
          <Badge tone="sale" className="absolute left-2 top-2">
            Free
          </Badge>
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <Label>{accessLabel(course)}</Label>
        <Link to="/courses/$slug" params={{ slug: course.slug }} className="line-clamp-2 text-sm font-semibold leading-5 text-foreground hover:text-primary">
          {course.title}
        </Link>
        {course.excerpt ? <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">{course.excerpt}</p> : null}
        {labels.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {labels.map((label) => (
              <Badge key={label} tone="stock" className="normal-case tracking-normal">
                {humanize(label)}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2">
          <span className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <BookOpen className="size-3" aria-hidden="true" />
              {course.lessonCount ?? 0} lessons
            </span>
            <span className="inline-flex items-center gap-1">
              <Award className="size-3" aria-hidden="true" />
              {course.topicCount ?? 0} topics
            </span>
          </span>
          <span className="text-sm font-semibold tabular-nums text-foreground">{priceLabel(course)}</span>
        </div>
      </div>
    </Card>
  );
}
