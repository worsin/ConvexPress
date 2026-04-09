import { v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";
import { requireCommerceEnabled } from "../commerce/helpers";
import { lookupUserByIdentifier } from "../helpers/permissions";
import { shippingProviderArg } from "./validators";

const connectionStatusArg = v.union(
  v.literal("disconnected"),
  v.literal("connected"),
  v.literal("degraded"),
  v.literal("error"),
);

function shipmentCountsTowardFulfillment(status: string) {
  return status === "label_created" || status === "shipped" || status === "delivered";
}

async function recalculateOrderFulfillment(ctx: any, orderId: any) {
  const order = await ctx.db.get(orderId);
  if (!order) return;

  const items = await ctx.db
    .query("commerce_order_items")
    .withIndex("by_order", (q: any) => q.eq("orderId", orderId))
    .collect();
  const shipments = await ctx.db
    .query("commerce_shipments")
    .withIndex("by_order", (q: any) => q.eq("orderId", orderId))
    .collect();

  const shippedByItem = new Map<string, number>();
  for (const shipment of shipments) {
    if (!shipmentCountsTowardFulfillment(shipment.status)) continue;
    for (const shipmentItem of shipment.items) {
      const key = shipmentItem.orderItemId.toString();
      shippedByItem.set(key, (shippedByItem.get(key) ?? 0) + shipmentItem.quantity);
    }
  }

  const totalQuantity = items.reduce((sum: number, item: any) => sum + item.quantity, 0);
  const shippedQuantity = items.reduce(
    (sum: number, item: any) =>
      sum + Math.min(item.quantity, shippedByItem.get(item._id.toString()) ?? 0),
    0,
  );

  const nextFulfillmentStatus =
    shippedQuantity <= 0
      ? "unfulfilled"
      : shippedQuantity >= totalQuantity
        ? "fulfilled"
        : "partial";

  await ctx.db.patch(orderId, {
    fulfillmentStatus: nextFulfillmentStatus,
    status:
      nextFulfillmentStatus === "fulfilled" && order.status === "paid"
        ? "fulfilled"
        : order.status,
    updatedAt: Date.now(),
  });
}

export const matchZoneForAddress = internalQuery({
  args: {
    countryCode: v.string(),
    state: v.optional(v.string()),
    postalCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const zones = await ctx.db.query("commerce_shipping_zones").collect();
    const sorted = zones
      .filter((z: any) => z.enabled !== false)
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    for (const zone of sorted) {
      if (!zone.countries.includes(args.countryCode)) continue;

      if (zone.states && zone.states.length > 0 && args.state) {
        if (!zone.states.includes(args.state)) continue;
      }

      if (zone.postalCodeRules && zone.postalCodeRules.length > 0 && args.postalCode) {
        let matched = false;
        for (const pattern of zone.postalCodeRules) {
          const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
          if (regex.test(args.postalCode)) {
            matched = true;
            break;
          }
        }
        if (!matched) continue;
      }

      const methods = await ctx.db
        .query("commerce_shipping_zone_methods")
        .withIndex("by_zone", (q: any) => q.eq("zoneId", zone._id))
        .collect();

      return {
        zone,
        methods: methods
          .filter((m: any) => m.enabled !== false)
          .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      };
    }

    return null;
  },
});

export const saveQuoteDiagnostics = internalMutation({
  args: {
    checkoutSessionId: v.optional(v.id("commerce_checkout_sessions")),
    requestedAt: v.number(),
    requestedBy: v.optional(v.string()),
    shippingAddress: v.optional(v.any()),
    providerResults: v.array(
      v.object({
        provider: v.string(),
        attempted: v.boolean(),
        success: v.boolean(),
        quoteCount: v.number(),
        durationMs: v.optional(v.number()),
        errorCode: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
        skippedReason: v.optional(v.string()),
      }),
    ),
    totalQuotes: v.number(),
    fallbackUsed: v.boolean(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("shipping_quote_diagnostics", args);
  },
});

export const getProviderSecret = internalQuery({
  args: {
    provider: shippingProviderArg,
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("shipping_provider_connections")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .unique();

    if (!connection) {
      return null;
    }

    const secret = await ctx.db
      .query("shipping_provider_secrets")
      .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
      .unique();

    return {
      connection,
      secret,
    };
  },
});

export const listProviderConnections = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("shipping_provider_connections").collect();
  },
});

