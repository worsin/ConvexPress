/**
 * Course Access & Enrollment - mutations.
 */

import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { mutation } from "../../_generated/server";
import { requireAuth, requireCan } from "../../helpers/permissions";
import { requirePluginEnabled } from "../../helpers/plugins";
import { emitEvent } from "../../helpers/events";
import { LMS_EVENTS, SYSTEM } from "../../events/constants";
import { canUserAccessCourse } from "../access";

const SELF_ENROLL_RATE_WINDOW_MS = 10 * 60 * 1000;
const SELF_ENROLL_RATE_LIMIT = 20;

function isCurrentlyActiveEnrollment(enrollment: { status?: string; expiresAt?: number | null }, now: number) {
  return enrollment.status === "active" && (!enrollment.expiresAt || enrollment.expiresAt > now);
}

export const enroll = mutation({
  args: {
    courseId: v.id("lms_courses"),
    userId: v.optional(v.id("users")),
    source: v.optional(
      v.union(v.literal("membership_plan"), v.literal("manual"), v.literal("purchase")),
    ),
  },
  returns: v.id("lms_enrollments"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const me = await requireAuth(ctx);

    // Enrolling someone else requires Editor+.
    const targetUserId = args.userId ?? me._id;
    if (args.userId && args.userId !== me._id) {
      await requireCan(ctx, "lms.enroll.manage");
    }

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new ConvexError({ code: "NOT_FOUND", message: "Course not found" });

    // Idempotent: reactivate or return existing.
    const existing = await ctx.db
      .query("lms_enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", targetUserId).eq("courseId", args.courseId),
      )
      .first();

    const now = Date.now();
    const expiresAt =
      course.accessDurationDays && course.accessDurationDays > 0
        ? now + course.accessDurationDays * 24 * 60 * 60 * 1000
        : undefined;
    const selfEnrollment = !args.userId || args.userId === me._id;
    const existingIsCurrentlyActive = existing
      ? isCurrentlyActiveEnrollment(existing, now)
      : false;

    // Staff choose the source when enrolling a learner. A self-enrollment's
    // source is DERIVED from the access decision, never taken from the client:
    // a membership-gated enrollment must stay a `membership_plan` projection
    // (re-checked against the live grant on every access), or a learner could
    // label it `manual`/`purchase` and keep the course after the membership
    // lapses.
    let source: Doc<"lms_enrollments">["source"] = args.source ?? "manual";
    let membershipPlanId: Id<"membership_plans"> | undefined;

    if (selfEnrollment) {
      const decision = await canUserAccessCourse(ctx, { courseId: args.courseId, userId: me._id });
      const selfEnrollable = decision.allowed || decision.reason === "free" || decision.reason === "open";
      if (!selfEnrollable) {
        throw new ConvexError({
          code: "ACCESS_DENIED",
          message:
            decision.reason === "membership_rule_missing"
              ? "This course requires a membership plan before learners can self-enroll."
              : "You do not have access to enroll in this course.",
        });
      }
      if (existingIsCurrentlyActive) return existing!._id;
      if (decision.reason === "membership") {
        membershipPlanId = (decision.matchingPlanIds ?? [])
          .map((planId) => ctx.db.normalizeId("membership_plans", planId))
          .find((planId): planId is Id<"membership_plans"> => planId !== null);
        if (!membershipPlanId) {
          throw new ConvexError({
            code: "ACCESS_DENIED",
            message: "You do not have access to enroll in this course.",
          });
        }
        source = "membership_plan";
      } else {
        source = "manual";
      }

      const recentActiveEnrollments = await ctx.db
        .query("lms_enrollments")
        .withIndex("by_user", (q) => q.eq("userId", me._id).eq("status", "active"))
        .collect();
      const recentCount = recentActiveEnrollments
        .filter((row) => isCurrentlyActiveEnrollment(row, now))
        .filter(
          (row) => now - (row.createdAt ?? row.enrolledAt ?? 0) <= SELF_ENROLL_RATE_WINDOW_MS,
        ).length;
      if (recentCount >= SELF_ENROLL_RATE_LIMIT) {
        throw new ConvexError({
          code: "RATE_LIMITED",
          message: "Too many enrollments in a short period. Try again later.",
        });
      }
    } else if (existingIsCurrentlyActive) {
      return existing!._id;
    }

    // Seat limit.
    if (!existingIsCurrentlyActive && course.seatLimit && course.seatLimit > 0) {
      const active = await ctx.db
        .query("lms_enrollments")
        .withIndex("by_course", (q) => q.eq("courseId", args.courseId).eq("status", "active"))
        .collect();
      const activeCount = active.filter((row) => isCurrentlyActiveEnrollment(row, now)).length;
      if (activeCount >= course.seatLimit) {
        throw new ConvexError({ code: "SEAT_LIMIT", message: "Course is full" });
      }
    }

    if (existing) {
      const reactivatedSource = selfEnrollment ? source : args.source ?? existing.source;
      await ctx.db.patch("lms_enrollments", existing._id, {
        status: "active",
        source: reactivatedSource,
        membershipPlanId: selfEnrollment ? membershipPlanId : existing.membershipPlanId,
        enrolledAt: existingIsCurrentlyActive ? existing.enrolledAt : now,
        expiresAt,
        updatedAt: now,
      });
      await emitEvent(ctx, LMS_EVENTS.ENROLLED, SYSTEM.LMS, {
        courseId: args.courseId,
        userId: targetUserId,
        enrollmentId: existing._id,
        source: reactivatedSource,
        reactivated: true,
      });
      return existing._id;
    }

    const enrollmentId = await ctx.db.insert("lms_enrollments", {
      userId: targetUserId,
      courseId: args.courseId,
      source,
      membershipPlanId,
      enrolledAt: now,
      expiresAt,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await emitEvent(ctx, LMS_EVENTS.ENROLLED, SYSTEM.LMS, {
      courseId: args.courseId,
      userId: targetUserId,
      enrollmentId,
      source,
    });
    return enrollmentId;
  },
});

export const unenroll = mutation({
  args: { courseId: v.id("lms_courses"), userId: v.optional(v.id("users")) },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const me = await requireAuth(ctx);
    const targetUserId = args.userId ?? me._id;
    if (args.userId && args.userId !== me._id) {
      await requireCan(ctx, "lms.enroll.manage");
    }
    const existing = await ctx.db
      .query("lms_enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", targetUserId).eq("courseId", args.courseId),
      )
      .first();
    if (existing) {
      await ctx.db.patch("lms_enrollments", existing._id, { status: "revoked", updatedAt: Date.now() });
      await emitEvent(ctx, LMS_EVENTS.UNENROLLED, SYSTEM.LMS, {
        courseId: args.courseId,
        userId: targetUserId,
        enrollmentId: existing._id,
      });
    }
    return { ok: true };
  },
});

