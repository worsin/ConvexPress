import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { currentUserCan, requireCan } from "../helpers/permissions";
import { canEditContent } from "../helpers/publicContent";
import { collectContactDefinitions } from "../canonicalDocuments/contactDefinitions";
import { contactProjectionMatches } from "../canonicalDocuments/contactProjection";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { readStoredDocument } from "../canonicalDocuments/definitions";
import { containsSyncedContent } from "../canonicalDocuments/foundation/syncedDisplay";
import { resolvePublishedOccurrences } from "./occurrences";
import { installation, syncedFailure } from "./model";
import { reconcileSyncedConsumers } from "./consumers";
import { removeSyncedConsumerDocument } from "./consumerWrites";
import { consumerIndexGeneration, currentConsumerIndex, hasDirtyConsumers, readConsumerIndex } from "./consumerIndexState";
import type { Id } from "../_generated/dataModel";

const projectionRef = makeFunctionReference<"mutation", { postId: Id<"posts">; generation: string; sequence: number }, boolean>("syncedBlocks/consumerIndex:reconcileDocument");
const progressValidator = v.object({
  status: v.union(v.literal("unconfigured"), v.literal("stale"), v.literal("building"), v.literal("blocked"), v.literal("ready")),
  generation: v.union(v.string(), v.null()), sequence: v.number(), documents: v.number(),
  phase: v.union(v.literal("posts"), v.literal("edges"), v.literal("dirty"), v.literal("forms"), v.literal("ready")),
  errorCode: v.union(v.string(), v.null()),
});
async function progress(ctx: Parameters<typeof readConsumerIndex>[0], scope: Awaited<ReturnType<typeof installation>>, budget: RequestReadLedger) {
  const generation = consumerIndexGeneration(), state = await readConsumerIndex(ctx, budget);
  if (!generation || !currentConsumerIndex(state, scope, generation)) return { status: generation ? "stale" as const : "unconfigured" as const, generation, sequence: 0, documents: 0, phase: "posts" as const, errorCode: null };
  const invalid = state.phase === "ready" && state.cursor !== null;
  const dirty = (state.phase === "ready" || state.phase === "forms") && await hasDirtyConsumers(ctx, budget);
  return { status: state.errorCode || invalid ? "blocked" as const : state.phase === "ready" && !dirty ? "ready" as const : "building" as const, generation, sequence: state.sequence, documents: state.documents, phase: dirty ? "dirty" as const : state.phase, errorCode: invalid ? "SYNCED_INDEX_STATE" : state.errorCode ?? null };
}
export const status = query({ args: {}, returns: progressValidator, handler: async ctx => {
  const budget = new RequestReadLedger(); await requireCan(ctx, "manage_options", budget);
  return progress(ctx, await installation(ctx, budget), budget);
} });
export const blockedDocument = query({
  args: {}, returns: v.union(v.null(), v.object({ id: v.id("posts"), title: v.string(), type: v.union(v.literal("page"), v.literal("post")) })),
  handler: async ctx => {
    const budget = new RequestReadLedger(); await requireCan(ctx, "manage_options", budget);
    const scope = await installation(ctx, budget), state = await readConsumerIndex(ctx, budget);
    if (!currentConsumerIndex(state, scope) || !state.errorCode || !state.blockedPostId) return null;
    budget.beforeRead(); const post = budget.record(await ctx.db.get("posts", state.blockedPostId));
    if (!post || post.type !== "page" && post.type !== "post" || !(await currentUserCan(ctx, post.type === "page" ? "page.read" : "post.read", budget)) || !(await canEditContent(ctx, post, budget))) return null;
    return { id: post._id, title: post.title, type: post.type };
  },
});
export const begin = mutation({ args: {}, returns: progressValidator, handler: async ctx => {
  const budget = new RequestReadLedger(); await requireCan(ctx, "manage_options", budget);
  const scope = await installation(ctx, budget), generation = consumerIndexGeneration();
  if (!generation) return syncedFailure("SYNCED_INDEX_UNCONFIGURED", "Complete deployment initialization or snapshot import before indexing reusable content.");
  const state = await readConsumerIndex(ctx, budget);
  if (!currentConsumerIndex(state, scope, generation) || state.phase === "ready" && state.cursor !== null) {
    const value = { key: "active" as const, generation, ...scope, phase: "posts" as const, cursor: null, sequence: 0, documents: 0, updatedAt: Date.now() };
    if (state) await ctx.db.replace("syncedBlockConsumerIndex", state._id, value);
    else await ctx.db.insert("syncedBlockConsumerIndex", value);
  }
  return progress(ctx, scope, budget);
} });

/** Internal maintenance only. It validates the in-progress index operation and
 * current installation; it never changes authored content or creates Forms. */
