/**
 * Lesson player loader: LMS gate, the course/tree/progress/access/lesson
 * queries, the completion + heartbeat mutations and the lock/completion
 * model, handed to the `dashboard.lesson` surface as one view model.
 */
import { api } from "@convexpress-website/backend/generated/api";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useDashboardPath } from "@/hooks/useDashboardConfig";
import {
  formatLockReason,
  getCompletionState,
  safeCourseUrl,
  type CertificateIssue,
  type CompletionGate,
  type CourseProgress,
  type CourseTree,
  type LessonDetail,
  type NodeProgress,
  type PlayerCourse,
  type UnlockState,
} from "@/lib/lms/lessonPlayer";
import CoreDashboardLesson, {
  type DashboardLessonOutlineState,
  type DashboardLessonSurfaceData,
} from "@/templates/packs/core/surfaces/dashboard.lesson";
import { Surface } from "@/templates/sdk/Surface";

const DEFAULT_LOCK_REASON = "Complete the required earlier lessons or check your enrollment before continuing.";

function useLessonHrefs(slug: string): DashboardLessonSurfaceData["hrefs"] {
  const { to } = useDashboardPath();
  return useMemo(
    () => ({
      courses: to("/courses"),
      lesson: (nodeId: string) => to(`/courses/${encodeURIComponent(slug)}/${encodeURIComponent(nodeId)}`),
      certificate: (serial: string) => `/certificates/${encodeURIComponent(serial)}`,
    }),
    [slug, to],
  );
}

function placeholderData(
  status: "loading" | "notFound",
  nodeId: string,
  hrefs: DashboardLessonSurfaceData["hrefs"],
): DashboardLessonSurfaceData {
  const noop = async () => undefined;
  return {
    status,
    nodeId,
    course: null,
    topics: [],
    outline: {},
    progress: null,
    lesson: null,
    nodeProgress: null,
    lessonLocked: false,
    lockReason: DEFAULT_LOCK_REASON,
    videoUrl: undefined,
    completion: { canComplete: false, requirements: [] },
    previousLesson: null,
    nextLesson: null,
    certificate: null,
    completionRedirectUrl: null,
    hrefs,
    actions: { markComplete: noop, markIncomplete: noop, issueCertificate: noop },
  };
}

export function DashboardCoursePlayerPage({ slug, nodeId }: { slug: string; nodeId: string }) {
  const hrefs = useLessonHrefs(slug);
  return (
    <PublicPluginGate
      pluginId="lms"
      pendingFallback={<Surface name="dashboard.lesson" data={placeholderData("loading", nodeId, hrefs)} fallback={CoreDashboardLesson} />}
    >
      <CoursePlayerContent slug={slug} nodeId={nodeId} hrefs={hrefs} />
    </PublicPluginGate>
  );
}

function CoursePlayerContent({ slug, nodeId, hrefs }: { slug: string; nodeId: string; hrefs: DashboardLessonSurfaceData["hrefs"] }) {
  const course = useQuery(api.lms.courses.queries.getBySlug, { slug }) as
    | PlayerCourse
    | null
    | undefined;

  if (course === undefined) {
    return <Surface name="dashboard.lesson" data={placeholderData("loading", nodeId, hrefs)} fallback={CoreDashboardLesson} />;
  }
  if (!course) {
    return <Surface name="dashboard.lesson" data={placeholderData("notFound", nodeId, hrefs)} fallback={CoreDashboardLesson} />;
  }

  return <CoursePlayer course={course} nodeId={nodeId} hrefs={hrefs} />;
}

function CoursePlayer({ course, nodeId, hrefs }: { course: PlayerCourse; nodeId: string; hrefs: DashboardLessonSurfaceData["hrefs"] }) {
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
    return <Surface name="dashboard.lesson" data={placeholderData("loading", nodeId, hrefs)} fallback={CoreDashboardLesson} />;
  }

  if (!orderedLessons.some((child) => child._id === nodeId)) {
    return <Surface name="dashboard.lesson" data={placeholderData("notFound", nodeId, hrefs)} fallback={CoreDashboardLesson} />;
  }

  const completionRedirectUrl = safeCourseUrl(progress.completionRedirectUrl);
  const completion = getCompletionState(lesson, nodeProgress, videoUrl, completionGate);
  const lockReason =
    selectedUnlock?.allowed === false
      ? formatLockReason(selectedUnlock)
      : selectedAccess?.allowed === false
        ? formatLockReason(selectedAccess)
        : DEFAULT_LOCK_REASON;

  const outline: Record<string, DashboardLessonOutlineState> = {};
  orderedLessons.forEach((child, lessonIndex) => {
    const unlock = unlockByNodeId.get(child._id);
    const locked =
      unlock?.allowed === false ||
      (isLinear &&
        lessonIndex > 0 &&
        orderedLessons.slice(0, lessonIndex).some((lessonNode) => !completed.has(lessonNode._id)));
    outline[child._id] = {
      completed: completed.has(child._id),
      locked,
      lockTitle: locked && unlock ? formatLockReason(unlock) : undefined,
    };
  });

  const data: DashboardLessonSurfaceData = {
    status: "ready",
    nodeId,
    course,
    topics,
    outline,
    progress,
    lesson,
    nodeProgress: nodeProgress ?? null,
    lessonLocked,
    lockReason,
    videoUrl,
    completion,
    previousLesson,
    nextLesson,
    certificate: myIssue ?? null,
    completionRedirectUrl,
    hrefs,
    actions: {
      markComplete: () => run("Lesson complete", () => markComplete({ nodeId: nodeId as any })),
      markIncomplete: () => run("Marked incomplete", () => markIncomplete({ nodeId: nodeId as any })),
      issueCertificate: () => run("Certificate issued", () => issueCertificate({ courseId: course._id as any })),
    },
  };

  return <Surface name="dashboard.lesson" data={data} fallback={CoreDashboardLesson} />;
}
