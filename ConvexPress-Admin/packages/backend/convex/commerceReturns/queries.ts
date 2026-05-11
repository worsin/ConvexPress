// @ts-nocheck
// Note: @ts-nocheck is retained because the generic Convex `db.query(table)`
// type machinery instantiates too deeply across the project's large schema
// (TS error 2589). Logic here is still reviewed; types are enforced at the
// call sites that can narrow the schema. Remove this pragma once the
// upstream Convex type depth issue is resolved for the whole repo.
/**
 * Commerce Returns — Queries
 *
 * Ported from VexCart returns.ts queries, adapted to ConvexPress
 * schema (commerce_return_* tables) and auth patterns.
 *
 * Authorization model:
 *   - Admin endpoints require `commerce.returns.view` capability.
 *   - Customer-facing endpoints require an authenticated user who is the
 *     return owner (or the order owner). Non-owners are rejected with
 *     FORBIDDEN, not silently allowed.
 *   - The legacy getById/getByReturnNumber/getByOrder/getUserReturns
 *     queries now require admin capability; customer-facing callers should
 *     use getMineById/getMineByOrder/getMyReturns.
 */

import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { requireCommerceReturnsEnabled } from "./helpers";
import { commerceReturnStatusValidator } from "../schema/commerceReturns";
import { getCustomerOrderReturnEligibility } from "./eligibility";
import { normalizeStoredReturnItems } from "./itemState";
import { isPluginEnabled } from "../helpers/plugins";

type ReturnRequestDoc = Doc<"commerce_return_requests">;
type ReturnItemDoc = Doc<"commerce_return_items">;
type ReturnHistoryDoc = Doc<"commerce_return_history">;
type UserDoc = Doc<"users">;

function formatUserName(user: UserDoc): string | undefined {
  if (user.displayName) return user.displayName;
  const parts = [user.firstName, user.lastName].filter(
    (v): v is string => !!v,
  );
  return parts.length > 0 ? parts.join(" ") : undefined;
}

async function getReturnItems(
  ctx: QueryCtx,
  returnId: Id<"commerce_return_requests">,
): Promise<ReturnItemDoc[]> {
  return await ctx.db
    .query("commerce_return_items")
    .withIndex("by_return_request", (q) =>
      q.eq("returnRequestId", returnId),
    )
    .collect();
}

async function getReturnHistory(
  ctx: QueryCtx,
  returnId: Id<"commerce_return_requests">,
): Promise<ReturnHistoryDoc[]> {
  return await ctx.db
    .query("commerce_return_history")
    .withIndex("by_return_request", (q) =>
      q.eq("returnRequestId", returnId),
    )
    .collect();
}

async function enrichReturn(ctx: QueryCtx, returnRequest: ReturnRequestDoc) {
  const order = await ctx.db.get(returnRequest.orderId);
  const returnItems = await getReturnItems(ctx, returnRequest._id);
  const normalizedItems = normalizeStoredReturnItems(returnRequest, returnItems);

  const orderItems = await Promise.all(
    normalizedItems.map(async (item) => {
      const orderItem = item.orderItemId
        ? await ctx.db.get(item.orderItemId as Id<"commerce_order_items">)
        : null;
      return {
        ...item,
        orderItem,
      };
    }),
  );

  const history = await getReturnHistory(ctx, returnRequest._id);
  const user = returnRequest.userId ? await ctx.db.get(returnRequest.userId) : null;
  const processedBy = returnRequest.processedBy
    ? await ctx.db.get(returnRequest.processedBy)
    : null;

  return {
    ...returnRequest,
    order,
    orderNumber: order?.orderNumber,
    customerEmail: order?.email,
    returnItems: normalizedItems,
    orderItems,
    itemCount: normalizedItems.length,
    history,
    user: user
      ? {
          _id: user._id,
          email: user.email,
          name: formatUserName(user),
        }
      : null,
    processedByUser: processedBy
      ? {
          _id: processedBy._id,
          email: processedBy.email,
          name: formatUserName(processedBy),
        }
      : null,
  };
}

