/**
 * Lesson System - queries.
 */

import { v } from "convex/values";
import { query } from "../../_generated/server";
import { isPluginEnabled } from "../../helpers/plugins";
import { docToText } from "./helpers";

export const getLesson = query({
  args: { nodeId: v.id("lms_nodes") },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "lms"))) return null;
    const node = await ctx.db.get(args.nodeId);
    if (!node) return null;
    return {
      node,
      bodyText: docToText(node.bodyDoc),
      materialsText: docToText(node.materialsDoc),
    };
  },
});
