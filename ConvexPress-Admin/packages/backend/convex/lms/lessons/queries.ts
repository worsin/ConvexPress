/**
 * Lesson System - queries.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";
import { hasMinimumRoleLevel } from "../../helpers/permissions";
import { docToText } from "./helpers";
import { canUserAccessNode } from "../access";

export const getLesson = query({
  args: { nodeId: v.id("lms_nodes") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const node = await ctx.db.get(args.nodeId);
    if (!node || node.kind !== "lesson") return null;
    const canAuthor = await hasMinimumRoleLevel(ctx, 60);
    if (!canAuthor) {
      const access = await canUserAccessNode(ctx, { nodeId: args.nodeId });
      if (!access.allowed) return null;
    }
    return {
      node,
      bodyText: docToText(node.bodyDoc),
      materialsText: docToText(node.materialsDoc),
    };
  },
});

export const listVersions = query({
  args: { nodeId: v.id("lms_nodes") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return [];
    if (!(await hasMinimumRoleLevel(ctx, 60))) return [];
    const versions = await ctx.db
      .query("lms_lessonVersions")
      .withIndex("by_node", (q) => q.eq("nodeId", args.nodeId))
      .collect();
    return versions
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((version) => ({
        ...version,
        bodyText: docToText(version.bodyDoc),
      }));
  },
});
