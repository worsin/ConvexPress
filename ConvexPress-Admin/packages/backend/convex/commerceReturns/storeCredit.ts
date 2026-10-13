/**
 * Commerce Returns — store-credit ledger (Wave 11.3).
 *
 * A customer's store-credit balance is the `balanceAfter` field of their
 * most recent ledger row. `issue` adds to balance, `redeem` subtracts,
 * `expire` subtracts via cron, `adjust` is admin manual.
 *
 * Redemption is called at checkout finalize (Cart/Checkout system).
 */

import { ConvexError, v } from "convex/values";

import {
  internalMutation,
  mutation,
  query,
} from "../_generated/server";
import { requireCan } from "../helpers/permissions";

import { tableDocs } from "../schema/tableDocs.generated";
async function latestEntry(ctx: any, userId: string) {
  return await ctx.db
    .query("commerce_store_credit_ledger")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .order("desc")
    .first();
}

export const getBalance = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const latest = await latestEntry(ctx, args.userId);
    return { balance: latest?.balanceAfter ?? 0 };
  },
});

export const listLedger = query({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  returns: v.array(tableDocs.commerce_store_credit_ledger),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("commerce_store_credit_ledger")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/**
 * Issue store credit. Admin-initiated (manual or via approved return).
 * Returns the new balance.
 */
export const issue = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    sourceReturnId: v.optional(v.id("commerce_return_requests")),
    sourceOrderId: v.optional(v.id("commerce_orders")),
    note: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "commerce.returns.manage");
    if (args.amount <= 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Issue amount must be positive.",
      });
    }
    const latest = await latestEntry(ctx, args.userId);
    const prev = latest?.balanceAfter ?? 0;
    const newBalance = prev + args.amount;
    const now = Date.now();
    await ctx.db.insert("commerce_store_credit_ledger", {
      userId: args.userId,
      entryType: "issue",
      amount: args.amount,
      balanceAfter: newBalance,
      sourceReturnId: args.sourceReturnId,
      sourceOrderId: args.sourceOrderId,
      note: args.note,
      expiresAt: args.expiresAt,
      createdAt: now,
    });
    return { balance: newBalance };
  },
});

/**
 * Redeem store credit against an order. Called from Cart/Checkout
 * finalize. Throws if balance is insufficient.
 */
export const redeem = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    orderId: v.optional(v.id("commerce_orders")),
    note: v.optional(v.string()),
  },
  returns: v.object({ balance: v.number() }),
  handler: async (ctx, args) => {
    if (args.amount <= 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Redeem amount must be positive.",
      });
    }
    const latest = await latestEntry(ctx, args.userId);
    const prev = latest?.balanceAfter ?? 0;
    if (prev < args.amount) {
      throw new ConvexError({
        code: "INSUFFICIENT_BALANCE",
        message: `Customer has $${(prev / 100).toFixed(2)} in credit; requested $${(args.amount / 100).toFixed(2)}.`,
      });
    }
    const newBalance = prev - args.amount;
    await ctx.db.insert("commerce_store_credit_ledger", {
      userId: args.userId,
      entryType: "redeem",
      amount: -args.amount,
      balanceAfter: newBalance,
      sourceOrderId: args.orderId,
      note: args.note,
      createdAt: Date.now(),
    });
    return { balance: newBalance };
  },
});

/**
 * Admin adjustment (bonus + or correction +/-).
 */
export const adjust = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "commerce.returns.manage");
    const latest = await latestEntry(ctx, args.userId);
    const prev = latest?.balanceAfter ?? 0;
    const newBalance = prev + args.amount;
    if (newBalance < 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Adjustment would produce a negative balance.",
      });
    }
    await ctx.db.insert("commerce_store_credit_ledger", {
      userId: args.userId,
      entryType: "adjust",
      amount: args.amount,
      balanceAfter: newBalance,
      note: args.note,
      createdAt: Date.now(),
    });
    return { balance: newBalance };
  },
});

/**
 * Daily cron — expire entries whose expiresAt has passed. Converts the
 * remaining expiring-credit into an `expire` row that zeroes it out.
 * Simplified MVP logic: when an `issue` row's expiresAt has passed and
 * no matching `expire` row exists, write a single expire entry for the
 * full issued amount (not per-issue tracking).
 */
export const expireExpired = internalMutation({
  args: {},
  returns: v.object({ expiredCount: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("commerce_store_credit_ledger")
      .withIndex("by_expires_at", (q: any) => q.lte("expiresAt", now))
      .collect();
    // Group by userId; only those whose most-recent issue row has expired
    // and hasn't already been expired.
    const seenUsers = new Set<string>();
    let expiredCount = 0;
    for (const row of expired as any[]) {
      if (row.entryType !== "issue") continue;
      const key = String(row.userId);
      if (seenUsers.has(key)) continue;
      seenUsers.add(key);
      const latest = await latestEntry(ctx, row.userId);
      if (!latest) continue;
      if (latest.balanceAfter <= 0) continue;
      await ctx.db.insert("commerce_store_credit_ledger", {
        userId: row.userId,
        entryType: "expire",
        amount: -latest.balanceAfter,
        balanceAfter: 0,
        note: "Automatic expiration",
        createdAt: now,
      });
      expiredCount++;
    }
    return { expiredCount };
  },
});
