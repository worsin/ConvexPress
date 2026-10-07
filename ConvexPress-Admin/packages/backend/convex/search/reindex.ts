import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { currentUserCan } from "../helpers/permissions";
import { searchableContentTypeValidator } from "./validators";
import { reindexContent, removeOrphanedSearchEntry } from "./internals";
import { installedSearchSources, type ExtensionSearchSource } from "./extensionSources";

const kinds = ["post", "page", "media", "comment", "course", "product", "event"] as const;
type Kind = typeof kinds[number];
const failedItem = v.object({ contentType: searchableContentTypeValidator, contentId: v.string() });
function phases(contentType: Kind | null): { kind: Kind; source?: ExtensionSearchSource }[] {
  return [...kinds.filter(kind => kind !== "event" && (!contentType || kind === contentType)).map(kind => ({ kind })),
    ...installedSearchSources().filter(source => !contentType || source.contentType === contentType).map(source => ({ kind: source.contentType, source }))];
}
function sourceKey(contentType: Kind | null) { return JSON.stringify([1, ...phases(contentType).map(phase => [phase.kind, phase.source?.id ?? "core", phase.source?.maintenance.version ?? "created-order-v1"])]); }
const counts = v.object({ post: v.number(), page: v.number(), media: v.number(), comment: v.number(), course: v.number(), product: v.number(), event: v.number() });
export const progressValidator = v.object({
  needsRestart: v.boolean(), contentType: v.union(searchableContentTypeValidator, v.null()), jobId: v.string(), status: v.union(v.literal("running"), v.literal("completed"), v.literal("failed")),
  sequence: v.number(), failure: v.optional(failedItem), indexed: counts, processed: v.number(), removed: v.number(), errors: v.number(), failedAttempts: v.number(), duration: v.number(),
});
export type ReindexProgress = { needsRestart: boolean; contentType: Kind | null; jobId: string; status: "running" | "completed" | "failed"; sequence: number; failure?: { contentType: Kind; contentId: string }; indexed: Record<Kind, number>; processed: number; removed: number; errors: number; failedAttempts: number; duration: number };
function progress(row: Doc<"searchReindexState">): ReindexProgress {
  return { needsRestart: row.status !== "completed" && row.sourceKey !== sourceKey(row.contentType), contentType: row.contentType, jobId: row.jobId, status: row.status, sequence: row.sequence, ...(row.failure ? { failure: row.failure } : {}), indexed: row.indexed, processed: row.processed, removed: row.removed,
    errors: row.status === "failed" ? 1 : 0, failedAttempts: row.failedAttempts, duration: Math.max(0, row.updatedAt - row.startedAt) };
}
async function authorize(ctx: QueryCtx | MutationCtx) {
  if (!await currentUserCan(ctx, "search.reindex") && !await currentUserCan(ctx, "manage_options")) throw new ConvexError({ code: "FORBIDDEN", message: "Reindex permission is no longer available." });
}
const read = (ctx: QueryCtx | MutationCtx) => ctx.db.query("searchReindexState").withIndex("by_key", q => q.eq("key", "current")).unique();
const leaseMs = 60_000;
const request = { jobId: v.string(), leaseId: v.string(), sequence: v.number() };
function owned(row: Doc<"searchReindexState"> | null, args: { jobId: string; leaseId: string }) {
  if (!row || row.jobId !== args.jobId || row.leaseId !== args.leaseId || row.leaseUntil <= Date.now()) throw new ConvexError({ code: "REINDEX_LEASE_LOST", message: "This reindex worker no longer owns the operation. Resume the current job." });
  return row;
}

/** Resume the same scope after interruption. A completed receipt stays stable
 * when its job ID is retried; a request without one starts the next operation. */
export const begin = internalMutation({
  args: { jobId: v.optional(v.string()), newJobId: v.string(), leaseId: v.string(), contentType: v.optional(searchableContentTypeValidator) },
  returns: progressValidator,
  handler: async (ctx, args) => {
    await authorize(ctx);
    const existing = await read(ctx), now = Date.now();
    if (args.jobId && existing?.jobId !== args.jobId) throw new ConvexError({ code: "REINDEX_CHANGED", message: "A newer reindex operation replaced this one." });
    if (existing && (args.jobId || existing.status !== "completed")) {
      if (existing.contentType !== (args.contentType ?? null)) throw new ConvexError({ code: "ALREADY_RUNNING", message: "Resume the existing reindex scope before starting another." });
      if (existing.status === "completed") return progress(existing);
      if (existing.leaseUntil > now) throw new ConvexError({ code: "ALREADY_RUNNING", message: "Reindex is already running. Retry after the current worker finishes." });
      if (existing.sourceKey !== sourceKey(existing.contentType)) {
        if (args.jobId) throw new ConvexError({ code: "REINDEX_SOURCES_CHANGED", message: "Installed search sources changed. Restart reindex from the beginning." });
      } else {
      const patch = { leaseId: args.leaseId, leaseUntil: now + leaseMs, status: "running" as const, updatedAt: now };
      await ctx.db.patch("searchReindexState", existing._id, patch);
      return progress({ ...existing, ...patch });
      }
    }
    // Respect any old action still executing across a deployment boundary.
    const legacy = await ctx.db.query("searchIndex").withIndex("by_content", q => q.eq("contentType", "post").eq("contentId", "__reindex_lock__")).unique();
    if (legacy && now - legacy.indexedAt < 30 * 60_000) throw new ConvexError({ code: "ALREADY_RUNNING", message: "A previous reindex worker is still active." });
    const value = { key: "current" as const, jobId: args.newJobId, leaseId: args.leaseId, leaseUntil: now + leaseMs, contentType: args.contentType ?? null,
      sourceKey: sourceKey(args.contentType ?? null), phase: 0, cursor: null, sequence: 0, status: "running" as const, indexed: { post: 0, page: 0, media: 0, comment: 0, course: 0, product: 0, event: 0 }, processed: 0, removed: 0, failedAttempts: 0, startedAt: now, updatedAt: now };
    if (existing) { await ctx.db.replace("searchReindexState", existing._id, value); return progress({ ...existing, ...value }); }
    const id = await ctx.db.insert("searchReindexState", value);
    return progress((await ctx.db.get("searchReindexState", id))!);
  },
});

