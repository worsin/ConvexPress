/**
 * Course Player (learner) — /lms/learn/$courseId
 *
 * Admin learner preview surface. Exercises enrollment, the curriculum,
 * progress/mark-complete, and certificate issuance on completion.
 */

import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  PlayCircle,
  Lock,
  Award,
} from "lucide-react";

import { LessonContentRenderer } from "@/components/lms/LessonContentRenderer";

export const Route = createFileRoute("/_authenticated/_admin/lms/learn/$courseId")({
  component: PlayerPage,
});

type TreeChild = { _id: string; kind: string; title: string };
type TreeTopic = { _id: string; title: string; children: TreeChild[] };

function VideoEmbed({ url }: { url?: string }) {
  const safeUrl = safeVideoUrl(url);
  if (!safeUrl) return null;
  const src = getVideoEmbedUrl(safeUrl);
  if (src) {
    return (
      <iframe
        title="Lesson video"
        className="aspect-video w-full rounded-lg border border-border"
        src={src}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return (
    <a href={safeUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
      {safeUrl}
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

function PlayerPage() {
  const { courseId } = Route.useParams();
  const id = courseId as Id<"lms_courses">;

  const course = useQuery(api.lms.courses.queries.getById, { courseId: id }) as
    | { title: string; status: string; certificateId?: string; progressionMode?: string }
    | null
    | undefined;
  const tree = useQuery(api.lms.nodes.queries.getCourseTree, { courseId: id }) as
    | { topics: TreeTopic[] }
    | undefined;
  const access = useQuery(api.lms.enrollment.queries.canAccessCourse, { courseId: id }) as
    | { allowed: boolean; reason: string; requiresLogin: boolean }
    | undefined;
  const progress = useQuery(api.lms.progress.queries.getCourseProgress, { courseId: id }) as
    | {
        percent: number;
        total: number;
        completedNodeIds: string[];
        nextNodeId: string | null;
        completionRedirectUrl?: string | null;
      }
    | undefined;
  const myIssue = useQuery(api.lms.certificates.queries.getMyIssue, { courseId: id });

  const enroll = useMutation(api.lms.enrollment.mutations.enroll);
  const markComplete = useMutation(api.lms.progress.mutations.markComplete);
  const markIncomplete = useMutation(api.lms.progress.mutations.markIncomplete);
  const recordHeartbeat = useMutation((api as any).lms.progress.mutations.recordHeartbeat);
  const issueCert = useMutation(api.lms.certificates.mutations.issueCertificate);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const timeSpentRef = useRef(0);
  const lesson = useQuery(
    (api as any).lms.lessons.queries.getLessonForPlayer,
    selectedId ? { nodeId: selectedId as Id<"lms_nodes"> } : "skip",
  ) as
    | {
        node: {
          title: string;
          videoUrl?: string;
          videoMediaId?: Id<"media">;
          requireVideoWatch?: boolean;
          minTimeSeconds?: number;
          showMarkComplete?: boolean;
        };
        bodyDoc?: unknown;
        materialsDoc?: unknown;
        bodyText: string;
        materialsText: string;
      }
    | null
    | undefined;
  const selectedAccess = useQuery(
    (api as any).lms.enrollment.queries.canAccessNode,
    selectedId ? { nodeId: selectedId as Id<"lms_nodes"> } : "skip",
  ) as { allowed: boolean; reason: string } | undefined;
  const nodeProgress = useQuery(
    api.lms.progress.queries.getNodeProgress,
    selectedId ? { nodeId: selectedId as Id<"lms_nodes"> } : "skip",
  ) as { videoWatchedFraction?: number; timeSpentSec?: number; completed?: boolean } | null | undefined;
  const videoMedia = useQuery(
    api.media.queries.get,
    lesson?.node.videoMediaId ? { mediaId: lesson.node.videoMediaId } : "skip",
  ) as { url?: string | null } | null | undefined;

  const topics = tree?.topics ?? [];
  const completed = new Set(progress?.completedNodeIds ?? []);
  const orderedLessons = topics.flatMap((t) => t.children.filter((c) => c.kind === "lesson"));
  const currentIndex = orderedLessons.findIndex((lessonNode) => lessonNode._id === selectedId);
  const previousLesson = currentIndex > 0 ? orderedLessons[currentIndex - 1] : null;
  const nextLesson =
    currentIndex >= 0 && currentIndex < orderedLessons.length - 1
      ? orderedLessons[currentIndex + 1]
      : null;
  const isLinear = course?.progressionMode === "linear";
  const allowed = access?.allowed ?? false;
  const lessonAllowed = selectedAccess?.allowed ?? allowed;
  const isLocked = (lessonId: string) => {
    if (!isLinear) return false;
    const idx = orderedLessons.findIndex((l) => l._id === lessonId);
    return idx > 0 && orderedLessons.slice(0, idx).some((l) => !completed.has(l._id));
  };

  // Default selection: next incomplete lesson, else first lesson.
  useEffect(() => {
    if (selectedId) return;
    if (progress?.nextNodeId) {
      setSelectedId(progress.nextNodeId);
    } else {
      const firstLesson = topics.flatMap((t) => t.children).find((c) => c.kind === "lesson");
      if (firstLesson) setSelectedId(firstLesson._id);
    }
  }, [progress, topics, selectedId]);

  useEffect(() => {
    timeSpentRef.current = nodeProgress?.timeSpentSec ?? 0;
  }, [selectedId, nodeProgress?.timeSpentSec]);

  useEffect(() => {
    if (!selectedId || !allowed || selectedAccess?.allowed === false || !lesson?.node) return;
    const timer = window.setInterval(() => {
      timeSpentRef.current += 15;
      void recordHeartbeat({
        nodeId: selectedId as Id<"lms_nodes">,
        timeSpentSec: timeSpentRef.current,
      }).catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [allowed, lesson?.node, recordHeartbeat, selectedAccess?.allowed, selectedId]);

  async function run(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      if (label) toast.success(label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }
  const completionRedirectUrl = safeCourseUrl(progress?.completionRedirectUrl);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link
        to="/lms/catalog"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Catalog
      </Link>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{course?.title ?? "Loading…"}</h1>
        <div className="flex items-center gap-3">
          {progress && progress.total > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-success" style={{ width: `${progress.percent}%` }} />
              </div>
              <span className="text-sm text-muted-foreground">{progress.percent}%</span>
            </div>
          )}
          {!allowed ? (
            <button
              type="button"
              onClick={() => run("Enrolled", () => enroll({ courseId: id }))}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Enroll
            </button>
          ) : (
            <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
              Enrolled
            </span>
          )}
        </div>
      </div>

      {/* Certificate banner on completion */}
      {progress?.percent === 100 && (course?.certificateId || completionRedirectUrl) && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-success/40 bg-success/10 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Award className="h-5 w-5 text-success" />
            Course complete!{" "}
            {course?.certificateId
              ? myIssue
                ? "Your certificate has been issued."
                : "Claim your certificate."
              : "Continue with the next step."}
          </div>
          <div className="flex flex-wrap gap-2">
            {completionRedirectUrl ? (
              <a
                href={completionRedirectUrl}
                className="rounded-md border border-success/40 bg-success/10 px-3 py-1.5 text-sm font-medium text-success hover:bg-success/15"
              >
                Continue
              </a>
            ) : null}
            {course?.certificateId && !myIssue ? (
              <button
                type="button"
                onClick={() => run("Certificate issued", () => issueCert({ courseId: id }))}
                className="rounded-md border border-success/40 bg-success/10 px-3 py-1.5 text-sm font-medium text-success hover:bg-success/15"
              >
                Get certificate
              </button>
            ) : null}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* Outline */}
        <aside className="space-y-4">
          {topics.map((topic) => (
            <div key={topic._id}>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                {topic.title}
              </div>
              <div className="space-y-0.5">
                {topic.children
                  .filter((c) => c.kind === "lesson")
                  .map((lessonNode) => {
                    const isDone = completed.has(lessonNode._id);
                    const isActive = selectedId === lessonNode._id;
                    const locked = isLocked(lessonNode._id);
                    return (
                      <button
                        key={lessonNode._id}
                        type="button"
                        onClick={() =>
                          locked
                            ? toast.error("Complete the previous lessons first")
                            : setSelectedId(lessonNode._id)
                        }
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                          isActive ? "bg-primary/10 text-primary" : "hover:bg-muted"
                        } ${locked ? "opacity-50" : ""}`}
                      >
                        {locked ? (
                          <Lock className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        ) : isDone ? (
                          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-success" />
                        ) : (
                          <Circle className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate">{lessonNode.title}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
          {topics.length === 0 && (
            <p className="text-sm text-muted-foreground">No lessons yet.</p>
          )}
        </aside>

        {/* Lesson view */}
        <main>
          {!allowed ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center">
              <Lock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {access?.reason === "membership_rule_missing"
                  ? "This course needs a membership access rule before learners can enroll."
                  : "Enroll to access this course's lessons."}
              </p>
            </div>
          ) : !selectedId || lesson === undefined ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {topics.length === 0 ? "No lessons yet." : "Select a lesson."}
            </div>
          ) : lesson === null ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Lesson not found.
            </div>
          ) : !lessonAllowed ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center">
              <Lock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                This lesson is locked: {selectedAccess?.reason ?? "not available yet"}.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <PlayCircle className="h-5 w-5" />
                <h2 className="text-xl font-semibold">{lesson.node.title}</h2>
              </div>
              <VideoEmbed url={videoMedia?.url ?? lesson.node.videoUrl} />
              {(lesson.node.requireVideoWatch || lesson.node.minTimeSeconds) && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  {lesson.node.requireVideoWatch && (
                    <span>
                      Video watched: {Math.round((nodeProgress?.videoWatchedFraction ?? 0) * 100)}%
                    </span>
                  )}
                  {lesson.node.minTimeSeconds ? (
                    <span>
                      Time: {nodeProgress?.timeSpentSec ?? 0}s / {lesson.node.minTimeSeconds}s
                    </span>
                  ) : null}
                  {lesson.node.requireVideoWatch && (
                    <button
                      type="button"
                      onClick={() =>
                        run("Video watch recorded", () =>
                          recordHeartbeat({
                            nodeId: selectedId as Id<"lms_nodes">,
                            watchedFraction: 1,
                            timeSpentSec: nodeProgress?.timeSpentSec ?? timeSpentRef.current,
                          }),
                        )
                      }
                      className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
                    >
                      Mark video watched
                    </button>
                  )}
                </div>
              )}
              <LessonContentRenderer
                doc={lesson.bodyDoc}
                fallbackText={lesson.bodyText}
                emptyLabel="No content yet."
              />
              {(lesson.materialsDoc || lesson.materialsText) && (
                <div className="rounded-lg border border-border p-4">
                  <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    Materials &amp; resources
                  </div>
                  <LessonContentRenderer
                    doc={lesson.materialsDoc}
                    fallbackText={lesson.materialsText}
                    emptyLabel="No materials yet."
                    className="space-y-3"
                  />
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <button
                  type="button"
                  disabled={!previousLesson}
                  onClick={() => previousLesson && setSelectedId(previousLesson._id)}
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous lesson
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  {completed.has(selectedId) ? (
                    <button
                      type="button"
                      onClick={() =>
                        run("Marked incomplete", () =>
                          markIncomplete({ nodeId: selectedId as Id<"lms_nodes"> }),
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                    >
                      <CheckCircle2 className="h-4 w-4 text-success" /> Completed — undo
                    </button>
                  ) : lesson.node.showMarkComplete === false ? (
                    <div className="text-sm text-muted-foreground">
                      This lesson completes automatically after its requirements are met.
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        run("Lesson complete", () =>
                          markComplete({ nodeId: selectedId as Id<"lms_nodes"> }),
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Mark complete
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!nextLesson || isLocked(nextLesson._id)}
                    onClick={() => nextLesson && !isLocked(nextLesson._id) && setSelectedId(nextLesson._id)}
                    className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next lesson
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
