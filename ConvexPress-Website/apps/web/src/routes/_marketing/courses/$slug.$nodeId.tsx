import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convexpress-website/backend/generated/api";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Lock, PlayCircle } from "lucide-react";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { LessonContentRenderer } from "@/components/lms/LessonContentRenderer";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";

export const Route = createFileRoute("/_marketing/courses/$slug/$nodeId")({
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
          title: "Course preview - ConvexPress",
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
      seoHead: buildSeoHead({
        title: `${course?.title ?? params.slug} preview - ConvexPress`,
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
  component: CoursePreviewLessonPage,
});

type Course = {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string;
  accessMode?: string;
};

type LessonDetail = {
  node: {
    _id: string;
    courseId: string;
    title: string;
    isPreview?: boolean;
    videoUrl?: string;
  };
  bodyDoc?: unknown;
  materialsDoc?: unknown;
  bodyText?: string;
  materialsText?: string;
};

function CoursePreviewLessonPage() {
  const { slug, nodeId } = Route.useParams();
  const { data: course } = useSuspenseQuery(
    convexQuery(api.lms.courses.queries.getBySlug, { slug }) as any,
  ) as { data: Course | null };
  const { data: lesson } = useSuspenseQuery(
    convexQuery((api as any).lms.lessons.queries.getLessonPublicView, {
      nodeId: nodeId as any,
    }) as any,
  ) as { data: LessonDetail | null };

  if (!course || !lesson || String(lesson.node.courseId) !== String(course._id)) {
    return <NotFoundPage />;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/courses/$slug"
          params={{ slug: course.slug }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Course overview
        </Link>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <PlayCircle className="size-3.5" aria-hidden="true" />
          {course.accessMode === "open" ? "Open lesson" : "Preview lesson"}
        </span>
      </div>

      <section className="grid gap-4 border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="size-3.5" aria-hidden="true" />
            {course.title}
          </span>
          <span className="inline-flex items-center gap-1">
            <Lock className="size-3.5" aria-hidden="true" />
            {course.accessMode ?? "members"}
          </span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {lesson.node.title}
        </h1>
        {course.excerpt ? (
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {course.excerpt}
          </p>
        ) : null}
      </section>

      {lesson.node.videoUrl ? <VideoEmbed url={lesson.node.videoUrl} /> : null}

      <article className="grid gap-4 border border-border bg-card p-6">
        <LessonContentRenderer
          doc={lesson.bodyDoc}
          fallbackText={lesson.bodyText}
          emptyLabel="Preview content is being prepared."
        />

        {(lesson.materialsDoc || lesson.materialsText) ? (
          <section className="border border-border bg-muted/30 p-4">
            <h2 className="mb-2 text-sm font-medium text-foreground">
              Materials
            </h2>
            <LessonContentRenderer
              doc={lesson.materialsDoc}
              fallbackText={lesson.materialsText}
              emptyLabel="No materials yet."
              className="space-y-3"
            />
          </section>
        ) : null}
      </article>

      <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card p-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {course.accessMode === "open" ? "Explore the full course" : "Continue the full course"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {course.accessMode === "open"
              ? "Use the course overview to browse the full lesson sequence."
              : "Sign in or enroll from the course overview to unlock the full lesson sequence."}
          </p>
        </div>
        <Link
          to="/courses/$slug"
          params={{ slug: course.slug }}
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          View course
        </Link>
      </div>
    </div>
  );
}

function VideoEmbed({ url }: { url: string }) {
  const safeUrl = safeVideoUrl(url);
  if (!safeUrl) return null;
  const src = getVideoEmbedUrl(safeUrl);

  if (!src) {
    return (
      <a
        href={safeUrl}
        target="_blank"
        rel="noreferrer"
        className="text-sm font-medium text-primary hover:underline"
      >
        Open lesson video
      </a>
    );
  }

  return (
    <iframe
      title="Lesson video"
      className="aspect-video w-full border border-border"
      src={src}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}

function safeVideoUrl(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function getVideoEmbedUrl(value: string): string | null {
  if (value.startsWith("/")) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = url.pathname.startsWith("/shorts/")
        ? url.pathname.split("/").filter(Boolean)[1]
        : url.searchParams.get("v");
      return id && /^[\w-]+$/.test(id) ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && /^[\w-]+$/.test(id) ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = url.pathname.split("/").filter(Boolean).find((part) => /^\d+$/.test(part));
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}
