import { v } from "convex/values";
import { paginationOptsValidator, type RegisteredQuery } from "convex/server";
import { query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireCan } from "../helpers/permissions";
import { canEditContent } from "../helpers/publicContent";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { owned, fail } from "./model";
import { canonicalBoundary, previewBlockDefinition, type DefinitionPreviewArgs } from "../canonicalDocuments/service";
import { documentReadValidator } from "../canonicalDocuments/validators";
import { blockPageRequestSchema } from "../canonicalDocuments/foundation/postGridContracts";
import { authoringRevision } from "../canonicalDocuments/foundation/documentState";
import type { CanonicalDocumentRead } from "../canonicalDocuments/foundation/documentContracts";

const owner = { id: v.id("blockDefinitions"), expectedGeneration: v.number() };
export const get: RegisteredQuery<"public", DefinitionPreviewArgs & { request?: Record<string, string> }, Promise<CanonicalDocumentRead>> = query({
  args: { ...owner, version: v.number(), expectedDigest: v.string(), postId: v.id("posts"), expectedRevision: v.number(), definitionJson: v.optional(v.string()), attrsJson: v.string(), request: v.optional(v.record(v.string(), v.string())) },
  returns: documentReadValidator,
  handler: (ctx, args: DefinitionPreviewArgs & { request?: Record<string, string> }) => canonicalBoundary(() => previewBlockDefinition(ctx, args, blockPageRequestSchema.parse(args.request ?? {}))),
});

/** Five body-bearing pages per read; filtered pages retain the engine cursor. */
export const pages = query({
  args: { id: owner.id, paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(v.object({ id: v.id("posts"), title: v.string(), revision: v.number() })), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), actor = await requireCan(ctx, "blocks.compose", budget);
    await requireCan(ctx, "post.read", budget);
    await owned(ctx, args.id, actor._id, budget);
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 5)
      fail("DEFINITION_PREVIEW_BUDGET", "Load at most five preview pages at a time.");
    budget.beforeRead();
    const result = await ctx.db.query("posts").withIndex("by_type", q => q.eq("type", "page")).order("desc").paginate(args.paginationOpts);
    const page: { id: Id<"posts">; title: string; revision: number }[] = [];
    for (const row of result.page) {
      budget.record(row);
      if (["draft", "publish", "private", "future"].includes(row.status) && await canEditContent(ctx, row, budget))
        page.push({ id: row._id, title: row.title, revision: authoringRevision(row) });
    }
    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});
