/**
 * API System - Public Queries
 *
 * Five queries for the admin UI:
 *
 *   - listKeys: List API keys for the current admin, filterable by status.
 *     Returns all key metadata except the keyHash (never exposed to client).
 *
 *   - getKey: Get a single API key by ID.
 *
 *   - listWebhooks: List webhooks for the current admin, filterable by status.
 *     Returns all webhook metadata except the encrypted secret.
 *
 *   - getWebhook: Get a single webhook by ID.
 *
 *   - listDeliveries: List delivery log entries for a specific webhook,
 *     sorted by deliveredAt descending with optional limit.
 *
 * All queries require Administrator-level access (api.create_key capability
 * check is used as the baseline since all API management is admin-only).
 *
 * Usage:
 *   const keys = useQuery(api.api.queries.listKeys, { status: "active" });
 *   const webhooks = useQuery(api.api.queries.listWebhooks, {});
 *   const deliveries = useQuery(api.api.queries.listDeliveries, { webhookId, limit: 50 });
 */

import { query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import {
  listKeysArgs,
  getKeyArgs,
  listWebhooksArgs,
  getWebhookArgs,
  listDeliveriesArgs,
} from "./validators";

import { v } from "convex/values";
import { tableDocs } from "../schema/tableDocs.generated";
// ─── listKeys ─────────────────────────────────────────────────────────────

/**
 * List API keys, optionally filtered by status.
 * Returns keys sorted by createdAt descending (newest first).
 * The keyHash field is excluded from the response for security.
 *
 * Auth: Administrator (api.create_key capability).
 */
export const listKeys = query({
  args: listKeysArgs,
  returns: v.array(v.object({
    _id: v.id("apiKeys"),
    _creationTime: v.number(),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.string()),
    environmentBinding: v.optional(v.string()),
    lastUsedAt: v.optional(v.number()),
    lastUsedIp: v.optional(v.string()),
    revokeReason: v.optional(v.string()),
    userId: v.string(),
    name: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
    status: v.union(v.literal("active"), v.literal("revoked"), v.literal("expired")),
    keyPrefix: v.string(),
    scopes: v.array(v.union(v.literal("read:posts"), v.literal("write:posts"), v.literal("read:comments"), v.literal("write:comments"), v.literal("read:media"), v.literal("write:media"), v.literal("read:users"), v.literal("write:users"), v.literal("read:taxonomies"), v.literal("write:taxonomies"), v.literal("read:settings"), v.literal("write:settings"), v.literal("read:menus"), v.literal("write:menus"))),
    rateLimitPerMinute: v.number(),
    rateLimitPerHour: v.number(),
    requestCount: v.number(),
  })),
  handler: async (ctx, args) => {
    // Require Administrator-level access
    await requireCan(ctx, "api.create_key");

    let keys;

    if (args.status) {
      // Filter by status using the by_status index
      keys = await ctx.db
        .query("apiKeys")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      // Return all keys
      keys = await ctx.db.query("apiKeys").collect();
    }

    // Sort by createdAt descending (newest first)
    keys.sort((a, b) => b.createdAt - a.createdAt);

    // Exclude keyHash from the response
    return keys.map(({ keyHash: _keyHash, ...rest }) => rest);
  },
});

// ─── getKey ───────────────────────────────────────────────────────────────

/**
 * Get a single API key by ID.
 * The keyHash field is excluded from the response.
 *
 * Auth: Administrator (api.create_key capability).
 */
export const getKey = query({
  args: getKeyArgs,
  returns: v.union(v.null(), v.object({
    _id: v.id("apiKeys"),
    _creationTime: v.number(),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.string()),
    environmentBinding: v.optional(v.string()),
    lastUsedAt: v.optional(v.number()),
    lastUsedIp: v.optional(v.string()),
    revokeReason: v.optional(v.string()),
    userId: v.string(),
    name: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
    status: v.union(v.literal("active"), v.literal("revoked"), v.literal("expired")),
    keyPrefix: v.string(),
    scopes: v.array(v.union(v.literal("read:posts"), v.literal("write:posts"), v.literal("read:comments"), v.literal("write:comments"), v.literal("read:media"), v.literal("write:media"), v.literal("read:users"), v.literal("write:users"), v.literal("read:taxonomies"), v.literal("write:taxonomies"), v.literal("read:settings"), v.literal("write:settings"), v.literal("read:menus"), v.literal("write:menus"))),
    rateLimitPerMinute: v.number(),
    rateLimitPerHour: v.number(),
    requestCount: v.number(),
  })),
  handler: async (ctx, args) => {
    await requireCan(ctx, "api.create_key");

    const key = await ctx.db.get("apiKeys", args.keyId);
    if (!key) return null;

    // Exclude keyHash from the response
    const { keyHash: _keyHash, ...rest } = key;
    return rest;
  },
});

