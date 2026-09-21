import { ConvexError, v } from "convex/values";
import { paginationOptsValidator, type PaginationOptions, type PaginationResult, type RegisteredQuery, type RegisteredMutation } from "convex/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import { requireCan } from "../helpers/permissions";
import { requireCommerceEnabled } from "./helpers";
import { emitEvent } from "../helpers/events";
import { BRAND_EVENTS, SYSTEM } from "../events/constants";
import { insertWithMediaReferences, patchWithMediaReferences, requireAttachableMedia } from "../media/attachmentGuard";

type BrandStatus = "draft" | "publish" | "archived";
interface CreateBrandArgs { name: string; slug?: string; description?: string; logoMediaId?: Id<"media">; status?: BrandStatus; sortOrder?: number }
interface UpdateBrandArgs { brandId: Id<"commerce_product_brands">; name?: string; slug?: string; description?: string; logoMediaId?: Id<"media"> | null; status?: BrandStatus; sortOrder?: number }

const brandStatus = v.union(v.literal("draft"), v.literal("publish"), v.literal("archived"));
const brandFields = { name: v.string(), slug: v.string(), description: v.string(), logoMediaId: v.optional(v.id("media")), status: brandStatus, sortOrder: v.number(), createdAt: v.number(), updatedAt: v.number() };
const brandDocument = v.object({ _id: v.id("commerce_product_brands"), _creationTime: v.number(), ...brandFields });
function invalid(message: string): never { throw new ConvexError({ code: "VALIDATION_ERROR", message }); }
export function normalizeBrand(values: { name: string; slug?: string; description?: string; sortOrder?: number }) {
  const name = values.name.trim().replace(/\s+/gu, " ");
  const slug = (values.slug ?? name).normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const description = (values.description ?? "").trim();
  const sortOrder = values.sortOrder ?? 0;
  if (!name || name.length > 160) invalid("Brand name must contain 1–160 characters.");
  if (!slug || slug.length > 120) invalid("Provide a URL slug containing letters or numbers, up to 120 characters.");
  if (description.length > 3000) invalid("Brand description must be at most 3000 characters.");
  if (!Number.isSafeInteger(sortOrder) || Math.abs(sortOrder) > 100000) invalid("Brand sort order must be a whole number between -100000 and 100000.");
  return { name, slug, description, sortOrder };
}
async function assertSlugAvailable(ctx: MutationCtx, slug: string, current?: Id<"commerce_product_brands">) {
  const found = await ctx.db.query("commerce_product_brands").withIndex("by_slug", q => q.eq("slug", slug)).unique();
  if (found && found._id !== current) throw new ConvexError({ code: "SLUG_EXISTS", message: "A brand already uses this URL slug. Choose another slug." });
}
async function assertLogo(ctx: MutationCtx, id?: Id<"media"> | null) {
  if (!id) return;
  const media = await requireAttachableMedia(ctx, id);
  if (!media.mimeType.startsWith("image/")) invalid("A brand logo must be an image.");
}
/** Assignment validates the local database identity. Archiving a brand preserves
 * existing assignments; it cannot be assigned to another product until restored. */