export const reconcileDocument = internalMutation({
  args: { postId: v.id("posts"), generation: v.string(), sequence: v.number() }, returns: v.boolean(),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), scope = await installation(ctx, budget), state = await readConsumerIndex(ctx, budget);
    if (!currentConsumerIndex(state, scope) || state.generation !== args.generation || state.sequence !== args.sequence)
      return syncedFailure("SYNCED_INDEX_CHANGED", "Index operation changed. Reload progress.");
    budget.beforeRead(); const post = budget.record(await ctx.db.get("posts", args.postId));
    if (state.phase === "forms") {
      if (!post || post.blocksVersion !== 2 || !post.blocks) return true;
      const tree = (await readStoredDocument(ctx, post, budget)).blocks;
      if (!containsSyncedContent(tree)) return true;
      const plan = await resolvePublishedOccurrences(ctx, tree, budget);
      for (const contact of collectContactDefinitions(plan.resolverTree)) {
        if (!plan.byId.get(contact.blockId)?.sourceChain.length) continue;
        budget.beforeRead();
        const form = budget.record(await ctx.db.query("forms").withIndex("by_contact_source", q => q.eq("contactPostId", post._id).eq("contactBlockId", contact.blockId)).unique());
        if (!form || form.status !== "published" || !(await contactProjectionMatches(ctx, form, contact.attrs, budget)))
          return syncedFailure("SYNCED_FORMS_REQUIRES_REFRESH", "Refresh reusable content on this page, then resume verification.");
      }
      return true;
    }
    const sources = new Set<Id<"syncedBlocks">>();
    if (post?.blocksVersion === 2 && post.blocks) {
      const tree = (await readStoredDocument(ctx, post, budget)).blocks;
      if (containsSyncedContent(tree)) await resolvePublishedOccurrences(ctx, tree, budget, { onSource: id => { sources.add(id); } });
    }
    // Repair overflow in bounded chunks instead of demanding a repair that the
    // repair endpoint itself refuses. Preserve valid unique edges. At most eight
    // can survive, so every overflowing batch removes at least one bad row.
    budget.beforeRead();
    const previous = await ctx.db.query("syncedBlockConsumers").withIndex("by_document", q => q.eq("postId", args.postId)).take(9);
    for (const row of previous) budget.record(row);
    if (previous.length > 8) {
      const retained = new Set<string>();
      for (const row of previous) {
        if (sources.has(row.sourceId) && !retained.has(row.sourceId) && row.websiteKey === scope.websiteKey && row.instanceKey === scope.instanceKey && row.deploymentOrigin === scope.deploymentOrigin) retained.add(row.sourceId);
        else await ctx.db.delete("syncedBlockConsumers", row._id);
      }
      return false;
    }
    if (!post || post.blocksVersion !== 2 || !post.blocks) await removeSyncedConsumerDocument(ctx, args.postId, budget);
    else await reconcileSyncedConsumers(ctx, post._id, scope, sources, budget);
    return true;
  },
});
export const step = mutation({
  args: { generation: v.string(), expectedSequence: v.number() }, returns: progressValidator,
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(); await requireCan(ctx, "manage_options", budget);
    const scope = await installation(ctx, budget), state = await readConsumerIndex(ctx, budget);
    if (!currentConsumerIndex(state, scope) || state.generation !== args.generation) return syncedFailure("SYNCED_INDEX_CHANGED", "Start indexing for this deployment before continuing.");
    if (!Number.isSafeInteger(args.expectedSequence) || args.expectedSequence < 0 || args.expectedSequence > state.sequence) return syncedFailure("SYNCED_INDEX_CURSOR", "Reload index progress before continuing.");
    if (args.expectedSequence < state.sequence) return progress(ctx, scope, budget);
    const update = { sequence: state.sequence + 1, updatedAt: Date.now() };
    let postId: Id<"posts"> | null = null, cursor = state.cursor, phase = state.phase;
    if ((phase === "forms" || phase === "ready") && await hasDirtyConsumers(ctx, budget)) {
      await ctx.db.patch("syncedBlockConsumerIndex", state._id, { ...update, phase: "dirty", cursor: null, errorCode: undefined, blockedPostId: undefined });
      return progress(ctx, scope, budget);
    }
    if (phase === "posts" || phase === "edges" || phase === "forms") {
      budget.beforeRead();
      const opts = { cursor, numItems: 1, maximumRowsRead: 2, maximumBytesRead: 512 * 1024 };
      const page = phase === "edges" ? await ctx.db.query("syncedBlockConsumers").paginate(opts) : await ctx.db.query("posts").paginate(opts);
      if (page.pageStatus || page.page.length > 1 || !page.isDone && page.continueCursor === cursor) {
        await ctx.db.patch("syncedBlockConsumerIndex", state._id, { ...update, errorCode: "SYNCED_INDEX_PAGE_BUDGET" });
        return progress(ctx, scope, budget);
      }
      for (const row of page.page) budget.record(row);
      const row = page.page[0];
      postId = row ? (phase === "edges" ? (row as { postId: Id<"posts"> }).postId : row._id) as Id<"posts"> : null;
      cursor = page.isDone ? null : page.continueCursor;
      if (page.isDone) phase = phase === "posts" ? "edges" : phase === "edges" ? "dirty" : "ready";
    } else {
      budget.beforeRead(); const dirty = budget.record(await ctx.db.query("syncedBlockConsumerDirty").first());
      postId = dirty?.postId ?? null; phase = dirty ? "dirty" : state.phase === "ready" ? "ready" : "forms"; cursor = null;
    }
    try {
      if (postId && !(await ctx.runMutation(projectionRef, { postId, generation: state.generation, sequence: state.sequence }))) {
        await ctx.db.patch("syncedBlockConsumerIndex", state._id, { ...update, errorCode: undefined });
        return progress(ctx, scope, budget);
      }
    } catch (error) {
      const data = error instanceof ConvexError ? error.data : null;
      const code = data && typeof data === "object" && "code" in data && typeof data.code === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(data.code) ? data.code : "SYNCED_INDEX_DOCUMENT";
      // Keep the original cursor so repair-and-resume cannot skip this page.
      await ctx.db.patch("syncedBlockConsumerIndex", state._id, { ...update, errorCode: code, blockedPostId: postId ?? undefined });
      return progress(ctx, scope, budget);
    }
    await ctx.db.patch("syncedBlockConsumerIndex", state._id, { ...update, phase, cursor, errorCode: undefined, blockedPostId: undefined, documents: state.documents + (postId ? 1 : 0) });
    return progress(ctx, scope, budget);
  },
});
