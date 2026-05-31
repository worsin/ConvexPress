/**
 * Course Access & Enrollment - mutations.
 */

import { ConvexError, v } from "convex/values";
import { mutation } from "../../_generated/server";
import { requireAuth, requireMinimumRoleLevel } from "../../helpers/permissions";
import { requirePluginEnabled } from "../../helpers/plugins";
import { emitEvent } from "../../helpers/events";

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
    await emitEvent(ctx, "lms.enrolled", "lms", {
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
      .filter((q) => q.eq(q.field("email"), args.email.trim()))
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
    await emitEvent(ctx, "lms.enrolled", "lms", {
      courseId: args.courseId,
      userId: user._id,
    });
    return enrollmentId;
  },
});
