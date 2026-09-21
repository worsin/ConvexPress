/**
 * Aster · courses.lessonPreview — a public preview / open lesson read like
 * an article: breadcrumbs and the preview badge, small-caps course line,
 * display title, the video in a 16:9 rounded frame, the body in the reading
 * measure, materials under a rule, and a quiet closing row back to the course.
 */
import { Link } from "@tanstack/react-router";

import { LessonContentRenderer } from "@/components/lms/LessonContentRenderer";
import type { LessonPreviewSurfaceData } from "@/templates/packs/core/surfaces/courses.lessonPreview";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Breadcrumbs, Container, LinkButton, Prose, Rule, SmallCaps } from "../parts";

export default function AsterLessonPreview({ data }: SurfaceProps<LessonPreviewSurfaceData>) {
  const { course, lesson } = data;
  const isOpen = course.accessMode === "open";

  return (
    <Container as="article" data-slot="lesson-preview" className="flex flex-col gap-12 py-6 md:gap-16 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Breadcrumbs items={[{ label: "Courses", to: "/courses" }, { label: course.title, to: "/courses/$slug", params: { slug: course.slug } }, { label: lesson.node.title }]} />
        <Badge tone="primary">{isOpen ? "Open lesson" : "Preview lesson"}</Badge>
      </div>

      <Prose as="header" className="flex flex-col gap-5">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to="/courses/$slug" params={{ slug: course.slug }} className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary hover:underline">
            {course.title}
          </Link>
          <span className="text-muted-foreground/60" aria-hidden="true">
            ·
          </span>
          <SmallCaps className="capitalize">{course.accessMode ?? "members"}</SmallCaps>
        </p>
        <h1 className="font-display text-4xl leading-[1.02] tracking-tight text-foreground text-balance md:text-5xl">{lesson.node.title}</h1>
        {course.excerpt ? <p className="text-base leading-8 text-muted-foreground md:text-[17px]">{course.excerpt}</p> : null}
      </Prose>

      {lesson.node.videoUrl ? (
        <div className="mx-auto w-full max-w-4xl">
          <VideoEmbed url={lesson.node.videoUrl} />
        </div>
      ) : null}

      <Prose className="flex flex-col gap-10">
        <LessonContentRenderer doc={lesson.bodyDoc} fallbackText={lesson.bodyText} emptyLabel="Preview content is being prepared." className="text-base leading-8 text-muted-foreground md:text-[17px]" />

        {lesson.materialsDoc || lesson.materialsText ? (
          <section className="flex flex-col gap-4 border-t border-border pt-8">
            <SmallCaps as="h2">Materials</SmallCaps>
            <LessonContentRenderer doc={lesson.materialsDoc} fallbackText={lesson.materialsText} emptyLabel="No materials yet." className="space-y-3 text-base leading-8 text-muted-foreground" />
          </section>
        ) : null}
      </Prose>

      <Prose>
        <Rule />
        <div className="flex flex-col gap-5 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-xl leading-snug tracking-tight text-foreground">{isOpen ? "Explore the full course" : "Continue the full course"}</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {isOpen ? "Use the course overview to browse the full lesson sequence." : "Sign in or enroll from the course overview to unlock the full lesson sequence."}
            </p>
          </div>
          <LinkButton to="/courses/$slug" params={{ slug: course.slug }} variant="primary" className="shrink-0 self-start sm:self-auto">
            View course
          </LinkButton>
        </div>
        <Rule />
      </Prose>
    </Container>
  );
}

function VideoEmbed({ url }: { url: string }) {
  const safeUrl = safeVideoUrl(url);
  if (!safeUrl) return null;
  const src = getVideoEmbedUrl(safeUrl);

  if (!src) {
    return (
      <a href={safeUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-foreground underline decoration-border underline-offset-[6px] hover:decoration-foreground">
        Open lesson video
      </a>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-muted">
      <iframe title="Lesson video" className="aspect-video w-full" src={src} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
    </div>
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
      const id = url.pathname.startsWith("/shorts/") ? url.pathname.split("/").filter(Boolean)[1] : url.searchParams.get("v");
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
