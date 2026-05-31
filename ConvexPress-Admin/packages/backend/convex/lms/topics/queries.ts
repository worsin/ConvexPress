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
