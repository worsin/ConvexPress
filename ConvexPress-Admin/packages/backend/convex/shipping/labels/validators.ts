import { v } from "convex/values";

export const purchaseLabelArgs = {
  orderId: v.id("commerce_orders"),
  rateQuoteKey: v.optional(v.string()),
  provider: v.optional(v.string()),
};

export const voidLabelArgs = {
  labelId: v.id("commerce_shipment_labels"),
  reason: v.optional(v.string()),
};

export const reprintLabelArgs = {
  labelId: v.id("commerce_shipment_labels"),
};

export const listLabelsArgs = {
  orderId: v.id("commerce_orders"),
};

export const getLabelArgs = {
  labelId: v.id("commerce_shipment_labels"),
};

export const batchPurchaseLabelsArgs = {
  orderIds: v.array(v.id("commerce_orders")),
};
