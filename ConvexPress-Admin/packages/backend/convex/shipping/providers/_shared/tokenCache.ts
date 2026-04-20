import { v } from "convex/values";

import { internalMutation, internalQuery } from "../../../_generated/server";

/**
 * Tier 1.1 — cross-invocation OAuth token cache.
 * Stores tokens in the database keyed by (connectionId, provider) so that
 * concurrent rate calls share a single token within its TTL window.
 */

const PROVIDER_VALIDATOR = v.union(
  v.literal("ups"),
  v.literal("usps"),
  v.literal("fedex"),
  v.literal("shipstation"),
  v.literal("dhl"),
);

export const getCachedToken = internalQuery({
  args: {
    connectionId: v.id("shipping_provider_connections"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("shipping_provider_oauth_tokens")
      .withIndex("by_connection", (q: any) => q.eq("connectionId", args.connectionId))
      .unique();
    if (!row) return null;
    if (row.expiresAt < Date.now()) return null;
    return row;
  },
});

export const setCachedToken = internalMutation({
  args: {
    connectionId: v.id("shipping_provider_connections"),
    provider: PROVIDER_VALIDATOR,
    accessToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("shipping_provider_oauth_tokens")
      .withIndex("by_connection", (q: any) => q.eq("connectionId", args.connectionId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        expiresAt: args.expiresAt,
        refreshedAt: now,
      });
      return existing._id;
    }
    return ctx.db.insert("shipping_provider_oauth_tokens", {
      connectionId: args.connectionId,
      provider: args.provider,
      accessToken: args.accessToken,
      expiresAt: args.expiresAt,
      refreshedAt: now,
    });
  },
});

export const purgeExpiredTokens = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("shipping_provider_oauth_tokens")
      .withIndex("by_expires", (q: any) => q.lt("expiresAt", now))
      .collect();
    for (const row of expired) await ctx.db.delete(row._id);
    return { purged: expired.length };
  },
});

export const findConnectionByProvider = internalQuery({
  args: { provider: PROVIDER_VALIDATOR },
  handler: async (ctx, args) => {
    return ctx.db
      .query("shipping_provider_connections")
      .withIndex("by_provider", (q: any) => q.eq("provider", args.provider))
      .unique();
  },
});

/**
 * Invalidate the cached OAuth token for a provider. Called when the carrier
 * returns 401 during a live request so the next attempt fetches fresh.
 */
export const invalidateForProvider = internalMutation({
  args: { provider: PROVIDER_VALIDATOR },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("shipping_provider_connections")
      .withIndex("by_provider", (q: any) => q.eq("provider", args.provider))
      .unique();
    if (!connection) return { invalidated: 0 };
    const rows = await ctx.db
      .query("shipping_provider_oauth_tokens")
      .withIndex("by_connection", (q: any) =>
        q.eq("connectionId", connection._id),
      )
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    return { invalidated: rows.length };
  },
});