export const updateConnectionHealth = internalMutation({
  args: {
    provider: shippingProviderArg,
    status: connectionStatusArg,
    lastSyncAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    lastErrorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("shipping_provider_connections")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .unique();

    if (!connection) return null;

    await ctx.db.patch(connection._id, {
      status: args.status,
      lastVerifiedAt: Date.now(),
      lastSyncAt: args.lastSyncAt,
      lastErrorCode: args.lastErrorCode,
      lastErrorMessage: args.lastErrorMessage,
      updatedAt: Date.now(),
    });

    return connection._id;
  },
});

export const syncProviderAccountsAndServices = internalMutation({
  args: {
    provider: shippingProviderArg,
    carriers: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("shipping_provider_connections")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .unique();

    if (!connection) return null;

    const existingAccounts = await ctx.db
      .query("shipping_provider_accounts")
      .withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
      .collect();

    for (const account of existingAccounts) {
      const services = await ctx.db
        .query("shipping_provider_services")
        .withIndex("by_account", (q) => q.eq("accountId", account._id))
        .collect();
      for (const service of services) {
        await ctx.db.delete(service._id);
      }
      await ctx.db.delete(account._id);
    }

    const now = Date.now();
    for (const carrier of args.carriers) {
      const accountId = await ctx.db.insert("shipping_provider_accounts", {
        connectionId: connection._id,
        provider: args.provider,
        externalAccountId:
          carrier.carrier_id ??
          carrier.account_id ??
          carrier.carrier_code ??
          `carrier-${Math.random().toString(36).slice(2, 10)}`,
        carrierCode: carrier.carrier_code ?? carrier.code ?? "unknown",
        carrierName: carrier.friendly_name ?? carrier.name ?? carrier.carrier_code ?? "Carrier",
        nickname: carrier.nickname,
        status: carrier.status ?? "active",
        supportsRates: carrier.supports_rates !== false,
        supportsLabels: carrier.supports_labels !== false,
        supportsTracking: carrier.supports_tracking !== false,
        supportsManifests: carrier.supports_manifests === true,
        supportsReturns: carrier.supports_returns === true,
        rawCapabilities: carrier,
        lastSyncAt: now,
        createdAt: now,
        updatedAt: now,
      });

      const services = Array.isArray(carrier.services) ? carrier.services : [];
      for (const service of services) {
        await ctx.db.insert("shipping_provider_services", {
          connectionId: connection._id,
          accountId,
          carrierCode: carrier.carrier_code ?? carrier.code ?? "unknown",
          serviceCode: service.service_code ?? service.code ?? service.name ?? "service",
          serviceName: service.name ?? service.service_code ?? "Service",
          serviceGroup: "standard",
          isActive: service.active !== false,
          supportsDomestic: service.domestic !== false,
          supportsInternational: service.international !== false,
          rawMetadata: service,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(connection._id, {
      lastSyncAt: now,
      updatedAt: now,
    });

    return connection._id;
  },
});

export const getRateContextForSession = internalQuery({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);

    const checkoutSession = await ctx.db
      .query("commerce_checkout_sessions")
      .withIndex("by_session", (q) => q.eq("sessionToken", args.sessionToken))
      .unique();
    if (!checkoutSession) return null;

    const cart = await ctx.db.get(checkoutSession.cartId);
    if (!cart) return null;

    const items = await ctx.db
      .query("commerce_cart_items")
      .withIndex("by_cart", (q) => q.eq("cartId", cart._id))
      .collect();

    const enrichedItems = await Promise.all(
      items.map(async (item) => ({
        ...item,
        product: await ctx.db.get(item.productId),
      })),
    );

    const connection = await ctx.db
      .query("shipping_provider_connections")
      .withIndex("by_provider", (q) => q.eq("provider", "shipstation"))
      .unique();

    return {
      checkoutSession,
      cart,
      items: enrichedItems,
      shipstationConnection: connection,
    };
  },
});

export const replaceCheckoutQuotes = internalMutation({
  args: {
    checkoutSessionId: v.id("commerce_checkout_sessions"),
    quotes: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("commerce_shipping_rate_quotes")
      .withIndex("by_checkout", (q) => q.eq("checkoutSessionId", args.checkoutSessionId))
      .collect();

    for (const quote of existing) {
      await ctx.db.delete(quote._id);
    }

    const now = Date.now();
    for (const quote of args.quotes) {
      await ctx.db.insert("commerce_shipping_rate_quotes", {
        checkoutSessionId: args.checkoutSessionId,
        quoteKey: quote.quoteKey,
        provider: quote.provider,
        accountId: undefined,
        carrierCode: quote.carrierCode,
        carrierName: quote.carrierName,
        serviceCode: quote.serviceCode,
        serviceName: quote.serviceName,
        amount: quote.amount,
        currency: quote.currency,
        estimatedDaysMin: quote.estimatedDaysMin,
        estimatedDaysMax: quote.estimatedDaysMax,
        deliveryDateEstimated: quote.deliveryDateEstimated,
        isCheapest: quote.isCheapest,
        isFastest: quote.isFastest,
        isBestValue: quote.isBestValue,
        rawQuote: quote.rawQuote,
        expiresAt: quote.expiresAt ?? now + 300_000,
        createdAt: now,
      });
    }

    return args.checkoutSessionId;
  },
});

export const checkShippingAdminAction = internalQuery({
  args: {
    userId: v.string(),
    capability: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await lookupUserByIdentifier(ctx, args.userId);

    if (!user) {
      throw new Error("User not found.");
    }

    if (user.status !== "active") {
      throw new Error("Account is not active.");
    }

    let capabilities: string[] = [];

    if (user.roleId) {
      const role = await ctx.db.get(user.roleId);
      if (role && role.status === "active") {
        capabilities = role.capabilities ?? [];
      }
    } else if (user.internalRole) {
      const role = await ctx.db
        .query("roles")
        .withIndex("by_slug", (q) => q.eq("slug", user.internalRole as string))
        .unique();
      if (role && role.status === "active") {
        capabilities = role.capabilities ?? [];
      }
    }

    if (!capabilities.includes(args.capability)) {
      throw new Error(`Missing capability: ${args.capability}`);
    }

    return { authorized: true, userId: user._id };
  },
});

export const getLabelContextForOrder = internalQuery({
  args: {
    orderId: v.id("commerce_orders"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;

    const items = await ctx.db
      .query("commerce_order_items")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    const quote =
      order.checkoutSessionId && order.selectedShippingMethodCode
        ? await ctx.db
            .query("commerce_shipping_rate_quotes")
            .withIndex("by_checkout", (q) =>
              q.eq("checkoutSessionId", order.checkoutSessionId!),
            )
            .filter((q) =>
              q.eq(
                q.field("quoteKey"),
                order.selectedShippingMethodCode ?? "__missing__",
              ),
            )
            .first()
        : null;

    const shipments = await ctx.db
      .query("commerce_shipments")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();
    const existingShipment = shipments.find(
      (shipment) => shipment.externalLabelId || shipment.trackingNumber,
    );

    return {
      order,
      items,
      quote,
      existingShipment,
    };
  },
});

export const getShipmentForTracking = internalQuery({
  args: {
    shipmentId: v.id("commerce_shipments"),
  },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) return null;

    const order = await ctx.db.get(shipment.orderId);
    return {
      shipment,
      order,
    };
  },
});

export const updateOrderShippingSnapshot = internalMutation({
  args: {
    orderId: v.id("commerce_orders"),
    shippingProvider: v.optional(v.string()),
    shippingCarrierCode: v.optional(v.string()),
    shippingCarrierName: v.optional(v.string()),
    shippingServiceCode: v.optional(v.string()),
    shippingServiceName: v.optional(v.string()),
    shippingQuoteRaw: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.orderId, {
      shippingProvider: args.shippingProvider,
      shippingCarrierCode: args.shippingCarrierCode,
      shippingCarrierName: args.shippingCarrierName,
      shippingServiceCode: args.shippingServiceCode,
      shippingServiceName: args.shippingServiceName,
      shippingQuoteRaw: args.shippingQuoteRaw,
      updatedAt: Date.now(),
    });

    return args.orderId;
  },
});

