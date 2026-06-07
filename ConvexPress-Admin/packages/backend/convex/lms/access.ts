/**
 * LMS access helpers.
 *
 * Centralizes course, node, membership, enrollment, prerequisite, drip, and
 * linear-progression decisions so UI hints cannot become the only gate.
 */

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { ConvexError } from "convex/values";
import {
  currentUserCan,
  getCurrentRoleLevel,
  getCurrentUser,
  requireCan,
} from "../helpers/permissions";
import { isPluginEnabled } from "../helpers/plugins";
import { evaluateMembershipAccess } from "../membership/access";
import type { Capability } from "../types/capabilities";

type LmsCtx = QueryCtx | MutationCtx;

export interface LmsAccessDecision {
  allowed: boolean;
  reason: string;
  requiresLogin: boolean;
  unlockAt?: number;
  enrollmentId?: Id<"lms_enrollments">;
  matchingPlanIds?: string[];
}

const COURSE_LIFECYCLE_BLOCK_REASONS = new Set([
  "not_found",
  "archived",
  "not_published",
  "not_started",
  "ended",
  "disabled",
]);

export async function getActiveEnrollment(
  ctx: LmsCtx,
  userId: Id<"users">,
  courseId: Id<"lms_courses">,
) {
  const enrollment = await ctx.db
    .query("lms_enrollments")
    .withIndex("by_user_course", (q: any) =>
      q.eq("userId", userId).eq("courseId", courseId),
    )
    .first();
  const active =
    enrollment &&
    enrollment.status === "active" &&
    (!enrollment.expiresAt || enrollment.expiresAt > Date.now());
  return active ? enrollment : null;
}

export async function getCourseRestrictionRules(
  ctx: LmsCtx,
  courseId: Id<"lms_courses">,
) {
  return await ctx.db
    .query("membership_restriction_rules")
    .withIndex("by_resource", (q: any) =>
      q.eq("resourceType", "course").eq("resourceIdOrKey", String(courseId)),
    )
    .collect();
}

export async function requireCourseAuthorOrEditor(
  ctx: LmsCtx,
  courseId: Id<"lms_courses">,
  capability: Capability = "lms.course.edit",
) {
  const user = await requireCan(ctx as any, capability);
  const course = await ctx.db.get(courseId);
  if (!course) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Course not found" });
  }

  const roleLevel = await getCurrentRoleLevel(ctx as any);
  if (roleLevel >= 80 || String(course.authorId) === String(user._id)) {
    return { user, course };
  }

  throw new ConvexError({
    code: "FORBIDDEN",
    message: "You can only manage your own LMS courses.",
  });
}

export async function requireNodeCourseAuthorOrEditor(
  ctx: LmsCtx,
  nodeId: Id<"lms_nodes">,
  capability: Capability = "lms.lesson.edit",
) {
  const node = await ctx.db.get(nodeId);
  if (!node) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Node not found" });
  }
  const auth = await requireCourseAuthorOrEditor(ctx, node.courseId, capability);
  return { ...auth, node };
}

