import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { refreshTermDiscovery } from "../helpers/postDiscovery";

/** Legacy/imported rows become queryable only after their coordinates are derived. */
export const recover = internalMutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    const page = await ctx.db.query("termRelationships").withIndex("by_discovery_ready", q => q.eq("discoveryReady", undefined))
      .paginate({ cursor: null, numItems: 4, maximumRowsRead: 4, maximumBytesRead: 256 * 1024 });
    const rows = page.page.length ? page.page : await ctx.db.query("termRelationships")
      .withIndex("by_discovery_ready", q => q.eq("discoveryReady", false)).take(4);
    for (const relation of rows) await refreshTermDiscovery(ctx, relation._id);
    if (rows.length || !page.isDone) await ctx.scheduler.runAfter(250, makeFunctionReference<"mutation">("posts/discovery:recover"), {});
    return null;
  },
});