export const createOrderShipmentFromLabel = internalMutation({
  args: {
    orderId: v.id("commerce_orders"),
    actorUserId: v.id("users"),
    shipmentNumber: v.string(),
    provider: v.string(),
    status: v.union(
      v.literal("label_created"),
      v.literal("shipped"),
      v.literal("delivered"),
      v.literal("returned"),
    ),
    carrier: v.optional(v.string()),
    carrierCode: v.optional(v.string()),
    serviceCode: v.optional(v.string()),
    serviceName: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    trackingUrl: v.optional(v.string()),
    trackingStatus: v.optional(v.string()),
    externalShipmentId: v.optional(v.string()),
    externalLabelId: v.optional(v.string()),
    labelUrl: v.optional(v.string()),
    labelFormat: v.optional(v.string()),
    items: v.array(
      v.object({
        orderItemId: v.id("commerce_order_items"),
        quantity: v.number(),
      }),
    ),
    rawMetadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const shipmentId = await ctx.db.insert("commerce_shipments", {
      orderId: args.orderId,
      shipmentNumber: args.shipmentNumber,
      status: args.status,
      provider: args.provider,
      carrier: args.carrier,
      carrierCode: args.carrierCode,
      serviceCode: args.serviceCode,
      serviceName: args.serviceName,
      trackingNumber: args.trackingNumber,
      trackingUrl: args.trackingUrl,
      trackingStatus: args.trackingStatus,
      externalShipmentId: args.externalShipmentId,
      externalLabelId: args.externalLabelId,
      labelUrl: args.labelUrl,
      labelFormat: args.labelFormat,
      labelPurchasedAt: now,
      items: args.items,
      note: undefined,
      shippedAt: undefined,
      deliveredAt: undefined,
      createdBy: args.actorUserId,
      createdAt: now,
      updatedAt: now,
    });

    await recalculateOrderFulfillment(ctx, args.orderId);

    await ctx.db.insert("commerce_order_history", {
      orderId: args.orderId,
      eventType: "shipment_created",
      message: "Shipping label purchased and shipment created.",
      actorUserId: args.actorUserId,
      metadata: {
        shipmentId,
        provider: args.provider,
        carrier: args.carrier,
        trackingNumber: args.trackingNumber,
        externalShipmentId: args.externalShipmentId,
        externalLabelId: args.externalLabelId,
        rawMetadata: args.rawMetadata,
      },
      createdAt: now,
    });

    return shipmentId;
  },
});

