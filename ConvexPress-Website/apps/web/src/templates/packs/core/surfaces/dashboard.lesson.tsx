/**
 * Core · dashboard.lesson — the lesson player: course outline with lock and
 * completion state, the lesson body, materials, video, completion controls
 * and the certificate / completion card. Every query, mutation and gate
 * lives in the loader (dashboard/pages/courses/CoursePlayerPage.tsx).
 */
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Award,
  BookOpen,
  CheckCircle2,
  Circle,
  Lock,
  PlayCircle,
} from "lucide-react";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { LessonContentRenderer } from "@/components/lms/LessonContentRenderer";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatIssuedDate,
  getVideoEmbedUrl,
  safeVideoUrl,
  type CertificateIssue,
  type CompletionState,
  type CourseProgress,
  type LessonDetail,
  type LessonSummary,
  type NodeProgress,
  type PlayerCourse,
  type TopicSummary,
} from "@/lib/lms/lessonPlayer";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface DashboardLessonOutlineState {
  completed: boolean;
  locked: boolean;
  /** Tooltip explaining the lock (drip schedule / access), when known. */
  lockTitle?: string;
}

export interface DashboardLessonSurfaceData {
  /** "loading" while any query is pending; "notFound" when the course or lesson does not exist. */
  status: "loading" | "notFound" | "ready";
  nodeId: string;
  course: PlayerCourse | null;
  topics: TopicSummary[];
  /** Outline state per lesson node id. */
  outline: Record<string, DashboardLessonOutlineState>;
  progress: CourseProgress | null;
  lesson: LessonDetail | null;
  nodeProgress: NodeProgress | null;
  /** True when the selected lesson may not be opened; `lockReason` explains why. */
  lessonLocked: boolean;
  lockReason: string;
  videoUrl: string | undefined;
  completion: CompletionState;
  previousLesson: LessonSummary | null;
  nextLesson: LessonSummary | null;
  /** The member's certificate for this course, when issued. */
  certificate: CertificateIssue | null;
  /** Sanitized completion redirect from the course settings. */
  completionRedirectUrl: string | null;
  hrefs: {
    courses: string;
    lesson: (nodeId: string) => string;
    certificate: (serial: string) => string;
  };
  actions: {
    markComplete: () => Promise<void>;
    markIncomplete: () => Promise<void>;
    issueCertificate: () => Promise<void>;
  };
}

