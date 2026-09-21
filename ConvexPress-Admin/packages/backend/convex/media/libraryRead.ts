import { ConvexError, getConvexSize, getDocumentSize, v, type Infer } from "convex/values";
import type { PaginationOptions, PaginationResult } from "convex/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { mediaTables, mediaTypeValidator } from "../schema/media";
import { listMediaArgsValidator } from "./validators";

export const MEDIA_PAGE_ROWS = 256;
export const MEDIA_PAGE_BYTES = 512 * 1024;
export const MEDIA_PAGE_SIZE = 100;
const pageFields = {
  isDone: v.boolean(), continueCursor: v.string(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())),
};
export const mediaListPageValidator = v.object({
  ...pageFields,
  page: v.array(v.object({ _id: v.id("media"), _creationTime: v.number(), ...mediaTables.media.validator.fields, uploaderName: v.string() })),
});
export const countDocumentValidator = v.object({
  _id: v.id("media"), mediaType: mediaTypeValidator, trashed: v.boolean(), mine: v.boolean(), unattached: v.boolean(),
});
export const mediaCountPageValidator = v.object({ ...pageFields, page: v.array(countDocumentValidator) });
export const mediaCountsValidator = v.object({ all: v.number(), images: v.number(), video: v.number(), audio: v.number(), documents: v.number(), mine: v.number(), unattached: v.number(), trashed: v.number() });
export type CountDocument = Infer<typeof countDocumentValidator>;
type ListArgs = Infer<typeof listMediaArgsValidator>;

function invalid(message: string): never { throw new ConvexError({ code: "VALIDATION_ERROR", message }); }
function budget(): never { throw new ConvexError({ code: "MEDIA_PAGE_BUDGET", message: "This media page exceeds the read budget. Narrow the filters or request a smaller page." }); }

export function mediaPagination(options: PaginationOptions): PaginationOptions {
  if (!Number.isSafeInteger(options.numItems) || options.numItems < 1 || options.numItems > MEDIA_PAGE_SIZE) invalid("Media page size must be an integer from 1 to 100");
  // Legacy search offsets were never stable opaque database cursors.
  if (options.cursor && /^\d+$/.test(options.cursor)) invalid("The media cursor is obsolete. Reload this media view.");
  return { ...options, maximumRowsRead: MEDIA_PAGE_ROWS, maximumBytesRead: MEDIA_PAGE_BYTES };
}

function checkedPage(page: PaginationResult<Doc<"media">>, options: PaginationOptions): PaginationResult<Doc<"media">> {
  const canSplit = !!page.splitCursor && page.splitCursor !== page.continueCursor && page.splitCursor !== options.cursor && page.splitCursor !== options.endCursor;
  // Native clients also split recommended pages (and growing reactive ranges).
  // Never hand them a non-progress cursor that would repeat the same range.
  if ((page.pageStatus != null || page.splitCursor != null) && !canSplit) budget();
  // Search currently ignores the server pagination scan budgets. This is an
  // explicit POST-read refusal before dependent reads, not a pre-read bound.
  const sizes = page.page.map((row) => getDocumentSize(row));
  // Splitting cannot make an individual oversized document fit.
  if (sizes.some((size) => size > MEDIA_PAGE_BYTES)) budget();
  const oversized = page.page.length > MEDIA_PAGE_ROWS || sizes.reduce((sum, size) => sum + size, 0) > MEDIA_PAGE_BYTES;
  if (oversized || page.pageStatus === "SplitRequired") {
    if (!canSplit) budget();
    return { ...page, page: [], isDone: false, pageStatus: "SplitRequired" };
  }
  return page;
}

export function matchesMediaFilters(item: Doc<"media">, args: ListArgs): boolean {
  const trash = args.trashView ?? "active";
  return !(trash === "active" && item.status === "trashed") && !(trash === "only" && item.status !== "trashed") &&
    (args.status === undefined || item.status === args.status) &&
    (args.mediaType === undefined || item.mediaType === args.mediaType) &&
    (args.uploadedBy === undefined || item.uploadedBy === args.uploadedBy) &&
    (args.mimeType === undefined || item.mimeType === args.mimeType) &&
    (args.dateFrom === undefined || item.createdAt >= args.dateFrom) &&
    (args.dateTo === undefined || item.createdAt <= args.dateTo) &&
    (!args.unattached || !item.attachedTo);
}

