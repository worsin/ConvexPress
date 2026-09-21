import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import { v } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireCan } from "../helpers/permissions";
import { canEditContent } from "../helpers/publicContent";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { authoringRevision } from "../canonicalDocuments/foundation/documentState";
import { canonicalSyncedOptionsSchema, canonicalSyncedRevisionsSchema, canonicalSyncedSelectionSchema } from "../canonicalDocuments/foundation/documentContracts";
import { checkGeneration, content, installation, owned, ownedSource, storedRevision, syncedFailure } from "./model";

const scopeValidator = v.object({ websiteKey: v.string(), instanceKey: v.string() });
const ownerValidator = v.union(
  v.object({ postId: v.id("posts"), expectedRevision: v.number() }),
  v.object({ syncedBlockId: v.id("syncedBlocks"), expectedGeneration: v.number() }),
);
const baseArgs = { owner: ownerValidator, expectedScope: scopeValidator };
type Owner = { postId: Id<"posts">; expectedRevision: number } | { syncedBlockId: Id<"syncedBlocks">; expectedGeneration: number };
type BaseArgs = { owner: Owner; expectedScope: { websiteKey: string; instanceKey: string } };
const pageFields = { isDone: v.boolean(), continueCursor: v.string(), splitCursor: v.optional(v.union(v.string(), v.null())), pageStatus: v.optional(v.union(v.literal("SplitRequired"), v.literal("SplitRecommended"), v.null())) };
const revisionFields = { title: v.string(), revision: v.number(), digest: v.string() };
const policyValidator = v.union(v.literal("latest"), v.literal("pinned"));