/** Admin: enroll a learner by email. */
export const enrollByEmail = mutation({
  args: { courseId: v.id("lms_courses"), email: v.string() },
  returns: v.id("lms_enrollments"),
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireCan(ctx, "lms.enroll.manage");
    const course = await ctx.db.get(args.courseId);
    if (!course) throw new ConvexError({ code: "NOT_FOUND", message: "Course not found" });
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.trim().toLowerCase()))
      .first();
    if (!user) {
      throw new ConvexError({ code: "NOT_FOUND", message: "No user with that email" });
    }
    const now = Date.now();
    const expiresAt =
      course.accessDurationDays && course.accessDurationDays > 0
        ? now + course.accessDurationDays * 24 * 60 * 60 * 1000
        : undefined;
    const existing = await ctx.db
      .query("lms_enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .first();
    const existingIsCurrentlyActive = existing
      ? isCurrentlyActiveEnrollment(existing, now)
      : false;
    if (!existingIsCurrentlyActive && course.seatLimit && course.seatLimit > 0) {
      const active = await ctx.db
        .query("lms_enrollments")
        .withIndex("by_course", (q) => q.eq("courseId", args.courseId).eq("status", "active"))
        .collect();
      const activeCount = active.filter((row) => isCurrentlyActiveEnrollment(row, now)).length;
      if (activeCount >= course.seatLimit) {
        throw new ConvexError({ code: "SEAT_LIMIT", message: "Course is full" });
      }
    }
    if (existing) {
      await ctx.db.patch("lms_enrollments", existing._id, {
        status: "active",
        source: "manual",
        enrolledAt: existingIsCurrentlyActive ? existing.enrolledAt : now,
        expiresAt,
        updatedAt: now,
      });
      await emitEvent(ctx, LMS_EVENTS.ENROLLED, SYSTEM.LMS, {
        courseId: args.courseId,
        userId: user._id,
        enrollmentId: existing._id,
        source: "manual",
        reactivated: !existingIsCurrentlyActive,
      });
      return existing._id;
    }
    const enrollmentId = await ctx.db.insert("lms_enrollments", {
      userId: user._id,
      courseId: args.courseId,
      source: "manual",
      enrolledAt: now,
      expiresAt,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await emitEvent(ctx, LMS_EVENTS.ENROLLED, SYSTEM.LMS, {
      courseId: args.courseId,
      userId: user._id,
      enrollmentId,
      source: "manual",
    });
    return enrollmentId;
  },
});