export async function canUserAccessCourse(
  ctx: LmsCtx,
  args: { courseId: Id<"lms_courses">; userId?: Id<"users"> },
): Promise<LmsAccessDecision> {
  const course = await ctx.db.get(args.courseId);
  if (!course) {
    return { allowed: false, reason: "not_found", requiresLogin: false };
  }
  if (course.status === "archived") {
    return { allowed: false, reason: "archived", requiresLogin: false };
  }

  const me = await getCurrentUser(ctx as any);
  const userId = args.userId ?? me?._id;
  const checkingAnotherUser = !!args.userId && String(args.userId) !== String(me?._id);
  const staffPreview =
    !checkingAnotherUser &&
    ((await currentUserCan(ctx as any, "lms.course.view")) ||
      (await currentUserCan(ctx as any, "lms.course.edit")));
  if (course.status !== "published" && !staffPreview) {
    return { allowed: false, reason: "not_published", requiresLogin: false };
  }
  const now = Date.now();
  if (!staffPreview && course.startDate && course.startDate > now) {
    return { allowed: false, reason: "not_started", requiresLogin: false, unlockAt: course.startDate };
  }
  if (!staffPreview && course.endDate && course.endDate < now) {
    return { allowed: false, reason: "ended", requiresLogin: false };
  }

  const mode = course.accessMode ?? "members";
  if (mode === "open") {
    return { allowed: true, reason: "open", requiresLogin: false };
  }

  if (!userId) {
    return { allowed: false, reason: "login_required", requiresLogin: true };
  }

  // Staff need a reliable preview path even before enrollment exists.
  if (staffPreview) {
    return { allowed: true, reason: "staff_preview", requiresLogin: false };
  }

  const enrollment = await getActiveEnrollment(ctx, userId, args.courseId);
  if (enrollment) {
    return {
      allowed: true,
      reason: "enrolled",
      requiresLogin: false,
      enrollmentId: enrollment._id,
    };
  }

  if (mode === "free") {
    return { allowed: true, reason: "free", requiresLogin: false };
  }
  if (mode === "closed") {
    return { allowed: false, reason: "closed", requiresLogin: false };
  }
  if (mode === "buy" || mode === "recurring") {
    return { allowed: false, reason: "purchase_required", requiresLogin: false };
  }

  const rules = await getCourseRestrictionRules(ctx, args.courseId);
  if (rules.length === 0) {
    return { allowed: false, reason: "membership_rule_missing", requiresLogin: false };
  }
  if (!(await isPluginEnabled(ctx as any, "membership"))) {
    return { allowed: false, reason: "membership_disabled", requiresLogin: false };
  }

  const decision = await evaluateMembershipAccess(ctx as any, {
    resourceType: "course",
    resourceIdOrKey: String(args.courseId),
    userId,
  });
  return {
    allowed: decision.allowed,
    reason: decision.allowed ? "membership" : decision.reason,
    requiresLogin: decision.reason === "login_required",
    matchingPlanIds: decision.matchingPlanIds,
  };
}

export async function prerequisitesSatisfied(
  ctx: LmsCtx,
  userId: Id<"users">,
  courseId: Id<"lms_courses">,
): Promise<LmsAccessDecision> {
  const course = await ctx.db.get(courseId);
  if (!course) return { allowed: false, reason: "not_found", requiresLogin: false };

  const prereqs = await ctx.db
    .query("lms_course_prerequisites")
    .withIndex("by_course", (q: any) => q.eq("courseId", courseId))
    .collect();
  if (prereqs.length === 0) {
    return { allowed: true, reason: "no_prerequisites", requiresLogin: false };
  }

  const completions = await ctx.db
    .query("lms_course_completions")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  const completedCourseIds = new Set(
    completions
      .filter((completion: any) => completion.percent >= 100)
      .map((completion: any) => String(completion.courseId)),
  );
  const required = prereqs.map((prereq: any) => String(prereq.prereqCourseId));
  const mode = course.prereqMode ?? "all";
  const ok =
    mode === "any"
      ? required.some((id) => completedCourseIds.has(id))
      : required.every((id) => completedCourseIds.has(id));

  return {
    allowed: ok,
    reason: ok ? "prerequisites_met" : "prerequisites_required",
    requiresLogin: false,
  };
}

export async function resolveNodeUnlock(
  ctx: LmsCtx,
  userId: Id<"users">,
  node: any,
): Promise<LmsAccessDecision> {
  const enrollment = await getActiveEnrollment(ctx, userId, node.courseId);
  const topic = node.parentId ? await ctx.db.get(node.parentId) : null;
  const mode = node.lessonDripMode ?? topic?.topicDripMode ?? "immediately";
  if (mode === "immediately") {
    return { allowed: true, reason: "unlocked", requiresLogin: false };
  }

  let unlockAt: number | undefined;
  if (mode === "specific_date") {
    unlockAt = node.lessonDripDate ?? topic?.topicDripDate;
  } else if (mode === "enrollment_based") {
    const offsetDays = node.lessonDripOffsetDays ?? topic?.topicDripOffsetDays ?? 0;
    if (!enrollment) {
      return { allowed: false, reason: "enrollment_required_for_drip", requiresLogin: false };
    }
    unlockAt = enrollment.enrolledAt + offsetDays * 24 * 60 * 60 * 1000;
  }

  if (unlockAt && unlockAt > Date.now()) {
    return {
      allowed: false,
      reason: "drip_locked",
      requiresLogin: false,
      unlockAt,
    };
  }
  return { allowed: true, reason: "unlocked", requiresLogin: false, unlockAt };
}

