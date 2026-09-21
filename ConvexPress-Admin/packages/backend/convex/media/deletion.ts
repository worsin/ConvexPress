import { makeFunctionReference } from "convex/server";
import { getDocumentSize } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { findMediaReferencesForIds, prepareReferenceClear, applyReferenceClear, type MediaReference } from "./references";
import { addReferenceBudget, beforeReferenceRead, referenceFailure } from "./referenceScan";
import { MEDIA_REFERENCE_TOTAL } from "./referencePolicy";
const dependents = makeFunctionReference<"query", { table: "mediaSizes" | "mediaMeta"; mediaId: Id<"media"> }, { rows: number; bytes: number; records: { id: string; storageId?: Id<"_storage"> }[] }>("media/referenceReads:dependents");
const owners = makeFunctionReference<"query", { table: "media" | "mediaSizes" | "mediaMeta"; storageId: Id<"_storage"> }, { rows: number; bytes: number; owners: Id<"media">[] }>("media/referenceReads:storageOwners");
/** Entire preflight completes before caller applies ANY reference or media write. */
export async function prepareMediaDeletion(ctx: MutationCtx, documents: Doc<"media">[], options: { force: boolean; permanent: boolean; authorizeForce?: () => Promise<void> }) {
  const media = [...new Map(documents.map(doc => [doc._id, doc])).values()];
  const total = { rows: media.length, bytes: media.reduce((sum, doc) => sum + getDocumentSize(doc), 0), queries: 0 };
  if (total.bytes > MEDIA_REFERENCE_TOTAL.bytes) referenceFailure();
  const references = media.length ? await findMediaReferencesForIds(ctx, media.map(doc => doc._id), total) : [];
  const blocked = new Map<string, MediaReference[]>();
  if (!options.force) for (const ref of references) blocked.set(ref.mediaId, [...(blocked.get(ref.mediaId) ?? []), ref]);
  const eligible = media.filter(doc => !blocked.has(doc._id));
  if (options.force && references.length) await options.authorizeForce?.();
  const clear = await prepareReferenceClear(ctx, options.force ? references : [], total);
  const records: { table: "mediaSizes" | "mediaMeta"; id: string }[] = [], blobs = new Set<Id<"_storage">>(), deleteBlobs: Id<"_storage">[] = [];
  if (options.permanent) {
    for (const doc of eligible) {
      if (doc.storageId) blobs.add(doc.storageId);
      for (const table of ["mediaSizes", "mediaMeta"] as const) {
        beforeReferenceRead(total);
        const result = await ctx.runQuery(dependents, { table, mediaId: doc._id });
        addReferenceBudget(total, result);
        for (const row of result.records) { records.push({ table, id: row.id }); if (row.storageId) blobs.add(row.storageId); }
      }
    }
    const selected = new Set(eligible.map(doc => doc._id));
    for (const storageId of blobs) {
      let shared = false;
      for (const table of ["media", "mediaSizes", "mediaMeta"] as const) {
        beforeReferenceRead(total);
        const result = await ctx.runQuery(owners, { table, storageId });
        addReferenceBudget(total, result);
        if (result.owners.some(owner => !selected.has(owner))) shared = true;
      }
      // Shared blobs survive removal of this library record. System metadata read
      // also fences disappearance; absent historical blobs need no storage call.
      beforeReferenceRead(total);
      const metadata = await ctx.db.system.get("_storage", storageId);
      if (metadata) {
        addReferenceBudget(total, { rows: 1, bytes: getDocumentSize(metadata) });
        if (!shared) deleteBlobs.push(storageId);
      }
    }
  }
  return { eligible, blocked, references, clear, records, deleteBlobs };
}
export async function applyMediaDeletionPreflight(ctx: MutationCtx, plan: Awaited<ReturnType<typeof prepareMediaDeletion>>) {
  await applyReferenceClear(ctx, plan.clear);
  // No blanket catches: any unexpected storage/database failure aborts the mutation.
  for (const storageId of plan.deleteBlobs) await ctx.storage.delete(storageId);
  for (const record of plan.records) {
    if (record.table === "mediaSizes") await ctx.db.delete("mediaSizes", record.id as Id<"mediaSizes">);
    else await ctx.db.delete("mediaMeta", record.id as Id<"mediaMeta">);
  }
}
/** Replacement is another blob deletion boundary; sizes can share original bytes. */
export async function preflightReplacedSizeBlob(ctx: MutationCtx, storageId: Id<"_storage">, replacement: Id<"_storage">): Promise<Id<"_storage"> | null> {
  if (storageId === replacement) return null;
  const media = await ctx.runQuery(owners, { table: "media", storageId });
  const sizes = await ctx.runQuery(owners, { table: "mediaSizes", storageId });
  const backups = await ctx.runQuery(owners, { table: "mediaMeta", storageId });
  if (media.rows || sizes.rows > 1 || backups.rows) return null;
  return await ctx.db.system.get("_storage", storageId) ? storageId : null;
}
export async function prepareSizeWipe(ctx: MutationCtx, mediaId: Id<"media">) {
  const result = await ctx.runQuery(dependents, { table: "mediaSizes", mediaId });
  const total = { rows: 0, bytes: 0, queries: 0 }; addReferenceBudget(total, result);
  const deleteBlobs: Id<"_storage">[] = [];
  for (const storageId of new Set(result.records.flatMap(row => row.storageId ? [row.storageId] : []))) {
    beforeReferenceRead(total);
    const media = await ctx.runQuery(owners, { table: "media", storageId });
    addReferenceBudget(total, media);
    beforeReferenceRead(total);
    const sizes = await ctx.runQuery(owners, { table: "mediaSizes", storageId });
    addReferenceBudget(total, sizes);
    beforeReferenceRead(total);
    const backups = await ctx.runQuery(owners, { table: "mediaMeta", storageId });
    addReferenceBudget(total, backups);
    beforeReferenceRead(total);
    const metadata = await ctx.db.system.get("_storage", storageId);
    if (metadata) addReferenceBudget(total, { rows: 1, bytes: getDocumentSize(metadata) });
    if (!media.rows && !backups.rows && sizes.owners.every(owner => owner === mediaId) && metadata) deleteBlobs.push(storageId);
  }
  return { records: result.records, deleteBlobs };
}
export async function preflightOriginalSwap(ctx: MutationCtx, media: Doc<"media">, replacement: Id<"_storage">) {
  if (!await ctx.db.system.get("_storage", replacement)) throw new Error("Replacement media storage is missing");
  if (!media.storageId || media.storageId === replacement) return null;
  const mediaOwners = await ctx.runQuery(owners, { table: "media", storageId: media.storageId });
  const sizeOwners = await ctx.runQuery(owners, { table: "mediaSizes", storageId: media.storageId });
  const backups = await ctx.runQuery(owners, { table: "mediaMeta", storageId: media.storageId });
  if (mediaOwners.owners.some(owner => owner !== media._id) || sizeOwners.rows || backups.rows) return null;
  return await ctx.db.system.get("_storage", media.storageId) ? media.storageId : null;
}
