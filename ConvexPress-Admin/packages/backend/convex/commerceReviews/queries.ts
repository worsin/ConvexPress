/**
 * Commerce Reviews — Queries
 *
 * Ported from VexCart reviews.ts queries, adapted to ConvexPress
 * schema (commerce_review_* tables) and auth patterns.
 *
 * Functions:
 *   Public:
 *   - getByProduct        Approved reviews for a product (with pagination & sorting)
 *   - getProductRating    Aggregate rating stats & distribution for a product
 *   - getMyReviews        Current user's own reviews (enriched with product data)
 *   - canReview           Check if user can review a product (duplicate & purchase checks)
 *   - hasVoted            Check if user has voted on a specific review
 *
 *   Admin:
 *   - getPendingReviews   Pending moderation queue
 *   - listAll             All reviews with status/product/rating filters
 *   - getStats            Dashboard stats (counts, average, recent)
 */

import type { RegisteredQuery } from "convex/server";
import { publicReviewArgs, publicReviewPageValidator, readPublicProductReviews, type PublicReviewArgs, type PublicReviewPage } from "./publicFeed";
import {readProductRatingSummary} from "./ratingIndex";
import {evaluateMembershipAccess} from "../membership/access";
import { v } from "convex/values";

import { query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { requireCommerceReviewsEnabled } from "./helpers";
import { commerceReviewStatusValidator } from "../schema/commerceReviews";
import { isPluginEnabled } from "../helpers/plugins";

/** "First Last" from the stored name parts; empty when neither is set. */
function fullName(user: Doc<"users"> | null): string {
  return [user?.firstName, user?.lastName].filter((part) => part).join(" ");
}

// ============================================
// PUBLIC QUERIES (Website)
// ============================================

/**
 * Get reviews for a product (approved only)
 */
export const getByProduct: RegisteredQuery<"public", PublicReviewArgs, PublicReviewPage> = query({
  args: publicReviewArgs,
  returns: publicReviewPageValidator,
  handler: readPublicProductReviews,
});

/**
 * Get product rating statistics
 */
export const getProductRating = query({
  args: { productId: v.id("commerce_products") },
  returns:v.union(v.null(),v.object({averageRating:v.number(),totalReviews:v.number(),distribution:v.record(v.string(),v.number())})),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceReviews"))) return null;
    await requireCommerceReviewsEnabled(ctx);

    const product=await ctx.db.get("commerce_products",args.productId);
    if(!product||product.status!=="publish"||(product.publishedAt!==undefined&&product.publishedAt>Date.now()))return null;
    for(const target of [{resourceType:"product" as const,resourceIdOrKey:String(product._id)},{resourceType:"route" as const,resourceIdOrKey:`/products/${encodeURIComponent(product.slug)}`}])
      if(!(await evaluateMembershipAccess(ctx,target)).allowed)return null;
    const summary=await readProductRatingSummary(ctx,args.productId);
    return summary?{averageRating:summary.average,totalReviews:summary.count,distribution:summary.distribution}:null;
  },
});

/**
 * Get a user's reviews
 */
export const getMyReviews = query({
  args: {},
  returns: v.union(v.null(), v.array(v.object({
    productName: v.string(),
    productSlug: v.optional(v.string()),
    productImage: v.optional(v.id("media")),
    _id: v.id("commerce_review_items"),
    _creationTime: v.number(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    moderatedBy: v.optional(v.id("users")),
    moderatedAt: v.optional(v.number()),
    orderId: v.optional(v.id("commerce_orders")),
    rejectionReason: v.optional(v.string()),
    userId: v.id("users"),
    updatedAt: v.number(),
    createdAt: v.number(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("spam"), v.literal("rejected"), v.literal("deleted")),
    rating: v.number(),
    productId: v.id("commerce_products"),
    isVerifiedPurchase: v.boolean(),
    helpfulCount: v.number(),
  }))),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "commerceReviews"))) return null;
    await requireCommerceReviewsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    const reviews = await ctx.db
      .query("commerce_review_items")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Enrich with product data
    const enriched = await Promise.all(
      reviews.map(async (review) => {
        const product = await ctx.db.get(review.productId);
        return {
          ...review,
          productName: product?.title || "Unknown Product",
          productSlug: product?.slug,
          productImage: product?.featuredMediaId,
        };
      }),
    );

    return enriched.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Check if user can review a product
 */