function requireAuthenticatedUser<T>(user: T | null | undefined): T {
  if (!user) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "You must be signed in to view returns.",
    });
  }
  return user;
}

function throwForbidden(message: string): never {
  throw new ConvexError({
    code: "FORBIDDEN",
    message,
  });
}

// ============================================
// ADMIN QUERIES
// ============================================

/**
 * Get return request by ID. Admin only.
 */
export const getById = query({
  args: {
    returnId: v.id("commerce_return_requests"),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceReturns"))) return null;
    await requireCan(ctx, "commerce.returns.view");
    await requireCommerceReturnsEnabled(ctx);

    return await ctx.db.get(args.returnId);
  },
});

/**
 * Get return request by return number. Admin only.
 */
export const getByReturnNumber = query({
  args: {
    returnNumber: v.string(),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceReturns"))) return null;
    await requireCan(ctx, "commerce.returns.view");
    await requireCommerceReturnsEnabled(ctx);

    return await ctx.db
      .query("commerce_return_requests")
      .withIndex("by_return_number", (q) =>
        q.eq("returnNumber", args.returnNumber),
      )
      .unique();
  },
});

/**
 * Get return request with full details (order, items, user, processor). Admin only.
 */
export const getWithDetails = query({
  args: {
    returnId: v.id("commerce_return_requests"),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceReturns"))) return null;
    await requireCan(ctx, "commerce.returns.view");
    await requireCommerceReturnsEnabled(ctx);

    const returnRequest = await ctx.db.get(args.returnId);
    if (!returnRequest) return null;

    return await enrichReturn(ctx, returnRequest);
  },
});

/**
 * Get returns for a specific order. Admin only.
 */
export const getByOrder = query({
  args: {
    orderId: v.id("commerce_orders"),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceReturns"))) return null;
    await requireCan(ctx, "commerce.returns.view");
    await requireCommerceReturnsEnabled(ctx);

    return await ctx.db
      .query("commerce_return_requests")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
  },
});

/**
 * Get returns for a specific user. Admin only.
 */
export const getUserReturns = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceReturns"))) return null;
    await requireCan(ctx, "commerce.returns.view");
    await requireCommerceReturnsEnabled(ctx);

    const limit = args.limit ?? 20;
    return await ctx.db
      .query("commerce_return_requests")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
});

// ============================================
// CUSTOMER QUERIES (ownership-gated)
// ============================================

export const getMineById = query({
  args: {
    returnId: v.id("commerce_return_requests"),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceReturns"))) return null;
    await requireCommerceReturnsEnabled(ctx);

    const user = requireAuthenticatedUser(await getCurrentUser(ctx));
    const returnRequest = await ctx.db.get(args.returnId);
    if (!returnRequest) return null;

    if (returnRequest.userId?.toString() !== user._id.toString()) {
      throwForbidden("You can only view your own returns.");
    }

    return await enrichReturn(ctx, returnRequest);
  },
});

export const getMineByOrder = query({
  args: {
    orderId: v.id("commerce_orders"),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceReturns"))) return [];
    await requireCommerceReturnsEnabled(ctx);

    const user = requireAuthenticatedUser(await getCurrentUser(ctx));
    const order = await ctx.db.get(args.orderId);
    if (!order) return [];
    if (order.userId?.toString() !== user._id.toString()) {
      throwForbidden("You can only view returns for your own orders.");
    }

    const returns = await ctx.db
      .query("commerce_return_requests")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    return await Promise.all(returns.map((ret) => enrichReturn(ctx, ret)));
  },
});

