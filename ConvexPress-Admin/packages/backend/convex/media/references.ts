import { recordCatalogWrite } from "../commerce/catalogRevision";
import { reconcileOwnerReferences } from "./reverseIndex";
import { assertAuthoringWrite } from "../helpers/authoringVersionFence";
import { assertMediaAttachments } from "./attachmentGuard";
/** Complete, bounded transactional media reference inspection. See referencePolicy
 * for opaque authored coverage and the explicitly reviewed force-clear adapters. */
import { ConvexError, getDocumentSize } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { clearableMediaFields, opaqueMediaContainers, MEDIA_REFERENCE_TOTAL } from "./referencePolicy";
import { inventory, referenceTables, referenceFailure, addReferenceBudget, beforeReferenceRead, type ScannedReference } from "./referenceScan";
export type MediaReference = ScannedReference & { label?: string; arrayIndex?: number };
const scan = makeFunctionReference<"query", { table: string; mediaIds: Id<"media">[]; field?: string }, { rows: number; bytes: number; references: ScannedReference[] }>("media/referenceReads:scan");
const indexed = makeFunctionReference<"query", { mediaIds: Id<"media">[] }, { rows: number; bytes: number; references: ScannedReference[] } | null>("media/referenceReads:indexed");
export async function findMediaReferencesForIds(ctx: Pick<QueryCtx | MutationCtx, "runQuery">, mediaIds: Id<"media">[], total = { rows: 0, bytes: 0, queries: 0 }): Promise<MediaReference[]> {
  const ids = [...new Set(mediaIds)];
  if (!ids.length || ids.length > 100) referenceFailure();
  beforeReferenceRead(total);
  const maintained = await ctx.runQuery(indexed, { mediaIds: ids });
  if (maintained) { addReferenceBudget(total, maintained); return maintained.references; }
  const refs: MediaReference[] = [];
  for (const table of referenceTables) {
    const descriptors = inventory[table] ?? [];
    const fields = opaqueMediaContainers[table] || descriptors.some(d => d.path.includes("*")) ? [undefined] : descriptors.map(d => d.path.join("."));
    for (const field of fields) for (const targets of field === undefined ? [ids] : ids.map(id => [id])) {
      beforeReferenceRead(total);
      const page = await ctx.runQuery(scan, { table, mediaIds: targets, ...(field === undefined ? {} : { field }) });
      addReferenceBudget(total, page); refs.push(...page.references);
      if (refs.length > 1000 || new Set(refs.map(ref => ref.documentId)).size > MEDIA_REFERENCE_TOTAL.documents) referenceFailure();
    }
  }
  return refs.filter((ref, i) => refs.findIndex(other => other.documentId === ref.documentId && other.path === ref.path && other.mediaId === ref.mediaId) === i);
}
export async function findMediaReferences(ctx: Pick<QueryCtx | MutationCtx, "runQuery">, mediaId: Id<"media">): Promise<MediaReference[]> {
  return findMediaReferencesForIds(ctx, [mediaId]);
}
type ClearWrite = { table: string; id: string; patch?: Record<string, unknown>; remove?: true };
export type ReferenceClearPlan = { writes: ClearWrite[] };
function cloneFields(value: any): any { return Array.isArray(value) ? value.map(cloneFields) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneFields(item)])) : value; }
function unclearable(): never { throw new ConvexError({ code: "MEDIA_REFERENCE_UNCLEARABLE", message: "A referenced document cannot be safely cleared. Edit its media references before deleting this item." }); }
export async function prepareReferenceClear(ctx: Pick<MutationCtx, "db">, refs: readonly MediaReference[], budget = { rows: 0, bytes: 0, queries: 0 }): Promise<ReferenceClearPlan> {
  const groups = new Map<string, MediaReference[]>(), writes: ClearWrite[] = [], albumRemovals = new Map<string, number>();
  for (const ref of refs) { const group = groups.get(ref.documentId) ?? []; group.push(ref); groups.set(ref.documentId, group); }
  if (groups.size > MEDIA_REFERENCE_TOTAL.documents) referenceFailure();
  for (const [id, group] of groups) {
    const table = group[0]!.table;
    beforeReferenceRead(budget);
    const original = await (ctx.db as any).get(table, id);
    if (!original) unclearable();
    addReferenceBudget(budget, { rows: 1, bytes: getDocumentSize(original) });
    for (const ref of group) {
      if (ref.table !== table || ref.opaque || !(clearableMediaFields[table] ?? []).includes(ref.field)) unclearable();
      const value = ref.path.split(".").reduce((item: any, key) => item?.[key], original);
      if (value !== ref.mediaId) unclearable();
    }
    if (table === "gallery_albumItems") {
      if (!original.albumId) unclearable();
      albumRemovals.set(original.albumId, (albumRemovals.get(original.albumId) ?? 0) + 1);
      writes.push({ table, id, remove: true }); continue;
    }
    if (table === "lms_nodes" && original.requireVideoWatch && group.some(ref => ref.field === "videoMediaId") && !original.videoUrl?.trim()) unclearable();
    const patch: Record<string, any> = {};
    // Remove array entries in descending order, after all current values were checked.
    const sorted = [...group].sort((a, b) => b.path.localeCompare(a.path, undefined, { numeric: true }));
    for (const ref of sorted) {
      const path = ref.path.split("."), root = path[0]!;
      if (path.length === 1) { patch[root] = undefined; continue; }
      if (!(root in patch)) patch[root] = cloneFields(original[root]);
      let parent = patch[root];
      for (const key of path.slice(1, -1)) parent = parent[key];
      const leaf = path[path.length - 1]!;
      if (Array.isArray(parent)) parent.splice(Number(leaf), 1); else delete parent[leaf];
    }
    if ("updatedAt" in original) patch.updatedAt = Date.now();
    writes.push({ table, id, patch });
  }
  for (const [id, removed] of albumRemovals) {
    beforeReferenceRead(budget);
    const album = await ctx.db.get("gallery_albums", id as Id<"gallery_albums">);
    if (album) addReferenceBudget(budget, { rows: 1, bytes: getDocumentSize(album) });
    if (!album || !Number.isSafeInteger(album.itemCount) || album.itemCount < removed) unclearable();
    const pending = writes.find(write => write.table === "gallery_albums" && write.id === id);
    if (pending) pending.patch = { ...pending.patch, itemCount: album.itemCount - removed, updatedAt: Date.now() };
    else writes.push({ table: "gallery_albums", id, patch: { itemCount: album.itemCount - removed, updatedAt: Date.now() } });
  }
  if (writes.length > MEDIA_REFERENCE_TOTAL.documents) referenceFailure();
  return { writes };
}
export async function applyReferenceClear(ctx: Pick<MutationCtx, "db">, plan: ReferenceClearPlan) {
  for (const write of plan.writes) {
    if (write.remove) {
      await reconcileOwnerReferences(ctx, write.table, write.id, null);
      await (ctx.db as any).delete(write.table, write.id);
      await recordCatalogWrite(ctx, write.table, "delete");
    } else {
      const previous = await (ctx.db as any).get(write.table, write.id);
      assertAuthoringWrite({ table: write.table, operation: "patch", id: write.id, previous, value: write.patch! });
      const candidate = { ...previous, ...write.patch };
      await assertMediaAttachments(ctx, write.table, candidate);
      await (ctx.db as any).patch(write.table, write.id, write.patch);
      await recordCatalogWrite(ctx, write.table, "patch", write.patch!);
      await reconcileOwnerReferences(ctx, write.table, write.id, candidate);
    }
  }
}
export async function clearMediaReferences(ctx: MutationCtx, _mediaId: Id<"media">, refs: MediaReference[]) {
  await applyReferenceClear(ctx, await prepareReferenceClear(ctx, refs));
}
