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

import { shippingDocs } from "../schema/shipping.docs.generated";
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
  returns: v.union(v.object({ replay: v.boolean(), receivedAt: v.optional(v.null()) }), v.object({ replay: v.boolean(), receivedAt: v.number() })),
  handler: async (ctx, args) => {
    if (!args.signatureHash) {
      // No signature → no dedup possible. Accept, let upstream log.
      return { replay: false };
    }

    const existing = await ctx.db
      .query("shipping_webhook_deliveries")
      .withIndex("by_provider_signature", (q) =>
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

export const purgeExpired: import("convex/server").RegisteredMutation<"internal", Record<string, never>, { deleted: number }> = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const BATCH = 500;
    const rows = await ctx.db
      .query("shipping_webhook_deliveries")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(BATCH);
    for (const row of rows) await ctx.db.delete("shipping_webhook_deliveries", row._id);
    return { deleted: rows.length };
  },
});

export const listRecent: import("convex/server").RegisteredQuery<"internal", { provider: import("convex/values").Infer<typeof shippingProviderValidator> }, import("../_generated/dataModel").Doc<"shipping_webhook_deliveries">[]> = internalQuery({
  args: { provider: shippingProviderValidator },
  returns: v.array(shippingDocs.shipping_webhook_deliveries),
  handler: async (ctx, args) => {
    return ctx.db
      .query("shipping_webhook_deliveries")
      .withIndex("by_provider_signature", (q) =>
        q.eq("provider", args.provider),
      )
      .order("desc")
      .take(100);
  },
});
