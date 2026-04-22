/**
 * Tier 4.2 — webhook replay protection.
 *
 * Each provider webhook is keyed by (provider, signatureHash). When a new
 * delivery arrives, we atomically check-and-insert: if the row exists, it's
 * a replay and we return `{ replay: true }` to the caller; otherwise we
 * insert and return `{ replay: false }`.
 *
 * The daily `shipping:webhook-dedup-purge` cron trims expired rows.
 */

import { v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";
import { shippingProviderValidator } from "../schema/shipping";

const DEDUP_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
const dedupProviderValidator = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("shipstation"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("fedex"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("ups"),
);

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const checkAndRecord = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    provider: dedupProviderValidator,
    signatureHash: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!args.signatureHash) {
      // No signature → no dedup possible. Accept, let upstream log.
      return { replay: false };
    }

    const existing = await ctx.db
      .query("shipping_webhook_deliveries")
      .withIndex("by_provider_signature", (q: any) =>
        q.eq("provider", args.provider).eq("signatureHash", args.signatureHash),
      )
      .unique();

    if (existing) {
      return { replay: true, receivedAt: existing.receivedAt };
    }

    const now = Date.now();
    await ctx.db.insert("shipping_webhook_deliveries", {
      provider: args.provider,
      signatureHash: args.signatureHash,
      receivedAt: now,
      expiresAt: now + DEDUP_TTL_MS,
    });
    return { replay: false };
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const purgeExpired = internalMutation({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    const now = Date.now();
    const BATCH = 500;
    const rows = await ctx.db
      .query("shipping_webhook_deliveries")
      .withIndex("by_expires", (q: any) => q.lt("expiresAt", now))
      .take(BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length };
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const listRecent = internalQuery({
  args: { provider: shippingProviderValidator },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    return ctx.db
      .query("shipping_webhook_deliveries")
      .withIndex("by_provider_signature", (q: any) =>
        q.eq("provider", args.provider),
      )
      .order("desc")
      .take(100);
  },
});