export default function CoreDashboardLesson({ data }: SurfaceProps<DashboardLessonSurfaceData>) {
  if (data.status === "loading") return <PlayerSkeleton />;
  if (data.status === "notFound" || !data.course || !data.progress) return <NotFoundPage />;

  const { course, topics, outline, progress, lesson, nodeProgress, lessonLocked, lockReason, videoUrl, completion, previousLesson, nextLesson, certificate, completionRedirectUrl, hrefs, actions, nodeId } = data;

  return (
    <div className="grid gap-6 xl:grid-cols-[18rem_1fr]">
      <aside className="space-y-4">
        <Link
          to={hrefs.courses}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          My Courses
        </Link>

        <div className="border border-border bg-card p-4">
          <h1 className="text-sm font-semibold text-foreground">{course.title}</h1>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{progress.completedCount} of {progress.total} lessons</span>
              <span>{progress.percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        </div>

        <nav className="space-y-4" aria-label="Course lessons">
          {topics.map((topic) => (
            <section key={topic._id} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {topic.title}
              </h2>
              <div className="space-y-1">
                {topic.children
                  .filter((child) => child.kind === "lesson")
                  .map((child) => {
                    const state = outline[child._id] ?? { completed: false, locked: false };
                    return (
                      <Link
                        key={child._id}
                        to={hrefs.lesson(child._id)}
                        className={[
                          "flex items-center gap-2 border border-border px-3 py-2 text-xs transition-colors",
                          child._id === nodeId
                            ? "bg-primary text-primary-foreground"
                            : state.locked
                              ? "bg-muted/50 text-muted-foreground hover:bg-muted"
                            : "bg-card text-foreground hover:bg-muted",
                        ].join(" ")}
                        title={state.locked ? state.lockTitle : undefined}
                      >
                        {state.locked ? (
                          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
                        ) : state.completed ? (
                          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                        ) : (
                          <Circle className="size-3.5 shrink-0" aria-hidden="true" />
                        )}
                        <span className="line-clamp-2">{child.title}</span>
                      </Link>
                    );
                  })}
              </div>
            </section>
          ))}
        </nav>
      </aside>

      <main className="space-y-6">
        <div className="border border-border bg-card p-6">
          {lessonLocked || !lesson ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
              <Lock className="size-8 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-foreground">Lesson locked</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                {lockReason}
              </p>
            </div>
          ) : (
            <article className="space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Lesson
                </p>
                <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                  {lesson.node.title}
                </h2>
              </div>

              {videoUrl ? <VideoEmbed url={videoUrl} /> : null}

              <LessonContentRenderer
                doc={lesson.bodyDoc}
                fallbackText={lesson.bodyText}
                emptyLabel="Lesson content is being prepared."
              />

              {(lesson.materialsDoc || lesson.materialsText) ? (
                <section className="border border-border bg-muted/30 p-4">
                  <h3 className="mb-2 text-sm font-medium text-foreground">
                    Materials
                  </h3>
                  <LessonContentRenderer
                    doc={lesson.materialsDoc}
                    fallbackText={lesson.materialsText}
                    emptyLabel="No materials yet."
                    className="space-y-3"
                  />
                </section>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <BookOpen className="size-3.5" aria-hidden="true" />
                    {nodeProgress?.timeSpentSec ?? 0}s tracked
                  </span>
                  {lesson.node.requireVideoWatch ? (
                    <span className="inline-flex items-center gap-1">
                      <PlayCircle className="size-3.5" aria-hidden="true" />
                      {Math.round((nodeProgress?.videoWatchedFraction ?? 0) * 100)}% watched
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {previousLesson ? (
                    <Link
                      to={hrefs.lesson(previousLesson._id)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Previous lesson
                    </Link>
                  ) : null}

                  {nodeProgress?.completed ? (
                    <button
                      type="button"
                      onClick={() => void actions.markIncomplete()}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Mark incomplete
                    </button>
                  ) : lesson.node.showMarkComplete === false ? null : (
                    <button
                      type="button"
                      disabled={!completion.canComplete}
                      onClick={() => void actions.markComplete()}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      title={completion.canComplete ? undefined : completion.requirements.join(" ")}
                    >
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      Mark complete
                    </button>
                  )}

                  {nextLesson ? (
                    <Link
                      to={hrefs.lesson(nextLesson._id)}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Next lesson
                    </Link>
                  ) : null}
                </div>
              </div>

              {!nodeProgress?.completed &&
              lesson.node.showMarkComplete !== false &&
              completion.requirements.length > 0 ? (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {completion.requirements.join(" ")}
                </div>
              ) : null}
            </article>
          )}
        </div>

        {progress.percent >= 100 && (course.certificateId || completionRedirectUrl) ? (
          <div className="border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Award className="mt-0.5 size-5 text-primary" aria-hidden="true" />
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    {course.certificateId ? "Certificate" : "Course complete"}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {course.certificateId
                      ? certificate
                        ? `Issued ${formatIssuedDate(certificate.issuedAt)}`
                        : "Your course is complete. Issue your certificate."
                      : "Your course is complete. Continue with the next step."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {completionRedirectUrl ? (
                  <a
                    href={completionRedirectUrl}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    Continue
                  </a>
                ) : null}
                {course.certificateId ? (
                  certificate ? (
                    <>
                      {certificate.pdfUrl ? (
                        <a
                          href={certificate.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
                        >
                          Download PDF
                        </a>
                      ) : null}
                      <Link
                        to={hrefs.certificate(certificate.serial)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        View certificate
                      </Link>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void actions.issueCertificate()}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      Issue certificate
                    </button>
                  )
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function PlayerSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[18rem_1fr]">
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="h-[32rem] w-full" />
    </div>
  );
}

function VideoEmbed({ url }: { url: string }) {
  const safeUrl = safeVideoUrl(url);
  if (!safeUrl) return null;
  const src = getVideoEmbedUrl(safeUrl);

  if (src) {
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

  return (
    <a
      href={safeUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex text-sm font-medium text-primary hover:underline"
    >
      Open lesson video
    </a>
  );
}
