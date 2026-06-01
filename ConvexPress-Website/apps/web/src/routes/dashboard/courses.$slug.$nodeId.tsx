import { api } from "@convexpress-website/backend/generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  Award,
  BookOpen,
  CheckCircle2,
  Circle,
  Lock,
  PlayCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { LessonContentRenderer } from "@/components/lms/LessonContentRenderer";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/dashboard/courses/$slug/$nodeId")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex" },
      { title: "Course Player - ConvexPress" },
    ],
  }),
  component: DashboardCoursePlayerPage,
});

type Course = {
  _id: string;
  title: string;
  slug: string;
  progressionMode?: string;
  certificateId?: string;
};

type LessonSummary = {
  _id: string;
  kind: string;
  title: string;
};

type TopicSummary = {
  _id: string;
  title: string;
  children: LessonSummary[];
};

type CourseTree = {
  topics: TopicSummary[];
};

type CourseProgress = {
  percent: number;
  total: number;
  completedCount: number;
  completedNodeIds: string[];
  nextNodeId: string | null;
  completionRedirectUrl?: string | null;
};

type UnlockState = {
  nodeId: string;
  allowed: boolean;
  reason: string;
  requiresLogin?: boolean;
  unlockAt?: number | null;
};

type LessonDetail = {
  node: {
    _id: string;
    title: string;
    videoUrl?: string;
    videoMediaId?: string;
    requireVideoWatch?: boolean;
    minTimeSeconds?: number;
    showMarkComplete?: boolean;
  };
  bodyDoc?: unknown;
  materialsDoc?: unknown;
  bodyText?: string;
  materialsText?: string;
};

type NodeProgress = {
  completed?: boolean;
  timeSpentSec?: number;
  videoWatchedFraction?: number;
};

type CompletionGate = {
  allowed: boolean;
  reason: string;
  requiresLogin?: boolean;
  watchedFraction?: number;
  requiredWatchedFraction?: number;
  timeSpentSec?: number;
  minTimeSeconds?: number;
  videoRemainingFraction?: number;
  timeRemainingSec?: number;
};

type CertificateIssue = {
  serial: string;
  issuedAt: number;
  pdfUrl?: string;
};

function DashboardCoursePlayerPage() {
  return (
    <PublicPluginGate pluginId="lms">
      <CoursePlayerContent />
    </PublicPluginGate>
  );
}

function CoursePlayerContent() {
  const { slug, nodeId } = Route.useParams();
  const course = useQuery(api.lms.courses.queries.getBySlug, { slug }) as
    | Course
    | null
    | undefined;

  if (course === undefined) {
    return <PlayerSkeleton />;
  }
  if (!course) {
    return <NotFoundPage />;
  }

  return <CoursePlayer course={course} nodeId={nodeId} />;
}

