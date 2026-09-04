import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convexpress-website/backend/generated/api";
import { useAuth } from "@/lib/auth/clerk";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { LmsRoutePending } from "@/components/lms/LmsRoutePending";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl, siteTitled } from "@/lib/seo/head";
import CoreCourseDetail, {
  type Course,
  type CourseAccess,
  type CourseDetailSurfaceData,
  type CourseTree,
} from "@/templates/packs/core/surfaces/courses.detail";
import { Surface } from "@/templates/sdk/Surface";

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
        lmsEnabled: false,
        seoHead: buildSeoHead({
          title: siteTitled("Course"),
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
      lmsEnabled: true,
      seoHead: buildSeoHead({
        title: siteTitled(`${course?.title ?? params.slug} - Course`),
        description:
          course?.excerpt ??
          `View the curriculum for ${course?.title ?? params.slug}.`,
        canonical: toAbsoluteUrl(`/courses/${params.slug}`, siteUrl),
        ogType: "article",
        jsonLdGraph: course
          ? [
              {
                "@context": "https://schema.org",
                "@type": "Course",
                name: course.title,
                description: course.excerpt ?? `Course: ${course.title}`,
                url: toAbsoluteUrl(`/courses/${course.slug}`, siteUrl),
                provider: {
                  "@type": "Organization",
                  name:
                    (publicSettings as { siteTitle?: string | null })?.siteTitle ??
                    "ConvexPress",
                  sameAs: siteUrl ?? undefined,
                },
                hasCourseInstance: {
                  "@type": "CourseInstance",
                  courseMode: "online",
                  courseWorkload: `${course.lessonCount ?? 0} lessons`,
                },
              },
            ]
          : undefined,
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
  pendingComponent: () => <LmsRoutePending label="Loading course" />,
  component: CourseDetailPage,
});

function CourseDetailPage() {
  const { lmsEnabled } = Route.useLoaderData();

  if (!lmsEnabled) {
    return <NotFoundPage />;
  }

  return <CourseDetailEnabled />;
}

function CourseDetailEnabled() {
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
  }) as CourseAccess | undefined;
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

  const data: CourseDetailSurfaceData = {
    course,
    tree,
    access,
    isSignedIn: !!isSignedIn,
    firstLessonId: firstLesson?._id,
    canEnterDashboard,
    canSelfEnroll,
    actions: { enroll: () => void handleEnroll() },
  };

  return <Surface name="courses.detail" data={data} fallback={CoreCourseDetail} />;
}