export async function readMediaList(ctx: QueryCtx, args: ListArgs) {
  const options = mediaPagination(args.paginationOpts);
  const search = args.search?.trim();
  if ((args.search?.length ?? 0) > 256) invalid("Media search must be 256 characters or fewer");
  if ((args.dateFrom !== undefined && !Number.isFinite(args.dateFrom)) || (args.dateTo !== undefined && !Number.isFinite(args.dateTo)) ||
    (args.dateFrom !== undefined && args.dateTo !== undefined && args.dateFrom > args.dateTo)) invalid("Invalid media date range");
  const raw = await (async () => {
    if (search) return ctx.db.query("media").withSearchIndex("search_media", (q) => {
      let result = q.search("title", search);
      if (args.mediaType !== undefined) result = result.eq("mediaType", args.mediaType);
      if (args.uploadedBy !== undefined) result = result.eq("uploadedBy", args.uploadedBy);
      if (args.status !== undefined) result = result.eq("status", args.status);
      else if (args.trashView === "only") result = result.eq("status", "trashed");
      return result;
    }).paginate(options);
    const order = args.orderDir === "asc" ? "asc" : "desc";
    if (args.mediaType && args.uploadedBy) return ctx.db.query("media").withIndex("by_uploader_type", (q) => q.eq("uploadedBy", args.uploadedBy!).eq("mediaType", args.mediaType!)).order(order).paginate(options);
    if (args.mediaType) return ctx.db.query("media").withIndex("by_type_created", (q) => q.eq("mediaType", args.mediaType!)).order(order).paginate(options);
    if (args.uploadedBy) return ctx.db.query("media").withIndex("by_uploaded_by", (q) => q.eq("uploadedBy", args.uploadedBy!)).order(order).paginate(options);
    if (args.status || args.trashView === "only") return ctx.db.query("media").withIndex("by_status", (q) => q.eq("status", args.status ?? "trashed")).order(order).paginate(options);
    if (args.mimeType) return ctx.db.query("media").withIndex("by_mime_type", (q) => q.eq("mimeType", args.mimeType!)).order(order).paginate(options);
    return ctx.db.query("media").withIndex("by_created").order(order).paginate(options);
  })();
  const result = checkedPage(raw, options);
  const matching = result.page.filter((row) => matchesMediaFilters(row, args));
  const uploaderNames = new Map<Id<"users">, string>();
  let enrichmentBytes = 0;
  // Sequential unique uploader reads stop before additional dependent reads if
  // a fetched user document exceeds the separate enrichment budget.
  for (const id of new Set(matching.map((row) => row.uploadedBy))) {
    const uploader = await ctx.db.get("users", id);
    enrichmentBytes += uploader ? getDocumentSize(uploader) : 0;
    if (enrichmentBytes > MEDIA_PAGE_BYTES) budget();
    uploaderNames.set(id, uploader?.displayName || (uploader?.firstName && uploader?.lastName ? `${uploader.firstName} ${uploader.lastName}` : null) || uploader?.email || "Unknown User");
  }
  const page = [];
  for (const row of matching) {
    // Preserve the existing search URL refresh behavior; ordinary listing
    // still uses the stored URL as before.
    const url = search && row.storageId ? (await ctx.storage.getUrl(row.storageId)) ?? row.url : row.url;
    page.push({ ...row, url, uploaderName: uploaderNames.get(row.uploadedBy)! });
  }
  const response = { ...result, page };
  if (getConvexSize(response) > 2 * MEDIA_PAGE_BYTES) budget();
  return response;
}

export async function readMediaCountPage(ctx: QueryCtx, options: PaginationOptions, userId: Id<"users">) {
  const pagination = mediaPagination(options);
  const raw = await ctx.db.query("media").order("desc").paginate(pagination);
  const result = checkedPage(raw, pagination);
  return { ...result, page: result.page.map((row): CountDocument => ({ _id: row._id, mediaType: row.mediaType, trashed: row.status === "trashed", mine: row.uploadedBy === userId, unattached: !row.attachedTo })) };
}

export function countMediaDocuments(rows: CountDocument[]) {
  const counts = { all: 0, images: 0, video: 0, audio: 0, documents: 0, mine: 0, unattached: 0, trashed: 0 };
  for (const row of rows) {
    if (row.trashed) { counts.trashed++; continue; }
    counts.all++;
    if (row.mediaType === "image") counts.images++;
    if (row.mediaType === "video") counts.video++;
    if (row.mediaType === "audio") counts.audio++;
    if (row.mediaType === "document") counts.documents++;
    if (row.mine) counts.mine++;
    if (row.unattached) counts.unattached++;
  }
  return counts;
}
