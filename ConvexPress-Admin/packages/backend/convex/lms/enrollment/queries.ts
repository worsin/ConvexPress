/**
 * Course Access & Enrollment - queries.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";
import { getCurrentUser } from "../../helpers/permissions";

export const canAccessCourse = query({
  args: { courseId: v.id("lms_courses"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) {
      return { allowed: false, reason: "disabled", requiresLogin: false };
    }
    const course = await ctx.db.get(args.courseId);
    if (!course) return { allowed: false, reason: "not_found", requiresLogin: false };

    const mode = course.accessMode ?? "members";
    if (mode === "open") return { allowed: true, reason: "open", requiresLogin: false };

    const me = await getCurrentUser(ctx);
    const userId = args.userId ?? me?._id;
    if (!userId) return { allowed: false, reason: "login_required", requiresLogin: true };

    if (mode === "free") return { allowed: true, reason: "free", requiresLogin: false };

    // members | buy | recurring | closed → require an active enrollment.
    const enrollment = await ctx.db
      .query("lms_enrollments")
      .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", args.courseId))
      .first();
    const active =
      enrollment &&
      enrollment.status === "active" &&
      (!enrollment.expiresAt || enrollment.expiresAt > Date.now());
    return {
      allowed: !!active,
      reason: active ? "enrolled" : "enroll_required",
      requiresLogin: false,
    };
  },
});

export const getEnrollment = query({
  args: { courseId: v.id("lms_courses"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const me = await getCurrentUser(ctx);
    const userId = args.userId ?? me?._id;
    if (!userId) return null;
    return await ctx.db
      .query("lms_enrollments")
      .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", args.courseId))
      .first();
  },
});

export const listEnrolleesForCourse = query({
  args: { courseId: v.id("lms_courses") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    const enrollments = await ctx.db
      .query("lms_enrollments")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId).eq("status", "active"))
      .collect();
    const rows = [];
    for (const e of enrollments) {
      const user = await ctx.db.get(e.userId);
      rows.push({
        enrollmentId: e._id,
        userId: e.userId,
        name: user?.displayName ?? user?.email ?? "Unknown",
        email: user?.email ?? "",
        source: e.source,
        enrolledAt: e.enrolledAt,
        expiresAt: e.expiresAt,
      });
    }
    return rows;
  },
});

export const listMyEnrollments = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    const me = await getCurrentUser(ctx);
    if (!me) return [];
    const enrollments = await ctx.db
      .query("lms_enrollments")
      .withIndex("by_user", (q) => q.eq("userId", me._id).eq("status", "active"))
      .collect();
    const rows = [];
    for (const e of enrollments) {
      const course = await ctx.db.get(e.courseId);
      if (course) {
        rows.push({
          enrollmentId: e._id,
          courseId: e.courseId,
          title: course.title,
          slug: course.slug,
          lessonCount: course.lessonCount ?? 0,
          enrolledAt: e.enrolledAt,
        });
      }
    }
    return rows;
  },
});
