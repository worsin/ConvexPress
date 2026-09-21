// @ts-nocheck
/**
 * Commerce Reviews — Mutations
 *
 * Ported from VexCart reviews.ts mutations, adapted to ConvexPress
 * schema (commerce_review_* tables) and auth patterns.
 *
 * Functions:
 *   Customer:
 *   - submit              Submit a product review (with verified purchase check)
 *   - update              Update own review (resets to pending on content change)
 *   - remove              Delete own review (cascades helpful votes)
 *   - voteHelpful         Toggle helpful vote on a review
 *
 *   Admin Moderation:
 *   - approve             Approve a review
 *   - reject              Reject a review (with optional reason)
 *   - markSpam            Mark a review as spam
 *   - bulkApprove         Bulk approve reviews
 *   - bulkReject          Bulk reject reviews
 *   - adminDelete         Admin delete a review (cascades helpful votes)
 */

import { ConvexError, v } from "convex/values";

import { mutation } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { requireCommerceReviewsEnabled } from "./helpers";
import { commerceReviewStatusValidator } from "../schema/commerceReviews";
import { requirePluginEnabled } from "../helpers/plugins";
import { patchDynamicWithMediaReferences, deleteDynamicWithMediaReferences } from "../media/attachmentGuard";


import {insertCountedReview, validateReviewRating} from "./ratingIndex";

// ============================================
// CUSTOMER MUTATIONS
// ============================================

/**
 * Submit a review
 */
export const submit = mutation({
  args: {
    productId: v.id("commerce_products"),
    rating: v.number(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
  },
  returns: v.id("commerce_review_items"),
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceReviews");
    await requireCommerceReviewsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "auth_required",
        message: "Authentication required to submit a review.",
      });
    }

    validateReviewRating(args.rating);
    // Validate rating
    if (args.rating < 1 || args.rating > 5) {
      throw new ConvexError({
        code: "invalid_rating",
        message: "Rating must be between 1 and 5.",
      });
    }

    // Check for existing review
    const existingReview = await ctx.db
      .query("commerce_review_items")
      .withIndex("by_product_user", (q: any) =>
        q.eq("productId", args.productId).eq("userId", user._id),
      )
      .first();

    if (existingReview) {
      throw new ConvexError({
        code: "duplicate_review",
        message: "You have already reviewed this product.",
      });
    }

    // Check for verified purchase
    let isVerifiedPurchase = false;
    let orderId: any = undefined;

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
        isVerifiedPurchase = true;
        orderId = order._id;
        break;
      }
    }

    const now = Date.now();

    const reviewId = await insertCountedReview(ctx, {
      productId: args.productId,
      userId: user._id,
      orderId,
      rating: Math.round(args.rating),
      title: args.title?.trim(),
      content: args.content?.trim(),
      status: "pending",
      helpfulCount: 0,
      isVerifiedPurchase,
      createdAt: now,
      updatedAt: now,
    });

    return reviewId;
  },
});

/**
 * Update a review (own review only)
 */
export const update = mutation({
  args: {
    reviewId: v.id("commerce_review_items"),
    rating: v.optional(v.number()),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
  },
  returns: v.id("commerce_review_items"),
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceReviews");
    await requireCommerceReviewsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "auth_required",
        message: "Authentication required.",
      });
    }

    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new ConvexError({
        code: "not_found",
        message: "Review not found.",
      });
    }

    if (review.userId !== user._id) {
      throw new ConvexError({
        code: "unauthorized",
        message: "You can only update your own reviews.",
      });
    }

    if(args.rating!==undefined)validateReviewRating(args.rating);
    // Validate rating if provided
    if (args.rating !== undefined && (args.rating < 1 || args.rating > 5)) {
      throw new ConvexError({
        code: "invalid_rating",
        message: "Rating must be between 1 and 5.",
      });
    }

    const updates: any = { updatedAt: Date.now() };
    if (args.rating !== undefined) updates.rating = Math.round(args.rating);
    if (args.title !== undefined) updates.title = args.title.trim();
    if (args.content !== undefined) updates.content = args.content.trim();

    // Reset to pending if content changes (re-moderation)
    if (args.title !== undefined || args.content !== undefined || (args.rating !== undefined && args.rating !== review.rating)) {
      updates.status = "pending";
    }

    await patchDynamicWithMediaReferences(ctx, args.reviewId, updates);
    return args.reviewId;
  },
});