export const canReview = query({
  args: { productId: v.id("commerce_products") },
  returns: v.union(v.null(), v.object({
    canReview: v.boolean(),
    reason: v.string(),
    existingReviewId: v.optional(v.null()),
    isVerifiedPurchase: v.optional(v.null()),
    orderId: v.optional(v.null()),
  }), v.object({
    canReview: v.boolean(),
    reason: v.string(),
    existingReviewId: v.id("commerce_review_items"),
    isVerifiedPurchase: v.optional(v.null()),
    orderId: v.optional(v.null()),
  }), v.object({
    canReview: v.boolean(),
    isVerifiedPurchase: v.boolean(),
    orderId: v.id("commerce_orders"),
    reason: v.optional(v.null()),
    existingReviewId: v.optional(v.null()),
  }), v.object({
    canReview: v.boolean(),
    isVerifiedPurchase: v.boolean(),
    reason: v.optional(v.null()),
    existingReviewId: v.optional(v.null()),
    orderId: v.optional(v.null()),
  })),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceReviews"))) return null;
    await requireCommerceReviewsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      return { canReview: false, reason: "Please sign in to write a review" };
    }

    // Check if already reviewed
    const existingReview = await ctx.db
      .query("commerce_review_items")
      .withIndex("by_product_user", (q) =>
        q.eq("productId", args.productId).eq("userId", user._id),
      )
      .first();

    if (existingReview) {
      return {
        canReview: false,
        reason: "You have already reviewed this product",
        existingReviewId: existingReview._id,
      };
    }

    // Check if user has purchased the product
    const orders = await ctx.db
      .query("commerce_orders")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("status"), "completed"))
      .collect();

    for (const order of orders) {
      const item = await ctx.db
        .query("commerce_order_items")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .filter((q) => q.eq(q.field("productId"), args.productId))
        .first();

      if (item) {
        return {
          canReview: true,
          isVerifiedPurchase: true,
          orderId: order._id,
        };
      }
    }

    // Allow non-verified reviews optionally
    return { canReview: true, isVerifiedPurchase: false };
  },
});

/**
 * Check if user has voted on a review
 */
export const hasVoted = query({
  args: { reviewId: v.id("commerce_review_items") },
  returns: v.union(v.boolean(), v.null()),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceReviews"))) return null;
    await requireCommerceReviewsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      return false;
    }

    const vote = await ctx.db
      .query("commerce_review_helpful_votes")
      .withIndex("by_review_user", (q) =>
        q.eq("reviewId", args.reviewId).eq("userId", user._id),
      )
      .unique();

    return !!vote;
  },
});

// ============================================
// ADMIN QUERIES
// ============================================

/**
 * Get pending reviews for moderation
 */
export const getPendingReviews = query({
  args: {
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  returns: v.union(v.null(), v.object({
    reviews: v.array(v.object({
      userName: v.string(),
      userEmail: v.optional(v.string()),
      productName: v.string(),
      productSlug: v.optional(v.string()),
      _id: v.id("commerce_review_items"),
      _creationTime: v.number(),
      title: v.optional(v.string()),
      content: v.optional(v.string()),
      moderatedBy: v.optional(v.id("users")),
      moderatedAt: v.optional(v.number()),
      orderId: v.optional(v.id("commerce_orders")),
      rejectionReason: v.optional(v.string()),
      userId: v.id("users"),
      updatedAt: v.number(),
      createdAt: v.number(),
      status: v.union(v.literal("pending"), v.literal("approved"), v.literal("spam"), v.literal("rejected"), v.literal("deleted")),
      rating: v.number(),
      productId: v.id("commerce_products"),
      isVerifiedPurchase: v.boolean(),
      helpfulCount: v.number(),
    })),
    total: v.number(),
    hasMore: v.boolean(),
  })),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceReviews"))) return null;
    await requireCommerceReviewsEnabled(ctx);
    await requireCan(ctx, "commerce.reviews.moderate");

    const limit = args.limit || 20;
    const offset = args.offset || 0;

    const reviews = await ctx.db
      .query("commerce_review_items")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    // Sort by newest first
    reviews.sort((a, b) => b.createdAt - a.createdAt);

    // Paginate
    const paginated = reviews.slice(offset, offset + limit);

    // Enrich with user and product data
    const enriched = await Promise.all(
      paginated.map(async (review) => {
        const [user, product] = await Promise.all([
          review.userId ? ctx.db.get(review.userId) : null,
          ctx.db.get(review.productId),
        ]);

        return {
          ...review,
          userName:
            user?.displayName || fullName(user) || user?.email || "Anonymous",
          userEmail: user?.email,
          productName: product?.title || "Unknown Product",
          productSlug: product?.slug,
        };
      }),
    );

    return {
      reviews: enriched,
      total: reviews.length,
      hasMore: offset + limit < reviews.length,
    };
  },
});

