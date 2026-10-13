/**
 * Curriculum tree (nodes) - queries.
 */

import { v, type Infer } from "convex/values";
import { query, type QueryCtx } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import { isPluginEnabled } from "../../helpers/plugins";
import { currentUserCan } from "../../helpers/permissions";
import { canUserAccessNode } from "../access";
import { lmsDocs } from "../../schema/lms.docs.generated";

/** A node without lesson body, materials, video source, and AI media fields. */
const publicNodeValidator = lmsDocs.lms_nodes.omit(
  "bodyDoc",
  "materialsDoc",
  "videoUrl",
  "videoProvider",
  "videoMediaId",
  "transcriptText",
  "audioMediaId",
  "captionsMediaId",
  "aiVideoMediaId",
);

function serializeNode(node: Doc<"lms_nodes">): Infer<typeof publicNodeValidator> {
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

async function canPreviewCourseTree(ctx: QueryCtx) {
  return (
    (await currentUserCan(ctx, "lms.course.view")) ||
    (await currentUserCan(ctx, "lms.builder.manage")) ||
    (await currentUserCan(ctx, "lms.lesson.edit"))
  );
}

export const getCourseTree = query({
  args: { courseId: v.id("lms_courses") },
  returns: v.object({
    topics: v.array(publicNodeValidator.extend({ children: v.array(publicNodeValidator) })),
  }),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return { topics: [] };
    const course = await ctx.db.get(args.courseId);
    if (!course) return { topics: [] };
    if (course.status !== "published" && !(await canPreviewCourseTree(ctx))) return { topics: [] };

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
  // Managers get the whole node; everyone else gets the public projection.
  returns: v.union(v.null(), lmsDocs.lms_nodes, publicNodeValidator),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const node = await ctx.db.get(args.nodeId);
    if (!node) return null;

    const canManageNode =
      (await currentUserCan(ctx, "lms.builder.manage")) ||
      (await currentUserCan(ctx, "lms.lesson.edit"));
    if (canManageNode) return node;

    if (node.kind === "lesson") {
      const access = await canUserAccessNode(ctx, { nodeId: args.nodeId });
      return access.allowed ? serializeNode(node) : null;
    }

    const course = await ctx.db.get(node.courseId);
    if (!course) return null;
    if (course.status === "published" || (await currentUserCan(ctx, "lms.course.view"))) {
      return serializeNode(node);
    }
    return null;
  },
});
