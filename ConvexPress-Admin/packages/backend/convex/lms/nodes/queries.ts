/**
 * Curriculum tree (nodes) - queries.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";
import { hasMinimumRoleLevel } from "../../helpers/permissions";

function serializeNode(node: any) {
  const {
    bodyDoc: _bodyDoc,
    materialsDoc: _materialsDoc,
    videoUrl: _videoUrl,
    videoProvider: _videoProvider,
    videoMediaId: _videoMediaId,
    transcriptText: _transcriptText,
    audioMediaId: _audioMediaId,
    captionsMediaId: _captionsMediaId,
    aiVideoMediaId: _aiVideoMediaId,
    ...publicNode
  } = node;
  return publicNode;
}

export const getCourseTree = query({
  args: { courseId: v.id("lms_courses") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return { topics: [] };
    const course = await ctx.db.get(args.courseId);
    if (!course) return { topics: [] };
    const canAuthor = await hasMinimumRoleLevel(ctx, 60);
    if (course.status !== "published" && !canAuthor) return { topics: [] };

    const nodes = await ctx.db
      .query("lms_nodes")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();

    const topics = nodes
      .filter((n) => n.kind === "topic")
      .sort((a, b) => a.position - b.position)
      .map((topic) => ({
        ...serializeNode(topic),
        children: nodes
          .filter((n) => n.parentId === topic._id)
          .sort((a, b) => a.position - b.position)
          .map(serializeNode),
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
