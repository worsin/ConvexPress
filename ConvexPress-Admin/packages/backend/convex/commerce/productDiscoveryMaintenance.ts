import { v } from "convex/values";
import type { RegisteredMutation } from "convex/server";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { patchWithMediaReferences } from "../media/attachmentGuard";

/** Re-running is safe: source rows are read and stamped in the same transaction.
 * Each batch selects only missing rows, so edits/deletes cannot be skipped by
 * an offset cursor. This is internal; deployment acceptance starts the job. */
export const rebuild: RegisteredMutation<"internal", Record<string, never>, {processed:number;done:boolean}> = internalMutation({
  args: {},
  returns: v.object({processed:v.number(),done:v.boolean()}),
  handler: async ctx => {
    const rows = await ctx.db.query("commerce_products")
      .withIndex("by_collection_index_version",q=>q.eq("collectionIndexVersion",undefined)).take(25);
    for (const product of rows) await patchWithMediaReferences(ctx,"commerce_products",product._id,{collectionIndexVersion:1});
    const done = rows.length < 25;
    if (!done) await ctx.scheduler.runAfter(0,internal.commerce.productDiscoveryMaintenance.rebuild,{});
    return {processed:rows.length,done};
  },
});