export async function requireAssignableBrand(ctx: Pick<QueryCtx, "db">, id: Id<"commerce_product_brands">) {
  const brand = await ctx.db.get("commerce_product_brands", id);
  if (!brand || brand.status === "archived") throw new ConvexError({ code: "BRAND_UNAVAILABLE", message: "The selected brand is missing or archived." });
  return brand;
}
export const list: RegisteredQuery<"public", { paginationOpts: PaginationOptions }, Promise<PaginationResult<Doc<"commerce_product_brands">>>> = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(brandDocument), isDone: v.boolean(), continueCursor: v.string(), splitCursor: v.optional(v.union(v.string(), v.null())), pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())) }),
  handler: async (ctx: QueryCtx, args: { paginationOpts: PaginationOptions }): Promise<PaginationResult<Doc<"commerce_product_brands">>> => {
    await requireCommerceEnabled(ctx); await requireCan(ctx, "manage_options");
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 48) invalid("Request 1–48 brands per page.");
    return await ctx.db.query("commerce_product_brands").withIndex("by_sort").paginate({ ...args.paginationOpts, maximumRowsRead: 48, maximumBytesRead: 256 * 1024 });
  },
});
export const get: RegisteredQuery<"public", {brandId: Id<"commerce_product_brands">}, Promise<Doc<"commerce_product_brands"> | null>> = query({
  args: { brandId: v.id("commerce_product_brands") }, returns: v.union(brandDocument, v.null()),
  handler: async (ctx: QueryCtx, { brandId }: {brandId: Id<"commerce_product_brands">}): Promise<Doc<"commerce_product_brands"> | null> => { await requireCommerceEnabled(ctx); await requireCan(ctx, "manage_options"); return await ctx.db.get("commerce_product_brands", brandId); },
});
export const create: RegisteredMutation<"public", CreateBrandArgs, Promise<Id<"commerce_product_brands">>> = mutation({
  args: { name: v.string(), slug: v.optional(v.string()), description: v.optional(v.string()), logoMediaId: v.optional(v.id("media")), status: v.optional(brandStatus), sortOrder: v.optional(v.number()) },
  returns: v.id("commerce_product_brands"),
  handler: async (ctx: MutationCtx, args: CreateBrandArgs): Promise<Id<"commerce_product_brands">> => {
    await requireCommerceEnabled(ctx); await requireCan(ctx, "manage_options");
    const data = normalizeBrand(args); await assertSlugAvailable(ctx, data.slug); await assertLogo(ctx, args.logoMediaId);
    const now = Date.now();
    const brandId = await insertWithMediaReferences(ctx, "commerce_product_brands", { ...data, logoMediaId: args.logoMediaId, status: args.status ?? "draft", createdAt: now, updatedAt: now });
    await emitEvent(ctx, BRAND_EVENTS.CREATED, SYSTEM.BRAND, { brandId, name: data.name, status: args.status ?? "draft" });
    return brandId;
  },
});
export const update: RegisteredMutation<"public", UpdateBrandArgs, Promise<Id<"commerce_product_brands">>> = mutation({
  args: { brandId: v.id("commerce_product_brands"), name: v.optional(v.string()), slug: v.optional(v.string()), description: v.optional(v.string()), logoMediaId: v.optional(v.union(v.id("media"), v.null())), status: v.optional(brandStatus), sortOrder: v.optional(v.number()) },
  returns: v.id("commerce_product_brands"),
  handler: async (ctx: MutationCtx, args: UpdateBrandArgs): Promise<Id<"commerce_product_brands">> => {
    await requireCommerceEnabled(ctx); await requireCan(ctx, "manage_options");
    const previous = await ctx.db.get("commerce_product_brands", args.brandId);
    if (!previous) throw new ConvexError({ code: "NOT_FOUND", message: "Brand not found." });
    const data = normalizeBrand({ name: args.name ?? previous.name, slug: args.slug ?? previous.slug, description: args.description ?? previous.description, sortOrder: args.sortOrder ?? previous.sortOrder });
    await assertSlugAvailable(ctx, data.slug, args.brandId); await assertLogo(ctx, args.logoMediaId);
    await patchWithMediaReferences(ctx, "commerce_product_brands", args.brandId, { ...data, status: args.status ?? previous.status, ...(args.logoMediaId === undefined ? {} : { logoMediaId: args.logoMediaId ?? undefined }), updatedAt: Date.now() });
    await emitEvent(ctx, BRAND_EVENTS.UPDATED, SYSTEM.BRAND, { brandId: args.brandId, changedFields: Object.keys(args).filter(key => key !== "brandId") });
    return args.brandId;
  },
});
