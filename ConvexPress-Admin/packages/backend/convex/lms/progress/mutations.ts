/**
 * Progress & Completion - mutations.
 */

import { ConvexError, v } from "convex/values";
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
  const total = lessons.length;
  const progressRows = await ctx.db
    .query("lms_progress")
    .withIndex("by_user_course", (q: any) => q.eq("userId", userId).eq("courseId", courseId))
    .collect();
  const completed = progressRows.filter((p: any) => p.completed).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const existing = await ctx.db
    .query("lms_course_completions")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  const rec = existing.find((c: any) => c.courseId === courseId);

  if (percent >= 100 && total > 0) {
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
      await ctx.db.patch(rec._id, { percent, completedAt: rec.completedAt ?? Date.now() });
    }
    // Auto-issue a certificate when the course has one assigned.
    if (course?.certificateId) {
      const existingIssue = await ctx.db
        .query("lms_certificate_issues")
        .withIndex("by_user_course", (q: any) => q.eq("userId", userId).eq("courseId", courseId))
        .first();
      if (!existingIssue) {
        const serial = `CERT-${Date.now().toString(36).toUpperCase()}-${String(userId).slice(-6).toUpperCase()}`;
        await ctx.db.insert("lms_certificate_issues", {
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
          serial,
        });
      }
    }
  } else if (rec) {
    await ctx.db.patch(rec._id, { percent });
    const issues = await ctx.db
      .query("lms_certificate_issues")
      .withIndex("by_user_course", (q: any) => q.eq("userId", userId).eq("courseId", courseId))
      .collect();
    for (const issue of issues.filter((i: any) => i.status === "issued")) {
      await ctx.db.patch(issue._id, { status: "revoked" });
      await emitEvent(ctx, LMS_EVENTS.CERTIFICATE_REVOKED, SYSTEM.LMS, {
        userId,
        courseId,
        certificateIssueId: issue._id,
      });
    }
  }
  return { percent, completed, total };
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
      .withIndex("by_user_node", (q) => q.eq("userId", user._id).eq("nodeId", args.nodeId))
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
    if (existing) {
      await ctx.db.patch(existing._id, { completed: true, completedAt: now, lastSeenAt: now });
    } else {
      await ctx.db.insert("lms_progress", {
        userId: user._id,
        courseId: node.courseId,
        nodeId: args.nodeId,
        completed: true,
        completedAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
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
      .withIndex("by_user_node", (q) => q.eq("userId", user._id).eq("nodeId", args.nodeId))
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

    if (existing) {
      await ctx.db.patch(existing._id, {
        videoWatchedFraction: nextWatched,
        timeSpentSec: nextTime,
        firstSeenAt,
        lastSeenAt: now,
        ...(shouldAutoComplete && !existing.completed
          ? { completed: true, completedAt: now }
          : {}),
      });
    } else {
      await ctx.db.insert("lms_progress", {
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

    return await recompute(ctx, user._id, node.courseId);
  },
});

export const markIncomplete = mutation({
  args: { nodeId: v.id("lms_nodes") },
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "lms");
    const user = await requireAuth(ctx);
    const node = await ctx.db.get(args.nodeId);
    if (!node) throw new ConvexError({ code: "NOT_FOUND", message: "Lesson not found" });
    const existing = await ctx.db
      .query("lms_progress")
      .withIndex("by_user_node", (q) => q.eq("userId", user._id).eq("nodeId", args.nodeId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { completed: false, completedAt: undefined });
    }
    return await recompute(ctx, user._id, node.courseId);
  },
});
