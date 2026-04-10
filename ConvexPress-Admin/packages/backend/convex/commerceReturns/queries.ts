// @ts-nocheck
/**
 * Commerce Returns — Queries
 *
 * Ported from VexCart returns.ts queries, adapted to ConvexPress
 * schema (commerce_return_* tables) and auth patterns.
 *
 * Functions:
 *   Public:
 *   - getById              Get return request by ID
 *   - getByReturnNumber    Get return request by return number
 *   - getWithDetails       Get return request with full enriched details
 *   - getByOrder           Get all returns for a specific order
 *   - getUserReturns       Get returns for a specific user
 *   - getMyReturns         Get current user's own returns
 *
 *   Admin:
 *   - list                 List returns with status filter & pagination
 *   - getStats             Return statistics dashboard
 *   - getRefundHealth      Refund pipeline health & stuck refund detection
 *   - getStuckRefunds      List refunds stuck in refund_pending state
 */

import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { requireCommerceReturnsEnabled } from "./helpers";
import { commerceReturnStatusValidator } from "../schema/commerceReturns";

// ============================================
// PUBLIC QUERIES
// ============================================

/**
 * Get return request by ID
 */
export const getById = query({
  args: {
    returnId: v.id("commerce_return_requests"),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceReturnsEnabled(ctx);

    return await ctx.db.get(args.returnId);
  },
});

/**
 * Get return request by return number
 */
export const getByReturnNumber = query({
  args: {
    returnNumber: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceReturnsEnabled(ctx);

    return await ctx.db
      .query("commerce_return_requests")
      .withIndex("by_return_number", (q: any) =>
        q.eq("returnNumber", args.returnNumber),
      )
      .unique();
  },
});

/**
 * Get return request with full details (order, items, user, processor)
 */
export const getWithDetails = query({
  args: {
    returnId: v.id("commerce_return_requests"),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceReturnsEnabled(ctx);

    const returnRequest = await ctx.db.get(args.returnId);
    if (!returnRequest) return null;

    // Get order details
    const order = await ctx.db.get(returnRequest.orderId);

    // Get order items for the return items
    const orderItems = await Promise.all(
      returnRequest.items.map(async (item: any) => {
        const orderItem = await ctx.db.get(item.orderItemId);
        return {
          ...item,
          orderItem,
        };
      }),
    );

    // Get user info if available
    const user = returnRequest.userId
      ? await ctx.db.get(returnRequest.userId)
      : null;

    // Get processor info if available
    const processedBy = returnRequest.processedBy
      ? await ctx.db.get(returnRequest.processedBy)
      : null;

    return {
      ...returnRequest,
      order,
      orderItems,
      user: user
        ? {
            _id: user._id,
            email: user.email,
            name: user.name,
          }
        : null,
      processedByUser: processedBy
        ? {
            _id: processedBy._id,
            email: processedBy.email,
            name: processedBy.name,
          }
        : null,
    };
  },
});

/**
 * Get returns for a specific order
 */
export const getByOrder = query({
  args: {
    orderId: v.id("commerce_orders"),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceReturnsEnabled(ctx);

    return await ctx.db
      .query("commerce_return_requests")
      .withIndex("by_order", (q: any) => q.eq("orderId", args.orderId))
      .collect();
  },
});

/**
 * Get returns for a specific user
 */
export const getUserReturns = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceReturnsEnabled(ctx);

    const limit = args.limit ?? 20;
    return await ctx.db
      .query("commerce_return_requests")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Get current user's own returns (customer-facing)
 */
export const getMyReturns = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceReturnsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      return { returns: [], hasMore: false };
    }

    const limit = args.limit ?? 10;

    const returns = await ctx.db
      .query("commerce_return_requests")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .order("desc")
      .take(limit + 1);

    const hasMore = returns.length > limit;
    if (hasMore) {
      returns.pop();
    }

    // Enrich with order info
    const enriched = await Promise.all(
      returns.map(async (ret: any) => {
        const order = await ctx.db.get(ret.orderId);
        return {
          ...ret,
          orderNumber: order?.orderNumber,
        };
      }),
    );

    return { returns: enriched, hasMore };
  },
});

// ============================================
// ADMIN QUERIES
// ============================================

/**
 * List return requests with filters (admin)
 */
