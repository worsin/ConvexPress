/**
 * Certificate System - queries.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";
import { getCurrentUser, requireCan } from "../../helpers/permissions";
import { docToText } from "../lessons/helpers";

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
      rows.push({
        ...issue,
        learnerName: user?.displayName ?? user?.email ?? "Unknown",
        courseTitle: course?.title ?? "Unknown course",
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
    return {
      valid: true,
      learnerName: user?.displayName ?? user?.email ?? "Unknown",
      courseTitle: course?.title ?? "Unknown course",
      issuedAt: issue.issuedAt,
      serial: issue.serial,
      certificateTitle: certificate?.title ?? "Certificate of Completion",
      orientation: certificate?.orientation ?? "landscape",
      certificateText: renderCertificateText(certificate?.templateDoc, {
        learnerName: user?.displayName ?? user?.email ?? "Unknown",
        courseTitle: course?.title ?? "Unknown course",
        issuedDate: formatDate(issue.issuedAt),
        serial: issue.serial,
        certificateTitle: certificate?.title ?? "Certificate of Completion",
      }),
    };
  },
});

function renderCertificateText(templateDoc: unknown, vars: Record<string, string>) {
  const fallback =
    "Certificate of Completion\n\nAwarded to {{learnerName}} for completing {{courseTitle}}.\n\nIssued {{issuedDate}}\nSerial {{serial}}";
  const source = docToText(templateDoc) || fallback;
  return source.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => {
    return vars[key] ?? "";
  });
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