export const updateShipmentTrackingFromProvider = internalMutation({
  args: {
    shipmentId: v.id("commerce_shipments"),
    actorUserId: v.id("users"),
    status: v.optional(
      v.union(
        v.literal("label_created"),
        v.literal("shipped"),
        v.literal("delivered"),
        v.literal("returned"),
      ),
    ),
    trackingStatus: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    trackingUrl: v.optional(v.string()),
    labelUrl: v.optional(v.string()),
    rawMetadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) return null;

    const now = Date.now();
    await ctx.db.patch(shipment._id, {
      status: args.status ?? shipment.status,
      trackingStatus: args.trackingStatus ?? shipment.trackingStatus,
      trackingNumber: args.trackingNumber ?? shipment.trackingNumber,
      trackingUrl: args.trackingUrl ?? shipment.trackingUrl,
      labelUrl: args.labelUrl ?? shipment.labelUrl,
      shippedAt:
        (args.status === "shipped" || args.status === "delivered") && !shipment.shippedAt
          ? now
          : shipment.shippedAt,
      deliveredAt:
        args.status === "delivered" && !shipment.deliveredAt ? now : shipment.deliveredAt,
      updatedAt: now,
    });

    await recalculateOrderFulfillment(ctx, shipment.orderId);

    await ctx.db.insert("commerce_order_history", {
      orderId: shipment.orderId,
      eventType: "shipment_updated",
      message: `Shipment tracking synced from provider${args.status ? ` (${args.status})` : ""}.`,
      actorUserId: args.actorUserId,
      metadata: {
        shipmentId: shipment._id,
        trackingStatus: args.trackingStatus,
        trackingNumber: args.trackingNumber,
        rawMetadata: args.rawMetadata,
      },
      createdAt: now,
    });

    return shipment._id;
  },
});
