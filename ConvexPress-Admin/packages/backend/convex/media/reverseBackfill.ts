import { MEDIA_IMPORT_PREFIX, MEDIA_INDEX_EPOCH_NAME } from "@convexpress/site-contract/media-index-epoch";
import { ConvexError, getDocumentSize, v } from "convex/values";
import type { RegisteredMutation, RegisteredQuery } from "convex/server";
import { mutation, query } from "../_generated/server";
import type { Doc, TableNames } from "../_generated/dataModel";
import { requireCan } from "../helpers/permissions";
import { referenceTables } from "./referenceScan";
import { currentReferenceGeneration, reconcileOwnerReferences, requireReferenceIndexReady } from "./reverseIndex";
import { MEDIA_REVERSE_WRITERS_COMPLETE } from "./reverseIndexVersion";

type Progress = { status: "unconfigured" | "stale" | "building" | "blocked" | "ready"; generation: string | null; sequence: number; owner: string | null; completedOwners: number; totalOwners: number; pages: number; documents: number; errorCode?: string };
const progressValidator = v.object({ status: v.union(v.literal("unconfigured"), v.literal("stale"), v.literal("building"), v.literal("blocked"), v.literal("ready")), generation: v.union(v.string(), v.null()), sequence: v.number(), owner: v.union(v.string(), v.null()), completedOwners: v.number(), totalOwners: v.number(), pages: v.number(), documents: v.number(), errorCode: v.optional(v.string()) });
function progress(state: Doc<"media_reference_state"> | null): Progress {
  if (process.env[MEDIA_INDEX_EPOCH_NAME]?.startsWith(MEDIA_IMPORT_PREFIX)) return { status: "blocked", generation: null, sequence: 0, owner: null, completedOwners: 0, totalOwners: referenceTables.length, pages: 0, documents: 0, errorCode: "MEDIA_INDEX_IMPORT_IN_PROGRESS" };
  const current = currentReferenceGeneration();
  const valid = !!current && state?.generation === current.generation && state.version === current.version && state.epoch === current.epoch;
  const falseReady = valid && state!.status === "ready" && (state!.ownerIndex !== referenceTables.length || state!.cursor !== null || state!.endCursor !== null || state!.pendingRanges.length !== 0);
  return {
    status: !current ? "unconfigured" : !valid ? "stale" : falseReady ? "blocked" : state!.status, generation: valid ? state!.generation : current?.generation ?? null,
    sequence: valid ? state!.sequence : 0, owner: valid ? referenceTables[state!.ownerIndex] ?? null : null,
    completedOwners: valid ? state!.ownerIndex : 0, totalOwners: referenceTables.length,
    pages: valid ? state!.pages : 0, documents: valid ? state!.documents : 0,
    ...(falseReady ? { errorCode: "MEDIA_INDEX_STATE_INVALID" } : valid && state!.errorCode ? { errorCode: state!.errorCode } : {})
  };
}
export const status: RegisteredQuery<"public", Record<string, never>, Promise<Progress>> = query({
  args: {}, returns: progressValidator,
  handler: async ctx => { await requireCan(ctx, "manage_options"); return progress(await ctx.db.query("media_reference_state").withIndex("by_key", q => q.eq("key", "active")).unique()); },
});
export const begin: RegisteredMutation<"public", Record<string, never>, Promise<Progress>> = mutation({
  args: {}, returns: progressValidator,
  handler: async ctx => {
    await requireCan(ctx, "manage_options");
    const current = currentReferenceGeneration();
    if (!current) throw new ConvexError({ code: "MEDIA_INDEX_UNCONFIGURED", message: "Configure the deployment media reference epoch before starting indexing." });
    if (!MEDIA_REVERSE_WRITERS_COMPLETE) throw new ConvexError({ code: "MEDIA_INDEX_COVERAGE_INCOMPLETE", message: "Writer coverage is not complete; the index cannot become authoritative." });
    const existing = await ctx.db.query("media_reference_state").withIndex("by_key", q => q.eq("key", "active")).unique();
    if (existing?.generation === current.generation && existing.version === current.version && existing.epoch === current.epoch && progress(existing).errorCode !== "MEDIA_INDEX_STATE_INVALID") return progress(existing);
    const values = { key: "active" as const, ...current, status: "building" as const, ownerIndex: 0, cursor: null, endCursor: null, pendingRanges: [], sequence: 0, pages: 0, documents: 0, startedAt: Date.now(), updatedAt: Date.now() };
    const id = existing?._id ?? await ctx.db.insert("media_reference_state", values);
    if (existing) await ctx.db.replace("media_reference_state", id, values);
    return progress(await ctx.db.get("media_reference_state", id));
  },
});
type StepArgs = { generation: string; expectedSequence: number };
export const step: RegisteredMutation<"public", StepArgs, Promise<Progress>> = mutation({
  args: { generation: v.string(), expectedSequence: v.number() }, returns: progressValidator,
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const current = currentReferenceGeneration();
    const state = await ctx.db.query("media_reference_state").withIndex("by_key", q => q.eq("key", "active")).unique();
    if (!MEDIA_REVERSE_WRITERS_COMPLETE || !current || !state || state.generation !== current.generation || args.generation !== current.generation) throw new ConvexError({ code: "MEDIA_INDEX_STALE", message: "Start or resume indexing for the current deployment generation." });
    if (!Number.isSafeInteger(args.expectedSequence) || args.expectedSequence < 0 || args.expectedSequence > state.sequence) throw new ConvexError({ code: "MEDIA_INDEX_CURSOR", message: "Refresh index progress before continuing." });
    if (args.expectedSequence < state.sequence || state.status === "ready") return progress(state);
    const table = referenceTables[state.ownerIndex];
    if (!table) throw new ConvexError({ code: "MEDIA_INDEX_CURSOR", message: "Index progress is invalid." });
    const page = await ctx.db.query(table as TableNames).paginate({ cursor: state.cursor, endCursor: state.endCursor, numItems: 8, maximumRowsRead: 16, maximumBytesRead: 256 * 1024 });
    const update = { sequence: state.sequence + 1, pages: state.pages + 1, updatedAt: Date.now() };
    if (page.pageStatus != null) {
      if (!page.splitCursor || page.splitCursor === state.cursor || page.splitCursor === state.endCursor || state.pendingRanges.length >= 32) {
        await ctx.db.patch("media_reference_state", state._id, { ...update, status: "blocked", errorCode: "MEDIA_INDEX_PAGE_BUDGET" });
      } else {
        await ctx.db.patch("media_reference_state", state._id, { ...update, status: "building", errorCode: undefined, endCursor: page.splitCursor, pendingRanges: [{ cursor: page.splitCursor, endCursor: state.endCursor }, ...state.pendingRanges] });
      }
      return progress(await ctx.db.get(state._id));
    }
    const bytes = page.page.reduce((sum, row) => sum + getDocumentSize(row), 0);
    if (page.page.length > 16 || bytes > 512 * 1024 || (!state.endCursor && !page.isDone && (!page.continueCursor || page.continueCursor === state.cursor))) {
      await ctx.db.patch("media_reference_state", state._id, { ...update, status: "blocked", errorCode: "MEDIA_INDEX_PAGE_BUDGET" });
      return progress(await ctx.db.get(state._id));
    }
    try {
      for (const owner of page.page) await reconcileOwnerReferences(ctx, table, owner._id, owner);
    } catch (error) {
      if (!(error instanceof ConvexError)) throw error;
      // Partial idempotent edge replacement is harmless: readiness stays closed,
      // and the cursor remains at this exact page for a later explicit retry.
      await ctx.db.patch("media_reference_state", state._id, { ...update, status: "blocked", errorCode: "MEDIA_INDEX_OWNER_BUDGET" });
      return progress(await ctx.db.get(state._id));
    }
    const nextRange = state.pendingRanges[0];
    const rangeComplete = state.endCursor !== null || page.isDone;
    const next = !rangeComplete ? { cursor: page.continueCursor } : nextRange ? { ...nextRange, pendingRanges: state.pendingRanges.slice(1) } : { ownerIndex: state.ownerIndex + 1, cursor: null, endCursor: null, pendingRanges: [] };
    await ctx.db.patch("media_reference_state", state._id, {
      ...update, ...next, documents: state.documents + page.page.length, errorCode: undefined,
      status: rangeComplete && !nextRange && state.ownerIndex + 1 === referenceTables.length ? "ready" : "building"
    });
    return progress(await ctx.db.get(state._id));
  },
});

