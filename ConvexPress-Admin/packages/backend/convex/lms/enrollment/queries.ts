/**
 * Course Access & Enrollment - queries.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";
import { getCurrentUser, requireCan } from "../../helpers/permissions";
import { canUserAccessCourse, canUserAccessNode } from "../access";

export const canAccessCourse = query({
  args: { courseId: v.id("lms_courses"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) {
      return { allowed: false, reason: "disabled", requiresLogin: false };
    }
    return await canUserAccessCourse(ctx, args);
  },
});

export const canAccessNode = query({
  args: { nodeId: v.id("lms_nodes"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) {
      return { allowed: false, reason: "disabled", requiresLogin: false };
    }
    return await canUserAccessNode(ctx, args);
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
    await requireCan(ctx, "lms.enroll.manage");
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

export const listMyLearning = query({
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
    for (const enrollment of enrollments) {
      const course = await ctx.db.get(enrollment.courseId);
      if (!course || course.status === "archived") continue;

      const nodes = await ctx.db
        .query("lms_nodes")
        .withIndex("by_course", (q) => q.eq("courseId", enrollment.courseId))
        .collect();
      const topics = nodes
        .filter((node) => node.kind === "topic")
        .sort((a, b) => a.position - b.position);
      const orderedLessons = [];
      for (const topic of topics) {
        orderedLessons.push(
          ...nodes
            .filter((node) => node.parentId === topic._id && node.kind === "lesson")
            .sort((a, b) => a.position - b.position),
        );
      }

      const progressRows = await ctx.db
        .query("lms_progress")
        .withIndex("by_user_course", (q) =>
          q.eq("userId", me._id).eq("courseId", enrollment.courseId),
        )
        .collect();
      const completedSet = new Set(
        progressRows.filter((progress) => progress.completed).map((progress) => progress.nodeId),
      );
      const completedCount = orderedLessons.filter((lesson) => completedSet.has(lesson._id)).length;
      const total = orderedLessons.length;
      const next = orderedLessons.find((lesson) => !completedSet.has(lesson._id));
      const certificateIssue = await ctx.db
        .query("lms_certificate_issues")
        .withIndex("by_user_course", (q) =>
          q.eq("userId", me._id).eq("courseId", enrollment.courseId),
        )
        .first();

      rows.push({
        enrollmentId: enrollment._id,
        courseId: enrollment.courseId,
        title: course.title,
        slug: course.slug,
        excerpt: course.excerpt,
        featuredImageId: course.featuredImageId,
        lessonCount: total,
        enrolledAt: enrollment.enrolledAt,
        expiresAt: enrollment.expiresAt,
        percent: total > 0 ? Math.round((completedCount / total) * 100) : 0,
        completedCount,
        nextNodeId: next?._id ?? orderedLessons[0]?._id ?? null,
        certificateSerial:
          certificateIssue?.status === "issued" ? certificateIssue.serial : undefined,
      });
    }

    return rows.sort((a, b) => b.enrolledAt - a.enrolledAt);
  },
});
