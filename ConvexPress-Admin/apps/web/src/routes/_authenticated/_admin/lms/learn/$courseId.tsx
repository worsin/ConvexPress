/**
 * Course Player (learner) — /lms/learn/$courseId
 *
 * Functional learner surface in the admin app for now (the website-app player
 * is a follow-up). Exercises enrollment, the curriculum, progress/mark-complete,
 * and certificate issuance on completion.
 */

import { useEffect, useState } from "react";
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

export const Route = createFileRoute("/_authenticated/_admin/lms/learn/$courseId")({
  component: PlayerPage,
});

type TreeChild = { _id: string; kind: string; title: string };
type TreeTopic = { _id: string; title: string; children: TreeChild[] };

function VideoEmbed({ url }: { url?: string }) {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  const src = yt
    ? `https://www.youtube.com/embed/${yt[1]}`
    : vimeo
      ? `https://player.vimeo.com/video/${vimeo[1]}`
      : null;
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
    <a href={url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
      {url}
    </a>
  );
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
    | { percent: number; total: number; completedNodeIds: string[]; nextNodeId: string | null }
    | undefined;
  const myIssue = useQuery(api.lms.certificates.queries.getMyIssue, { courseId: id });

  const enroll = useMutation(api.lms.enrollment.mutations.enroll);
  const markComplete = useMutation(api.lms.progress.mutations.markComplete);
  const markIncomplete = useMutation(api.lms.progress.mutations.markIncomplete);
  const issueCert = useMutation(api.lms.certificates.mutations.issueCertificate);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lesson = useQuery(
    api.lms.lessons.queries.getLesson,
    selectedId ? { nodeId: selectedId as Id<"lms_nodes"> } : "skip",
  ) as
    | { node: { title: string; videoUrl?: string }; bodyText: string; materialsText: string }
    | null
    | undefined;

  const topics = tree?.topics ?? [];
  const completed = new Set(progress?.completedNodeIds ?? []);
  const orderedLessons = topics.flatMap((t) => t.children.filter((c) => c.kind === "lesson"));
  const isLinear = course?.progressionMode === "linear";
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

  const allowed = access?.allowed ?? false;

  async function run(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      if (label) toast.success(label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

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
                <div className="h-full bg-green-500" style={{ width: `${progress.percent}%` }} />
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
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
              Enrolled
            </span>
          )}
        </div>
      </div>

      {/* Certificate banner on completion */}
      {progress?.percent === 100 && course?.certificateId && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-green-500/40 bg-green-500/10 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Award className="h-5 w-5 text-green-600" />
            Course complete!{" "}
            {myIssue ? "Your certificate has been issued." : "Claim your certificate."}
          </div>
          {!myIssue && (
            <button
              type="button"
              onClick={() => run("Certificate issued", () => issueCert({ courseId: id }))}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Get certificate
            </button>
          )}
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
                          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-500" />
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
                Enroll to access this course's lessons.
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
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <PlayCircle className="h-5 w-5" />
                <h2 className="text-xl font-semibold">{lesson.node.title}</h2>
              </div>
              <VideoEmbed url={lesson.node.videoUrl} />
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                {lesson.bodyText || (
                  <span className="text-muted-foreground">No content yet.</span>
                )}
              </div>
              {lesson.materialsText && (
                <div className="rounded-lg border border-border p-4">
                  <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    Materials &amp; resources
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{lesson.materialsText}</div>
                </div>
              )}
              <div className="border-t border-border pt-4">
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
                    <CheckCircle2 className="h-4 w-4 text-green-500" /> Completed — undo
                  </button>
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
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