export const list = query({
  args: {
    status: v.optional(commerceReturnStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCan(ctx, "commerce.returns.view");
    await requireCommerceReturnsEnabled(ctx);

    const limit = args.limit ?? 20;

    let q;
    if (args.status) {
      q = ctx.db
        .query("commerce_return_requests")
        .withIndex("by_status", (q: any) => q.eq("status", args.status));
    } else {
      q = ctx.db.query("commerce_return_requests");
    }

    const returns = await q.order("desc").take(limit + 1);

    const hasMore = returns.length > limit;
    if (hasMore) {
      returns.pop();
    }

    // Enrich with order info
    const enriched = await Promise.all(
      returns.map(async (ret: any) => {
        const order = await ctx.db.get(ret.orderId);
        return {
          ...ret,
          orderNumber: order?.orderNumber,
          customerEmail: order?.email,
        };
      }),
    );

    return {
      returns: enriched,
      hasMore,
      nextCursor:
        hasMore && returns.length > 0
          ? returns[returns.length - 1]?._id ?? null
          : null,
    };
  },
});

/**
 * Get return statistics (admin dashboard)
 */
export const getStats = query({
  args: {},
  handler: async (ctx: any) => {
    await requireCan(ctx, "commerce.returns.view");
    await requireCommerceReturnsEnabled(ctx);

    const allReturns = await ctx.db
      .query("commerce_return_requests")
      .collect();

    const requested = allReturns.filter(
      (r: any) => r.status === "requested",
    ).length;
    const approved = allReturns.filter(
      (r: any) => r.status === "approved",
    ).length;
    const rejected = allReturns.filter(
      (r: any) => r.status === "rejected",
    ).length;
    const received = allReturns.filter(
      (r: any) => r.status === "received",
    ).length;
    const refundPending = allReturns.filter(
      (r: any) => r.status === "refund_pending",
    ).length;
    const refunded = allReturns.filter(
      (r: any) => r.status === "refunded",
    ).length;
    const completed = allReturns.filter(
      (r: any) => r.status === "completed",
    ).length;

    // Calculate total refund amount
    const totalRefunded = allReturns
      .filter(
        (r: any) => r.status === "refunded" || r.status === "completed",
      )
      .reduce((sum: number, r: any) => sum + (r.refundAmount || 0), 0);

    // Recent returns (last 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentReturns = allReturns.filter(
      (r: any) => r.createdAt > thirtyDaysAgo,
    );

    // Stuck refunds (in refund_pending for more than 1 hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const stuckRefunds = allReturns.filter(
      (r: any) =>
        r.status === "refund_pending" &&
        (r.refundPendingAt ?? r.updatedAt) < oneHourAgo,
    ).length;

    return {
      total: allReturns.length,
      byStatus: {
        requested,
        approved,
        rejected,
        received,
        refundPending,
        refunded,
        completed,
      },
      pendingAction: requested + approved + received + refundPending,
      totalRefunded,
      recentCount: recentReturns.length,
      stuckRefunds,
    };
  },
});

/**
 * Get refund pipeline health — provides observability into the refund process.
 * Tracks pending, stuck, and completed refunds.
 */
export const getRefundHealth = query({
  args: {},
  handler: async (ctx: any) => {
    await requireCan(ctx, "commerce.returns.view");
    await requireCommerceReturnsEnabled(ctx);

    const returns = await ctx.db.query("commerce_return_requests").collect();
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    return {
      total: returns.length,
      refundPending: returns.filter((r: any) => r.status === "refund_pending").length,
      stuckRefunds: returns.filter(
        (r: any) =>
          r.status === "refund_pending" &&
          (r.refundPendingAt ?? r.updatedAt) < oneHourAgo,
      ).length,
      completedToday: returns.filter(
        (r: any) =>
          r.status === "completed" &&
          r.completedAt &&
          r.completedAt > now - 86400000,
      ).length,
    };
  },
});

/**
 * Get returns stuck in refund_pending state beyond a threshold.
 * Useful for admin dashboards and alerting.
 */
export const getStuckRefunds = query({
  args: {
    staleMinutes: v.optional(v.number()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCan(ctx, "commerce.returns.view");
    await requireCommerceReturnsEnabled(ctx);

    const staleThreshold =
      Date.now() - (args.staleMinutes ?? 60) * 60 * 1000;

    const returns = await ctx.db
      .query("commerce_return_requests")
      .collect();

    return returns.filter(
      (r: any) =>
        r.status === "refund_pending" &&
        (r.refundPendingAt ?? r.updatedAt) < staleThreshold,
    );
  },
});
