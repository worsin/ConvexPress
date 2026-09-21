import { newCertificateSerial } from "../certificates/serial";
import { canResumeProgressRevocation } from "../certificates/revocationPolicy";
import { insertCountedProgress, patchCountedProgress } from "./counts";
import { summarizeCourseProgress } from "./summary";
/**
 * Progress & Completion - mutations.
 */

import { insertWithMediaReferences, patchWithMediaReferences , patchDynamicWithMediaReferences} from "../../media/attachmentGuard";
import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import { mutation } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireAuth } from "../../helpers/permissions";
import { requirePluginEnabled } from "../../helpers/plugins";
import { emitEvent } from "../../helpers/events";
import { LMS_EVENTS, SYSTEM } from "../../events/constants";
import { canUserAccessNode } from "../access";

async function recompute(ctx: any, userId: Id<"users">, courseId: Id<"lms_courses">) {
  const lessons = await ctx.db
    .query("lms_nodes")
    .withIndex("by_course_kind", (q: any) => q.eq("courseId", courseId).eq("kind", "lesson"))
    .collect();
  const progressRows = await ctx.db
    .query("lms_progress")
    .withIndex("by_user_course", (q: any) => q.eq("userId", userId).eq("courseId", courseId))
    .collect();
  const summary = summarizeCourseProgress(courseId, userId, lessons, progressRows);
  const { percent, total, completedCount: completed } = summary;
  const rec = await ctx.db.query("lms_course_completions")
    .withIndex("by_user_course", (q: any) => q.eq("userId", userId).eq("courseId", courseId))
    .first();

  if (completed === total && total > 0) {
    const course = await ctx.db.get(courseId);
    if (!rec) {
      await ctx.db.insert("lms_course_completions", {
        userId,
        courseId,
        completedAt: Date.now(),
        percent,
        pointsEarned: course?.pointsAwarded,
      });
      await emitEvent(ctx, LMS_EVENTS.COURSE_COMPLETED, SYSTEM.LMS, { userId, courseId });
    } else {
      await patchDynamicWithMediaReferences(ctx, rec._id, { percent, completedAt: rec.completedAt ?? Date.now() });
    }
    // Auto-issue a certificate when the course has one assigned.
    if (course?.certificateId) {
      const certificate = await ctx.db.get(course.certificateId);
      if (!certificate?.isActive) return { percent, completed, total };
      const existingIssue = await ctx.db
        .query("lms_certificate_issues")
        .withIndex("by_user_course", (q: any) => q.eq("userId", userId).eq("courseId", courseId))
        .first();
      if (existingIssue?.status === "revoked") {
        if (!canResumeProgressRevocation(existingIssue)) return { percent, completed, total };
        const serial = await newCertificateSerial(ctx);
        await patchWithMediaReferences<"lms_certificate_issues">(ctx, "lms_certificate_issues", existingIssue._id, {
          certificateId: course.certificateId,
          serial,
          issuedAt: Date.now(),
          pdfMediaId: undefined,
          revokedAt: undefined,
          revokedBy: undefined,
          revocationReason: undefined,
          revocationKind: undefined,
          status: "issued",
        });
        await emitEvent(ctx, LMS_EVENTS.CERTIFICATE_ISSUED, SYSTEM.LMS, {
          userId,
          courseId,
          certificateId: course.certificateId,
          certificateIssueId: existingIssue._id,
          serial,
          reissued: true,
        });
        await scheduleCertificatePdfRender(ctx, existingIssue._id);
      } else if (!existingIssue) {
        const serial = await newCertificateSerial(ctx);
        const certificateIssueId: import("../../_generated/dataModel").Id<"lms_certificate_issues"> = await insertWithMediaReferences<"lms_certificate_issues">(ctx, "lms_certificate_issues", {
          userId,
          courseId,
          certificateId: course.certificateId,
          serial,
          issuedAt: Date.now(),
          status: "issued",
        });
        await emitEvent(ctx, LMS_EVENTS.CERTIFICATE_ISSUED, SYSTEM.LMS, {
          userId,
          courseId,
          certificateId: course.certificateId,
          certificateIssueId,
          serial,
        });
        await scheduleCertificatePdfRender(ctx, certificateIssueId);
      } else if (!existingIssue.pdfMediaId) {
        await scheduleCertificatePdfRender(ctx, existingIssue._id);
      }
    }
  } else if (rec) {
    await patchDynamicWithMediaReferences(ctx, rec._id, { percent });
    const issues = await ctx.db
      .query("lms_certificate_issues")
      .withIndex("by_user_course", (q: any) => q.eq("userId", userId).eq("courseId", courseId))
      .collect();
    for (const issue of issues.filter((i: any) => i.status === "issued")) {
      await patchWithMediaReferences<"lms_certificate_issues">(ctx, "lms_certificate_issues", issue._id, {
        status: "revoked",
        revokedAt: Date.now(),
        revocationReason: "Course completion was rolled back.",
        revocationKind: "progress",
        revokedBy: undefined,
      });
      await emitEvent(ctx, LMS_EVENTS.CERTIFICATE_REVOKED, SYSTEM.LMS, {
        userId,
        courseId,
        certificateIssueId: issue._id,
      });
    }
  }
  return { percent, completed, total };
}

