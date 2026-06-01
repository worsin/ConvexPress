/**
 * Progress & Completion - queries.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";
import { getCurrentUser, requireCan } from "../../helpers/permissions";

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
    if (!userId) return empty;
    if (args.userId && args.userId !== me?._id) {
      await requireCan(ctx, "lms.enroll.manage");
    }

    // Ordered lesson list: topics by position, then lessons by position.
    const nodes = await ctx.db
      .query("lms_nodes")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    const topics = nodes
      .filter((n) => n.kind === "topic")
      .sort((a, b) => a.position - b.position);
    const orderedLessons: typeof nodes = [];
    for (const t of topics) {
      const lessons = nodes
        .filter((n) => n.parentId === t._id && n.kind === "lesson")
        .sort((a, b) => a.position - b.position);
      orderedLessons.push(...lessons);
    }

    const progressRows = await ctx.db
      .query("lms_progress")
      .withIndex("by_user_course", (q) => q.eq("userId", userId).eq("courseId", args.courseId))
      .collect();
    const completedSet = new Set(
      progressRows.filter((p) => p.completed).map((p) => p.nodeId as string),
    );

    const total = orderedLessons.length;
    const completedCount = orderedLessons.filter((l) => completedSet.has(l._id)).length;
    const next = orderedLessons.find((l) => !completedSet.has(l._id));
    const topicProgress = topics.map((topic) => {
      const lessons = orderedLessons.filter((lesson) => lesson.parentId === topic._id);
      const topicCompleted = lessons.filter((lesson) => completedSet.has(lesson._id)).length;
      return {
        topicId: String(topic._id),
        title: topic.title,
        percent: lessons.length > 0 ? Math.round((topicCompleted / lessons.length) * 100) : 0,
        completedCount: topicCompleted,
        total: lessons.length,
      };
    });

    return {
      percent: total > 0 ? Math.round((completedCount / total) * 100) : 0,
      total,
      completedCount,
      completedNodeIds: [...completedSet],
      nextNodeId: next?._id ?? null,
      topicProgress,
    };
  },
});

export const getNodeProgress = query({
  args: { nodeId: v.id("lms_nodes"), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const me = await getCurrentUser(ctx);
    const userId = args.userId ?? me?._id;
    if (!userId) return null;
    if (args.userId && args.userId !== me?._id) {
      await requireCan(ctx, "lms.enroll.manage");
    }
    return await ctx.db
      .query("lms_progress")
      .withIndex("by_user_node", (q) => q.eq("userId", userId).eq("nodeId", args.nodeId))
      .first();
  },
});
