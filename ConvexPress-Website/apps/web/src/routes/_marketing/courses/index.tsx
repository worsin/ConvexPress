import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convexpress-website/backend/generated/api";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { LmsRoutePending } from "@/components/lms/LmsRoutePending";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl, siteTitled } from "@/lib/seo/head";
import CoreCoursesIndex, {
  humanize,
  type CatalogFilters,
  type CatalogResult,
  type CourseCard,
  type CoursesIndexSurfaceData,
} from "@/templates/packs/core/surfaces/courses.index";
import { Surface } from "@/templates/sdk/Surface";

const coursesSearchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  access: z.string().optional(),
  sort: z.enum(["newest", "title_asc", "title_desc", "popular"]).optional(),
  page: z.coerce.number().int().positive().optional(),
});

function buildCatalogArgs({
  q,
  category,
  tag,
  access,
  sort,
  page,
}: {
  q?: string;
  category?: string;
  tag?: string;
  access?: string;
  sort?: string;
  page?: number;
}) {
  return {
    search: q || undefined,
    category: category || undefined,
    tag: tag || undefined,
    accessMode: access || undefined,
    sort: sort || "newest",
    page: page || 1,
    pageSize: 12,
  };
}

function buildLegacyCatalogArgs(q?: string) {
  return q?.trim() ? { search: q.trim() } : {};
}

