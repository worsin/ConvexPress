/**
 * Certificate System - queries.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";
import { getCurrentUser } from "../../helpers/permissions";

export const listTemplates = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    return await ctx.db.query("lms_certificates").order("desc").take(200);
  },
});

export const getTemplate = query({
  args: { certificateId: v.id("lms_certificates") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    return await ctx.db.get(args.certificateId);
  },
});

export const getMyIssue = query({
  args: { courseId: v.id("lms_courses"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const me = await getCurrentUser(ctx);
    const userId = args.userId ?? me?._id;
    if (!userId) return null;
    return await ctx.db
      .query("lms_certificate_issues")
      .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", args.courseId))
      .first();
  },
});

/** Public verification by serial. */
export const verifyBySerial = query({
  args: { serial: v.string() },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return { valid: false };
    const issue = await ctx.db
      .query("lms_certificate_issues")
      .withIndex("by_serial", (q) => q.eq("serial", args.serial))
      .first();
    if (!issue || issue.status !== "issued") return { valid: false };
    const user = await ctx.db.get(issue.userId);
    const course = await ctx.db.get(issue.courseId);
    return {
      valid: true,
      learnerName: user?.displayName ?? user?.email ?? "Unknown",
      courseTitle: course?.title ?? "Unknown course",
      issuedAt: issue.issuedAt,
      serial: issue.serial,
    };
  },
});
