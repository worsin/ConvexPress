import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convexpress-website/backend/generated/api";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Filter, GraduationCap, Lock, Search, Users, X } from "lucide-react";
import { z } from "zod";
import { useState } from "react";

import { MediaImage } from "@/components/media/MediaImage";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";

const coursesSearchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  access: z.string().optional(),
});

function buildCatalogArgs({
  q,
  category,
  tag,
  access,
}: {
  q?: string;
  category?: string;
  tag?: string;
  access?: string;
}) {
  return {
    search: q || undefined,
    category: category || undefined,
    tag: tag || undefined,
    accessMode: access || undefined,
  };
}

export const Route = createFileRoute("/_marketing/courses/")({
  validateSearch: coursesSearchSchema,
  loaderDeps: ({ search }) => ({
    q: search.q?.trim() ?? "",
    category: search.category?.trim() ?? "",
    tag: search.tag?.trim() ?? "",
    access: search.access?.trim() ?? "",
  }),
  loader: async ({ context: { queryClient }, deps }) => {
    const publicSettings = await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    );
    const siteUrl = normalizeSiteUrl(
      (publicSettings as { siteUrl?: string | null })?.siteUrl,
    );

    if (isPublicPluginEnabled("lms", publicSettings)) {
      await queryClient.ensureQueryData(
        convexQuery(api.lms.courses.queries.listCatalog, buildCatalogArgs(deps)),
      );
      await queryClient.ensureQueryData(
        convexQuery(api.lms.courses.queries.getCatalogFilters, {}),
      );
    }

    const canonicalQuery = new URLSearchParams();
    if (deps.q) canonicalQuery.set("q", deps.q);
    if (deps.category) canonicalQuery.set("category", deps.category);
    if (deps.tag) canonicalQuery.set("tag", deps.tag);
    if (deps.access) canonicalQuery.set("access", deps.access);
    const canonicalPath = canonicalQuery.size
      ? `/courses?${canonicalQuery.toString()}`
      : "/courses";

    return {
      seoHead: buildSeoHead({
        title: deps.q ? `Courses matching ${deps.q} - ConvexPress` : "Courses - ConvexPress",
        description: "Browse published courses from the ConvexPress learning catalog.",
        canonical: toAbsoluteUrl(canonicalPath, siteUrl),
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
  component: CoursesIndexPage,
});

type CourseCard = {
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

type CatalogFilter = { slug: string; label: string; count: number };

type CatalogFilters = {
  categories: CatalogFilter[];
  tags: CatalogFilter[];
  accessModes: CatalogFilter[];
};

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

function CoursesIndexPage() {
  const navigate = Route.useNavigate();
  const { q, category, tag, access } = Route.useLoaderDeps();
  const [query, setQuery] = useState(q);
  const { data: courses } = useSuspenseQuery(
    convexQuery(api.lms.courses.queries.listCatalog, buildCatalogArgs({ q, category, tag, access })) as any,
  ) as { data: CourseCard[] };
  const { data: filters } = useSuspenseQuery(
    convexQuery(api.lms.courses.queries.getCatalogFilters, {}) as any,
  ) as { data: CatalogFilters };

  function runSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void navigate({
      to: "/courses",
      search: {
        q: query.trim() || undefined,
        category: category || undefined,
        tag: tag || undefined,
        access: access || undefined,
      },
    } as any);
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
          <FilterGroup title="Access" active={access} items={filters.accessModes} param="access" />
          <FilterGroup title="Categories" active={category} items={filters.categories} param="category" />
          <FilterGroup title="Tags" active={tag} items={filters.tags} param="tag" />
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

        <main className="min-w-0">
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
                    <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
                      Course
                    </div>
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
        </main>
      </div>
    </div>
  );
}

function FilterGroup({
  title,
  items,
  active,
  param,
}: {
  title: string;
  items: CatalogFilter[];
  active?: string;
  param: "access" | "category" | "tag";
}) {
  const { q, category, tag, access } = Route.useLoaderDeps();
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

function humanize(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