export const Route = createFileRoute("/_marketing/courses/")({
  validateSearch: coursesSearchSchema,
  loaderDeps: ({ search }) => ({
    q: search.q?.trim() ?? "",
    category: search.category?.trim() ?? "",
    tag: search.tag?.trim() ?? "",
    access: search.access?.trim() ?? "",
    sort: search.sort ?? "newest",
    page: search.page ?? 1,
  }),
  loader: async ({ context: { queryClient }, deps }) => {
    const publicSettings = await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    );
    const siteUrl = normalizeSiteUrl(
      (publicSettings as { siteUrl?: string | null })?.siteUrl,
    );

    let catalogMode: "server" | "legacy" = "server";

    const lmsEnabled = isPublicPluginEnabled("lms", publicSettings);

    if (lmsEnabled) {
      try {
        await queryClient.ensureQueryData(
          convexQuery((api as any).lms.courses.queries.getCatalog, buildCatalogArgs(deps)),
        );
        await queryClient.ensureQueryData(
          convexQuery((api as any).lms.courses.queries.getCatalogFilters, {}),
        );
      } catch {
        catalogMode = "legacy";
        await queryClient.ensureQueryData(
          convexQuery((api as any).lms.courses.queries.listCatalog, buildLegacyCatalogArgs(deps.q)),
        );
        await queryClient.ensureQueryData(
          convexQuery((api as any).lms.courses.queries.listCatalog, {}),
        );
      }
    }

    const canonicalQuery = new URLSearchParams();
    if (deps.q) canonicalQuery.set("q", deps.q);
    if (deps.category) canonicalQuery.set("category", deps.category);
    if (deps.tag) canonicalQuery.set("tag", deps.tag);
    if (deps.access) canonicalQuery.set("access", deps.access);
    if (deps.sort && deps.sort !== "newest") canonicalQuery.set("sort", deps.sort);
    if (deps.page > 1) canonicalQuery.set("page", String(deps.page));
    const canonicalPath = canonicalQuery.size
      ? `/courses?${canonicalQuery.toString()}`
      : "/courses";

    return {
      catalogMode,
      lmsEnabled,
      seoHead: buildSeoHead({
        title: deps.q ? siteTitled(`Courses matching ${deps.q}`) : siteTitled("Courses"),
        description: "Browse published courses from the ConvexPress learning catalog.",
        canonical: toAbsoluteUrl(canonicalPath, siteUrl),
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
  pendingComponent: () => <LmsRoutePending label="Loading courses" />,
  component: CoursesIndexPage,
});

function CoursesIndexPage() {
  const { catalogMode, lmsEnabled } = Route.useLoaderData();
  if (!lmsEnabled) return <NotFoundPage />;
  return catalogMode === "legacy" ? <LegacyCatalogPage /> : <ServerCatalogPage />;
}

/** Navigation callbacks shared by both catalog modes. */
function useCatalogActions(): CoursesIndexSurfaceData["actions"] {
  const navigate = Route.useNavigate();
  const { q, category, tag, access, sort } = Route.useLoaderDeps();

  function search(query: string) {
    void navigate({
      to: "/courses",
      search: {
        q: query || undefined,
        category: category || undefined,
        tag: tag || undefined,
        access: access || undefined,
        sort: sort === "newest" ? undefined : sort,
        page: undefined,
      },
    } as any);
  }

  function changeSort(nextSort: string) {
    void navigate({
      to: "/courses",
      search: {
        q: q || undefined,
        category: category || undefined,
        tag: tag || undefined,
        access: access || undefined,
        sort: nextSort === "newest" ? undefined : nextSort,
        page: undefined,
      },
    } as any);
  }

  return { search, changeSort };
}

function ServerCatalogPage() {
  const { q, category, tag, access, sort, page } = Route.useLoaderDeps();
  const actions = useCatalogActions();
  const { data: catalog } = useSuspenseQuery(
    convexQuery(
      (api as any).lms.courses.queries.getCatalog,
      buildCatalogArgs({ q, category, tag, access, sort, page }),
    ) as any,
  ) as { data: CatalogResult };
  const { data: filters } = useSuspenseQuery(
    convexQuery((api as any).lms.courses.queries.getCatalogFilters, {}) as any,
  ) as { data: CatalogFilters };

  const data: CoursesIndexSurfaceData = {
    catalog,
    courses: catalog.items,
    filters,
    activeFilters: { q, category, tag, access, sort },
    actions,
  };

  return <Surface name="courses.index" data={data} fallback={CoreCoursesIndex} />;
}

function LegacyCatalogPage() {
  const deps = Route.useLoaderDeps();
  const { q, category, tag, access, sort } = deps;
  const actions = useCatalogActions();
  const { data: searchCourses } = useSuspenseQuery(
    convexQuery(
      (api as any).lms.courses.queries.listCatalog,
      buildLegacyCatalogArgs(q),
    ) as any,
  ) as { data: CourseCard[] };
  const { data: allCourses } = useSuspenseQuery(
    convexQuery((api as any).lms.courses.queries.listCatalog, {}) as any,
  ) as { data: CourseCard[] };
  const catalog = buildLegacyCatalog(searchCourses, deps);
  const filters = buildLegacyFilters(allCourses);

  const data: CoursesIndexSurfaceData = {
    catalog,
    courses: catalog.items,
    filters,
    activeFilters: { q, category, tag, access, sort },
    actions,
  };

  return <Surface name="courses.index" data={data} fallback={CoreCoursesIndex} />;
}

function buildLegacyCatalog(courses: CourseCard[], deps: ReturnType<typeof Route.useLoaderDeps>): CatalogResult {
  const pageSize = 12;
  const requestedPage = Math.max(Math.floor(deps.page ?? 1), 1);
  let rows = courses.filter((course) => {
    if (deps.category && !hasSlug(course.categoryIds, deps.category)) return false;
    if (deps.tag && !hasSlug(course.tagIds, deps.tag)) return false;
    if (deps.access && (course.accessMode ?? "members") !== deps.access) return false;
    return true;
  });

  rows = sortLegacyCatalogRows(rows, deps.sort ?? "newest");
  const total = rows.length;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
  const safePage = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1;
  const start = (safePage - 1) * pageSize;

  return {
    items: rows.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

function sortLegacyCatalogRows(courses: CourseCard[], sort = "newest") {
  const rows = [...courses];
  if (sort === "title_asc") {
    return rows.sort((a, b) => a.title.localeCompare(b.title));
  }
  if (sort === "title_desc") {
    return rows.sort((a, b) => b.title.localeCompare(a.title));
  }
  if (sort === "popular") {
    return rows.sort((a, b) => {
      const accessDiff = Number(b.allowed === true) - Number(a.allowed === true);
      return accessDiff || a.title.localeCompare(b.title);
    });
  }
  return rows;
}

function buildLegacyFilters(courses: CourseCard[]): CatalogFilters {
  function counts(values: unknown[]) {
    const map = new Map<string, number>();
    for (const value of values) {
      if (typeof value !== "string") continue;
      const slug = normalizeSlug(value);
      if (!slug) continue;
      map.set(slug, (map.get(slug) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([slug, count]) => ({ slug, label: humanize(slug), count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  return {
    categories: counts(courses.flatMap((course) => course.categoryIds ?? [])),
    tags: counts(courses.flatMap((course) => course.tagIds ?? [])),
    accessModes: counts(courses.map((course) => course.accessMode ?? "members")),
  };
}

function hasSlug(values: string[] | undefined, slug: string) {
  const normalized = normalizeSlug(slug);
  return (values ?? []).some((value) => normalizeSlug(value) === normalized);
}

function normalizeSlug(value: string) {
  return value.trim().toLowerCase();
}
