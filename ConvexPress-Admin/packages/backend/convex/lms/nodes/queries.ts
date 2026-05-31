/**
 * Curriculum tree (nodes) - queries.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";

export const getCourseTree = query({
  args: { courseId: v.id("lms_courses") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return { topics: [] };
    const nodes = await ctx.db
      .query("lms_nodes")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    const topics = nodes
      .filter((n) => n.kind === "topic")
      .sort((a, b) => a.position - b.position)
      .map((topic) => ({
        ...topic,
        children: nodes
          .filter((n) => n.parentId === topic._id)
          .sort((a, b) => a.position - b.position),
      }));

    return { topics };
  },
});

export const getNode = query({
  args: { nodeId: v.id("lms_nodes") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    return await ctx.db.get(args.nodeId);
  },
});
