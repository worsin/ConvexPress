import { assertCheckoutAccess } from "../commerce/shopperAccess";
import type { RegisteredQuery, RegisteredMutation } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import { selectCheckoutSession } from "../commerce/cartLifecycle";
import { ConvexError, v, type Infer } from "convex/values";
import { labelOriginProofValidator, type LabelOriginProof } from "./labelOrigin";
import { persistedShippingQuoteValidator } from "./quoteProvenance";

import { internalMutation, internalQuery } from "../_generated/server";
import { requireCommerceEnabled } from "../commerce/helpers";
import { lookupUserByIdentifier } from "../helpers/permissions";
import { zoneMatchesAddress } from "./helpers";
import { shippingProviderArg } from "./validators";
import { patchDynamicWithMediaReferences } from "../media/attachmentGuard";


// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
const connectionStatusArg = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("disconnected"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("connected"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("degraded"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
    order.fulfillmentStatus === "needs_review" ? "needs_review" :
    shippedQuantity <= 0
      ? "unfulfilled"
      : shippedQuantity >= totalQuantity
        ? "fulfilled"
        : "partial";

  await patchDynamicWithMediaReferences(ctx, orderId, {
    fulfillmentStatus: nextFulfillmentStatus,
    status:
      nextFulfillmentStatus === "fulfilled" && order.status === "paid"
        ? "fulfilled"
        : order.status,
    updatedAt: Date.now(),
  });
}

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const matchZoneForAddress = internalQuery({
  args: {
    countryCode: v.string(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    state: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    postalCode: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    const zones = await ctx.db.query("commerce_shipping_zones").collect();
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    const sorted = zones
      .filter((z: any) => z.enabled !== false)
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    for (const zone of sorted) {
      if (!zoneMatchesAddress(zone, args)) continue;

      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const saveQuoteDiagnostics = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    checkoutSessionId: v.optional(v.id("commerce_checkout_sessions")),
    requestedAt: v.number(),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    requestedBy: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    shippingAddress: v.optional(v.any()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    providerResults: v.array(
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      v.object({
        provider: v.string(),
        attempted: v.boolean(),
        success: v.boolean(),
        quoteCount: v.number(),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        durationMs: v.optional(v.number()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        errorCode: v.optional(v.string()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        errorMessage: v.optional(v.string()),
        // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
        skippedReason: v.optional(v.string()),
      }),
    ),
    totalQuotes: v.number(),
    fallbackUsed: v.boolean(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return ctx.db.insert("shipping_quote_diagnostics", args);
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getProviderSecret = internalQuery({
  args: {
    provider: shippingProviderArg,
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("shipping_provider_connections")
      .withIndex("by_provider", (q: any) => q.eq("provider", args.provider))
      .unique();

    if (!connection) {
      return null;
    }

    const secret = await ctx.db
      .query("shipping_provider_secrets")
      .withIndex("by_connection", (q: any) => q.eq("connectionId", connection._id))
      .unique();

    return {
      // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
      connection,
      secret,
    };
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const listProviderConnections = internalQuery({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    return ctx.db.query("shipping_provider_connections").collect();
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateConnectionHealth = internalMutation({
  args: {
    provider: shippingProviderArg,
    status: connectionStatusArg,
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    lastSyncAt: v.optional(v.number()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    lastErrorCode: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    lastErrorMessage: v.optional(v.string()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("shipping_provider_connections")
      .withIndex("by_provider", (q: any) => q.eq("provider", args.provider))
      .unique();

    if (!connection) return null;

    await ctx.db.patch("shipping_provider_connections", connection._id, {
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const syncProviderAccountsAndServices = internalMutation({
  args: {
    provider: shippingProviderArg,
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    carriers: v.array(v.any()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("shipping_provider_connections")
      .withIndex("by_provider", (q: any) => q.eq("provider", args.provider))
      .unique();

    if (!connection) return null;

    const existingAccounts = await ctx.db
      .query("shipping_provider_accounts")
      .withIndex("by_connection", (q: any) => q.eq("connectionId", connection._id))
      .collect();

    for (const account of existingAccounts) {
      const services = await ctx.db
        .query("shipping_provider_services")
        .withIndex("by_account", (q: any) => q.eq("accountId", account._id))
        .collect();
      for (const service of services) {
        await ctx.db.delete("shipping_provider_services", service._id);
      }
      await ctx.db.delete("shipping_provider_accounts", account._id);
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

    await ctx.db.patch("shipping_provider_connections", connection._id, {
      lastSyncAt: now,
      updatedAt: now,
    });

    return connection._id;
  },
});

type CheckoutRateContext = {
  checkoutSession: Doc<"commerce_checkout_sessions">;
  cart: Doc<"commerce_carts">;
  items: Array<Doc<"commerce_cart_items"> & { product: Doc<"commerce_products"> | null }>;
  shipstationConnection: Doc<"shipping_provider_connections"> | null;
} | null;
export const getRateContextForSession: RegisteredQuery<"internal", { sessionToken: string }, CheckoutRateContext> = internalQuery({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);

    const checkoutSessions = await ctx.db
      .query("commerce_checkout_sessions")
      .withIndex("by_session", (q: any) => q.eq("sessionToken", args.sessionToken))
      .collect();
    const checkoutSession = selectCheckoutSession<Doc<"commerce_checkout_sessions">>(checkoutSessions);
    if (!checkoutSession) return null;
    await assertCheckoutAccess(ctx, checkoutSession, args.sessionToken);

    const cart = await ctx.db.get(checkoutSession.cartId);
    if (!cart) return null;

    const items = await ctx.db
      .query("commerce_cart_items")
      .withIndex("by_cart", (q: any) => q.eq("cartId", cart._id))
      .collect();

    const enrichedItems = await Promise.all(
      items.map(async (item: any) => ({
        ...item,
        product: await ctx.db.get(item.productId),
      })),
    );

    const connection = await ctx.db
      .query("shipping_provider_connections")
      .withIndex("by_provider", (q: any) => q.eq("provider", "shipstation"))
      .unique();

    return {
      checkoutSession,
      cart,
      items: enrichedItems,
      shipstationConnection: connection,
    };
  },
});

type ReplaceCheckoutQuotesArgs = {checkoutSessionId:Id<"commerce_checkout_sessions">;quotes:Infer<typeof persistedShippingQuoteValidator>[];addressKey?:string;cartKey?:string};
export const replaceCheckoutQuotes: RegisteredMutation<"internal",ReplaceCheckoutQuotesArgs,Id<"commerce_checkout_sessions">> = internalMutation({
  args: {
    checkoutSessionId:v.id("commerce_checkout_sessions"),quotes:v.array(persistedShippingQuoteValidator),
    addressKey:v.optional(v.string()),cartKey:v.optional(v.string()),
  },
  returns:v.id("commerce_checkout_sessions"),
  handler: async (ctx,args) => {
    if(args.quotes.length>500)throw new ConvexError({code:"SHIPPING_QUOTE_CAPACITY",message:"Too many shipping quotes for one checkout."});
    const now=Date.now();
    const keys=new Set<string>();
    for(const quote of args.quotes){
      if(!quote.quoteKey || keys.has(quote.quoteKey) || !Number.isSafeInteger(quote.amount) || quote.amount<0 ||
        (quote.expiresAt!==undefined && (!Number.isSafeInteger(quote.expiresAt) || quote.expiresAt<=now))) {
        throw new ConvexError({code:"INVALID_SHIPPING_QUOTE",message:"Shipping quotes must have unique keys, valid prices and a future expiry."});
      }
      for(const pkg of quote.packages??[])for(const value of [pkg.weightOz,pkg.lengthIn,pkg.widthIn,pkg.heightIn]) {
        if(value!==undefined && (!Number.isFinite(value)||value<=0))throw new ConvexError({code:"INVALID_SHIPPING_QUOTE",message:"Quoted package measurements must be positive finite numbers."});
      }
      keys.add(quote.quoteKey);
    }
    const existing=await ctx.db.query("commerce_shipping_rate_quotes")
      .withIndex("by_checkout",q=>q.eq("checkoutSessionId",args.checkoutSessionId)).take(501);
    if(existing.length>500)throw new ConvexError({code:"SHIPPING_QUOTE_CAPACITY",message:"Stored shipping quotes exceed the checkout replacement budget."});
    for(const quote of existing)await ctx.db.delete("commerce_shipping_rate_quotes",quote._id);
    for(const quote of args.quotes)await ctx.db.insert("commerce_shipping_rate_quotes",{
      ...quote,checkoutSessionId:args.checkoutSessionId,
      addressKey:args.addressKey??quote.addressKey,cartKey:args.cartKey??quote.cartKey,
      expiresAt:quote.expiresAt??now+300_000,createdAt:now,
    });
    return args.checkoutSessionId;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const checkShippingAdminAction = internalQuery({
  args: {
    userId: v.string(),
    capability: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
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
        .withIndex("by_slug", (q: any) => q.eq("slug", user.internalRole as string))
        .unique();
      if (role && role.status === "active") {
        capabilities = role.capabilities ?? [];
      }
    }

    if (!capabilities.includes(args.capability)) {
      console.warn(
        `Shipping admin action denied: user=${user._id} capability=${args.capability}`,
      );
      throw new Error("Insufficient permissions");
    }

    return { authorized: true, userId: user._id };
  },
});

type OrderLabelContext = {
  order: Doc<"commerce_orders">;
  items: Doc<"commerce_order_items">[];
  quote: Doc<"commerce_shipping_rate_quotes"> | null;
  existingShipment: Doc<"commerce_shipments"> | undefined;
} | null;
export const getLabelContextForOrder: RegisteredQuery<"internal", { orderId: Id<"commerce_orders"> }, OrderLabelContext> = internalQuery({
  args: {
    orderId: v.id("commerce_orders"),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;

    const items = await ctx.db
      .query("commerce_order_items")
      .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
      .collect();
    const quote =
      order.checkoutSessionId && order.selectedShippingMethodCode
        ? await ctx.db
            .query("commerce_shipping_rate_quotes")
            .withIndex("by_checkout", (q: any) =>
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
      .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
      .collect();
    const existingShipment = shipments.find(
      (shipment: any) => shipment.externalLabelId || shipment.trackingNumber,
    );

    return {
      order,
      items,
      quote,
      existingShipment,
    };
  },
});

export const getShipmentForTracking: RegisteredQuery<"internal", { shipmentId: Id<"commerce_shipments"> }, { shipment: Doc<"commerce_shipments">; order: Doc<"commerce_orders"> | null } | null> = internalQuery({
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

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateOrderShippingSnapshot = internalMutation({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    orderId: v.id("commerce_orders"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    shippingProvider: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    shippingCarrierCode: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    shippingCarrierName: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    shippingServiceCode: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    shippingServiceName: v.optional(v.string()),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    shippingQuoteRaw: v.optional(v.any()),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await ctx.db.patch("commerce_orders", args.orderId, {
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

type CreateShipmentFromLabelArgs = {
  orderId: Id<"commerce_orders">;
  actorUserId: Id<"users">;
  shipmentNumber: string;
  provider: string;
  status: "label_created" | "shipped" | "delivered" | "returned";
  carrier?: string;
  carrierCode?: string;
  serviceCode?: string;
  serviceName?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  trackingStatus?: string;
  externalShipmentId?: string;
  externalLabelId?: string;
  labelUrl?: string;
  labelFormat?: string;
  items: { orderItemId: Id<"commerce_order_items">; quantity: number }[];
  rawMetadata?: import("convex/values").Value;
  originProof?: LabelOriginProof;
};
const createShipmentFromLabelValidator=v.object({
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
      originProof:v.optional(labelOriginProofValidator),
});
export const createOrderShipmentFromLabel: RegisteredMutation<"internal",CreateShipmentFromLabelArgs,Id<"commerce_shipments">> = internalMutation({
  args:createShipmentFromLabelValidator.fields,
  returns:v.id("commerce_shipments"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const shipmentId = await ctx.db.insert("commerce_shipments", {
      orderId: args.orderId,
      shipmentNumber: args.shipmentNumber,
      status: args.status,
      provider: args.provider,
      shipFromLocationId: args.originProof?.origin.shipFromLocationId,
      originProof:args.originProof,
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
        originProof:args.originProof,
      },
      createdAt: now,
    });

    return shipmentId;
  },
});

type ShipmentTrackingUpdate = {
  shipmentId: Id<"commerce_shipments">;
  actorUserId: Id<"users">;
  status?: "label_created" | "shipped" | "delivered" | "returned";
  trackingStatus?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  labelUrl?: string;
  rawMetadata?: unknown;
};
export const updateShipmentTrackingFromProvider: RegisteredMutation<"internal", ShipmentTrackingUpdate, Id<"commerce_shipments"> | null> = internalMutation({
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
    await ctx.db.patch("commerce_shipments", shipment._id, {
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