// ─── listWebhooks ─────────────────────────────────────────────────────────

/**
 * List webhooks, optionally filtered by status.
 * Returns webhooks sorted by createdAt descending (newest first).
 * The secret field is excluded from the response.
 *
 * Auth: Administrator (api.create_webhook capability).
 */
export const listWebhooks = query({
  args: listWebhooksArgs,
  returns: v.array(v.object({
    _id: v.id("webhooks"),
    _creationTime: v.number(),
    eventListenerId: v.optional(v.id("eventListeners")),
    lastDeliveryAt: v.optional(v.number()),
    disabledAt: v.optional(v.number()),
    userId: v.string(),
    name: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("disabled")),
    eventCode: v.string(),
    contentType: v.union(v.literal("application/json"), v.literal("application/x-www-form-urlencoded")),
    deliveryUrl: v.string(),
    consecutiveFailures: v.number(),
    maxConsecutiveFailures: v.number(),
    deliveryTimeout: v.number(),
  })),
  handler: async (ctx, args) => {
    await requireCan(ctx, "api.create_webhook");

    let webhooks;

    if (args.status) {
      webhooks = await ctx.db
        .query("webhooks")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      webhooks = await ctx.db.query("webhooks").collect();
    }

    // Sort by createdAt descending (newest first)
    webhooks.sort((a, b) => b.createdAt - a.createdAt);

    // Exclude encrypted secret from the response
    return webhooks.map(({ secret: _secret, ...rest }) => rest);
  },
});

// ─── getWebhook ───────────────────────────────────────────────────────────

/**
 * Get a single webhook by ID.
 * The secret field is excluded from the response.
 *
 * Auth: Administrator (api.create_webhook capability).
 */
export const getWebhook = query({
  args: getWebhookArgs,
  returns: v.union(v.null(), v.object({
    _id: v.id("webhooks"),
    _creationTime: v.number(),
    eventListenerId: v.optional(v.id("eventListeners")),
    lastDeliveryAt: v.optional(v.number()),
    disabledAt: v.optional(v.number()),
    userId: v.string(),
    name: v.string(),
    updatedAt: v.number(),
    createdAt: v.number(),
    status: v.union(v.literal("active"), v.literal("paused"), v.literal("disabled")),
    eventCode: v.string(),
    contentType: v.union(v.literal("application/json"), v.literal("application/x-www-form-urlencoded")),
    deliveryUrl: v.string(),
    consecutiveFailures: v.number(),
    maxConsecutiveFailures: v.number(),
    deliveryTimeout: v.number(),
  })),
  handler: async (ctx, args) => {
    await requireCan(ctx, "api.create_webhook");

    const webhook = await ctx.db.get("webhooks", args.webhookId);
    if (!webhook) return null;

    // Exclude encrypted secret from the response
    const { secret: _secret, ...rest } = webhook;
    return rest;
  },
});

// ─── listDeliveries ───────────────────────────────────────────────────────

/**
 * List delivery log entries for a specific webhook.
 * Returns deliveries sorted by deliveredAt descending (newest first).
 * Supports optional limit (defaults to 50, max 200).
 *
 * Auth: Administrator (api.create_webhook capability).
 */
export const listDeliveries = query({
  args: listDeliveriesArgs,
  returns: v.array(tableDocs.webhookDeliveries),
  handler: async (ctx, args) => {
    await requireCan(ctx, "api.create_webhook");

    // Clamp limit to 1-200 range, default 50
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

    const deliveries = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_webhook", (q) => q.eq("webhookId", args.webhookId))
      .order("desc")
      .take(limit);

    return deliveries;
  },
});