export const getMyOrderEligibility = query({
  args: {
    orderId: v.id("commerce_orders"),
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceReturns"))) return null;
    await requireCommerceReturnsEnabled(ctx);

    const user = requireAuthenticatedUser(await getCurrentUser(ctx));
    const eligibility = await getCustomerOrderReturnEligibility(ctx as never, {
      orderId: args.orderId,
      userId: user._id,
    });

    return {
      ...eligibility,
      orderNumber: eligibility.order?.orderNumber,
      totalAmount: eligibility.order?.totalAmount,
      currencyCode: eligibility.order?.currencyCode,
      returnWindowDays: eligibility.policy.returnWindowDays,
      requireDeliveryBeforeReturn: eligibility.policy.requireDeliveryBeforeReturn,
    };
  },
});

/**
 * Get current user's own returns (customer-facing)
 */
export const getMyReturns = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceReturns"))) return { page: [], isDone: true, continueCursor: "" };
    await requireCommerceReturnsEnabled(ctx);

    const user = await getCurrentUser(ctx);
    if (!user) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("commerce_return_requests")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(result.page.map((ret) => enrichReturn(ctx, ret))),
    };
  },
});

// ============================================
// ADMIN LIST / DASHBOARD QUERIES
// ============================================

/**
 * List return requests with filters (admin)
 */
export const list = query({
  args: {
    status: v.optional(commerceReturnStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceReturns"))) return { page: [], isDone: true, continueCursor: "" };
    await requireCan(ctx, "commerce.returns.view");
    await requireCommerceReturnsEnabled(ctx);

    const q = args.status
      ? ctx.db
          .query("commerce_return_requests")
          .withIndex("by_status", (b) =>
            b.eq("status", args.status as ReturnRequestDoc["status"]),
          )
      : ctx.db.query("commerce_return_requests");

    const result = await q.order("desc").paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(result.page.map((ret) => enrichReturn(ctx, ret))),
    };
  },
});

/**
 * Get return statistics (admin dashboard)
 */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "commerceReturns"))) return null;
    await requireCan(ctx, "commerce.returns.view");
    await requireCommerceReturnsEnabled(ctx);

    const allReturns = await ctx.db
      .query("commerce_return_requests")
      .collect();

    const requested = allReturns.filter((r) => r.status === "requested").length;
    const approved = allReturns.filter((r) => r.status === "approved").length;
    const rejected = allReturns.filter((r) => r.status === "rejected").length;
    const received = allReturns.filter((r) => r.status === "received").length;
    const refundPending = allReturns.filter(
      (r) => r.status === "refund_pending",
    ).length;
    const refunded = allReturns.filter((r) => r.status === "refunded").length;
    const completed = allReturns.filter((r) => r.status === "completed").length;

    const totalRefunded = allReturns
      .filter((r) => r.status === "refunded" || r.status === "completed")
      .reduce((sum, r) => sum + (r.refundAmount ?? 0), 0);

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentReturns = allReturns.filter((r) => r.createdAt > thirtyDaysAgo);

    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const stuckRefunds = allReturns.filter(
      (r) =>
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
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "commerceReturns"))) return null;
    await requireCan(ctx, "commerce.returns.view");
    await requireCommerceReturnsEnabled(ctx);

    const returns = await ctx.db.query("commerce_return_requests").collect();
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    return {
      total: returns.length,
      refundPending: returns.filter((r) => r.status === "refund_pending").length,
      stuckRefunds: returns.filter(
        (r) =>
          r.status === "refund_pending" &&
          (r.refundPendingAt ?? r.updatedAt) < oneHourAgo,
      ).length,
      completedToday: returns.filter(
        (r) =>
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
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "commerceReturns"))) return null;
    await requireCan(ctx, "commerce.returns.view");
    await requireCommerceReturnsEnabled(ctx);

    const staleThreshold =
      Date.now() - (args.staleMinutes ?? 60) * 60 * 1000;

    const returns = await ctx.db
      .query("commerce_return_requests")
      .collect();

    return returns.filter(
      (r) =>
        r.status === "refund_pending" &&
        (r.refundPendingAt ?? r.updatedAt) < staleThreshold,
    );
  },
});
