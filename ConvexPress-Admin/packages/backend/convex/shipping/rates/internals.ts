import { v } from "convex/values";

import { internalMutation, internalQuery } from "../../_generated/server";
import { emitEvent } from "../../helpers/events";
import { listZoneMethods } from "../methods/tables";

import { shippingDocs } from "../../schema/shipping.docs.generated";
/**
 * Load the enabled live-rate zone methods for a zone. Returns the list of
 * providers (and optional account/service filters) that should fan out for
 * rating. If none are defined, the pipeline can fall back to all configured
 * providers per installation settings.
 */
export const listLiveRateZoneMethods = internalQuery({
  args: { zoneId: v.id("commerce_shipping_zones") },
  returns: v.array(shippingDocs.commerce_shipping_zone_methods),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("commerce_shipping_zone_methods")
      .withIndex("by_zone_sort", (q) => q.eq("zoneId", args.zoneId))
      .collect();
    return rows.filter((r) => r.enabled && r.methodType === "live_rate");
  },
});

/**
 * Fetch a user's tags for rule-context customer segmentation. Returns [] if
 * the user is missing or has no tags. Fail-open on any error to avoid
 * blocking rate calculation.
 */
export const getUserTags = internalQuery({
  args: { userId: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    try {
      const userId = ctx.db.normalizeId("users", args.userId);
      const user = userId ? await ctx.db.get(userId) : null;
      if (!user) return [];
      // The users schema declares no `tags`; read it as an optional stored extra.
      const stored: Record<string, unknown> = user;
      const tags = stored.tags;
      return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
    } catch {
      return [];
    }
  },
});


/**
 * Load every enabled method config across all method-type tables for a given
 * zone. Returns each config tagged with its method type so the pipeline can
 * dispatch to the right calculator.
 */
export const listEnabledMethodsForZone = internalQuery({
  args: { zoneId: v.id("commerce_shipping_zones") },
  returns: v.array(v.union(v.object({ methodType: v.literal("free"), config: shippingDocs.commerce_shipping_method_free }), v.object({
    methodType: v.literal("flat_rate"),
    config: shippingDocs.commerce_shipping_method_flat_rate,
  }), v.object({
    methodType: v.literal("local_pickup"),
    config: shippingDocs.commerce_shipping_method_local_pickup,
  }), v.object({
    methodType: v.literal("weight_based"),
    config: shippingDocs.commerce_shipping_method_weight_based,
  }), v.object({
    methodType: v.literal("dimensional"),
    config: shippingDocs.commerce_shipping_method_dimensional,
  }), v.object({
    methodType: v.literal("price_based"),
    config: shippingDocs.commerce_shipping_method_price_based,
  }), v.object({
    methodType: v.literal("quantity_based"),
    config: shippingDocs.commerce_shipping_method_quantity_based,
  }), v.object({
    methodType: v.literal("local_delivery"),
    config: shippingDocs.commerce_shipping_method_local_delivery,
  }), v.object({
    methodType: v.literal("table_rate"),
    config: shippingDocs.commerce_shipping_method_table_rate,
  }))),
  handler: async (ctx, args) => {
    const methods = await listZoneMethods(ctx, args.zoneId);
    return methods.filter((method) => method.config.enabled !== false);
  },
});

/**
 * Persist a pipeline run diagnostic record. Called by the pipeline action
 * after every rate calculation (successful or failed).
 */
export const recordPipelineRun = internalMutation({
  args: {
    checkoutSessionId: v.optional(v.id("commerce_checkout_sessions")),
    requestedAt: v.number(),
    totalDurationMs: v.number(),
    matchedZoneId: v.optional(v.id("commerce_shipping_zones")),
    matchedZoneName: v.optional(v.string()),
    fellBackToManual: v.boolean(),
    totalQuotes: v.number(),
    cacheHit: v.optional(v.boolean()),
    shipFromLocationId: v.optional(v.id("commerce_ship_from_locations")),
    selectedPackageIds: v.optional(v.array(v.string())),
    warnings: v.optional(v.array(v.string())),
    zeroQuoteReasons: v.optional(v.array(v.string())),
    requestContext: v.optional(
      v.object({
        shippingAddress: v.optional(v.any()),
        itemCount: v.optional(v.number()),
        totalWeightOz: v.optional(v.number()),
        subtotalAmount: v.optional(v.number()),
        currencyCode: v.optional(v.string()),
        preferredProvider: v.optional(v.string()),
      }),
    ),
    stages: v.array(
      v.object({
        stage: v.string(),
        startedAt: v.number(),
        durationMs: v.number(),
        success: v.boolean(),
        detail: v.optional(v.string()),
      }),
    ),
    providerResults: v.optional(
      v.array(
        v.object({
          provider: v.string(),
          success: v.boolean(),
          quoteCount: v.number(),
          durationMs: v.number(),
          error: v.optional(v.string()),
        }),
      ),
    ),
    addressKey: v.optional(v.string()),
    cartKey: v.optional(v.string()),
  },
  returns: v.id("commerce_rate_pipeline_runs"),
  handler: async (ctx, args) => {
    return ctx.db.insert("commerce_rate_pipeline_runs", args);
  },
});

/**
 * Read persisted quotes for a checkout session if they're still fresh AND
 * match the current address + cart fingerprints. Used by the pipeline for
 * its cache-hit path (PRD A7 §5 step 9 "Cache quotes with addressKey/cartKey").
 */
export const getCachedQuotesForSession = internalQuery({
  args: {
    checkoutSessionId: v.id("commerce_checkout_sessions"),
    addressKey: v.string(),
    cartKey: v.string(),
  },
  returns: v.union(v.null(), v.array(shippingDocs.commerce_shipping_rate_quotes)),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("commerce_shipping_rate_quotes")
      .withIndex("by_checkout", (q) =>
        q.eq("checkoutSessionId", args.checkoutSessionId),
      )
      .collect();
    if (rows.length === 0) return null;
    const now = Date.now();
    const valid = rows.filter(
      (r) =>
        r.addressKey === args.addressKey &&
        r.cartKey === args.cartKey &&
        (r.expiresAt ?? 0) > now,
    );
    if (valid.length === 0) return null;
    return valid.sort((a, b) => a.amount - b.amount);
  },
});

/**
 * Action-safe event emitter for the rate pipeline. The pipeline runs in an
 * action context (Node), so it can't call `emitEvent` (MutationCtx) directly.
 * Route through this internal mutation.
 */
export const emitRateEvent = internalMutation({
  args: {
    eventCode: v.string(),
    payload: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await emitEvent(ctx, args.eventCode, "shipping", args.payload);
  },
});
