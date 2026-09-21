import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import { ConvexError, v, type Validator } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isPluginEnabled } from "../helpers/plugins";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { evaluateMembershipAccess } from "../membership/access";

export type ReviewSort = "newest" | "oldest" | "highest" | "lowest" | "helpful";
export type PublicReview = {
  state: "review";
  _id: Id<"commerce_review_items">;
  rating: number;
  title?: string;
  content?: string;
  isVerifiedPurchase: boolean;
  helpfulCount: number;
  userName: string;
  createdAt: number;
};
export type PublicReviewEntry = PublicReview | { state: "unavailable" };
export type PublicReviewPage = {
  page: PublicReviewEntry[];
  isDone: boolean;
  continueCursor: string;
  splitCursor?: string | null;
  pageStatus?: "SplitRecommended" | "SplitRequired" | null;
};
export type PublicReviewArgs = {
  instanceKey: string;
  productId: Id<"commerce_products">;
  sortBy?: ReviewSort;
  paginationOpts: PaginationOptions;
};
export const publicReviewArgs: {
  instanceKey: Validator<string>;
  productId: Validator<Id<"commerce_products">>;
  sortBy: Validator<ReviewSort | undefined, "optional">;
  paginationOpts: typeof paginationOptsValidator;
} = {
  instanceKey: v.string(), productId: v.id("commerce_products"),
  sortBy: v.optional(v.union(v.literal("newest"), v.literal("oldest"), v.literal("highest"), v.literal("lowest"), v.literal("helpful"))),
  paginationOpts: paginationOptsValidator,
};
export const publicReviewPageValidator: Validator<PublicReviewPage, "required", keyof PublicReviewPage> = v.object({
  page: v.array(v.union(v.object({ state: v.literal("unavailable") }), v.object({
    state: v.literal("review"), _id: v.id("commerce_review_items"), rating: v.number(),
    title: v.optional(v.string()), content: v.optional(v.string()), isVerifiedPurchase: v.boolean(),
    helpfulCount: v.number(), userName: v.string(), createdAt: v.number(),
  }))),
  isDone: v.boolean(), continueCursor: v.string(), splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())),
});

/** A product's review text has the same publication and membership authority as
 * the product. Every continuation rechecks it; the cursor grants no access. */
export async function readPublicProductReviews(ctx: QueryCtx, args: PublicReviewArgs): Promise<PublicReviewPage> {
  const opts = args.paginationOpts;
  if (!Number.isSafeInteger(opts.numItems) || opts.numItems < 1 || opts.numItems > 24 ||
      (opts.cursor?.length ?? 0) > 8192 || (opts.endCursor?.length ?? 0) > 8192)
    throw new ConvexError({ code: "invalid_review_page", message: "Invalid review page." });
  const unavailable: PublicReviewPage = { page: [{ state: "unavailable" }], isDone: true, continueCursor: "" };
  if (!args.instanceKey || args.instanceKey.length > 256) return unavailable;
  const budget = new RequestReadLedger();
  budget.beforeRead();
  const identity = budget.record(await ctx.db.query("convexpress_siteIdentity").withIndex("by_identity_key", q => q.eq("identityKey", "site-identity")).unique());
  if (identity?.instanceKey !== args.instanceKey || !(await isPluginEnabled(ctx, "commerce", budget)) || !(await isPluginEnabled(ctx, "commerceReviews", budget))) return unavailable;
  budget.beforeRead();
  const product = budget.record(await ctx.db.get("commerce_products", args.productId));
  if (!product || product.status !== "publish" || (product.publishedAt !== undefined && (!Number.isFinite(product.publishedAt) || product.publishedAt > Date.now()))) return unavailable;
  for (const resource of [
    { resourceType: "product" as const, resourceIdOrKey: String(product._id) },
    { resourceType: "route" as const, resourceIdOrKey: `/products/${encodeURIComponent(product.slug)}` },
  ]) if (!(await evaluateMembershipAccess(ctx, resource, budget)).allowed) return unavailable;
  const sort = args.sortBy ?? "newest";
  const index = sort === "highest" || sort === "lowest" ? "by_product_status_rating" : sort === "helpful" ? "by_product_status_helpful" : "by_product_status_created";
  budget.beforeRead();
  const result = await ctx.db.query("commerce_review_items")
    .withIndex(index, q => q.eq("productId", args.productId).eq("status", "approved"))
    .order(sort === "oldest" || sort === "lowest" ? "asc" : "desc")
    .paginate({ ...opts, maximumRowsRead: 24, maximumBytesRead: 256 * 1024 });
  const page: PublicReview[] = [];
  for (const review of result.page) {
    budget.record(review);
    if (!Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5 || !Number.isFinite(review.createdAt)) continue;
    budget.beforeRead();
    const author = budget.record(await ctx.db.get("users", review.userId));
    page.push({ state: "review", _id: review._id, rating: review.rating,
      ...(review.title ? { title: review.title.slice(0, 240) } : {}),
      ...(review.content ? { content: review.content.slice(0, 12000) } : {}),
      isVerifiedPurchase: review.isVerifiedPurchase,
      helpfulCount: Number.isSafeInteger(review.helpfulCount) && review.helpfulCount >= 0 ? review.helpfulCount : 0,
      userName: author?.displayName?.trim().slice(0, 80) || "A reader", createdAt: review.createdAt,
    });
  }
  // Preserve split cursors even when a page contains only invalid legacy rows.
  return { ...result, page };
}
