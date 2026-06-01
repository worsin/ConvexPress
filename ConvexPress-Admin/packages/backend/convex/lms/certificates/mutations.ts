/**
 * Certificate System - mutations.
 */

import { ConvexError, v } from "convex/values";
import { mutation } from "../../_generated/server";
import { requireAuth, requireCan } from "../../helpers/permissions";
import { requirePluginEnabled } from "../../helpers/plugins";
import { emitEvent } from "../../helpers/events";
import { LMS_EVENTS, SYSTEM } from "../../events/constants";

const DEFAULT_TEMPLATE_TEXT =
  "Certificate of Completion\n\nAwarded to {{learnerName}} for completing {{courseTitle}}.\n\nIssued {{issuedDate}}\nSerial {{serial}}";

export const createTemplate = mutation({
  args: {
    title: v.string(),
    orientation: v.optional(v.union(v.literal("landscape"), v.literal("portrait"))),
    templateDoc: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const user = await requireCan(ctx, "lms.certificate.manage");
    const now = Date.now();
    return await ctx.db.insert("lms_certificates", {
      title: args.title.trim() || "Certificate",
      templateDoc: args.templateDoc ?? textToDoc(DEFAULT_TEMPLATE_TEXT),
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
    await requireCan(ctx, "lms.certificate.manage");
    const { certificateId, ...rest } = args;
    const certificate = await ctx.db.get(certificateId);
    if (!certificate) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Certificate template not found" });
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(rest)) {
      if (val === undefined) continue;
      patch[k] = k === "title" ? String(val).trim() || "Certificate" : val;
    }
    await ctx.db.patch(certificateId, patch as never);
    return certificateId;
  },
});

export const deleteTemplate = mutation({
  args: { certificateId: v.id("lms_certificates") },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    await requireCan(ctx, "lms.certificate.manage");
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
      await requireCan(ctx, "lms.certificate.manage");
    }

    const course = await ctx.db.get(args.courseId);
    if (!course) throw new ConvexError({ code: "NOT_FOUND", message: "Course not found" });
    if (!course.certificateId) {
      throw new ConvexError({ code: "NO_CERTIFICATE", message: "Course has no certificate" });
    }
    const certificate = await ctx.db.get(course.certificateId);
    if (!certificate || !certificate.isActive) {
      throw new ConvexError({
        code: "CERTIFICATE_INACTIVE",
        message: "The assigned certificate template is inactive.",
      });
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

    const serial = newCertificateSerial(userId);
    const issuedAt = Date.now();
    const issueId = existing
      ? (await ctx.db.patch(existing._id, {
          certificateId: course.certificateId,
          serial,
          issuedAt,
          revokedAt: undefined,
          revokedBy: undefined,
          revocationReason: undefined,
          status: "issued",
        }), existing._id)
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
      certificateIssueId: issueId,
      serial,
    });
    return issueId;
  },
});

export const revokeIssue = mutation({
  args: { issueId: v.id("lms_certificate_issues"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const user = await requireCan(ctx, "lms.certificate.manage");
    const issue = await ctx.db.get(args.issueId);
    if (!issue) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Certificate issue not found" });
    }
    if (issue.status === "revoked") {
      return { ok: true, alreadyRevoked: true };
    }
    await ctx.db.patch(args.issueId, {
      status: "revoked",
      revokedAt: Date.now(),
      revokedBy: user._id,
      revocationReason: args.reason?.trim() || undefined,
    });
    await emitEvent(ctx, LMS_EVENTS.CERTIFICATE_REVOKED, SYSTEM.LMS, {
      userId: issue.userId,
      courseId: issue.courseId,
      certificateIssueId: args.issueId,
      reason: args.reason?.trim() || undefined,
    });
    return { ok: true };
  },
});

function textToDoc(text: string) {
  return {
    type: "doc",
    content: text.split(/\n{2,}/).map((block) => ({
      type: "paragraph",
      content: block
        ? [{ type: "text", text: block.replace(/\n/g, " ") }]
        : [],
    })),
  };
}

function newCertificateSerial(userId: string) {
  return `CERT-${Date.now().toString(36).toUpperCase()}-${String(userId).slice(-6).toUpperCase()}`;
}
