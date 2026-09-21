import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { installation } from "../syncedBlocks/model";
import { canonicalJson } from "../canonicalDocuments/foundation/shared/fingerprints";
import { createPublicProductCardProjector } from "../canonicalDocuments/featuredProducts";
import { SourceByteLedger } from "../canonicalDocuments/sourceBudget";
import { enabledPluginIds } from "../helpers/plugins";
import { composeArgs } from "./composeContracts";
import { fail } from "./model";

/** Page-independent selections for a new definition. Only selected rows are
 * later disclosed to AI; every generation/save revalidates their availability. */
export const options = query({
  args: { expectedScope: composeArgs.expectedScope, kind: v.union(v.literal("product"), v.literal("media")), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ page: v.array(v.object({ id: v.string(), title: v.string() })), cursor: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger();
    for (const capability of ["blocks.ai", "blocks.compose", "post.create", "post.read"] as const) await requireCan(ctx, capability, budget);
    const scope = await installation(ctx, budget);
    if (canonicalJson(scope) !== canonicalJson(args.expectedScope)) fail("AI_SCOPE_CHANGED", "Select the current website environment.");
    if (args.cursor !== null && args.cursor.length > 4096) fail("AI_RESOURCE_CURSOR", "Reopen the resource list.");
    const opts = { numItems: 10, cursor: args.cursor, maximumRowsRead: 10, maximumBytesRead: 128 * 1024 };
    if (args.kind === "media") {
      await requireCan(ctx, "media.read", budget);
      budget.beforeRead();
      const result = await ctx.db.query("media").withIndex("by_status", q => q.eq("status", "active")).order("desc").paginate(opts);
      result.page.forEach(row => budget.record(row));
      return { page: result.page.map(row => ({ id: row._id, title: row.fileName.slice(0, 512) })), cursor: result.isDone ? null : result.continueCursor };
    }
    if (!(await enabledPluginIds(ctx, budget)).includes("commerce")) fail("PLUGIN_DISABLED", "Enable Commerce before selecting products.");
    const project = await createPublicProductCardProjector(ctx, false, budget, new SourceByteLedger());
    budget.beforeRead();
    const result = await ctx.db.query("commerce_products").withIndex("by_status_created", q => q.eq("status", "publish")).order("desc").paginate(opts);
    const page: Array<{ id: string; title: string }> = [];
    for (const row of result.page) {
      budget.record(row);
      const card = await project(row);
      if (card) page.push({ id: row._id, title: card.title.slice(0, 512) });
    }
    return { page, cursor: result.isDone ? null : result.continueCursor };
  },
});