/**
 * Get all reviews with filters (admin)
 */
export const listAll = query({
  args: {
    status: v.optional(commerceReviewStatusValidator),
    productId: v.optional(v.id("commerce_products")),
    minRating: v.optional(v.number()),
    maxRating: v.optional(v.number()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  returns: v.union(v.null(), v.object({
    reviews: v.array(v.object({
      userName: v.string(),
      userEmail: v.optional(v.string()),
      productName: v.string(),
      productSlug: v.optional(v.string()),
      _id: v.id("commerce_review_items"),
      _creationTime: v.number(),
      title: v.optional(v.string()),
      content: v.optional(v.string()),
      moderatedBy: v.optional(v.id("users")),
      moderatedAt: v.optional(v.number()),
      orderId: v.optional(v.id("commerce_orders")),
      rejectionReason: v.optional(v.string()),
      userId: v.id("users"),
      updatedAt: v.number(),
      createdAt: v.number(),
      status: v.union(v.literal("pending"), v.literal("approved"), v.literal("spam"), v.literal("rejected"), v.literal("deleted")),
      rating: v.number(),
      productId: v.id("commerce_products"),
      isVerifiedPurchase: v.boolean(),
      helpfulCount: v.number(),
    })),
    total: v.number(),
    hasMore: v.boolean(),
  })),
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceReviews"))) return null;
    await requireCommerceReviewsEnabled(ctx);
    await requireCan(ctx, "commerce.reviews.view");

    const limit = args.limit || 50;
    const offset = args.offset || 0;

    const status = args.status;
    const reviewsQuery = status
      ? ctx.db
          .query("commerce_review_items")
          .withIndex("by_status", (q) => q.eq("status", status))
      : ctx.db.query("commerce_review_items");

    let reviews = await reviewsQuery.collect();

    // Apply additional filters
    if (args.productId) {
      reviews = reviews.filter((r) => r.productId === args.productId);
    }
    const { minRating, maxRating } = args;
    if (minRating !== undefined) {
      reviews = reviews.filter((r) => r.rating >= minRating);
    }
    if (maxRating !== undefined) {
      reviews = reviews.filter((r) => r.rating <= maxRating);
    }

    // Sort by newest
    reviews.sort((a, b) => b.createdAt - a.createdAt);

    // Paginate
    const paginated = reviews.slice(offset, offset + limit);

    // Enrich with user and product data
    const enriched = await Promise.all(
      paginated.map(async (review) => {
        const [user, product] = await Promise.all([
          review.userId ? ctx.db.get(review.userId) : null,
          ctx.db.get(review.productId),
        ]);

        return {
          ...review,
          userName:
            user?.displayName || fullName(user) || user?.email || "Anonymous",
          userEmail: user?.email,
          productName: product?.title || "Unknown Product",
          productSlug: product?.slug,
        };
      }),
    );

    return {
      reviews: enriched,
      total: reviews.length,
      hasMore: offset + limit < reviews.length,
    };
  },
});

/**
 * Get review statistics (admin dashboard)
 */
export const getStats = query({
  args: {},
  returns: v.union(v.null(), v.object({
    total: v.number(),
    pending: v.number(),
    approved: v.number(),
    rejected: v.number(),
    spam: v.number(),
    averageRating: v.number(),
    recentReviews: v.number(),
  })),
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "commerceReviews"))) return null;
    await requireCommerceReviewsEnabled(ctx);
    await requireCan(ctx, "commerce.reviews.view");

    const allReviews = await ctx.db.query("commerce_review_items").collect();

    const pending = allReviews.filter(
      (r) => r.status === "pending",
    ).length;
    const approved = allReviews.filter(
      (r) => r.status === "approved",
    ).length;
    const rejected = allReviews.filter(
      (r) => r.status === "rejected",
    ).length;
    const spam = allReviews.filter((r) => r.status === "spam").length;

    const approvedReviews = allReviews.filter(
      (r) => r.status === "approved",
    );
    const avgRating =
      approvedReviews.length > 0
        ? approvedReviews.reduce((sum: number, r) => sum + r.rating, 0) /
          approvedReviews.length
        : 0;

    // Count reviews from last 7 days
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentReviews = allReviews.filter(
      (r) => r.createdAt > weekAgo,
    ).length;

    return {
      total: allReviews.length,
      pending,
      approved,
      rejected,
      spam,
      averageRating: avgRating,
      recentReviews,
    };
  },
});