type CleanupArgs = { generation: string };
type CleanupResult = { deleted: number; remaining: boolean };
/** At most eight obsolete infrastructure rows per call. No authored/storage deletion. */
export const cleanupObsolete: RegisteredMutation<"public", CleanupArgs, Promise<CleanupResult>> = mutation({
  args: { generation: v.string() }, returns: v.object({ deleted: v.number(), remaining: v.boolean() }),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const current = await requireReferenceIndexReady(ctx);
    if (!current || args.generation !== current.generation) throw new ConvexError({ code: "MEDIA_INDEX_STALE", message: "Refresh current index progress before cleanup." });
    let rows = await ctx.db.query("media_reference_edges").withIndex("by_generation", q => q.lt("generation", current.generation)).take(8);
    if (!rows.length) rows = await ctx.db.query("media_reference_edges").withIndex("by_generation", q => q.gt("generation", current.generation)).take(8);
    // A nonempty batch cannot prove global completion. Another explicit bounded
    // call checks both sides and reports completion only when both are empty.
    for (const row of rows) {
      if (row.generation === current.generation) throw new ConvexError({ code: "MEDIA_INDEX_STALE", message: "Current index records cannot be cleaned." });
      await ctx.db.delete("media_reference_edges", row._id);
    }
    return { deleted: rows.length, remaining: rows.length > 0 };
  },
});
