import { certificateCodeSchema, certificateVerificationSchema } from "../../canonicalDocuments/foundation/certificateContracts";
/**
 * Certificate System - queries.
 */

import { v } from "convex/values";
import { query, type QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { isPluginEnabled } from "../../helpers/plugins";
import { getCurrentUser, requireCan } from "../../helpers/permissions";
import {
  buildCertificateMergeValues,
  renderCertificateText,
} from "./rendering";

import { lmsDocs } from "../../schema/lms.docs.generated";
export const listTemplates = query({
  args: {},
  returns: v.array(lmsDocs.lms_certificates),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    await requireCan(ctx, "lms.certificate.manage");
    return await ctx.db.query("lms_certificates").order("desc").take(200);
  },
});

export const getTemplate = query({
  args: { certificateId: v.id("lms_certificates") },
  returns: v.union(v.null(), lmsDocs.lms_certificates),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    await requireCan(ctx, "lms.certificate.manage");
    return await ctx.db.get(args.certificateId);
  },
});

export const getMyIssue = query({
  args: { courseId: v.id("lms_courses"), userId: v.optional(v.id("users")) },
  returns: v.union(v.null(), v.object({
    pdfUrl: v.optional(v.string()),
    _id: v.id("lms_certificate_issues"),
    _creationTime: v.number(),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.id("users")),
    pdfMediaId: v.optional(v.id("media")),
    revocationReason: v.optional(v.string()),
    revocationKind: v.optional(v.union(v.literal("progress"), v.literal("administrator"))),
    userId: v.id("users"),
    status: v.union(v.literal("issued"), v.literal("revoked")),
    courseId: v.id("lms_courses"),
    certificateId: v.id("lms_certificates"),
    serial: v.string(),
    issuedAt: v.number(),
  })),
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
    if (issue?.status !== "issued") return null;
    const pdfUrl = await resolveIssuePdfUrl(ctx, issue);
    return { ...issue, pdfUrl: pdfUrl ?? undefined };
  },
});

