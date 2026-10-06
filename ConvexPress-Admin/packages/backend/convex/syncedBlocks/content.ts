import { collectCanonicalMediaIds } from "../canonicalDocuments/foundation/documentContracts";
import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { insertWithMediaReferences, patchWithMediaReferences, assertMediaAttachments } from "../media/attachmentGuard";
import { canonicalStoredTreeValidator } from "../canonicalDocuments/foundation/generated/storage";
import { enqueueRefresh } from "./refresh";
import { content, owned, selected, checkGeneration, installation, publicationReview, storedRevision, syncedFailure } from "./model";
import { assertAuthoredActions } from "../canonicalDocuments/foundation/authoredDefinitions";

const id = v.id("syncedBlocks"), selection = { id, expectedGeneration: v.number() };
const receipt = v.object({ id, generation: v.number(), revision: v.number(), digest: v.string(), changed: v.boolean() });
const reviewValidator = v.object({ digest: v.string(), expandedNodes: v.number(), dependencies: v.array(v.object({ path: v.array(v.string()), id: v.string(), revision: v.number(), digest: v.string() })) });

export const create = mutation({
  args: { title: v.string(), blocks: canonicalStoredTreeValidator }, returns: receipt,
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), actor = await requireCan(ctx, "post.create", budget), scope = await installation(ctx, budget), value = content(args.title, args.blocks), now = Date.now();
    assertAuthoredActions(value);
    const sourceId = await ctx.db.insert("syncedBlocks", { ...scope, title: value.title, generation: 1, lastRevision: 1, createdBy: actor._id, updatedBy: actor._id, createdAt: now, updatedAt: now });
    await insertWithMediaReferences(ctx, "syncedBlockRevisions", { syncedBlockId: sourceId, revision: 1, ...value, createdBy: actor._id, createdAt: now }, undefined, budget, collectCanonicalMediaIds(value.blocks));
    return { id: sourceId, generation: 1, revision: 1, digest: value.digest, changed: true };
  },
});
export const save = mutation({
  args: { ...selection, title: v.string(), blocks: canonicalStoredTreeValidator }, returns: receipt,
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), actor = await requireCan(ctx, "post.update", budget), { source } = await owned(ctx, args.id, actor._id, budget);
    checkGeneration(source, args.expectedGeneration);
    if (source.isLocked) return syncedFailure("SYNCED_LOCKED", "This imported source is locked. Unlock it explicitly before editing.");
    const value = content(args.title, args.blocks), current = await storedRevision(ctx, source._id, source.lastRevision, budget);
    assertAuthoredActions(value);
    if (!current) return syncedFailure("SYNCED_REVISION", "The current revision is unavailable. Recover it before editing.");
    if (content(current.title, current.blocks).digest !== current.digest) return syncedFailure("SYNCED_REVISION", "Recover the damaged current revision before editing.");
    if (current.digest === value.digest) {
      await assertMediaAttachments(ctx, "syncedBlockRevisions", value, budget, collectCanonicalMediaIds(value.blocks));
      return { id: source._id, generation: source.generation, revision: source.lastRevision, digest: current.digest, changed: false };
    }
    const revision = source.lastRevision + 1, generation = source.generation + 1, now = Date.now();
    if (!Number.isInteger(revision) || revision > 1_000_000) return syncedFailure("SYNCED_REVISION_LIMIT", "The synced content revision limit was reached.");
    await insertWithMediaReferences(ctx, "syncedBlockRevisions", { syncedBlockId: source._id, revision, ...value, createdBy: actor._id, createdAt: now }, undefined, budget, collectCanonicalMediaIds(value.blocks));
    await ctx.db.patch("syncedBlocks", source._id, { title: value.title, lastRevision: revision, generation, updatedBy: actor._id, updatedAt: now });
    return { id: source._id, generation, revision, digest: value.digest, changed: true };
  },
});
export const reviewPublication = query({
  args: { ...selection, revision: v.number() }, returns: reviewValidator,
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), actor = await requireCan(ctx, "post.publish", budget);
    const { source, version, scope } = await selected(ctx, args.id, args.expectedGeneration, args.revision, actor._id, budget);
    return publicationReview(ctx, source, version, scope, budget);
  },
});
export const publish = mutation({
  args: { ...selection, revision: v.number(), reviewDigest: v.string() }, returns: receipt,
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), actor = await requireCan(ctx, "post.publish", budget);
    const { source, version, scope } = await selected(ctx, args.id, args.expectedGeneration, args.revision, actor._id, budget);
    const review = await publicationReview(ctx, source, version, scope, budget);
    if (args.reviewDigest !== review.digest) return syncedFailure("SYNCED_REVIEW_CHANGED", "Review the current content and dependencies again before publishing.");
    if (source.publishedRevision === version.revision) return { id: source._id, generation: source.generation, revision: version.revision, digest: version.digest, changed: false };
    const now = Date.now(), generation = source.generation + 1;
    if (version.publishedAt === undefined) await patchWithMediaReferences(ctx, "syncedBlockRevisions", version._id, { publishedAt: now }, undefined, budget);
    await ctx.db.patch("syncedBlocks", source._id, { publishedRevision: version.revision, generation, updatedBy: actor._id, updatedAt: now });
    await enqueueRefresh(ctx, source, scope, generation, "post.publish", budget);
    return { id: source._id, generation, revision: version.revision, digest: version.digest, changed: true };
  },
});
export const withdraw = mutation({
  args: selection, returns: v.object({ id, generation: v.number(), changed: v.boolean() }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), actor = await requireCan(ctx, "post.unpublish", budget), { source, scope } = await owned(ctx, args.id, actor._id, budget);
    checkGeneration(source, args.expectedGeneration);
    if (source.publishedRevision === undefined) return { id: source._id, generation: source.generation, changed: false };
    const generation = source.generation + 1;
    await ctx.db.patch("syncedBlocks", source._id, { publishedRevision: undefined, generation, updatedAt: Date.now(), updatedBy: actor._id });
    await enqueueRefresh(ctx, source, scope, generation, "post.unpublish", budget);
    return { id: source._id, generation, changed: true };
  },
});
export const get = query({
  args: { id }, returns: v.object({ id, title: v.string(), generation: v.number(), revision: v.number(), publishedRevision: v.union(v.number(), v.null()), blocks: canonicalStoredTreeValidator, digest: v.string() }),
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), actor = await requireCan(ctx, "post.read", budget);
    const { source } = await owned(ctx, args.id, actor._id, budget), version = await storedRevision(ctx, source._id, source.lastRevision, budget);
    if (!version) return syncedFailure("SYNCED_REVISION", "The current revision is unavailable.");
    const value = content(version.title, version.blocks);
    if (value.digest !== version.digest) return syncedFailure("SYNCED_REVISION", "The saved revision failed its content integrity check.");
    return { id: source._id, title: version.title, generation: source.generation, revision: source.lastRevision, publishedRevision: source.publishedRevision ?? null, blocks: value.blocks, digest: version.digest };
  },
});

