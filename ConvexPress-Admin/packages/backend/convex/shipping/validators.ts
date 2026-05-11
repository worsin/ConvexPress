import { v } from "convex/values";

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const shippingProviderArg = v.union(
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("shipstation"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("ups"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("usps"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("fedex"),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  v.literal("dhl"),
);

export const getProviderConnectionArgs = {
  provider: shippingProviderArg,
};

export const upsertConnectionMetadataArgs = {
  provider: shippingProviderArg,
  displayName: v.string(),
  enabled: v.boolean(),
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  mode: v.union(v.literal("sandbox"), v.literal("production")),
  isPrimary: v.boolean(),
  rateShoppingEnabled: v.boolean(),
  rateShoppingPriority: v.number(),
  // Tier 1.2 — per-connection webhook signing secret (optional, falls back to env var)
  webhookSecret: v.optional(v.string()),
};

export const saveProviderSecretArgs = {
  provider: shippingProviderArg,
  credentials: v.any(),
};

export const createShipStationLabelForOrderArgs = {
  orderId: v.id("commerce_orders"),
  rateId: v.optional(v.string()),
};

export const syncShipStationTrackingArgs = {
  shipmentId: v.id("commerce_shipments"),
};

export const createShippingLabelForOrderArgs = {
  orderId: v.id("commerce_orders"),
  rateId: v.optional(v.string()),
};

export const syncShipmentTrackingArgs = {
  shipmentId: v.id("commerce_shipments"),
};

export const verifyDirectCarrierFoundationArgs = {
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  provider: v.union(
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.literal("ups"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.literal("usps"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.literal("fedex"),
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    v.literal("dhl"),
  ),
};
