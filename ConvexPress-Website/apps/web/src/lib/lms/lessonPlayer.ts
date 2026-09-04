/**
 * Lesson player model (pure). Shared by the dashboard lesson loader
 * (dashboard/pages/courses/CoursePlayerPage.tsx), which computes the view
 * model, and the `dashboard.lesson` surface, which renders it.
 */

export type PlayerCourse = {
  _id: string;
  title: string;
  slug: string;
  progressionMode?: string;
  certificateId?: string;
};

export type LessonSummary = {
  _id: string;
  kind: string;
  title: string;
};

export type TopicSummary = {
  _id: string;
  title: string;
  children: LessonSummary[];
};

export type CourseTree = {
  topics: TopicSummary[];
};

export type CourseProgress = {
  percent: number;
  total: number;
  completedCount: number;
  completedNodeIds: string[];
  nextNodeId: string | null;
  completionRedirectUrl?: string | null;
};

export type UnlockState = {
  nodeId: string;
  allowed: boolean;
  reason: string;
  requiresLogin?: boolean;
  unlockAt?: number | null;
};

export type LessonDetail = {
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

export type NodeProgress = {
  completed?: boolean;
  timeSpentSec?: number;
  videoWatchedFraction?: number;
};

export type CompletionGate = {
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

export type CertificateIssue = {
  serial: string;
  issuedAt: number;
  pdfUrl?: string;
};

export interface CompletionState {
  canComplete: boolean;
  requirements: string[];
}

export function safeVideoUrl(value?: string | null): string | null {
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

export function getVideoEmbedUrl(value: string): string | null {
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

export function getCompletionState(
  lesson: LessonDetail | null | undefined,
  progress: NodeProgress | null | undefined,
  videoUrl?: string,
  gate?: CompletionGate,
): CompletionState {
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

export function formatCompletionGateReason(gate: CompletionGate): string {
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

export function formatLockReason(state: { reason?: string; unlockAt?: number | null }): string {
  switch (state.reason) {
    case "drip_locked":
      return state.unlockAt
        ? `This lesson unlocks ${formatLockDateTime(state.unlockAt)}.`
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
        ? `This course opens ${formatLockDateTime(state.unlockAt)}.`
        : "This course is not open yet.";
    case "ended":
      return "This course is no longer available.";
    default:
      return "Complete the required earlier lessons or check your enrollment before continuing.";
  }
}

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  if (minutes <= 0) return `${remaining}s`;
  if (remaining === 0) return `${minutes}m`;
  return `${minutes}m ${remaining}s`;
}

function formatLockDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function safeCourseUrl(value?: string | null): string | null {
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

export function formatIssuedDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
