import { v } from "convex/values";

export const shippingProviderArg = v.union(
  v.literal("shipstation"),
  v.literal("ups"),
  v.literal("usps"),
  v.literal("fedex"),
  v.literal("dhl"),
);

export const getProviderConnectionArgs = {
  provider: shippingProviderArg,
};

export const upsertConnectionMetadataArgs = {
  provider: shippingProviderArg,
  displayName: v.string(),
  enabled: v.boolean(),
  mode: v.union(v.literal("sandbox"), v.literal("production")),
  isPrimary: v.boolean(),
  rateShoppingEnabled: v.boolean(),
  rateShoppingPriority: v.number(),
};

export const saveProviderSecretArgs = {
  provider: shippingProviderArg,
  credentials: v.any(),
};

export const createShipStationLabelForOrderArgs = {
  orderId: v.id("commerce_orders"),
};

export const syncShipStationTrackingArgs = {
  shipmentId: v.id("commerce_shipments"),
};

export const createShippingLabelForOrderArgs = {
  orderId: v.id("commerce_orders"),
};

export const syncShipmentTrackingArgs = {
  shipmentId: v.id("commerce_shipments"),
};

export const verifyDirectCarrierFoundationArgs = {
  provider: v.union(
    v.literal("ups"),
    v.literal("usps"),
    v.literal("fedex"),
    v.literal("dhl"),
  ),
};
