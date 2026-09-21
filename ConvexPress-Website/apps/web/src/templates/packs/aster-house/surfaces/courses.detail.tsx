/**
 * Aster · courses.detail — the course as a feature spread: breadcrumbs, a
 * 7/5 hero (3:2 image left, small-caps meta, display title, excerpt and the
 * pill call to action right), the description in the reading measure, then
 * the curriculum as rule-separated topics with lesson rows.
 *
 * The call-to-action decision tree is Core's, unchanged.
 */
import { Link } from "@tanstack/react-router";

import { CourseImageFallback } from "@/components/lms/CourseImageFallback";
import { LessonContentRenderer } from "@/components/lms/LessonContentRenderer";
import { MediaImage } from "@/components/media/MediaImage";
import type { Course, CourseAccess, CourseDetailSurfaceData } from "@/templates/packs/core/surfaces/courses.detail";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Breadcrumbs, Button, Container, EmptyState, LinkButton, Prose, Rule, SectionHeading, SmallCaps, buttonClasses } from "../parts";

export default function AsterCourseDetail({ data }: SurfaceProps<CourseDetailSurfaceData>) {
  const { course, tree, access, isSignedIn, firstLessonId, canEnterDashboard, canSelfEnroll, actions } = data;

  return (
    <Container data-slot="course-detail" className="flex flex-col gap-14 py-6 md:gap-20 md:py-10">
      <Breadcrumbs items={[{ label: "Courses", to: "/courses" }, { label: course.title }]} />

      {/* Hero */}
      <section className="grid gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7">
          <div className="overflow-hidden rounded-2xl bg-muted">
            <div className="aspect-[3/2] w-full">
              {course.featuredImageId ? (
                <MediaImage
                  mediaId={course.featuredImageId as any}
                  alt={course.title}
                  className="h-full w-full object-cover"
                  preferredSize="large"
                  sizes="(max-width: 1024px) 100vw, 58vw"
                  loading="eager"
                />
              ) : (
                <CourseImageFallback title={course.title} subtitle={`${course.lessonCount ?? 0} lessons`} />
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-6 lg:col-span-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SmallCaps className="tabular-nums">{course.lessonCount ?? 0} lessons</SmallCaps>
            <Dot />
            <SmallCaps className="capitalize">{course.accessMode ?? "members"}</SmallCaps>
            {course.certificateId ? (
              <>
                <Dot />
                <SmallCaps>Certificate</SmallCaps>
              </>
            ) : null}
          </div>
          <h1 className="font-display text-4xl leading-[1.02] tracking-tight text-foreground text-balance md:text-5xl">{course.title}</h1>
          {course.excerpt ? <p className="text-base leading-8 text-muted-foreground md:text-[17px]">{course.excerpt}</p> : null}
          <div>
            <CourseCta
              course={course}
              firstLessonId={firstLessonId}
              isSignedIn={isSignedIn}
              canEnterDashboard={canEnterDashboard}
              canSelfEnroll={canSelfEnroll}
              access={access}
              onEnroll={actions.enroll}
            />
          </div>
        </div>
      </section>

      {/* About */}
      {course.descriptionDoc ? (
        <Prose as="section" className="flex flex-col gap-8">
          <Rule />
          <h2 className="font-display text-3xl tracking-tight text-foreground md:text-4xl">About this course</h2>
          <LessonContentRenderer
            doc={course.descriptionDoc}
            fallbackText={course.excerpt}
            emptyLabel="Course description is being prepared."
            className="text-base leading-8 text-muted-foreground md:text-[17px]"
          />
        </Prose>
      ) : null}

      {/* Curriculum */}
      <section className="flex flex-col gap-10">
        <Rule />
        <SectionHeading eyebrow="Curriculum" title="What you will learn" lede="Follow the course in order from topic to topic." />

        {tree.topics.length === 0 ? (
          <EmptyState eyebrow="Coming soon" title="Curriculum is being prepared." />
        ) : (
          <ol className="flex flex-col divide-y divide-border border-y border-border">
            {tree.topics.map((topic, topicIndex) => {
              const lessonCount = topic.children.filter((child) => child.kind === "lesson").length;
              return (
                <li key={topic._id} className="grid gap-6 py-8 lg:grid-cols-12 lg:gap-12">
                  <div className="flex flex-col gap-2 lg:col-span-5">
                    <SmallCaps className="tabular-nums">Topic {topicIndex + 1}</SmallCaps>
                    <h3 className="font-display text-2xl leading-snug tracking-tight text-foreground">{topic.title}</h3>
                    <SmallCaps className="tabular-nums">
                      {lessonCount} {lessonCount === 1 ? "lesson" : "lessons"}
                    </SmallCaps>
                  </div>
                  <ol className="flex flex-col divide-y divide-border lg:col-span-7">
                    {topic.children.map((child, childIndex) => (
                      <li key={child._id} className="flex items-center justify-between gap-4 py-3 text-sm">
                        <span className="flex min-w-0 items-baseline gap-3">
                          <span className="w-6 shrink-0 text-[11px] tabular-nums text-muted-foreground">{String(childIndex + 1).padStart(2, "0")}</span>
                          {child.kind === "lesson" && child.isPreview ? (
                            <Link to="/courses/$slug/$nodeId" params={{ slug: course.slug, nodeId: child._id }} className="truncate text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground">
                              {child.title}
                            </Link>
                          ) : (
                            <span className="truncate text-foreground">{child.title}</span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          {child.kind !== "lesson" ? <SmallCaps className="capitalize">{child.kind}</SmallCaps> : null}
                          {child.isPreview ? <Badge tone="primary">Preview</Badge> : null}
                        </span>
                      </li>
                    ))}
                  </ol>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </Container>
  );
}

function Dot() {
  return (
    <span className="text-muted-foreground/60" aria-hidden="true">
      ·
    </span>
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
  access?: CourseAccess;
  onEnroll: () => void;
}) {
  if (canEnterDashboard && firstLessonId) {
    return (
      <LinkButton to="/dashboard/courses/$slug/$nodeId" params={{ slug: course.slug, nodeId: firstLessonId }} variant="primary">
        Continue learning
      </LinkButton>
    );
  }

  if (!isSignedIn && (access?.requiresLogin || course.accessMode !== "open")) {
    return (
      <LinkButton to="/login" search={{ returnTo: `/courses/${course.slug}` }} variant="primary">
        Sign in to enroll
      </LinkButton>
    );
  }

  if (!isSignedIn && course.accessMode === "open" && firstLessonId) {
    return (
      <LinkButton to="/courses/$slug/$nodeId" params={{ slug: course.slug, nodeId: firstLessonId }} variant="primary">
        Start learning
      </LinkButton>
    );
  }

  if (course.accessMode === "buy" || course.accessMode === "recurring") {
    const href = safeCourseUrl(course.externalButtonUrl) ?? "/pricing";
    return (
      <a href={href} className={buttonClasses("primary")}>
        Get access
      </a>
    );
  }

  if (canSelfEnroll) {
    return (
      <Button variant="primary" onClick={onEnroll}>
        Enroll now
      </Button>
    );
  }

  return <p className="border-t border-border pt-4 text-sm leading-7 text-muted-foreground">This course is restricted. Check your membership or contact the site team for access.</p>;
}

function safeCourseUrl(value?: string | null): string | null {
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