export async function resolveAnonymousSpecificDateUnlock(
  ctx: LmsCtx,
  node: any,
): Promise<LmsAccessDecision> {
  const topic = node.parentId ? await ctx.db.get(node.parentId) : null;
  const mode = node.lessonDripMode ?? topic?.topicDripMode ?? "immediately";
  if (mode !== "specific_date") {
    return { allowed: true, reason: "unlocked", requiresLogin: false };
  }

  const unlockAt = node.lessonDripDate ?? topic?.topicDripDate;
  if (unlockAt && unlockAt > Date.now()) {
    return {
      allowed: false,
      reason: "drip_locked",
      requiresLogin: false,
      unlockAt,
    };
  }
  return { allowed: true, reason: "unlocked", requiresLogin: false, unlockAt };
}

async function getOrderedLessons(ctx: LmsCtx, courseId: Id<"lms_courses">) {
  const nodes = await ctx.db
    .query("lms_nodes")
    .withIndex("by_course", (q: any) => q.eq("courseId", courseId))
    .collect();
  const topics = nodes
    .filter((node: any) => node.kind === "topic")
    .sort((a: any, b: any) => a.position - b.position);
  const ordered: any[] = [];
  for (const topic of topics) {
    ordered.push(
      ...nodes
        .filter((node: any) => node.parentId === topic._id && node.kind === "lesson")
        .sort((a: any, b: any) => a.position - b.position),
    );
  }
  return ordered;
}

export async function linearProgressionSatisfied(
  ctx: LmsCtx,
  userId: Id<"users">,
  node: any,
): Promise<LmsAccessDecision> {
  const course = await ctx.db.get(node.courseId);
  if (!course || (course.progressionMode ?? "linear") !== "linear") {
    return { allowed: true, reason: "free_form", requiresLogin: false };
  }

  const ordered = await getOrderedLessons(ctx, node.courseId);
  const index = ordered.findIndex((lesson) => lesson._id === node._id);
  if (index <= 0) {
    return { allowed: true, reason: "first_lesson", requiresLogin: false };
  }

  const progress = await ctx.db
    .query("lms_progress")
    .withIndex("by_user_course", (q: any) =>
      q.eq("userId", userId).eq("courseId", node.courseId),
    )
    .collect();
  const completed = new Set(
    progress.filter((row: any) => row.completed).map((row: any) => String(row.nodeId)),
  );
  const missingPrior = ordered.slice(0, index).find((lesson) => !completed.has(String(lesson._id)));
  return {
    allowed: !missingPrior,
    reason: missingPrior ? "previous_lesson_required" : "linear_unlocked",
    requiresLogin: false,
  };
}

export async function canUserAccessNode(
  ctx: LmsCtx,
  args: { nodeId: Id<"lms_nodes">; userId?: Id<"users"> },
): Promise<LmsAccessDecision> {
  const node = await ctx.db.get(args.nodeId);
  if (!node || node.kind !== "lesson") {
    return { allowed: false, reason: "not_found", requiresLogin: false };
  }

  const me = await getCurrentUser(ctx as any);
  const userId = args.userId ?? me?._id;
  const courseDecision = await canUserAccessCourse(ctx, {
    courseId: node.courseId,
    userId,
  });
  if (!courseDecision.allowed) {
    if (node.isPreview && !COURSE_LIFECYCLE_BLOCK_REASONS.has(courseDecision.reason)) {
      const previewDrip = await resolveAnonymousSpecificDateUnlock(ctx, node);
      if (!previewDrip.allowed) return previewDrip;
      return { allowed: true, reason: "preview", requiresLogin: false };
    }
    return courseDecision;
  }
  if (!userId) {
    const anonymousDrip = await resolveAnonymousSpecificDateUnlock(ctx, node);
    return anonymousDrip.allowed ? courseDecision : anonymousDrip;
  }

  const prereq = await prerequisitesSatisfied(ctx, userId, node.courseId);
  if (!prereq.allowed) return prereq;

  const drip = await resolveNodeUnlock(ctx, userId, node);
  if (!drip.allowed) return drip;

  const linear = await linearProgressionSatisfied(ctx, userId, node);
  if (!linear.allowed) return linear;

  return { allowed: true, reason: courseDecision.reason, requiresLogin: false };
}
