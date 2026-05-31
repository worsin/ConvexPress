/**
 * Certificate System - mutations.
 */

import { ConvexError, v } from "convex/values";
import { mutation } from "../../_generated/server";
import { requireAuth, requireMinimumRoleLevel } from "../../helpers/permissions";
import { requirePluginEnabled } from "../../helpers/plugins";
import { emitEvent } from "../../helpers/events";
import { LMS_EVENTS, SYSTEM } from "../../events/constants";

export const createTemplate = mutation({
  args: {
    title: v.string(),
    orientation: v.optional(v.union(v.literal("landscape"), v.literal("portrait"))),
    templateDoc: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const user = await requireMinimumRoleLevel(ctx, 80);
    const now = Date.now();
    return await ctx.db.insert("lms_certificates", {
      title: args.title.trim() || "Certificate",
      templateDoc: args.templateDoc ?? {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Certificate of Completion" }] }],
      },
      orientation: args.orientation ?? "landscape",
      isActive: true,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateTemplate = mutation({
  args: {
    certificateId: v.id("lms_certificates"),
    title: v.optional(v.string()),
    orientation: v.optional(v.union(v.literal("landscape"), v.literal("portrait"))),
    templateDoc: v.optional(v.any()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireMinimumRoleLevel(ctx, 80);
    const { certificateId, ...rest } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(rest)) if (val !== undefined) patch[k] = val;
    await ctx.db.patch(certificateId, patch as never);
    return certificateId;
  },
});

export const deleteTemplate = mutation({
  args: { certificateId: v.id("lms_certificates") },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireMinimumRoleLevel(ctx, 80);
    const assignedCourses = await ctx.db.query("lms_courses").collect();
    if (assignedCourses.some((course) => course.certificateId === args.certificateId)) {
      throw new ConvexError({
        code: "CERTIFICATE_IN_USE",
        message: "Remove this certificate from courses before deleting it.",
      });
    }
    const issues = await ctx.db.query("lms_certificate_issues").collect();
    if (issues.some((issue) => issue.certificateId === args.certificateId)) {
      throw new ConvexError({
        code: "CERTIFICATE_IN_USE",
        message: "Certificate templates with issued certificates cannot be deleted.",
      });
    }
    await ctx.db.delete(args.certificateId);
    return { ok: true };
  },
});

/** Idempotent issuance — only when the learner has completed the course and it has a certificate. */
export const issueCertificate = mutation({
  args: { courseId: v.id("lms_courses"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const me = await requireAuth(ctx);
    const userId = args.userId ?? me._id;
    if (args.userId && args.userId !== me._id) {
      await requireMinimumRoleLevel(ctx, 80);
    }

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new ConvexError({ code: "NOT_FOUND", message: "Course not found" });
    if (!course.certificateId) {
      throw new ConvexError({ code: "NO_CERTIFICATE", message: "Course has no certificate" });
    }

    const completions = await ctx.db
      .query("lms_course_completions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const done = completions.find((c) => c.courseId === args.courseId && c.percent >= 100);
    if (!done) {
      throw new ConvexError({ code: "NOT_COMPLETED", message: "Course not completed" });
    }

    const existing = await ctx.db
      .query("lms_certificate_issues")
      .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", args.courseId))
      .first();
    if (existing?.status === "issued") return existing._id;

    const serial = `CERT-${Date.now().toString(36).toUpperCase()}-${String(userId).slice(-6).toUpperCase()}`;
    const issuedAt = Date.now();
    const issueId = existing
      ? (await ctx.db.patch(existing._id, { serial, issuedAt, status: "issued" }), existing._id)
      : await ctx.db.insert("lms_certificate_issues", {
          userId,
          courseId: args.courseId,
          certificateId: course.certificateId,
          serial,
          issuedAt,
          status: "issued",
        });
    await emitEvent(ctx, LMS_EVENTS.CERTIFICATE_ISSUED, SYSTEM.LMS, {
      userId,
      courseId: args.courseId,
      certificateId: course.certificateId,
      serial,
    });
    return issueId;
  },
});

export const revokeIssue = mutation({
  args: { issueId: v.id("lms_certificate_issues") },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireMinimumRoleLevel(ctx, 80);
    const issue = await ctx.db.get(args.issueId);
    if (!issue) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Certificate issue not found" });
    }
    await ctx.db.patch(args.issueId, { status: "revoked" });
    await emitEvent(ctx, LMS_EVENTS.CERTIFICATE_REVOKED, SYSTEM.LMS, {
      userId: issue.userId,
      courseId: issue.courseId,
      certificateIssueId: args.issueId,
    });
    return { ok: true };
  },
});