export const restore = mutation({
  args: { ...selection, revision: v.number(), expectedDigest: v.string() }, returns: receipt,
  handler: async (ctx, args) => {
    const budget = new RequestReadLedger(), actor = await requireCan(ctx, "post.restore", budget);
    await requireCan(ctx, "post.update", budget);
    const { source, version } = await selected(ctx, args.id, args.expectedGeneration, args.revision, actor._id, budget);
    if (source.isLocked) return syncedFailure("SYNCED_LOCKED", "This imported source is locked. Unlock it explicitly before restoring.");
    const value = content(version.title, version.blocks);
    if (value.digest !== version.digest || value.digest !== args.expectedDigest) return syncedFailure("SYNCED_RESTORE_CHANGED", "Review the saved revision again before restoring it.");
    const current = await storedRevision(ctx, source._id, source.lastRevision, budget);
    if (current?.digest === value.digest) {
      let intact = false;
      try { intact = content(current.title, current.blocks).digest === current.digest; }
      catch { /* Restore appends a valid revision even if the current body is damaged. */ }
      if (intact) {
        await assertMediaAttachments(ctx, "syncedBlockRevisions", value, budget, collectCanonicalMediaIds(value.blocks));
        return { id: source._id, generation: source.generation, revision: source.lastRevision, digest: value.digest, changed: false };
      }
    }
    const revision = source.lastRevision + 1, generation = source.generation + 1, now = Date.now();
    if (!Number.isInteger(revision) || revision > 1_000_000) return syncedFailure("SYNCED_REVISION_LIMIT", "The synced content revision limit was reached.");
    await insertWithMediaReferences(ctx, "syncedBlockRevisions", { syncedBlockId: source._id, revision, ...value, createdBy: actor._id, createdAt: now }, undefined, budget, collectCanonicalMediaIds(value.blocks));
    await ctx.db.patch("syncedBlocks", source._id, { title: value.title, lastRevision: revision, generation, updatedBy: actor._id, updatedAt: now });
    return { id: source._id, generation, revision, digest: value.digest, changed: true };
  },
});

/** Preserve imported authoring locks until the authorized operator releases one. */
export const unlockImported = mutation({
 args: selection, returns: v.object({id,generation:v.number()}),
 handler: async(ctx,args)=>{const budget=new RequestReadLedger(),actor=await requireCan(ctx,"post.update",budget),{source}=await owned(ctx,args.id,actor._id,budget);checkGeneration(source,args.expectedGeneration);
 if(!source.isLocked)return {id:source._id,generation:source.generation};
 const generation=source.generation+1;await ctx.db.patch("syncedBlocks",source._id,{isLocked:false,generation,updatedAt:Date.now(),updatedBy:actor._id});return {id:source._id,generation};}
});