/** One source item per transaction bounds expensive canonical projection. Index
 * writes and the continuation commit together; replay cannot double-count them. */
export const step = internalMutation({
  args: request, returns: progressValidator,
  handler: async (ctx, args) => {
    await authorize(ctx);
    const row = owned(await read(ctx), args);
    if (row.sequence !== args.sequence || row.status !== "running") return progress(row);
    if (row.sourceKey !== sourceKey(row.contentType)) throw new ConvexError({ code: "REINDEX_SOURCES_CHANGED", message: "Installed search sources changed. Restart the scan." });
    const plan = phases(row.contentType), selected = plan[row.phase], kind = selected?.kind;
    const options = { cursor: row.cursor, numItems: 1, maximumRowsRead: 1, maximumBytesRead: 1024 * 1024 };
    let page: { ids: string[]; cursor: string; isDone: boolean };
    if (selected?.source) page = await selected.source.maintenance.page(ctx, row.cursor);
    else {
      const source = kind === "post" || kind === "page"
        ? ctx.db.query("posts").withIndex("by_type", q => q.eq("type", kind))
        : kind === "media" ? ctx.db.query("media") : kind === "comment" ? ctx.db.query("comments")
        : kind === "course" ? ctx.db.query("lms_courses") : kind === "product" ? ctx.db.query("commerce_products") : ctx.db.query("searchIndex");
      const result = await source.paginate(options);
      page = { ids: result.page.map(item => String(item._id)), cursor: result.continueCursor, isDone: result.isDone };
    }
    if (page.ids.length > 1 || page.cursor.length > 4096) throw Error("Search maintenance exceeded its page contract");
    const indexed = { ...row.indexed }; let removed = row.removed, processed = row.processed;
    for (const id of page.ids) {
      if (kind) {
        const before = await ctx.db.query("searchIndex").withIndex("by_content", q => q.eq("contentType", kind).eq("contentId", id)).unique();
        try {
          if (selected.source) {
            if (!selected.source.matchesId(ctx, id)) throw Error("Search source returned a foreign identity");
            await selected.source.maintenance.sync(ctx, id);
          } else await reindexContent(ctx, kind, id);
        }
        catch { throw new ConvexError({ code: "REINDEX_ITEM_FAILED", contentType: kind, contentId: id }); }
        const after = await ctx.db.query("searchIndex").withIndex("by_content", q => q.eq("contentType", kind).eq("contentId", id)).unique();
        if (after) indexed[kind]++; else if (before) removed++;
        processed++;
      } else {
        const entry = await ctx.db.get("searchIndex", id as Id<"searchIndex">);
        if (entry && await removeOrphanedSearchEntry(ctx, entry)) removed++;
      }
    }
    if (!page.isDone && page.cursor === row.cursor) throw Error("Reindex continuation did not advance");
    const phase = row.phase + (page.isDone ? 1 : 0), done = phase > plan.length, now = Date.now();
    const patch = { failure: undefined, indexed, processed, removed, phase, cursor: page.isDone ? null : page.cursor, sequence: row.sequence + 1,
      status: done ? "completed" as const : "running" as const, leaseUntil: done ? 0 : now + leaseMs, updatedAt: now };
    await ctx.db.patch("searchReindexState", row._id, patch);
    return progress({ ...row, ...patch });
  },
});

/** Bounded action chunks relinquish only their own lease. A failed transaction
 * leaves its cursor unchanged; the next authorized retry processes that item. */
export const finishChunk = internalMutation({
  args: { ...request, failed: v.boolean(), failure: v.optional(failedItem) }, returns: progressValidator,
  handler: async (ctx, args) => {
    // Release is still safe if authority was revoked during the action. It may
    // only relinquish this worker's existing lease; it cannot advance content.
    const row = await read(ctx);
    if (!row || row.jobId !== args.jobId || row.leaseId !== args.leaseId) throw new ConvexError({ code: "REINDEX_LEASE_LOST", message: "Reindex ownership changed." });
    if (row.sequence !== args.sequence || row.status === "completed" || row.leaseUntil <= Date.now()) return progress(row);
    const patch = { ...(args.failed ? { failure: args.failure } : {}), leaseUntil: 0, status: args.failed ? "failed" as const : row.status, failedAttempts: row.failedAttempts + (args.failed ? 1 : 0), updatedAt: Date.now() };
    await ctx.db.patch("searchReindexState", row._id, patch);
    return progress({ ...row, ...patch });
  },
});

export const status = internalQuery({
  args: { jobId: v.string() }, returns: progressValidator,
  handler: async (ctx, args) => { await authorize(ctx); const row = await read(ctx); if (!row || row.jobId !== args.jobId) throw Error("Reindex operation changed"); return progress(row); },
});

/** Current site-local progress for an authorized operator, including reload. */
export const current = query({
  args: {}, returns: v.union(progressValidator, v.null()),
  handler: async ctx => { await authorize(ctx); const row = await read(ctx); return row ? progress(row) : null; },
});
