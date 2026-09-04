import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convexpress-website/backend/generated/api";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { LmsRoutePending } from "@/components/lms/LmsRoutePending";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl, siteTitled } from "@/lib/seo/head";
import CoreLessonPreview, {
  type LessonDetail,
  type LessonPreviewSurfaceData,
  type PreviewCourse,
} from "@/templates/packs/core/surfaces/courses.lessonPreview";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/courses/$slug_/$nodeId")({
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
          title: siteTitled("Course preview"),
          canonical: toAbsoluteUrl(
            `/courses/${params.slug}/${params.nodeId}`,
            siteUrl,
          ),
        }),
      };
    }

    const course = await queryClient.ensureQueryData(
      convexQuery(api.lms.courses.queries.getBySlug, { slug: params.slug }),
    );
    if (course?._id) {
      await queryClient.ensureQueryData(
        convexQuery((api as any).lms.lessons.queries.getLessonPublicView, {
          nodeId: params.nodeId as any,
        }) as any,
      );
    }

    return {
      lmsEnabled: true,
      seoHead: buildSeoHead({
        title: siteTitled(`${course?.title ?? params.slug} preview`),
        description:
          course?.excerpt ??
          `Preview a lesson from ${course?.title ?? params.slug}.`,
        canonical: toAbsoluteUrl(
          `/courses/${params.slug}/${params.nodeId}`,
          siteUrl,
        ),
      }),
    };
  },
  head: ({ loaderData }) => loaderData?.seoHead ?? {},
  pendingComponent: () => <LmsRoutePending label="Loading preview lesson" />,
  component: CoursePreviewLessonPage,
});

function CoursePreviewLessonPage() {
  const { lmsEnabled } = Route.useLoaderData();

  if (!lmsEnabled) {
    return <NotFoundPage />;
  }

  return <CoursePreviewLessonEnabled />;
}

function CoursePreviewLessonEnabled() {
  const { slug, nodeId } = Route.useParams();
  const { data: course } = useSuspenseQuery(
    convexQuery(api.lms.courses.queries.getBySlug, { slug }) as any,
  ) as { data: PreviewCourse | null };
  const { data: lesson } = useSuspenseQuery(
    convexQuery((api as any).lms.lessons.queries.getLessonPublicView, {
      nodeId: nodeId as any,
    }) as any,
  ) as { data: LessonDetail | null };

  if (!course || !lesson || String(lesson.node.courseId) !== String(course._id)) {
    return <NotFoundPage />;
  }

  const data: LessonPreviewSurfaceData = { course, lesson };

  return <Surface name="courses.lessonPreview" data={data} fallback={CoreLessonPreview} />;
}
