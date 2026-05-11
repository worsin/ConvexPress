// @ts-nocheck
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

import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { requireCommerceReviewsEnabled } from "./helpers";
import { commerceReviewStatusValidator } from "../schema/commerceReviews";
import { isPluginEnabled } from "../helpers/plugins";

// ============================================
// PUBLIC QUERIES (Website)
// ============================================

/**
 * Get reviews for a product (approved only)
 */
export const getByProduct = query({
  args: {
    productId: v.id("commerce_products"),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    sortBy: v.optional(
      v.union(
        v.literal("newest"),
        v.literal("oldest"),
        v.literal("highest"),
        v.literal("lowest"),
        v.literal("helpful"),
      ),
    ),
  },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "commerceReviews"))) return null;
    await requireCommerceReviewsEnabled(ctx);

    const limit = args.limit || 10;
    const offset = args.offset || 0;

    // Get approved reviews for the product
    const reviews = await ctx.db
      .query("commerce_review_items")
      .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
      .filter((q: any) => q.eq(q.field("status"), "approved"))
      .collect();

    // Sort based on preference
    let sorted = [...reviews];
    switch (args.sortBy) {
      case "oldest":
        sorted.sort((a: any, b: any) => a.createdAt - b.createdAt);
        break;
      case "highest":
        sorted.sort((a: any, b: any) => b.rating - a.rating);
        break;
      case "lowest":
        sorted.sort((a: any, b: any) => a.rating - b.rating);
        break;
      case "helpful":
        sorted.sort(
          (a: any, b: any) => (b.helpfulCount || 0) - (a.helpfulCount || 0),
        );
        break;
      case "newest":
      default:
        sorted.sort((a: any, b: any) => b.createdAt - a.createdAt);
        break;
    }

    // Paginate
    const paginated = sorted.slice(offset, offset + limit);

    // Enrich with user data
    const enriched = await Promise.all(
      paginated.map(async (review: any) => {
        const user = review.userId
          ? await ctx.db.get(review.userId)
          : null;

        return {
          ...review,
          userName: user?.displayName || user?.name || "Anonymous",
          userAvatar: user?.imageUrl || user?.image,
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
 * Get product rating statistics
 */
export const getProductRating = query({
  args: { productId: v.id("commerce_products") },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "commerceReviews"))) return null;
    await requireCommerceReviewsEnabled(ctx);

    const reviews = await ctx.db
      .query("commerce_review_items")
      .withIndex("by_product", (q: any) => q.eq("productId", args.productId))
      .filter((q: any) => q.eq(q.field("status"), "approved"))
      .collect();

    if (reviews.length === 0) {
      return {
        averageRating: 0,
        totalReviews: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
    }

    const totalRating = reviews.reduce(
      (sum: number, r: any) => sum + r.rating,
      0,
    );
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach((r: any) => {
      distribution[r.rating as keyof typeof distribution]++;
    });

    return {
      averageRating: totalRating / reviews.length,
      totalReviews: reviews.length,
      distribution,
    };
  },
});

/**
 * Get a user's reviews
 */
export const getMyReviews = query({
  args: {},
  handler: async (ctx: any) => {
    if (!(await isPluginEnabled(ctx, "commerceReviews"))) return null;
    await requireCommerceReviewsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    const reviews = await ctx.db
      .query("commerce_review_items")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    // Enrich with product data
    const enriched = await Promise.all(
      reviews.map(async (review: any) => {
        const product = await ctx.db.get(review.productId);
        return {
          ...review,
          productName: product?.title || "Unknown Product",
          productSlug: product?.slug,
          productImage: product?.featuredMediaId,
        };
      }),
    );

    return enriched.sort((a: any, b: any) => b.createdAt - a.createdAt);
  },
});

/**
 * Check if user can review a product
 */
export const canReview = query({
  args: { productId: v.id("commerce_products") },
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "commerceReviews"))) return null;
    await requireCommerceReviewsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      return { canReview: false, reason: "Please sign in to write a review" };
    }

    // Check if already reviewed
    const existingReview = await ctx.db
      .query("commerce_review_items")
      .withIndex("by_product_user", (q: any) =>
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
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .filter((q: any) => q.eq(q.field("status"), "completed"))
      .collect();

    for (const order of orders) {
      const item = await ctx.db
        .query("commerce_order_items")
        .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
        .filter((q: any) => q.eq(q.field("productId"), args.productId))
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
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "commerceReviews"))) return null;
    await requireCommerceReviewsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      return false;
    }

    const vote = await ctx.db
      .query("commerce_review_helpful_votes")
      .withIndex("by_review_user", (q: any) =>
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
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "commerceReviews"))) return null;
    await requireCommerceReviewsEnabled(ctx);
    await requireCan(ctx, "commerce.reviews.moderate");

    const limit = args.limit || 20;
    const offset = args.offset || 0;

    const reviews = await ctx.db
      .query("commerce_review_items")
      .withIndex("by_status", (q: any) => q.eq("status", "pending"))
      .collect();

    // Sort by newest first
    reviews.sort((a: any, b: any) => b.createdAt - a.createdAt);

    // Paginate
    const paginated = reviews.slice(offset, offset + limit);

    // Enrich with user and product data
    const enriched = await Promise.all(
      paginated.map(async (review: any) => {
        const [user, product] = await Promise.all([
          review.userId ? ctx.db.get(review.userId) : null,
          ctx.db.get(review.productId),
        ]);

        return {
          ...review,
          userName:
            user?.displayName || user?.name || user?.email || "Anonymous",
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
  handler: async (ctx: any, args: any) => {
    if (!(await isPluginEnabled(ctx, "commerceReviews"))) return null;
    await requireCommerceReviewsEnabled(ctx);
    await requireCan(ctx, "commerce.reviews.view");

    const limit = args.limit || 50;
    const offset = args.offset || 0;

    const reviewsQuery = args.status
      ? ctx.db
          .query("commerce_review_items")
          .withIndex("by_status", (q: any) => q.eq("status", args.status))
      : ctx.db.query("commerce_review_items");

    let reviews = await reviewsQuery.collect();

    // Apply additional filters
    if (args.productId) {
      reviews = reviews.filter((r: any) => r.productId === args.productId);
    }
    if (args.minRating !== undefined) {
      reviews = reviews.filter((r: any) => r.rating >= args.minRating);
    }
    if (args.maxRating !== undefined) {
      reviews = reviews.filter((r: any) => r.rating <= args.maxRating);
    }

    // Sort by newest
    reviews.sort((a: any, b: any) => b.createdAt - a.createdAt);

    // Paginate
    const paginated = reviews.slice(offset, offset + limit);

    // Enrich with user and product data
    const enriched = await Promise.all(
      paginated.map(async (review: any) => {
        const [user, product] = await Promise.all([
          review.userId ? ctx.db.get(review.userId) : null,
          ctx.db.get(review.productId),
        ]);

        return {
          ...review,
          userName:
            user?.displayName || user?.name || user?.email || "Anonymous",
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
  handler: async (ctx: any) => {
    if (!(await isPluginEnabled(ctx, "commerceReviews"))) return null;
    await requireCommerceReviewsEnabled(ctx);
    await requireCan(ctx, "commerce.reviews.view");

    const allReviews = await ctx.db.query("commerce_review_items").collect();

    const pending = allReviews.filter(
      (r: any) => r.status === "pending",
    ).length;
    const approved = allReviews.filter(
      (r: any) => r.status === "approved",
    ).length;
    const rejected = allReviews.filter(
      (r: any) => r.status === "rejected",
    ).length;
    const spam = allReviews.filter((r: any) => r.status === "spam").length;

    const approvedReviews = allReviews.filter(
      (r: any) => r.status === "approved",
    );
    const avgRating =
      approvedReviews.length > 0
        ? approvedReviews.reduce((sum: number, r: any) => sum + r.rating, 0) /
          approvedReviews.length
        : 0;

    // Count reviews from last 7 days
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentReviews = allReviews.filter(
      (r: any) => r.createdAt > weekAgo,
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
