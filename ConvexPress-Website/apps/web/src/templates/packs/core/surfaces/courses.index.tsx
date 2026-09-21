/** Core · courses.index — the LMS course catalog with search, filters, sort and pagination. */
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Filter,
  GraduationCap,
  Lock,
  Search,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";

import { CourseImageFallback } from "@/components/lms/CourseImageFallback";
import { MediaImage } from "@/components/media/MediaImage";
import type { SurfaceProps } from "@/templates/sdk/types";

export type CourseSort = "newest" | "title_asc" | "title_desc" | "popular";

export type CourseCard = {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string;
  featuredImageId?: string;
  accessMode?: string;
  price?: number;
  recurringPrice?: number;
  lessonCount?: number;
  topicCount?: number;
  categoryIds?: string[];
  tagIds?: string[];
  allowed?: boolean;
  requiresLogin?: boolean;
};

export type CatalogFilter = { slug: string; label: string; count: number };

export type CatalogFilters = {
  categories: CatalogFilter[];
  tags: CatalogFilter[];
  accessModes: CatalogFilter[];
};

export type CatalogResult = {
  items: CourseCard[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export interface CoursesActiveFilters {
  q: string;
  category: string;
  tag: string;
  access: string;
  sort: CourseSort;
}

export interface CoursesIndexSurfaceData {
  /** The current page of the catalog (server or legacy-built). */
  catalog: CatalogResult;
  /** Rows to render (equals `catalog.items`). */
  courses: CourseCard[];
  /** Filter groups with counts. */
  filters: CatalogFilters;
  /** Filters currently applied from the URL. */
  activeFilters: CoursesActiveFilters;
  actions: {
    /** Navigate to the catalog with a new search query (already trimmed by the surface). */
    search: (query: string) => void;
    /** Navigate to the catalog with a new sort. */
    changeSort: (sort: string) => void;
  };
}

export function humanize(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function accessLabel(course: CourseCard) {
  switch (course.accessMode) {
    case "open":
      return "Open access";
    case "free":
      return "Free enrollment";
    case "buy":
      return typeof course.price === "number"
        ? `One-time ${formatCents(course.price)}`
        : "Paid course";
    case "recurring":
      return typeof course.recurringPrice === "number"
        ? `${formatCents(course.recurringPrice)} recurring`
        : "Recurring access";
    case "closed":
      return "Closed";
    case "members":
    default:
      return "Members";
  }
}

function formatCents(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount / 100);
}

export default function CoreCoursesIndex({ data }: SurfaceProps<CoursesIndexSurfaceData>) {
  const { catalog, courses, filters, activeFilters, actions } = data;
  const { q, category, tag, access, sort } = activeFilters;
  const [query, setQuery] = useState(q);

  function runSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    actions.search(query.trim());
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-6 border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            Learning
          </span>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            Courses built and published from the ConvexPress LMS.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            Explore structured courses with lessons, progress tracking,
            membership access rules, and certificates of completion.
          </p>
        </div>
        <form
          onSubmit={runSearch}
          role="search"
          className="flex flex-col gap-3 sm:flex-row"
        >
          <label className="sr-only" htmlFor="course-search">
            Search courses
          </label>
          <div className="flex min-h-11 flex-1 items-center gap-2 border border-input bg-background px-3">
            <Search className="size-4 text-muted-foreground" aria-hidden="true" />
            <input
              id="course-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search courses"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Search className="size-4" aria-hidden="true" />
            Search
          </button>
        </form>
      </section>

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-4">
          <FilterGroup title="Access" active={access} items={filters.accessModes} param="access" filters={activeFilters} />
          <FilterGroup title="Categories" active={category} items={filters.categories} param="category" filters={activeFilters} />
          <FilterGroup title="Tags" active={tag} items={filters.tags} param="tag" filters={activeFilters} />
          {(q || category || tag || access) ? (
            <Link
              to="/courses"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden="true" />
              Clear filters
            </Link>
          ) : null}
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {catalog.total === 1 ? "1 course" : `${catalog.total} courses`}
            </p>
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              Sort
              <select
                value={sort}
                onChange={(event) => actions.changeSort(event.target.value)}
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
              >
                <option value="newest">Newest</option>
                <option value="popular">Popular</option>
                <option value="title_asc">A-Z</option>
                <option value="title_desc">Z-A</option>
              </select>
            </label>
          </div>
          {courses.length === 0 ? (
            <div className="border border-dashed border-border p-10 text-center">
              <GraduationCap className="mx-auto mb-3 size-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {q || category || tag || access
                  ? "No courses match those filters."
                  : "No courses are published yet."}
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {courses.map((course) => (
                <article
                  key={course._id}
                  className="group overflow-hidden border border-border bg-card shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <Link to="/courses/$slug" params={{ slug: course.slug }} className="block">
                    <div className="aspect-[4/3] bg-muted/40">
                      {course.featuredImageId ? (
                        <MediaImage
                          mediaId={course.featuredImageId as any}
                          alt={course.title}
                          className="h-full w-full object-cover"
                          preferredSize="large"
                          sizes="(max-width: 768px) 100vw, 33vw"
                        />
                      ) : (
                        <CourseImageFallback
                          title={course.title}
                          subtitle={accessLabel(course)}
                        />
                      )}
                    </div>
                    <div className="flex flex-col gap-4 p-5">
                      <div className="flex flex-wrap gap-2 text-xs font-medium">
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-primary">
                          <Lock className="size-3" aria-hidden="true" />
                          {accessLabel(course)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                          <BookOpen className="size-3" aria-hidden="true" />
                          {course.lessonCount ?? 0} lessons
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                          <Users className="size-3" aria-hidden="true" />
                          {course.topicCount ?? 0} topics
                        </span>
                      </div>

                      <div>
                        <h2 className="text-xl font-semibold text-foreground">
                          {course.title}
                        </h2>
                        {course.excerpt ? (
                          <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                            {course.excerpt}
                          </p>
                        ) : null}
                        {(course.categoryIds?.length || course.tagIds?.length) ? (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {[...(course.categoryIds ?? []), ...(course.tagIds ?? [])]
                              .slice(0, 5)
                              .map((label) => (
                                <span
                                  key={label}
                                  className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                                >
                                  {humanize(label)}
                                </span>
                              ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </article>
              ))}
            </div>
          )}
          <Pagination catalog={catalog} filters={activeFilters} />
        </div>
      </div>
    </div>
  );
}

function FilterGroup({
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
    <section className="space-y-2 border border-border bg-card p-4">
      <h2 className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Filter className="size-3.5" aria-hidden="true" />
        {title}
      </h2>
      <div className="space-y-1">
        {items.map((item) => (
          <Link
            key={item.slug}
            to="/courses"
            search={{
              q: q || undefined,
              category: param === "category" ? item.slug : category || undefined,
              tag: param === "tag" ? item.slug : tag || undefined,
              access: param === "access" ? item.slug : access || undefined,
              sort: sort === "newest" ? undefined : sort,
              page: undefined,
            }}
            className={[
              "flex items-center justify-between gap-2 px-2 py-1.5 text-xs transition-colors",
              active === item.slug
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            ].join(" ")}
          >
            <span>{item.label}</span>
            <span>{item.count}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Pagination({ catalog, filters }: { catalog: CatalogResult; filters: CoursesActiveFilters }) {
  const { q, category, tag, access, sort } = filters;
  if (catalog.totalPages <= 1) return null;
  const baseSearch = {
    q: q || undefined,
    category: category || undefined,
    tag: tag || undefined,
    access: access || undefined,
    sort: sort === "newest" ? undefined : sort,
  };
  const previousPage = catalog.page > 1 ? catalog.page - 1 : null;
  const nextPage = catalog.page < catalog.totalPages ? catalog.page + 1 : null;

  return (
    <nav className="mt-8 flex flex-wrap items-center justify-between gap-3" aria-label="Course pages">
      <p className="text-xs text-muted-foreground">
        Page {catalog.page} of {catalog.totalPages}
      </p>
      <div className="flex items-center gap-2">
        {previousPage ? (
          <Link
            to="/courses"
            search={{ ...baseSearch, page: previousPage === 1 ? undefined : previousPage }}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Previous
          </Link>
        ) : null}
        {nextPage ? (
          <Link
            to="/courses"
            search={{ ...baseSearch, page: nextPage }}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