async function scheduleCertificatePdfRender(ctx: any, issueId: string) {
  await ctx.scheduler.runAfter(
    0,
    (internal as any).lms.certificates.actions.renderCertificatePdf,
    { issueId },
  );
}

export const markComplete = mutation({
  args: { nodeId: v.id("lms_nodes") },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(args.nodeId);
    if (!node || node.kind !== "lesson") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Not a lesson" });
    }
    const access = await canUserAccessNode(ctx, { nodeId: args.nodeId, userId: user._id });
    if (!access.allowed) {
      throw new ConvexError({ code: "ACCESS_DENIED", message: access.reason });
    }
    if (node.showMarkComplete === false) {
      throw new ConvexError({
        code: "MARK_COMPLETE_DISABLED",
        message: "Manual completion is disabled for this lesson.",
      });
    }

    const existing = await ctx.db
      .query("lms_progress")
      .withIndex("by_user_course_node_completed", (q) => q.eq("userId", user._id).eq("courseId", node.courseId).eq("nodeId", args.nodeId))
      .first();
    if (node.requireVideoWatch && (existing?.videoWatchedFraction ?? 0) < 0.9) {
      throw new ConvexError({
        code: "VIDEO_REQUIRED",
        message: "Watch the lesson video before marking it complete.",
      });
    }
    if (node.minTimeSeconds && (existing?.timeSpentSec ?? 0) < node.minTimeSeconds) {
      throw new ConvexError({
        code: "TIME_REQUIRED",
        message: `Spend at least ${node.minTimeSeconds} seconds on this lesson before completing it.`,
      });
    }

    const now = Date.now();
    const wasCompleted = existing?.completed === true;
    let progressId: Id<"lms_progress">;
    if (existing) {
      await patchCountedProgress(ctx, existing._id, { completed: true, completedAt: now, lastSeenAt: now });
      progressId = existing._id;
    } else {
      progressId = await insertCountedProgress(ctx, {
        userId: user._id,
        courseId: node.courseId,
        nodeId: args.nodeId,
        completed: true,
        completedAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
      });
    }
    if (!wasCompleted) {
      await emitEvent(ctx, LMS_EVENTS.LESSON_COMPLETED, SYSTEM.LMS, {
        userId: user._id,
        courseId: node.courseId,
        nodeId: args.nodeId,
        progressId,
        completionMode: "manual",
      });
    }
    return await recompute(ctx, user._id, node.courseId);
  },
});