/**
 * Delete a review (own review only)
 */
export const remove = mutation({
  args: { reviewId: v.id("commerce_review_items") },
  returns: v.id("commerce_review_items"),
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceReviews");
    await requireCommerceReviewsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "auth_required",
        message: "Authentication required.",
      });
    }

    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new ConvexError({
        code: "not_found",
        message: "Review not found.",
      });
    }

    if (review.userId !== user._id) {
      throw new ConvexError({
        code: "unauthorized",
        message: "You can only delete your own reviews.",
      });
    }

    // Delete helpful votes
    const votes = await ctx.db
      .query("commerce_review_helpful_votes")
      .withIndex("by_review", (q: any) => q.eq("reviewId", args.reviewId))
      .collect();

    for (const vote of votes) {
      await deleteDynamicWithMediaReferences(ctx, vote._id);
    }

    // Delete review
    await deleteDynamicWithMediaReferences(ctx, args.reviewId);


    return args.reviewId;
  },
});

/**
 * Vote a review as helpful (toggle)
 */
export const voteHelpful = mutation({
  args: { reviewId: v.id("commerce_review_items") },
  returns: v.object({ voted: v.boolean() }),
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceReviews");
    await requireCommerceReviewsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError({
        code: "auth_required",
        message: "Authentication required to vote.",
      });
    }

    const review = await ctx.db.get(args.reviewId);
    if (!review || review.status !== "approved") {
      throw new ConvexError({
        code: "not_found",
        message: "Review not found.",
      });
    }

    // Check if already voted
    const existingVote = await ctx.db
      .query("commerce_review_helpful_votes")
      .withIndex("by_review_user", (q: any) =>
        q.eq("reviewId", args.reviewId).eq("userId", user._id),
      )
      .unique();

    if (existingVote) {
      // Remove vote (toggle off)
      await deleteDynamicWithMediaReferences(ctx, existingVote._id);
      await patchDynamicWithMediaReferences(ctx, args.reviewId, {
        helpfulCount: Math.max(0, (review.helpfulCount || 0) - 1),
      });
      return { voted: false };
    } else {
      // Add vote (toggle on)
      await ctx.db.insert("commerce_review_helpful_votes", {
        reviewId: args.reviewId,
        userId: user._id,
        createdAt: Date.now(),
      });
      await patchDynamicWithMediaReferences(ctx, args.reviewId, {
        helpfulCount: (review.helpfulCount || 0) + 1,
      });
      return { voted: true };
    }
  },
});

// ============================================
// ADMIN MUTATIONS
// ============================================

/**
 * Approve a review (admin)
 */
export const approve = mutation({
  args: { reviewId: v.id("commerce_review_items") },
  returns: v.id("commerce_review_items"),
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceReviews");
    await requireCommerceReviewsEnabled(ctx);
    const moderator = await requireCan(ctx, "commerce.reviews.moderate");

    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new ConvexError({
        code: "not_found",
        message: "Review not found.",
      });
    }

    const now = Date.now();
    await patchDynamicWithMediaReferences(ctx, args.reviewId, {
      status: "approved",
      rejectionReason: undefined,
      moderatedBy: moderator._id,
      moderatedAt: now,
      updatedAt: now,
    });


    return args.reviewId;
  },
});

/**
 * Reject a review (admin)
 */
