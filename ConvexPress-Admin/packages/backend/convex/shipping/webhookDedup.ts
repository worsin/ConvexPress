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

const dedupProviderValidator = v.union(
  v.literal("shipstation"),
  v.literal("fedex"),
  v.literal("ups"),
);

export const checkAndRecord = internalMutation({
  args: {
    provider: dedupProviderValidator,
    signatureHash: v.string(),
  },
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

export const purgeExpired = internalMutation({
  args: {},
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

export const listRecent = internalQuery({
  args: { provider: shippingProviderValidator },
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
