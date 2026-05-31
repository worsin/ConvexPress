/**
 * Course Access & Enrollment - mutations.
 */

import { ConvexError, v } from "convex/values";
import { mutation } from "../../_generated/server";
import { requireAuth, requireMinimumRoleLevel } from "../../helpers/permissions";
import { requirePluginEnabled } from "../../helpers/plugins";
import { emitEvent } from "../../helpers/events";
import { LMS_EVENTS, SYSTEM } from "../../events/constants";
import { canUserAccessCourse } from "../access";

const SELF_ENROLL_RATE_WINDOW_MS = 10 * 60 * 1000;
const SELF_ENROLL_RATE_LIMIT = 20;

export const enroll = mutation({
  args: {
    courseId: v.id("lms_courses"),
    userId: v.optional(v.id("users")),
    source: v.optional(
      v.union(v.literal("membership_plan"), v.literal("manual"), v.literal("purchase")),
    ),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const me = await requireAuth(ctx);

    // Enrolling someone else requires Editor+.
    const targetUserId = args.userId ?? me._id;
    if (args.userId && args.userId !== me._id) {
      await requireMinimumRoleLevel(ctx, 80);
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

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "active",
        source: args.source ?? existing.source,
        expiresAt,
        updatedAt: now,
      });
      return existing._id;
    }

    if (!args.userId || args.userId === me._id) {
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

      const recentActiveEnrollments = await ctx.db
        .query("lms_enrollments")
        .withIndex("by_user", (q) => q.eq("userId", me._id).eq("status", "active"))
        .collect();
      const recentCount = recentActiveEnrollments.filter(
        (row) => now - (row.createdAt ?? row.enrolledAt ?? 0) <= SELF_ENROLL_RATE_WINDOW_MS,
      ).length;
      if (recentCount >= SELF_ENROLL_RATE_LIMIT) {
        throw new ConvexError({
          code: "RATE_LIMITED",
          message: "Too many enrollments in a short period. Try again later.",
        });
      }
    }

    // Seat limit.
    if (course.seatLimit && course.seatLimit > 0) {
      const active = await ctx.db
        .query("lms_enrollments")
        .withIndex("by_course", (q) => q.eq("courseId", args.courseId).eq("status", "active"))
        .collect();
      if (active.length >= course.seatLimit) {
        throw new ConvexError({ code: "SEAT_LIMIT", message: "Course is full" });
      }
    }

    const enrollmentId = await ctx.db.insert("lms_enrollments", {
      userId: targetUserId,
      courseId: args.courseId,
      source: args.source ?? "manual",
      enrolledAt: now,
      expiresAt,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await emitEvent(ctx, LMS_EVENTS.ENROLLED, SYSTEM.LMS, {
      courseId: args.courseId,
      userId: targetUserId,
    });
    return enrollmentId;
  },
});

export const unenroll = mutation({
  args: { courseId: v.id("lms_courses"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const me = await requireAuth(ctx);
    const targetUserId = args.userId ?? me._id;
    if (args.userId && args.userId !== me._id) {
      await requireMinimumRoleLevel(ctx, 80);
    }
    const existing = await ctx.db
      .query("lms_enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", targetUserId).eq("courseId", args.courseId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { status: "revoked", updatedAt: Date.now() });
    }
    return { ok: true };
  },
});

/** Admin: enroll a learner by email. */
export const enrollByEmail = mutation({
  args: { courseId: v.id("lms_courses"), email: v.string() },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireMinimumRoleLevel(ctx, 80);
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.trim().toLowerCase()))
      .first();
    if (!user) {
      throw new ConvexError({ code: "NOT_FOUND", message: "No user with that email" });
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("lms_enrollments")
      .withIndex("by_user_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { status: "active", updatedAt: now });
      return existing._id;
    }
    const enrollmentId = await ctx.db.insert("lms_enrollments", {
      userId: user._id,
      courseId: args.courseId,
      source: "manual",
      enrolledAt: now,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await emitEvent(ctx, LMS_EVENTS.ENROLLED, SYSTEM.LMS, {
      courseId: args.courseId,
      userId: user._id,
    });
    return enrollmentId;
  },
});
