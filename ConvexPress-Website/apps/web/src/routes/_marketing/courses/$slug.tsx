import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convexpress-website/backend/generated/api";
import { useAuth } from "@clerk/clerk-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Lock,
  PlayCircle,
} from "lucide-react";
import { toast } from "sonner";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { MediaImage } from "@/components/media/MediaImage";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";

export const Route = createFileRoute("/_marketing/courses/$slug")({
  loader: async ({ context: { queryClient }, params }) => {
    const publicSettings = await queryClient.ensureQueryData(
      convexQuery(api.settings.queries.getPublic, {}),
    );
    const siteUrl = normalizeSiteUrl(
      (publicSettings as { siteUrl?: string | null })?.siteUrl,
    );

    if (!isPublicPluginEnabled("lms", publicSettings)) {
      return {
        seoHead: buildSeoHead({
          title: "Course - ConvexPress",
          canonical: toAbsoluteUrl(`/courses/${params.slug}`, siteUrl),
        }),
      };
    }

    const course = await queryClient.ensureQueryData(
      convexQuery(api.lms.courses.queries.getBySlug, { slug: params.slug }),
    );
    if (course?._id) {
      await queryClient.ensureQueryData(
        convexQuery(api.lms.nodes.queries.getCourseTree, {
          courseId: course._id,
        }),
      );
    }

    return {
      seoHead: buildSeoHead({
        title: `${course?.title ?? params.slug} - Course - ConvexPress`,
        description:
          course?.excerpt ??
          `View the curriculum for ${course?.title ?? params.slug}.`,
        canonical: toAbsoluteUrl(`/courses/${params.slug}`, siteUrl),
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
  component: CourseDetailPage,
});

type Course = {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string;
  featuredImageId?: string;
  promoVideoUrl?: string;
  accessMode?: string;
  price?: number;
  recurringPrice?: number;
  lessonCount?: number;
  topicCount?: number;
  certificateId?: string;
  externalButtonUrl?: string;
};

type LessonNode = {
  _id: string;
  kind: string;
  title: string;
  isPreview?: boolean;
};

type TopicNode = {
  _id: string;
  title: string;
  children: LessonNode[];
};

type CourseTree = {
  topics: TopicNode[];
};

function CourseDetailPage() {
  const { slug } = Route.useParams();
  const { data: course } = useSuspenseQuery(
    convexQuery(api.lms.courses.queries.getBySlug, { slug }) as any,
  ) as { data: Course | null };

  if (!course) {
    return <NotFoundPage />;
  }

  return <CourseDetailContent course={course} />;
}

function CourseDetailContent({ course }: { course: Course }) {
  const { isSignedIn } = useAuth();
  const { data: tree } = useSuspenseQuery(
    convexQuery(api.lms.nodes.queries.getCourseTree, {
      courseId: course._id as any,
    }) as any,
  ) as { data: CourseTree };
  const access = useQuery((api as any).lms.enrollment.queries.canAccessCourse, {
    courseId: course._id as any,
  }) as
    | { allowed: boolean; reason: string; requiresLogin?: boolean }
    | undefined;
  const enrollment = useQuery(
    (api as any).lms.enrollment.queries.getEnrollment,
    isSignedIn ? { courseId: course._id as any } : "skip",
  ) as { _id: string } | null | undefined;
  const enroll = useMutation((api as any).lms.enrollment.mutations.enroll);

  const firstLesson = tree.topics
    .flatMap((topic) => topic.children)
    .find((node) => node.kind === "lesson");
  const canEnterDashboard = !!enrollment && !!firstLesson;
  const canSelfEnroll =
    access?.allowed === true ||
    access?.reason === "free" ||
    access?.reason === "open";

  async function handleEnroll() {
    try {
      await enroll({ courseId: course._id as any });
      toast.success("Course added to your dashboard");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Unable to enroll in this course",
      );
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 py-12">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/courses" className="hover:text-foreground">
          Courses
        </Link>
        <span>/</span>
        <span className="text-foreground">{course.title}</span>
      </div>

      <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm">
          <div className="aspect-[4/3] bg-muted/40">
            {course.featuredImageId ? (
              <MediaImage
                mediaId={course.featuredImageId as any}
                alt={course.title}
                className="h-full w-full object-cover"
                preferredSize="large"
                sizes="(max-width: 1024px) 100vw, 55vw"
                loading="eager"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-muted text-sm text-muted-foreground">
                Course
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6 rounded-[2rem] border border-border bg-card p-8 shadow-sm">
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-primary">
              <BookOpen className="size-3" aria-hidden="true" />
              {course.lessonCount ?? 0} lessons
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
              <Lock className="size-3" aria-hidden="true" />
              {course.accessMode ?? "members"}
            </span>
            {course.certificateId ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                <Award className="size-3" aria-hidden="true" />
                Certificate
              </span>
            ) : null}
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">
              {course.title}
            </h1>
            {course.excerpt ? (
              <p className="text-base leading-7 text-muted-foreground">
                {course.excerpt}
              </p>
            ) : null}
          </div>

          <CourseCta
            course={course}
            firstLessonId={firstLesson?._id}
            isSignedIn={!!isSignedIn}
            canEnterDashboard={canEnterDashboard}
            canSelfEnroll={canSelfEnroll}
            access={access}
            onEnroll={() => void handleEnroll()}
          />
        </div>
      </section>

      <section className="grid gap-5">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Curriculum
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Follow the course in order from topic to topic.
          </p>
        </div>

        {tree.topics.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Curriculum is being prepared.
          </div>
        ) : (
          <div className="grid gap-4">
            {tree.topics.map((topic, topicIndex) => (
              <article key={topic._id} className="border border-border bg-card p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Topic {topicIndex + 1}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-foreground">
                      {topic.title}
                    </h3>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {topic.children.filter((child) => child.kind === "lesson").length} lessons
                  </span>
                </div>
                <ol className="grid gap-2">
                  {topic.children.map((child) => (
                    <li
                      key={child._id}
                      className="flex items-center justify-between gap-3 border border-border/70 px-3 py-2 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {child.kind === "lesson" ? (
                          <PlayCircle className="size-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <BookOpen className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{child.title}</span>
                      </span>
                      {child.isPreview ? (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          Preview
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CourseCta({
  course,
  firstLessonId,
  isSignedIn,
  canEnterDashboard,
  canSelfEnroll,
  access,
  onEnroll,
}: {
  course: Course;
  firstLessonId?: string;
  isSignedIn: boolean;
  canEnterDashboard: boolean;
  canSelfEnroll: boolean;
  access?: { allowed: boolean; reason: string; requiresLogin?: boolean };
  onEnroll: () => void;
}) {
  if (canEnterDashboard && firstLessonId) {
    return (
      <Link
        to="/dashboard/courses/$slug/$nodeId"
        params={{ slug: course.slug, nodeId: firstLessonId }}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
      >
        Continue learning
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    );
  }

  if (!isSignedIn && (access?.requiresLogin || course.accessMode !== "open")) {
    return (
      <Link
        to="/login"
        search={{ redirect: `/courses/${course.slug}` } as any}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
      >
        Sign in to enroll
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    );
  }

  if (course.accessMode === "buy" || course.accessMode === "recurring") {
    const href = course.externalButtonUrl || "/pricing";
    return (
      <a
        href={href}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
      >
        Get access
        <ArrowRight className="size-4" aria-hidden="true" />
      </a>
    );
  }

  if (canSelfEnroll) {
    return (
      <button
        type="button"
        onClick={onEnroll}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
      >
        <CheckCircle2 className="size-4" aria-hidden="true" />
        Enroll now
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
      This course is restricted. Check your membership or contact the site team
      for access.
    </div>
  );
}
