/** Core · courses.detail — course overview: hero, CTA, description and curriculum. */
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Lock,
  PlayCircle,
} from "lucide-react";

import { CourseImageFallback } from "@/components/lms/CourseImageFallback";
import { LessonContentRenderer } from "@/components/lms/LessonContentRenderer";
import { MediaImage } from "@/components/media/MediaImage";
import type { SurfaceProps } from "@/templates/sdk/types";

export type Course = {
  _id: string;
  title: string;
  slug: string;
  descriptionDoc?: unknown;
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

export type LessonNode = {
  _id: string;
  kind: string;
  title: string;
  isPreview?: boolean;
};

export type TopicNode = {
  _id: string;
  title: string;
  children: LessonNode[];
};

export type CourseTree = {
  topics: TopicNode[];
};

export type CourseAccess = { allowed: boolean; reason: string; requiresLogin?: boolean };

export interface CourseDetailSurfaceData {
  course: Course;
  tree: CourseTree;
  /** Access decision for the current visitor; undefined while loading. */
  access?: CourseAccess;
  isSignedIn: boolean;
  /** First lesson in curriculum order, if any. */
  firstLessonId?: string;
  /** Enrolled and has a first lesson → "Continue learning". */
  canEnterDashboard: boolean;
  /** Access allows self-enrolment (allowed / free / open). */
  canSelfEnroll: boolean;
  actions: {
    /** Enrol the visitor (toasts on success/failure are the route's job). */
    enroll: () => void;
  };
}

export default function CoreCourseDetail({ data }: SurfaceProps<CourseDetailSurfaceData>) {
  const { course, tree, access, isSignedIn, firstLessonId, canEnterDashboard, canSelfEnroll, actions } = data;

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
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
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
              <CourseImageFallback
                title={course.title}
                subtitle={`${course.lessonCount ?? 0} lessons`}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6 rounded-lg border border-border bg-card p-8 shadow-sm">
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
            firstLessonId={firstLessonId}
            isSignedIn={isSignedIn}
            canEnterDashboard={canEnterDashboard}
            canSelfEnroll={canSelfEnroll}
            access={access}
            onEnroll={actions.enroll}
          />
        </div>
      </section>

      {course.descriptionDoc ? (
        <section className="grid gap-3 border border-border bg-card p-6">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            About this course
          </h2>
          <LessonContentRenderer
            doc={course.descriptionDoc}
            fallbackText={course.excerpt}
            emptyLabel="Course description is being prepared."
            className="text-base leading-7"
          />
        </section>
      ) : null}

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
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
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
                        {child.kind === "lesson" && child.isPreview ? (
                          <Link
                            to="/courses/$slug/$nodeId"
                            params={{ slug: course.slug, nodeId: child._id }}
                            className="truncate text-primary hover:underline"
                          >
                            {child.title}
                          </Link>
                        ) : (
                          <span className="truncate">{child.title}</span>
                        )}
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
  access?: CourseAccess;
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
        search={{ returnTo: `/courses/${course.slug}` }}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
      >
        Sign in to enroll
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    );
  }

  if (!isSignedIn && course.accessMode === "open" && firstLessonId) {
    return (
      <Link
        to="/courses/$slug/$nodeId"
        params={{ slug: course.slug, nodeId: firstLessonId }}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
      >
        Start learning
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    );
  }

  if (course.accessMode === "buy" || course.accessMode === "recurring") {
    const href = safeCourseUrl(course.externalButtonUrl) ?? "/pricing";
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
    <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
      This course is restricted. Check your membership or contact the site team
      for access.
    </div>
  );
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