async function authorize(ctx: QueryCtx, args: BaseArgs, budget: RequestReadLedger) {
  const actor = await requireCan(ctx, "post.read", budget);
  const scope = await installation(ctx, budget);
  if (scope.websiteKey !== args.expectedScope.websiteKey || scope.instanceKey !== args.expectedScope.instanceKey)
    return syncedFailure("SYNCED_UNAVAILABLE", "The selected environment changed. Reopen the picker.");
  if ("postId" in args.owner) {
    budget.beforeRead();
    const post = budget.record(await ctx.db.get("posts", args.owner.postId));
    if (!post || !(await canEditContent(ctx, post, budget))) return syncedFailure("FORBIDDEN", "You cannot edit this document.");
    if (post.blocksVersion !== 2 || !["draft", "publish", "private", "future"].includes(post.status) || !["post", "page"].includes(post.type))
      return syncedFailure("SYNCED_DOCUMENT", "Open a supported canonical document before choosing reusable content.");
    if (!Number.isSafeInteger(args.owner.expectedRevision) || authoringRevision(post) !== args.owner.expectedRevision)
      return syncedFailure("SYNCED_CONFLICT", "The document changed. Reopen the picker.");
  } else {
    await requireCan(ctx, "post.update", budget);
    const { source } = await owned(ctx, args.owner.syncedBlockId, actor._id, budget);
    checkGeneration(source, args.owner.expectedGeneration);
  }
  return scope;
}
function pageOptions(value: PaginationOptions): PaginationOptions {
  if (!Number.isInteger(value.numItems) || value.numItems < 1 || value.numItems > 8)
    return syncedFailure("SYNCED_PAGE_SIZE", "Request between 1 and 8 reusable choices.");
  return { ...value, maximumRowsRead: 8, maximumBytesRead: 512 * 1024 };
}
function metadata(version: NonNullable<Awaited<ReturnType<typeof storedRevision>>>) {
  if (version.publishedAt === undefined || !Number.isInteger(version.revision) || version.revision < 1 || version.revision > 1000000) return null;
  try {
    const checked = content(version.title, version.blocks);
    return checked.digest === version.digest ? { title: checked.title, revision: version.revision, digest: version.digest } : null;
  } catch { return null; }
}
async function currentSource(ctx: QueryCtx, args: BaseArgs & { sourceId: Id<"syncedBlocks">; publishedRevision: number }, scope: Awaited<ReturnType<typeof installation>>, budget: RequestReadLedger) {
  if ("syncedBlockId" in args.owner && args.owner.syncedBlockId === args.sourceId)
    return syncedFailure("SYNCED_CYCLE", "A reusable source cannot contain itself.");
  const source = await ownedSource(ctx, args.sourceId, scope, budget);
  if (!source || source.publishedRevision === undefined) return syncedFailure("SYNCED_UNAVAILABLE", "This reusable content is no longer published here.");
  if (source.publishedRevision !== args.publishedRevision) return syncedFailure("SYNCED_CONFLICT", "The published revision changed. Reopen the picker.");
  const version = await storedRevision(ctx, source._id, source.publishedRevision, budget);
  if (!version || !metadata(version)) return syncedFailure("SYNCED_UNAVAILABLE", "This published revision is unavailable.");
  return { source, version };
}
export const sources = query({
  args: { ...baseArgs, paginationOpts: paginationOptsValidator },
  returns: v.object({ ...pageFields, page: v.array(v.object({ id: v.id("syncedBlocks"), ...revisionFields })) }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), scope = await authorize(ctx, args, budget);
    budget.beforeRead();
    const result = await ctx.db.query("syncedBlocks").withIndex("by_scope_published", q => q.eq("websiteKey", scope.websiteKey).eq("instanceKey", scope.instanceKey).eq("deploymentOrigin", scope.deploymentOrigin).gt("publishedRevision", 0)).order("desc").paginate(pageOptions(args.paginationOpts));
    result.page.forEach(row => budget.record(row));
    const page = [];
    for (const source of result.page) {
      if (source.publishedRevision === undefined || ("syncedBlockId" in args.owner && source._id === args.owner.syncedBlockId)) continue;
      const version = await storedRevision(ctx, source._id, source.publishedRevision, budget);
      const item = version && metadata(version);
      if (item) page.push({ id: source._id, ...item });
    }
    // Parse before returning without erasing Convex's branded ID type.
    const response = { ...result, page }; canonicalSyncedOptionsSchema.parse(response); return response;
  },
});
export const revisions = query({
  args: { ...baseArgs, sourceId: v.id("syncedBlocks"), publishedRevision: v.number(), paginationOpts: paginationOptsValidator },
  returns: v.object({ ...pageFields, sourceId: v.id("syncedBlocks"), publishedRevision: v.number(), page: v.array(v.object(revisionFields)) }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), scope = await authorize(ctx, args, budget);
    await currentSource(ctx, args, scope, budget);
    budget.beforeRead();
    const result = await ctx.db.query("syncedBlockRevisions").withIndex("by_source_revision", q => q.eq("syncedBlockId", args.sourceId)).order("desc").paginate(pageOptions(args.paginationOpts));
    result.page.forEach(row => budget.record(row));
    const response = { ...result, sourceId: args.sourceId, publishedRevision: args.publishedRevision, page: result.page.flatMap(version => { const item = metadata(version); return item ? [item] : []; }) };
    canonicalSyncedRevisionsSchema.parse(response); return response;
  },
});
export const select = query({
  args: { ...baseArgs, sourceId: v.id("syncedBlocks"), publishedRevision: v.number(), revisionPolicy: policyValidator, revision: v.number() },
  returns: v.object({ scope: scopeValidator, id: v.id("syncedBlocks"), publishedRevision: v.number(), revisionPolicy: policyValidator, revision: v.number(), digest: v.string() }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), scope = await authorize(ctx, args, budget);
    const { version: latest } = await currentSource(ctx, args, scope, budget);
    if (!Number.isInteger(args.revision) || args.revision < 1 || args.revision > 1000000 || (args.revisionPolicy === "latest" && args.revision !== args.publishedRevision))
      return syncedFailure("SYNCED_REVISION", "Choose a published revision.");
    const version = args.revision === latest.revision ? latest : await storedRevision(ctx, args.sourceId, args.revision, budget);
    const item = version && metadata(version);
    if (!item) return syncedFailure("SYNCED_UNAVAILABLE", "This published revision is unavailable.");
    const response = { scope: { websiteKey: scope.websiteKey, instanceKey: scope.instanceKey }, id: args.sourceId, publishedRevision: args.publishedRevision, revisionPolicy: args.revisionPolicy, revision: item.revision, digest: item.digest };
    canonicalSyncedSelectionSchema.parse(response); return response;
  },
});