function CoursePlayer({ course, nodeId }: { course: Course; nodeId: string }) {
  const tree = useQuery((api as any).lms.nodes.queries.getCourseTree, {
    courseId: course._id as any,
  }) as CourseTree | undefined;
  const access = useQuery((api as any).lms.enrollment.queries.canAccessCourse, {
    courseId: course._id as any,
  }) as { allowed: boolean; reason: string } | undefined;
  const selectedAccess = useQuery((api as any).lms.enrollment.queries.canAccessNode, {
    nodeId: nodeId as any,
  }) as { allowed: boolean; reason: string } | undefined;
  const unlockSchedule = useQuery(
    (api as any).lms.enrollment.queries.getCourseUnlockSchedule,
    {
      courseId: course._id as any,
    },
  ) as UnlockState[] | undefined;
  const progress = useQuery((api as any).lms.progress.queries.getCourseProgress, {
    courseId: course._id as any,
  }) as CourseProgress | undefined;
  const lesson = useQuery((api as any).lms.lessons.queries.getLessonForPlayer, {
    nodeId: nodeId as any,
  }) as LessonDetail | null | undefined;
  const nodeProgress = useQuery((api as any).lms.progress.queries.getNodeProgress, {
    nodeId: nodeId as any,
  }) as NodeProgress | null | undefined;
  const completionGate = useQuery((api as any).lms.progress.queries.canComplete, {
    nodeId: nodeId as any,
  }) as CompletionGate | undefined;
  const myIssue = useQuery((api as any).lms.certificates.queries.getMyIssue, {
    courseId: course._id as any,
  }) as CertificateIssue | null | undefined;
  const videoMedia = useQuery(
    (api as any).media.queries.get,
    lesson?.node.videoMediaId ? { mediaId: lesson.node.videoMediaId as any } : "skip",
  ) as { url?: string | null } | null | undefined;

  const markComplete = useMutation((api as any).lms.progress.mutations.markComplete);
  const markIncomplete = useMutation((api as any).lms.progress.mutations.markIncomplete);
  const recordHeartbeat = useMutation((api as any).lms.progress.mutations.recordHeartbeat);
  const issueCertificate = useMutation((api as any).lms.certificates.mutations.issueCertificate);
  const timeSpentRef = useRef(0);
  const videoWatchedRef = useRef(0);

  const topics = tree?.topics ?? [];
  const orderedLessons = useMemo(
    () => topics.flatMap((topic) => topic.children.filter((child) => child.kind === "lesson")),
    [topics],
  );
  const unlockByNodeId = useMemo(
    () => new Map((unlockSchedule ?? []).map((item) => [String(item.nodeId), item])),
    [unlockSchedule],
  );
  const completed = new Set(progress?.completedNodeIds ?? []);
  const currentIndex = orderedLessons.findIndex((child) => child._id === nodeId);
  const previousLesson = currentIndex > 0 ? orderedLessons[currentIndex - 1] : null;
  const nextLesson =
    currentIndex >= 0 && currentIndex < orderedLessons.length - 1
      ? orderedLessons[currentIndex + 1]
      : null;
  const isLinear = course.progressionMode === "linear";
  const selectedUnlock = unlockByNodeId.get(nodeId);
  const lessonLocked =
    selectedUnlock?.allowed === false ||
    selectedAccess?.allowed === false ||
    (isLinear &&
      currentIndex > 0 &&
      orderedLessons.slice(0, currentIndex).some((child) => !completed.has(child._id)));
  const videoUrl = videoMedia?.url ?? lesson?.node.videoUrl;

  useEffect(() => {
    timeSpentRef.current = nodeProgress?.timeSpentSec ?? 0;
    videoWatchedRef.current = nodeProgress?.videoWatchedFraction ?? 0;
  }, [nodeId, nodeProgress?.timeSpentSec, nodeProgress?.videoWatchedFraction]);

  useEffect(() => {
    if (!lesson?.node || lessonLocked || access?.allowed === false) return;
    const timer = window.setInterval(() => {
      timeSpentRef.current += 15;
      if (videoUrl) {
        videoWatchedRef.current = Math.min(1, videoWatchedRef.current + 0.15);
      }
      void recordHeartbeat({
        nodeId: nodeId as any,
        timeSpentSec: timeSpentRef.current,
        watchedFraction: videoUrl ? videoWatchedRef.current : undefined,
      }).catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [access?.allowed, lesson?.node, lessonLocked, nodeId, recordHeartbeat, videoUrl]);

  async function run(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      toast.success(label);
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Action failed",
      );
    }
  }

  if (
    tree === undefined ||
    progress === undefined ||
    access === undefined ||
    unlockSchedule === undefined ||
    lesson === undefined ||
    completionGate === undefined ||
    selectedAccess === undefined
  ) {
    return <PlayerSkeleton />;
  }

  if (!orderedLessons.some((child) => child._id === nodeId)) {
    return <NotFoundPage />;
  }
  const completionRedirectUrl = safeCourseUrl(progress.completionRedirectUrl);
  const completionState = getCompletionState(lesson, nodeProgress, videoUrl, completionGate);
  const selectedLockReason =
    selectedUnlock?.allowed === false
      ? formatLockReason(selectedUnlock)
      : selectedAccess?.allowed === false
        ? formatLockReason(selectedAccess)
        : "Complete the required earlier lessons or check your enrollment before continuing.";

  return (
    <div className="grid gap-6 xl:grid-cols-[18rem_1fr]">
      <aside className="space-y-4">
        <Link
          to="/dashboard/courses"
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
                    const lessonIndex = orderedLessons.findIndex(
                      (lessonNode) => lessonNode._id === child._id,
                    );
                    const unlock = unlockByNodeId.get(child._id);
                    const locked =
                      unlock?.allowed === false ||
                      (isLinear &&
                        lessonIndex > 0 &&
                        orderedLessons
                          .slice(0, lessonIndex)
                          .some((lessonNode) => !completed.has(lessonNode._id)));
                    return (
                      <Link
                        key={child._id}
                        to="/dashboard/courses/$slug/$nodeId"
                        params={{ slug: course.slug, nodeId: child._id }}
                        className={[
                          "flex items-center gap-2 border border-border px-3 py-2 text-xs transition-colors",
                          child._id === nodeId
                            ? "bg-primary text-primary-foreground"
                            : locked
                              ? "bg-muted/50 text-muted-foreground hover:bg-muted"
                            : "bg-card text-foreground hover:bg-muted",
                        ].join(" ")}
                        title={locked && unlock ? formatLockReason(unlock) : undefined}
                      >
                        {locked ? (
                          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
                        ) : completed.has(child._id) ? (
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
                {selectedLockReason}
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
                      to="/dashboard/courses/$slug/$nodeId"
                      params={{ slug: course.slug, nodeId: previousLesson._id }}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Previous lesson
                    </Link>
                  ) : null}

                  {nodeProgress?.completed ? (
                    <button
                      type="button"
                      onClick={() =>
                        void run("Marked incomplete", () =>
                          markIncomplete({ nodeId: nodeId as any }),
                        )
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Mark incomplete
                    </button>
                  ) : lesson.node.showMarkComplete === false ? null : (
                    <button
                      type="button"
                      disabled={!completionState.canComplete}
                      onClick={() =>
                        void run("Lesson complete", () =>
                          markComplete({ nodeId: nodeId as any }),
                        )
                      }
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      title={
                        completionState.canComplete
                          ? undefined
                          : completionState.requirements.join(" ")
                      }
                    >
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      Mark complete
                    </button>
                  )}

                  {nextLesson ? (
                    <Link
                      to="/dashboard/courses/$slug/$nodeId"
                      params={{ slug: course.slug, nodeId: nextLesson._id }}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Next lesson
                    </Link>
                  ) : null}
                </div>
              </div>

              {!nodeProgress?.completed &&
              lesson.node.showMarkComplete !== false &&
              completionState.requirements.length > 0 ? (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {completionState.requirements.join(" ")}
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
                      ? myIssue
                        ? `Issued ${formatDate(myIssue.issuedAt)}`
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
                  myIssue ? (
                    <>
                      {myIssue.pdfUrl ? (
                        <a
                          href={myIssue.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
                        >
                          Download PDF
                        </a>
                      ) : null}
                      <Link
                        to="/certificates/$serial"
                        params={{ serial: myIssue.serial }}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        View certificate
                      </Link>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        void run("Certificate issued", () =>
                          issueCertificate({ courseId: course._id as any }),
                        )
                      }
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

function getCompletionState(
  lesson: LessonDetail | null | undefined,
  progress: NodeProgress | null | undefined,
  videoUrl?: string,
  gate?: CompletionGate,
) {
  const requirements: string[] = [];
  const watched = gate?.watchedFraction ?? progress?.videoWatchedFraction ?? 0;
  const timeSpent = gate?.timeSpentSec ?? progress?.timeSpentSec ?? 0;
  const minTime = gate?.minTimeSeconds ?? lesson?.node.minTimeSeconds ?? 0;

  if (gate && gate.allowed) {
    return { canComplete: true, requirements };
  }

  if (gate?.reason === "mark_complete_disabled") {
    requirements.push("Manual completion is disabled for this lesson.");
  } else if (gate?.reason === "video_required" || lesson?.node.requireVideoWatch) {
    if (!videoUrl) {
      requirements.push("This lesson requires video completion, but no video is attached.");
    } else if ((gate?.videoRemainingFraction ?? Math.max(0, 0.9 - watched)) > 0) {
      const required = Math.round((gate?.requiredWatchedFraction ?? 0.9) * 100);
      requirements.push(`Watch ${Math.max(0, required - Math.round(watched * 100))}% more of the video.`);
    }
  }

  const timeRemaining = gate?.timeRemainingSec ?? Math.max(0, minTime - timeSpent);
  if ((gate?.reason === "time_required" || minTime > 0) && timeRemaining > 0) {
    requirements.push(`Spend ${formatDuration(timeRemaining)} more in the lesson.`);
  }

  if (gate && !gate.allowed && requirements.length === 0) {
    requirements.push(formatCompletionGateReason(gate));
  }

  return {
    canComplete: requirements.length === 0,
    requirements,
  };
}

function formatCompletionGateReason(gate: CompletionGate) {
  switch (gate.reason) {
    case "login_required":
      return "Sign in before completing this lesson.";
    case "previous_lesson_required":
      return "Complete the previous lessons before marking this one complete.";
    case "drip_locked":
      return "This lesson is still locked.";
    case "prerequisites_required":
      return "Complete the prerequisite course before completing this lesson.";
    default:
      return "This lesson is not ready to complete yet.";
  }
}

function formatLockReason(state: { reason?: string; unlockAt?: number | null }) {
  switch (state.reason) {
    case "drip_locked":
      return state.unlockAt
        ? `This lesson unlocks ${formatDateTime(state.unlockAt)}.`
        : "This lesson has not unlocked yet.";
    case "previous_lesson_required":
      return "Complete the previous lessons before continuing.";
    case "prerequisites_required":
      return "Complete the required prerequisite course before continuing.";
    case "login_required":
      return "Sign in before continuing this lesson.";
    case "purchase_required":
      return "Purchase or unlock this course before continuing.";
    case "membership_rule_missing":
    case "no_matching_plan":
    case "membership_disabled":
      return "Your membership does not currently unlock this lesson.";
    case "enrollment_required_for_drip":
      return "Enroll in the course before this lesson can unlock.";
    case "not_started":
      return state.unlockAt
        ? `This course opens ${formatDateTime(state.unlockAt)}.`
        : "This course is not open yet.";
    case "ended":
      return "This course is no longer available.";
    default:
      return "Complete the required earlier lessons or check your enrollment before continuing.";
  }
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  if (minutes <= 0) return `${remaining}s`;
  if (remaining === 0) return `${minutes}m`;
  return `${minutes}m ${remaining}s`;
}

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
