import { MEDIA_IMPORT_PREFIX } from "@convexpress/site-contract/media-index-epoch";
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import { ConvexError, getDocumentSize } from "convex/values";
import type { Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { resolveMediaReferenceIds } from "./referenceExtraction";
import { referenceTables, scanReferences, beforeReferenceRead, addReferenceBudget, type ScannedReference } from "./referenceScan";
import { MEDIA_REVERSE_EPOCH_VARIABLE, MEDIA_REVERSE_INDEX_VERSION, MEDIA_REVERSE_WRITERS_COMPLETE } from "./reverseIndexVersion";

export type ReferenceGeneration = { epoch: string; version: string; generation: string };
export function currentReferenceGeneration(): ReferenceGeneration | null {
  const epoch = process.env[MEDIA_REVERSE_EPOCH_VARIABLE];
  if (!epoch) return null;
  if (epoch.startsWith(MEDIA_IMPORT_PREFIX)) throw new ConvexError({ code: "MEDIA_INDEX_IMPORT_IN_PROGRESS", message: "Snapshot import is unresolved. Media indexing and deletion resume after verified import completion." });
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(epoch)) throw new ConvexError({ code: "MEDIA_INDEX_UNAVAILABLE", message: "Media reference index configuration is invalid." });
  return { epoch, version: MEDIA_REVERSE_INDEX_VERSION, generation: `${epoch}:${MEDIA_REVERSE_INDEX_VERSION}` };
}
export function indexUnavailable(): never {
  throw new ConvexError({ code: "MEDIA_INDEX_NOT_READY", message: "Media reference indexing must complete before deletion. Resume the bounded index backfill." });
}
export async function requireReferenceIndexReady(ctx: Pick<QueryCtx, "db">, budget?: { rows: number; bytes: number; queries: number }): Promise<ReferenceGeneration | null> {
  const current = currentReferenceGeneration();
  if (!current) return null;
  if (budget) beforeReferenceRead(budget);
  const state = await ctx.db.query("media_reference_state").withIndex("by_key", q => q.eq("key", "active")).unique();
  if (budget) addReferenceBudget(budget, { rows: state ? 1 : 0, bytes: state ? getDocumentSize(state) : 0 });
  if (!MEDIA_REVERSE_WRITERS_COMPLETE || !state || state.status !== "ready" || state.generation !== current.generation || state.version !== current.version || state.epoch !== current.epoch || state.ownerIndex !== referenceTables.length || state.cursor !== null || state.endCursor !== null || state.pendingRanges.length !== 0) indexUnavailable();
  return current;
}
export async function ownerReferences(ctx: Pick<QueryCtx, "db">, table: string, id: string, candidate: Record<string, unknown>, ledger?: RequestReadLedger): Promise<ScannedReference[]> {
  if (!referenceTables.includes(table)) return [];
  const mediaIds = await resolveMediaReferenceIds(ctx, table, candidate, ledger);
  const refs = scanReferences(table, { ...candidate, _id: id }, mediaIds, value => ctx.db.normalizeId("media", value));
  return refs.filter((ref, i) => refs.findIndex(other => other.path === ref.path && other.mediaId === ref.mediaId && other.opaque === ref.opaque) === i);
}
export async function reconcileOwnerReferences(ctx: Pick<MutationCtx, "db">, table: string, id: string, candidate: Record<string, unknown> | null, ledger?: RequestReadLedger): Promise<void> {
  const current = currentReferenceGeneration();
  if (!current || !referenceTables.includes(table)) return;
  const refs = candidate ? await ownerReferences(ctx, table, id, candidate, ledger) : [];
  ledger?.beforeRead();
  const previous = await ctx.db.query("media_reference_edges").withIndex("by_owner_generation", q => q.eq("ownerId", id).eq("generation", current.generation)).take(101);
  for (const edge of previous) ledger?.record(edge);
  if (previous.length > 100 || previous.reduce((sum, edge) => sum + getDocumentSize(edge), 0) > 512 * 1024 || previous.some(edge => edge.ownerTable !== table)) throw new ConvexError({ code: "MEDIA_INDEX_OWNER_CONFLICT", message: "Media reference owner index requires reconciliation." });
  const grouped = new Map<string, ScannedReference[]>();
  for (const ref of refs) { const group = grouped.get(ref.mediaId) ?? []; group.push(ref); grouped.set(ref.mediaId, group); }
  if (getDocumentSize({ references: refs }) > 512 * 1024) throw new ConvexError({ code: "MEDIA_ATTACHMENT_BUDGET", message: "Media reference evidence exceeds the supported owner budget." });
  if (grouped.size > 100) throw new ConvexError({ code: "MEDIA_ATTACHMENT_BUDGET", message: "Too many media attachments in one document." });
  for (const edge of previous) await ctx.db.delete("media_reference_edges", edge._id);
  for (const [mediaId, references] of grouped) await ctx.db.insert("media_reference_edges", {
    generation: current.generation, mediaId, ownerTable: table, ownerId: id,
    references: references.map(({ field, path, opaque }) => ({ field, path, opaque })), updatedAt: Date.now(),
  });
}
/** Bounded exact-media edge query; never infer absence from an incomplete range. */
export async function readIndexedReferences(ctx: Pick<QueryCtx, "db">, mediaId: Id<"media">, sharedBudget?: { rows: number; bytes: number; queries: number }): Promise<{ rows: number; bytes: number; references: ScannedReference[] } | null> {
  const budget = sharedBudget ?? { rows: 0, bytes: 0, queries: 0 };
  const start = { rows: budget.rows, bytes: budget.bytes };
  beforeReferenceRead(budget);
  const current = await requireReferenceIndexReady(ctx, budget);
  if (!current) return null;
  beforeReferenceRead(budget);
  const edges = await ctx.db.query("media_reference_edges").withIndex("by_media_generation", q => q.eq("mediaId", mediaId).eq("generation", current.generation)).take(101);
  let bytes = edges.reduce((sum, edge) => sum + getDocumentSize(edge), 0);
  addReferenceBudget(budget, { rows: edges.length, bytes });
  if (edges.length > 100 || bytes > 512 * 1024) throw new ConvexError({ code: "MEDIA_REFERENCE_BUDGET", message: "Media references exceed the safe deletion budget; nothing was deleted." });
  const references: ScannedReference[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    if (!referenceTables.includes(edge.ownerTable) || seen.has(edge.ownerId)) indexUnavailable();
    seen.add(edge.ownerId);
    const ownerId = ctx.db.normalizeId(edge.ownerTable as TableNames, edge.ownerId);
    if (!ownerId) indexUnavailable();
    beforeReferenceRead(budget);
    const owner = await ctx.db.get(ownerId);
    if (!owner) indexUnavailable();
    const ownerBytes = getDocumentSize(owner);
    bytes += ownerBytes;
    addReferenceBudget(budget, { rows: 1, bytes: ownerBytes });
    if (bytes > 512 * 1024) throw new ConvexError({ code: "MEDIA_REFERENCE_BUDGET", message: "Media references exceed the safe deletion budget; nothing was deleted." });
    // This read already has the target ID: inspect it directly without resolving
    // unrelated legacy-shaped strings or spending unaccounted media reads.
    const scanned = scanReferences(edge.ownerTable, owner, [mediaId], value => ctx.db.normalizeId("media", value));
    const actual = scanned.filter((ref, i) => scanned.findIndex(other => other.path === ref.path && other.mediaId === ref.mediaId && other.opaque === ref.opaque) === i);
    const evidenceKey = (ref: { field: string; path: string; opaque: boolean }) => JSON.stringify([ref.field, ref.path, ref.opaque]);
    if (!actual.length || JSON.stringify(actual.map(evidenceKey).sort()) !== JSON.stringify(edge.references.map(evidenceKey).sort())) indexUnavailable();
    references.push(...actual);
  }
  if (references.length > 1000) throw new ConvexError({ code: "MEDIA_REFERENCE_BUDGET", message: "Media references exceed the safe deletion budget; nothing was deleted." });
  return { rows: budget.rows - start.rows, bytes: budget.bytes - start.bytes, references };
}

/** Dev/raw destructive maintenance must close readiness in its own transaction. */
export async function invalidateMediaReferenceIndex(ctx: Pick<MutationCtx, "db">): Promise<void> {
  const state = await ctx.db.query("media_reference_state").withIndex("by_key", q => q.eq("key", "active")).unique();
  if (!state) return;
  await ctx.db.patch("media_reference_state", state._id, {
    status: "blocked", errorCode: "MEDIA_INDEX_INVALIDATED", ownerIndex: 0,
    cursor: null, endCursor: null, pendingRanges: [], documents: 0, pages: 0,
    sequence: state.sequence + 1, updatedAt: Date.now(),
  });
}
