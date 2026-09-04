/**
 * Depot · courses.lessonPreview — a public preview / open lesson: breadcrumb
 * row with the preview badge, lesson 8/12 (video, body, materials) beside a
 * sticky course box 4/12 with the "view course" action. Same URL safety and
 * embed rules as Core.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, PlayCircle } from "lucide-react";

import { LessonContentRenderer } from "@/components/lms/LessonContentRenderer";
import type { LessonPreviewSurfaceData } from "@/templates/packs/core/surfaces/courses.lessonPreview";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Breadcrumbs, Card, Container, DataTable, Label, LinkButton, SectionHeading, StickyPanel } from "../parts";

export default function DepotLessonPreview({ data }: SurfaceProps<LessonPreviewSurfaceData>) {
  const { course, lesson } = data;
  const open = course.accessMode === "open";

  return (
    <Container padded={false} data-slot="lesson-preview" data-pack="depot" className="flex flex-col gap-4 py-6 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Breadcrumbs items={[{ label: "Courses", to: "/courses" }, { label: course.title, to: "/courses/$slug", params: { slug: course.slug } }, { label: lesson.node.title }]} />
        <Badge tone="sale">
          <PlayCircle className="mr-1 size-3" aria-hidden="true" />
          {open ? "Open lesson" : "Preview lesson"}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
          <header className="flex flex-col gap-1.5">
            <Label>
              <BookOpen className="mr-1 inline size-3" aria-hidden="true" />
              {course.title}
            </Label>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{lesson.node.title}</h1>
            {course.excerpt ? <p className="text-[13px] leading-5 text-muted-foreground">{course.excerpt}</p> : null}
          </header>

          {lesson.node.videoUrl ? <VideoEmbed url={lesson.node.videoUrl} /> : null}

          <Card as="article" className="p-4">
            <LessonContentRenderer doc={lesson.bodyDoc} fallbackText={lesson.bodyText} emptyLabel="Preview content is being prepared." className="text-sm leading-6" />
          </Card>

          {lesson.materialsDoc || lesson.materialsText ? (
            <section className="flex flex-col gap-3">
              <SectionHeading title="Materials" />
              <Card className="bg-muted/30 p-4">
                <LessonContentRenderer doc={lesson.materialsDoc} fallbackText={lesson.materialsText} emptyLabel="No materials yet." className="space-y-3 text-sm leading-6" />
              </Card>
            </section>
          ) : null}
        </div>

        <StickyPanel label="Course" className="lg:col-span-4">
          <h2 className="text-lg font-semibold text-foreground">{open ? "Explore the full course" : "Continue the full course"}</h2>
          <p className="text-[13px] leading-5 text-muted-foreground">{open ? "Use the course overview to browse the full lesson sequence." : "Sign in or enroll from the course overview to unlock the full lesson sequence."}</p>
          <DataTable
            caption="Lesson facts"
            firstColumnLabel
            rows={[
              { key: "course", cells: ["Course", course.title] },
              { key: "access", cells: ["Access", <span className="capitalize">{course.accessMode ?? "members"}</span>] },
              { key: "kind", cells: ["This lesson", open ? "Open to everyone" : "Free preview"] },
            ]}
          />
          <LinkButton to="/courses/$slug" params={{ slug: course.slug }} className="w-full">
            View course
          </LinkButton>
          <Link to="/courses/$slug" params={{ slug: course.slug }} className="inline-flex items-center justify-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Course overview
          </Link>
        </StickyPanel>
      </div>
    </Container>
  );
}

function VideoEmbed({ url }: { url: string }) {
  const safeUrl = safeVideoUrl(url);
  if (!safeUrl) return null;
  const src = getVideoEmbedUrl(safeUrl);

  if (!src) {
    return (
      <a href={safeUrl} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-primary hover:underline">
        Open lesson video
      </a>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-muted">
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
