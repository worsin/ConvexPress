import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convexpress-website/backend/generated/api";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, GraduationCap, Lock, Users } from "lucide-react";
import { z } from "zod";

import { MediaImage } from "@/components/media/MediaImage";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";

const coursesSearchSchema = z.object({
  q: z.string().optional(),
});

export const Route = createFileRoute("/_marketing/courses/")({
  validateSearch: coursesSearchSchema,
  loaderDeps: ({ search }) => ({ q: search.q?.trim() ?? "" }),
  loader: async ({ context: { queryClient }, deps: { q } }) => {
    const publicSettings = await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    );
    const siteUrl = normalizeSiteUrl(
      (publicSettings as { siteUrl?: string | null })?.siteUrl,
    );

    if (isPublicPluginEnabled("lms", publicSettings)) {
      await queryClient.ensureQueryData(
        convexQuery(api.lms.courses.queries.listPublished, {}),
      );
    }

    return {
      seoHead: buildSeoHead({
        title: q ? `Courses matching ${q} - ConvexPress` : "Courses - ConvexPress",
        description: "Browse published courses from the ConvexPress learning catalog.",
        canonical: toAbsoluteUrl(q ? `/courses?q=${encodeURIComponent(q)}` : "/courses", siteUrl),
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
  const { q } = Route.useLoaderDeps();
  const { data } = useSuspenseQuery(
    convexQuery(api.lms.courses.queries.listPublished, {}) as any,
  ) as { data: CourseCard[] };

  const search = q.toLowerCase();
  const courses = search
    ? data.filter((course) => course.title.toLowerCase().includes(search))
    : data;

  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-6 rounded-[2rem] border border-border/60 bg-card p-8 shadow-sm">
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
      </section>

      {courses.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-10 text-center">
          <GraduationCap className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No courses are published yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <article
              key={course._id}
              className="group overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
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
                  </div>
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
