import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireCan, resolveUserRole } from "../helpers/permissions";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { installation } from "../syncedBlocks/model";
import { fail } from "./model";

/** Draft inventory belongs to definition authors, not the reusable page picker. */
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    isDone: v.boolean(), continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(v.union(v.literal("SplitRequired"), v.literal("SplitRecommended"), v.null())),
    page: v.array(v.object({ id: v.id("blockDefinitions"), name: v.string(), title: v.string(), generation: v.number(), lastVersion: v.number(), activeVersion: v.union(v.number(), v.null()), status: v.union(v.literal("draft"), v.literal("active"), v.literal("promoted")) })),
  }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger();
    const actor = await requireCan(ctx, "blocks.compose", budget);
    await requireCan(ctx, "post.read", budget);
    const scope = await installation(ctx, budget), role = await resolveUserRole(ctx, actor, budget);
    const count = args.paginationOpts.numItems;
    if (!Number.isInteger(count) || count < 1 || count > 20) return fail("DEFINITION_PAGE_SIZE", "Request between 1 and 20 definitions.");
    budget.beforeRead();
    const source = role && role.level >= 80
      ? ctx.db.query("blockDefinitions").withIndex("by_scope_name", q => q.eq("websiteKey", scope.websiteKey).eq("instanceKey", scope.instanceKey).eq("deploymentOrigin", scope.deploymentOrigin))
      : ctx.db.query("blockDefinitions").withIndex("by_scope_author_name", q => q.eq("websiteKey", scope.websiteKey).eq("instanceKey", scope.instanceKey).eq("deploymentOrigin", scope.deploymentOrigin).eq("createdBy", actor._id));
    const result = await source.order("asc").paginate({ ...args.paginationOpts, maximumRowsRead: 20, maximumBytesRead: 256 * 1024 });
    result.page.forEach(row => budget.record(row));
    return { ...result, page: result.page.map(row => ({ id: row._id, name: row.name, title: row.title, generation: row.generation, lastVersion: row.lastVersion, activeVersion: row.activeVersion ?? null, status: row.status })) };
  },
});
