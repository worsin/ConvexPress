/** Each nested read owns one pagination journal and participates in its mutation's transaction. */
import { v } from "convex/values";
import type { RegisteredQuery } from "convex/server";
import { internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { inventory, referenceTables, referenceValidator, scanReferences, completeReferencePage, referenceFailure, type ScannedReference } from "./referenceScan";
import { MEDIA_REFERENCE_PAGE, opaqueMediaContainers } from "./referencePolicy";
import { mediaReferenceIndex } from "./referenceIndexes";
import { readIndexedReferences, requireReferenceIndexReady } from "./reverseIndex";
import { addReferenceBudget } from "./referenceScan";
type Args = { table: string; mediaIds: Id<"media">[]; field?: string };
type Result = { rows: number; bytes: number; references: ScannedReference[] };
export const indexed: RegisteredQuery<"internal", { mediaIds: Id<"media">[] }, Promise<Result | null>> = internalQuery({
  args: { mediaIds: v.array(v.id("media")) },
  returns: v.union(v.null(), v.object({ rows: v.number(), bytes: v.number(), references: v.array(referenceValidator) })),
  handler: async (ctx, args): Promise<Result | null> => {
    if (!args.mediaIds.length || args.mediaIds.length > 100) referenceFailure();
    const total = { rows: 0, bytes: 0, queries: 0 }, references: ScannedReference[] = [];
    for (const id of new Set(args.mediaIds)) {
      const result = await readIndexedReferences(ctx, id, total);
      if (!result) return null;
      references.push(...result.references);
      if (references.length > 1000 || new Set(references.map(ref => ref.documentId)).size > 100) referenceFailure();
    }
    return { rows: total.rows, bytes: total.bytes, references };
  },
});
export const scan: RegisteredQuery<"internal", Args, Promise<Result>> = internalQuery({
  args: { table: v.string(), mediaIds: v.array(v.id("media")), field: v.optional(v.string()) },
  returns: v.object({ rows: v.number(), bytes: v.number(), references: v.array(referenceValidator) }),
  handler: async (ctx, args): Promise<Result> => {
    if (!referenceTables.includes(args.table) || !args.mediaIds.length || args.mediaIds.length > 100) referenceFailure();
    let query = (ctx.db as any).query(args.table);
    if (args.field !== undefined) {
      if (args.mediaIds.length !== 1 || !(inventory[args.table] ?? []).some(d => !d.path.includes("*") && d.path.join(".") === args.field)) referenceFailure();
      query = query.withIndex(mediaReferenceIndex(args.table, args.field), (q: any) => q.eq(args.field, args.mediaIds[0]));
    } else if (!(opaqueMediaContainers[args.table] || (inventory[args.table] ?? []).some(d => d.path.includes("*")))) referenceFailure();
    const page = await query.paginate(MEDIA_REFERENCE_PAGE);
    const measured = completeReferencePage(page);
    const references = page.page.flatMap((doc: any) => scanReferences(args.table, doc, args.mediaIds, value => ctx.db.normalizeId("media", value)));
    if (references.length > 1000) referenceFailure();
    return { ...measured, references };
  },
});

type DependentArgs = { table: "mediaSizes" | "mediaMeta"; mediaId: Id<"media"> };
type DependentResult = { rows: number; bytes: number; records: { id: string; storageId?: Id<"_storage"> }[] };
export const dependents: RegisteredQuery<"internal", DependentArgs, Promise<DependentResult>> = internalQuery({
  args: { table: v.union(v.literal("mediaSizes"), v.literal("mediaMeta")), mediaId: v.id("media") },
  returns: v.object({ rows: v.number(), bytes: v.number(), records: v.array(v.object({ id: v.string(), storageId: v.optional(v.id("_storage")) })) }),
  handler: async (ctx, args): Promise<DependentResult> => {
    const page = await ctx.db.query(args.table).withIndex("by_media", q => q.eq("mediaId", args.mediaId)).paginate(MEDIA_REFERENCE_PAGE);
    return { ...completeReferencePage(page), records: page.page.map(row => ({ id: row._id, ...("storageId" in row ? { storageId: row.storageId } : {}) })) };
  },
});
type StorageArgs = { table: "media" | "mediaSizes" | "mediaMeta"; storageId: Id<"_storage"> };
type StorageResult = { rows: number; bytes: number; owners: Id<"media">[] };
export const storageOwners: RegisteredQuery<"internal", StorageArgs, Promise<StorageResult>> = internalQuery({
  args: { table: v.union(v.literal("media"), v.literal("mediaSizes"), v.literal("mediaMeta")), storageId: v.id("_storage") },
  returns: v.object({ rows: v.number(), bytes: v.number(), owners: v.array(v.id("media")) }),
  handler: async (ctx, args): Promise<StorageResult> => {
    const page = await ctx.db.query(args.table).withIndex("by_storage", q => q.eq(args.table === "mediaMeta" ? "value" : "storageId", args.storageId)).paginate(MEDIA_REFERENCE_PAGE);
    return { ...completeReferencePage(page), owners: page.page.map(row => "mediaId" in row ? row.mediaId : row._id as Id<"media">) };
  },
});

type TrashResult = { ids: Id<"media">[]; cursor: string | null };
export const trashPage: RegisteredQuery<"internal", { cursor: string | null; status?: "failed" }, Promise<TrashResult>> = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), status: v.optional(v.literal("failed")) },
  returns: v.object({ ids: v.array(v.id("media")), cursor: v.union(v.string(), v.null()) }),
  handler: async (ctx, args): Promise<TrashResult> => {
    const page = await ctx.db.query("media").withIndex("by_status", q => q.eq("status", args.status ?? "trashed")).paginate({ ...MEDIA_REFERENCE_PAGE, numItems: 8, cursor: args.cursor });
    // Enumeration may span ticks. Reference inspection for selected IDs must still
    // be complete in THIS mutation; a continuation is never permission to delete.
    completeReferencePage({ ...page, isDone: true });
    if (!page.isDone && (!page.continueCursor || page.continueCursor === args.cursor)) referenceFailure();
    return { ids: page.page.map(row => row._id), cursor: page.isDone ? null : page.continueCursor };
  },
});