export const recordHeartbeat = mutation({
  args: {
    nodeId: v.id("lms_nodes"),
    watchedFraction: v.optional(v.number()),
    timeSpentSec: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(args.nodeId);
    if (!node || node.kind !== "lesson") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Not a lesson" });
    }
    const access = await canUserAccessNode(ctx, { nodeId: args.nodeId, userId: user._id });
    if (!access.allowed) {
      throw new ConvexError({ code: "ACCESS_DENIED", message: access.reason });
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("lms_progress")
      .withIndex("by_user_course_node_completed", (q) => q.eq("userId", user._id).eq("courseId", node.courseId).eq("nodeId", args.nodeId))
      .first();
    const nextWatched = Math.max(
      existing?.videoWatchedFraction ?? 0,
      Math.min(Math.max(args.watchedFraction ?? 0, 0), 1),
    );
    const nextTime = Math.max(existing?.timeSpentSec ?? 0, args.timeSpentSec ?? 0);
    const firstSeenAt = existing?.firstSeenAt ?? now;
    const completionDelayMet =
      !node.completionDelaySec || now - firstSeenAt >= node.completionDelaySec * 1000;
    const videoMet = !node.requireVideoWatch || nextWatched >= 0.9;
    const timeMet = !node.minTimeSeconds || nextTime >= node.minTimeSeconds;
    const shouldAutoComplete = !!node.autoComplete && completionDelayMet && videoMet && timeMet;
    const completedNow = shouldAutoComplete && existing?.completed !== true;
    let progressId: Id<"lms_progress">;

    if (existing) {
      await patchCountedProgress(ctx, existing._id, {
        videoWatchedFraction: nextWatched,
        timeSpentSec: nextTime,
        firstSeenAt,
        lastSeenAt: now,
        ...(shouldAutoComplete && !existing.completed
          ? { completed: true, completedAt: now }
          : {}),
      });
      progressId = existing._id;
    } else {
      progressId = await insertCountedProgress(ctx, {
        userId: user._id,
        courseId: node.courseId,
        nodeId: args.nodeId,
        completed: shouldAutoComplete,
        completedAt: shouldAutoComplete ? now : undefined,
        videoWatchedFraction: nextWatched,
        timeSpentSec: nextTime,
        firstSeenAt,
        lastSeenAt: now,
      });
    }

    if (completedNow) {
      await emitEvent(ctx, LMS_EVENTS.LESSON_COMPLETED, SYSTEM.LMS, {
        userId: user._id,
        courseId: node.courseId,
        nodeId: args.nodeId,
        progressId,
        completionMode: "automatic",
      });
    }

    return await recompute(ctx, user._id, node.courseId);
  },
});

export const markIncomplete = mutation({
  args: { nodeId: v.id("lms_nodes") },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(args.nodeId);
    if (!node || node.kind !== "lesson") {
      throw new ConvexError({ code: "VALIDATION_ERROR", message: "Not a lesson" });
    }
    const access = await canUserAccessNode(ctx, { nodeId: args.nodeId, userId: user._id });
    if (!access.allowed) {
      throw new ConvexError({ code: "ACCESS_DENIED", message: access.reason });
    }
    const matches = await ctx.db
      .query("lms_progress")
      .withIndex("by_user_course_node_completed", (q) => q.eq("userId", user._id).eq("courseId", node.courseId).eq("nodeId", args.nodeId))
      .take(129);
    if (matches.length > 128) throw new ConvexError({ code: "LMS_PROGRESS_DUPLICATES", message: "This lesson has conflicting progress records. Ask the site administrator to repair them before retrying." });
    const completed = matches.find(row => row.completed);
    for (const row of matches) {
      if (row.completed) await patchCountedProgress(ctx, row._id, { completed: false, completedAt: undefined });
    }
    if (completed) {
      await emitEvent(ctx, LMS_EVENTS.LESSON_INCOMPLETE, SYSTEM.LMS, {
        userId: user._id,
        courseId: node.courseId,
        nodeId: args.nodeId,
        progressId: completed._id,
      });
    }
    return await recompute(ctx, user._id, node.courseId);
  },
});