export const reject = mutation({
  args: {
    reviewId: v.id("commerce_review_items"),
    reason: v.optional(v.string()),
  },
  returns: v.id("commerce_review_items"),
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceReviews");
    await requireCommerceReviewsEnabled(ctx);
    const moderator = await requireCan(ctx, "commerce.reviews.moderate");

    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new ConvexError({
        code: "not_found",
        message: "Review not found.",
      });
    }

    const now = Date.now();
    await patchDynamicWithMediaReferences(ctx, args.reviewId, {
      status: "rejected",
      rejectionReason: args.reason,
      moderatedBy: moderator._id,
      moderatedAt: now,
      updatedAt: now,
    });


    return args.reviewId;
  },
});

/**
 * Mark a review as spam (admin)
 */
export const markSpam = mutation({
  args: { reviewId: v.id("commerce_review_items") },
  returns: v.id("commerce_review_items"),
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceReviews");
    await requireCommerceReviewsEnabled(ctx);
    const moderator = await requireCan(ctx, "commerce.reviews.moderate");

    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new ConvexError({
        code: "not_found",
        message: "Review not found.",
      });
    }

    const now = Date.now();
    await patchDynamicWithMediaReferences(ctx, args.reviewId, {
      status: "spam",
      moderatedBy: moderator._id,
      moderatedAt: now,
      updatedAt: now,
    });


    return args.reviewId;
  },
});

/**
 * Bulk approve reviews (admin)
 */
export const bulkApprove = mutation({
  args: { reviewIds: v.array(v.id("commerce_review_items")) },
  returns: v.object({ approved: v.number() }),
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceReviews");
    await requireCommerceReviewsEnabled(ctx);
    const moderator = await requireCan(ctx, "commerce.reviews.moderate");

    const now = Date.now();
    if(args.reviewIds.length>100)throw new ConvexError({code:"review_batch_limit",message:"Moderate at most 100 reviews at once."});
    let changed=0;

    for (const reviewId of new Set(args.reviewIds)) {
      const review = await ctx.db.get(reviewId);
      if (review) {
        await patchDynamicWithMediaReferences(ctx, reviewId, {
          status: "approved",
          rejectionReason: undefined,
          moderatedBy: moderator._id,
          moderatedAt: now,
          updatedAt: now,
        });
        changed++;
      }
    }


    return { approved: changed };
  },
});

/**
 * Bulk reject reviews (admin)
 */
export const bulkReject = mutation({
  args: {
    reviewIds: v.array(v.id("commerce_review_items")),
    reason: v.optional(v.string()),
  },
  returns: v.object({ rejected: v.number() }),
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceReviews");
    await requireCommerceReviewsEnabled(ctx);
    const moderator = await requireCan(ctx, "commerce.reviews.moderate");

    const now = Date.now();
    if(args.reviewIds.length>100)throw new ConvexError({code:"review_batch_limit",message:"Moderate at most 100 reviews at once."});
    let changed=0;

    for (const reviewId of new Set(args.reviewIds)) {
      const review = await ctx.db.get(reviewId);
      if (review) {
        await patchDynamicWithMediaReferences(ctx, reviewId, {
          status: "rejected",
          rejectionReason: args.reason,
          moderatedBy: moderator._id,
          moderatedAt: now,
          updatedAt: now,
        });
        changed++;
      }
    }


    return { rejected: changed };
  },
});

/**
 * Delete a review (admin)
 */
export const adminDelete = mutation({
  args: { reviewId: v.id("commerce_review_items") },
  returns: v.id("commerce_review_items"),
  handler: async (ctx: any, args: any) => {
    await requirePluginEnabled(ctx, "commerceReviews");
    await requireCommerceReviewsEnabled(ctx);
    await requireCan(ctx, "commerce.reviews.delete");

    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new ConvexError({
        code: "not_found",
        message: "Review not found.",
      });
    }

    // Delete helpful votes
    const votes = await ctx.db
      .query("commerce_review_helpful_votes")
      .withIndex("by_review", (q: any) => q.eq("reviewId", args.reviewId))
      .collect();

    for (const vote of votes) {
      await deleteDynamicWithMediaReferences(ctx, vote._id);
    }

    // Delete review
    await deleteDynamicWithMediaReferences(ctx, args.reviewId);


    return args.reviewId;
  },
});