export const listIssues = query({
  args: { courseId: v.optional(v.id("lms_courses")) },
  returns: v.array(v.object({
    learnerName: v.string(),
    courseTitle: v.string(),
    pdfUrl: v.optional(v.string()),
    _id: v.id("lms_certificate_issues"),
    _creationTime: v.number(),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.id("users")),
    pdfMediaId: v.optional(v.id("media")),
    revocationReason: v.optional(v.string()),
    revocationKind: v.optional(v.union(v.literal("progress"), v.literal("administrator"))),
    userId: v.id("users"),
    status: v.union(v.literal("issued"), v.literal("revoked")),
    courseId: v.id("lms_courses"),
    certificateId: v.id("lms_certificates"),
    serial: v.string(),
    issuedAt: v.number(),
  })),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    await requireCan(ctx, "lms.certificate.manage");
    const courseId = args.courseId;
    const issues = courseId
      ? await ctx.db
          .query("lms_certificate_issues")
          .withIndex("by_course", (q) => q.eq("courseId", courseId))
          .collect()
      : await ctx.db.query("lms_certificate_issues").order("desc").take(200);
    const rows = [];
    for (const issue of issues) {
      const user = await ctx.db.get(issue.userId);
      const course = await ctx.db.get(issue.courseId);
      const pdfUrl = await resolveIssuePdfUrl(ctx, issue);
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
  returns: v.union(v.object({
    valid: v.boolean(),
    learnerName: v.optional(v.null()),
    courseTitle: v.optional(v.null()),
    issuedAt: v.optional(v.null()),
    serial: v.optional(v.null()),
    pdfUrl: v.optional(v.null()),
    certificateTitle: v.optional(v.null()),
    orientation: v.optional(v.null()),
    certificateText: v.optional(v.null()),
  }), v.object({
    valid: v.boolean(),
    learnerName: v.string(),
    courseTitle: v.string(),
    issuedAt: v.number(),
    serial: v.string(),
    pdfUrl: v.optional(v.string()),
    certificateTitle: v.string(),
    orientation: v.union(v.literal("landscape"), v.literal("portrait")),
    certificateText: v.string(),
  })),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return { valid: false };
    const serial = args.serial.trim().toUpperCase();
    if (!/^CERT-[A-Z0-9-]{6,80}$/.test(serial)) {
      return { valid: false };
    }
    const matches = await ctx.db.query("lms_certificate_issues")
      .withIndex("by_serial", q => q.eq("serial", serial)).take(2);
    const issue = matches.length === 1 ? matches[0] : null;
    if (!issue || issue.status !== "issued") return { valid: false };
    const user = await ctx.db.get(issue.userId);
    const course = await ctx.db.get(issue.courseId);
    const certificate = await ctx.db.get(issue.certificateId);
    const completion = await findCompletion(ctx, issue.userId, issue.courseId);
    const pdfUrl = await resolveIssuePdfUrl(ctx, issue);
    const learnerName = publicHolderName(user);
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

async function findCompletion(ctx: QueryCtx, userId: Id<"users">, courseId: Id<"lms_courses">) {
  return ctx.db.query("lms_course_completions")
    .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", courseId)).first();
}

function publicHolderName(user: { displayName?: string; email?: string } | null) {
  const name = user?.displayName?.trim();
  return name && !name.includes("@") ? name.slice(0, 200) : "Certificate holder";
}

/** Public code lookup returns only the details printed on the credential. */
export const verifyPublicCode = query({
  args: { serial: v.string() },
  returns: v.union(
    v.object({state:v.literal("unverified")}), v.object({state:v.literal("unavailable")}),
    v.object({state:v.literal("valid"),serial:v.string(),holderName:v.string(),courseTitle:v.string(),
      certificateTitle:v.string(),issuedAt:v.number(),pdfUrl:v.union(v.string(),v.null())}),
  ),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return {state:"unavailable" as const};
    // Reject oversized inputs before normalization; no scans or partial-code search.
    if (args.serial.length > 100) return {state:"unverified" as const};
    const code = certificateCodeSchema.safeParse(args.serial);
    if (!code.success) return {state:"unverified" as const};
    const matches = await ctx.db.query("lms_certificate_issues")
      .withIndex("by_serial", q => q.eq("serial", code.data)).take(2);
    const issue = matches.length === 1 ? matches[0] : null;
    if (!issue || issue.status !== "issued" || !Number.isFinite(issue.issuedAt) || issue.issuedAt < 0)
      return {state:"unverified" as const};
    const [user, course, certificate] = await Promise.all([
      ctx.db.get(issue.userId), ctx.db.get(issue.courseId), ctx.db.get(issue.certificateId),
    ]);
    if (!user || !course || !certificate) return {state:"unverified" as const};
    const result = certificateVerificationSchema.safeParse({state:"valid",serial:issue.serial,
      holderName:publicHolderName(user),courseTitle:course.title.trim().slice(0,200)||"Course",
      certificateTitle:certificate.title.trim().slice(0,200)||"Certificate",issuedAt:issue.issuedAt,
      pdfUrl:await resolveIssuePdfUrl(ctx,issue)});
    return result.success ? result.data : {state:"unverified" as const};
  },
});

async function resolveIssuePdfUrl(
  ctx: QueryCtx,
  issue: { pdfMediaId?: Id<"media"> },
): Promise<string | null> {
  if (!issue.pdfMediaId) return null;
  const pdfMedia = await ctx.db.get("media", issue.pdfMediaId);
  if (!pdfMedia || pdfMedia.status !== "active" || pdfMedia.mimeType !== "application/pdf") return null;
  if (pdfMedia.storageId) {
    return await ctx.storage.getUrl(pdfMedia.storageId);
  }
  return pdfMedia.url ?? null;
}
