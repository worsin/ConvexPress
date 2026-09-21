import { summarizeCourseProgress } from "./summary";
/**
 * Progress & Completion - queries.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";
import { getCurrentUser, requireCan } from "../../helpers/permissions";
import { canUserAccessCourse, canUserAccessNode } from "../access";

export const getCourseProgress = query({
  args: { courseId: v.id("lms_courses"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const empty = {
      percent: 0,
      total: 0,
      completedCount: 0,
      completedNodeIds: [] as string[],
      nextNodeId: null as string | null,
      topicProgress: [] as Array<{
        topicId: string;
        title: string;
        percent: number;
        completedCount: number;
        total: number;
      }>,
    };
    if (!(await isPluginEnabled(ctx, "lms"))) return empty;
    const me = await getCurrentUser(ctx);
    const userId = args.userId ?? me?._id;
    if (!userId || !me || me.status !== "active") return empty;
    if (args.userId && args.userId !== me?._id) {
      await requireCan(ctx, "lms.enroll.manage");
      const learner = await ctx.db.get("users", userId);
      if (!learner || learner.status !== "active") return empty;
    }
    const access = await canUserAccessCourse(ctx, {
      courseId: args.courseId,
      userId,
    });
    if (!access.allowed) return empty;

    // Ordered lesson list: topics by position, then lessons by position.
    const nodes = await ctx.db
      .query("lms_nodes")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    const progressRows = await ctx.db
      .query("lms_progress")
      .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", args.courseId))
      .collect();
    const summary = summarizeCourseProgress(args.courseId, userId, nodes, progressRows);
    const { percent } = summary;
    const course = percent >= 100 ? await ctx.db.get(args.courseId) : null;

    return {
      ...summary,
      completionRedirectUrl: course?.completionRedirectUrl,
    };
  },
});

export const getNodeProgress = query({
  args: { nodeId: v.id("lms_nodes"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const me = await getCurrentUser(ctx);
    const userId = args.userId ?? me?._id;
    if (!userId || !me || me.status !== "active") return null;
    if (args.userId && args.userId !== me?._id) {
      await requireCan(ctx, "lms.enroll.manage");
      const learner = await ctx.db.get("users", userId);
      if (!learner || learner.status !== "active") return null;
    }
    const access = await canUserAccessNode(ctx, { nodeId: args.nodeId, userId });
    if (!access.allowed) return null;
    return await ctx.db
      .query("lms_progress")
      .withIndex("by_user_node", (q) => q.eq("userId", userId).eq("nodeId", args.nodeId))
      .first();
  },
});

export const canComplete = query({
  args: { nodeId: v.id("lms_nodes"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) {
      return { allowed: false, reason: "disabled", requiresLogin: false };
    }
    const me = await getCurrentUser(ctx);
    const userId = args.userId ?? me?._id;
    if (!userId || !me || me.status !== "active") {
      return { allowed: false, reason: "login_required", requiresLogin: true };
    }
    if (args.userId && args.userId !== me?._id) {
      await requireCan(ctx, "lms.enroll.manage");
    }

    if (args.userId && args.userId !== me._id) {
      const learner = await ctx.db.get("users", userId);
      if (!learner || learner.status !== "active") {
        return { allowed: false, reason: "inactive_user", requiresLogin: false };
      }
    }

    const node = await ctx.db.get(args.nodeId);
    if (!node || node.kind !== "lesson") {
      return { allowed: false, reason: "not_found", requiresLogin: false };
    }

    const access = await canUserAccessNode(ctx, { nodeId: args.nodeId, userId });
    if (!access.allowed) {
      return {
        allowed: false,
        reason: access.reason,
        requiresLogin: access.requiresLogin,
        unlockAt: access.unlockAt,
      };
    }
    if (node.showMarkComplete === false) {
      return { allowed: false, reason: "mark_complete_disabled", requiresLogin: false };
    }

    const progress = await ctx.db
      .query("lms_progress")
      .withIndex("by_user_node", (q) => q.eq("userId", userId).eq("nodeId", args.nodeId))
      .first();
    const watchedFraction = progress?.videoWatchedFraction ?? 0;
    const timeSpentSec = progress?.timeSpentSec ?? 0;
    const requiredWatchedFraction = node.requireVideoWatch ? 0.9 : undefined;
    const minTimeSeconds = node.minTimeSeconds ?? 0;
    const videoRemainingFraction = requiredWatchedFraction
      ? Math.max(0, requiredWatchedFraction - watchedFraction)
      : 0;
    const timeRemainingSec = Math.max(0, minTimeSeconds - timeSpentSec);

    if (videoRemainingFraction > 0) {
      return {
        allowed: false,
        reason: "video_required",
        requiresLogin: false,
        watchedFraction,
        requiredWatchedFraction,
        timeSpentSec,
        minTimeSeconds,
        videoRemainingFraction,
        timeRemainingSec,
      };
    }
    if (timeRemainingSec > 0) {
      return {
        allowed: false,
        reason: "time_required",
        requiresLogin: false,
        watchedFraction,
        requiredWatchedFraction,
        timeSpentSec,
        minTimeSeconds,
        videoRemainingFraction,
        timeRemainingSec,
      };
    }

    return {
      allowed: true,
      reason: progress?.completed ? "already_completed" : "ready",
      requiresLogin: false,
      watchedFraction,
      requiredWatchedFraction,
      timeSpentSec,
      minTimeSeconds,
      videoRemainingFraction,
      timeRemainingSec,
    };
  },
});
