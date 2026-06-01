/**
 * Certificate System - queries.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";
import { getCurrentUser, requireCan } from "../../helpers/permissions";
import {
  buildCertificateMergeValues,
  renderCertificateText,
} from "./rendering";

export const listTemplates = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    await requireCan(ctx, "lms.certificate.manage");
    return await ctx.db.query("lms_certificates").order("desc").take(200);
  },
});

export const getTemplate = query({
  args: { certificateId: v.id("lms_certificates") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    await requireCan(ctx, "lms.certificate.manage");
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
    if (args.userId && args.userId !== me?._id) {
      await requireCan(ctx, "lms.certificate.manage");
    }
    const issue = await ctx.db
      .query("lms_certificate_issues")
      .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", args.courseId))
      .first();
    return issue?.status === "issued" ? issue : null;
  },
});

export const listIssues = query({
  args: { courseId: v.optional(v.id("lms_courses")) },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    await requireCan(ctx, "lms.certificate.manage");
    const issues = args.courseId
      ? await ctx.db
          .query("lms_certificate_issues")
          .withIndex("by_course", (q) => q.eq("courseId", args.courseId!))
          .collect()
      : await ctx.db.query("lms_certificate_issues").order("desc").take(200);
    const rows = [];
    for (const issue of issues) {
      const user = await ctx.db.get(issue.userId);
      const course = await ctx.db.get(issue.courseId);
      const pdfMedia = issue.pdfMediaId ? await ctx.db.get(issue.pdfMediaId) : null;
      const pdfUrl = pdfMedia?.storageId
        ? await ctx.storage.getUrl(pdfMedia.storageId)
        : pdfMedia?.url;
      rows.push({
        ...issue,
        learnerName: user?.displayName ?? user?.email ?? "Unknown",
        courseTitle: course?.title ?? "Unknown course",
        pdfUrl: pdfUrl ?? undefined,
      });
    }
    return rows.sort((a, b) => b.issuedAt - a.issuedAt);
  },
});

/** Public verification by serial. */
export const verifyBySerial = query({
  args: { serial: v.string() },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return { valid: false };
    const serial = args.serial.trim().toUpperCase();
    if (!/^CERT-[A-Z0-9-]{6,80}$/.test(serial)) {
      return { valid: false };
    }
    const issue = await ctx.db
      .query("lms_certificate_issues")
      .withIndex("by_serial", (q) => q.eq("serial", serial))
      .first();
    if (!issue || issue.status !== "issued") return { valid: false };
    const user = await ctx.db.get(issue.userId);
    const course = await ctx.db.get(issue.courseId);
    const certificate = await ctx.db.get(issue.certificateId);
    const completion = await findCompletion(ctx, issue.userId, issue.courseId);
    const pdfMedia = issue.pdfMediaId ? await ctx.db.get(issue.pdfMediaId) : null;
    const pdfUrl = pdfMedia?.storageId
      ? await ctx.storage.getUrl(pdfMedia.storageId)
      : pdfMedia?.url;
    const learnerName = user?.displayName ?? user?.email ?? "Unknown";
    const courseTitle = course?.title ?? "Unknown course";
    const certificateTitle = certificate?.title ?? "Certificate of Completion";
    return {
      valid: true,
      learnerName,
      courseTitle,
      issuedAt: issue.issuedAt,
      serial: issue.serial,
      pdfUrl: pdfUrl ?? undefined,
      certificateTitle,
      orientation: certificate?.orientation ?? "landscape",
      certificateText: renderCertificateText(certificate?.templateDoc, {
        ...buildCertificateMergeValues({
          learnerName,
          courseTitle,
          issuedAt: issue.issuedAt,
          serial: issue.serial,
          certificateTitle,
          points: completion?.pointsEarned ?? course?.pointsAwarded,
        }),
      }),
    };
  },
});

async function findCompletion(ctx: any, userId: string, courseId: string) {
  const completions = await ctx.db
    .query("lms_course_completions")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  return completions.find((completion: any) => completion.courseId === courseId) ?? null;
}
