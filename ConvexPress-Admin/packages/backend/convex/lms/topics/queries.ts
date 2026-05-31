/**
 * Topic System - queries.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";

export const getTopic = query({
  args: { nodeId: v.id("lms_nodes") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const node = await ctx.db.get(args.nodeId);
    if (!node || node.kind !== "topic") return null;
    return node;
  },
});

export const listTopics = query({
  args: { courseId: v.id("lms_courses") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    return await ctx.db
      .query("lms_nodes")
      .withIndex("by_course_kind", (q) => q.eq("courseId", args.courseId).eq("kind", "topic"))
      .collect()
      .then((topics) => topics.sort((a, b) => a.position - b.position));
  },
});

export const getTopicWithLessons = query({
  args: { nodeId: v.id("lms_nodes") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const topic = await ctx.db.get(args.nodeId);
    if (!topic || topic.kind !== "topic") return null;
    const children = await ctx.db
      .query("lms_nodes")
      .withIndex("by_parent", (q) => q.eq("parentId", args.nodeId))
      .collect();
    return {
      topic,
      lessons: children
        .filter((child) => child.kind === "lesson")
        .sort((a, b) => a.position - b.position),
      headings: children
        .filter((child) => child.kind === "section_heading")
        .sort((a, b) => a.position - b.position),
      children: children.sort((a, b) => a.position - b.position),
    };
  },
});

export const resolveLessonDrip = query({
  args: { nodeId: v.id("lms_nodes") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const lesson = await ctx.db.get(args.nodeId);
    if (!lesson || lesson.kind !== "lesson") return null;
    const topic = lesson.parentId ? await ctx.db.get(lesson.parentId) : null;
    const mode = lesson.lessonDripMode ?? topic?.topicDripMode ?? "immediately";
    return {
      mode,
      offsetDays:
        lesson.lessonDripOffsetDays ??
        topic?.topicDripOffsetDays ??
        0,
      date: lesson.lessonDripDate ?? topic?.topicDripDate,
      source: lesson.lessonDripMode ? "lesson" : topic?.topicDripMode ? "topic" : "default",
    };
  },
});
