import { ConvexError } from "convex/values";

import { mutation, query } from "../_generated/server";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import { getBundlePurchaseDelta } from "../commerceBundles/runtime";
import { requireCommerceEnabled } from "./helpers";
import {
  getOrderItemInventoryAllocations,
  resolveInventoryAdjustment,
} from "./orderBundleHelpers";
import {
  captureOrderPaymentArgs,
  createShipmentArgs,
  createOrderRefundArgs,
  getOrderByCheckoutSessionArgs,
  getOrderArgs,
  getOrderByTrackingTokenArgs,
  listOrdersArgs,
  updateShipmentStatusArgs,
  updateOrderFulfillmentArgs,
  updateOrderStatusArgs,
} from "./validators";

async function enrichOrder(ctx: any, order: any) {
  const items = await ctx.db
    .query("commerce_order_items")
    .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
    .collect();
  const history = await ctx.db
    .query("commerce_order_history")
    .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
    .collect();
  const transactions = await ctx.db
    .query("commerce_payment_transactions")
    .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
    .collect();
  const refunds = await ctx.db
    .query("commerce_payment_refunds")
    .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
    .collect();
  const shipments = await ctx.db
    .query("commerce_shipments")
    .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
    .collect();

  return {
    ...order,
    items,
    history: history.sort((a: any, b: any) => a.createdAt - b.createdAt),
    transactions: transactions.sort((a: any, b: any) => b.createdAt - a.createdAt),
    refunds: refunds.sort((a: any, b: any) => b.createdAt - a.createdAt),
    shipments: shipments.sort((a: any, b: any) => b.createdAt - a.createdAt),
  };
}

async function appendOrderHistory(
  ctx: any,
  args: {
    orderId: any;
    eventType: string;
    message: string;
    actorUserId?: any;
    metadata?: Record<string, unknown>;
  },
) {
  await ctx.db.insert("commerce_order_history", {
    orderId: args.orderId,
    eventType: args.eventType,
    message: args.message,
    actorUserId: args.actorUserId,
    metadata: args.metadata,
    createdAt: Date.now(),
  });
}

async function resolveInventoryTarget(
  ctx: any,
  productId: any,
  variantId?: any,
) {
  const product = await ctx.db.get(productId);
  if (!product) {
    return null;
  }

  if (product.productType === "variable") {
    if (!variantId) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Variable product "${product.title}" is missing a selected variant.`,
      });
    }

    const variant = await ctx.db.get(variantId);
    if (!variant || variant.productId !== productId) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Inventory target is invalid for "${product.title}".`,
      });
    }

    return {
      product,
      variant,
      stockQuantity:
        typeof variant.stockQuantity === "number" ? variant.stockQuantity : 0,
      label: `${product.title} - ${variant.title}`,
      patchId: variant._id,
    };
  }

  return {
    product,
    variant: null,
    stockQuantity:
      typeof product.stockQuantity === "number" ? product.stockQuantity : 0,
    label: product.title,
    patchId: product._id,
  };
}

async function adjustBundleStockCapForOrderItem(
  ctx: any,
  args: {
    item: any;
    mode: "decrement" | "restore";
  },
) {
  const delta = getBundlePurchaseDelta(args.item.metadata, args.item.quantity);
  if (!delta) return;

  const bundle: any = await ctx.db.get(delta.bundleId);
  if (!bundle?.trackInventory || typeof bundle.stockCount !== "number") return;

  const nextStock =
    args.mode === "decrement"
      ? bundle.stockCount - delta.quantity
      : bundle.stockCount + delta.quantity;

  if (nextStock < 0) {
    throw new ConvexError({
      code: "OUT_OF_STOCK",
      message: `Bundle "${bundle.name}" does not have enough stock available.`,
    });
  }

  await ctx.db.patch(delta.bundleId, {
    stockCount: nextStock,
    updatedAt: Date.now(),
  });
}

async function adjustInventoryForOrder(
  ctx: any,
  args: {
    order: any;
    actorUserId?: any;
    mode: "decrement" | "restore";
    reason: string;
  },
) {
  const items = await ctx.db
    .query("commerce_order_items")
    .withIndex("by_order", (q: any) => q.eq("orderId", args.order._id))
    .collect();

  for (const item of items) {
    await adjustBundleStockCapForOrderItem(ctx, {
      item,
      mode: args.mode,
    });

    const allocations = getOrderItemInventoryAllocations(item);

    for (const allocation of allocations) {
      if (!allocation.productId) continue;
      const target = await resolveInventoryTarget(
        ctx,
        allocation.productId,
        allocation.variantId,
      );
      if (!target || target.product.trackInventory === false) continue;
      const adjustment = resolveInventoryAdjustment({
        mode: args.mode,
        stockQuantity: target.stockQuantity,
        allocationQuantity: allocation.quantity,
        allowBackorders: target.product.allowBackorders,
        label: target.label,
      });

      await ctx.db.patch(target.patchId, {
        stockQuantity: adjustment.nextStock,
        updatedAt: Date.now(),
      });

      await ctx.db.insert("commerce_inventory_adjustments", {
        productId: allocation.productId,
        variantId: allocation.variantId,
        adjustmentType: adjustment.adjustmentType,
        quantityDelta: adjustment.quantityDelta,
        reason: `${args.reason} (${args.order.orderNumber})`,
        actorUserId: args.actorUserId,
        createdAt: Date.now(),
      });
    }
  }
}

async function listShipmentsByOrder(ctx: any, orderId: any) {
  return ctx.db
    .query("commerce_shipments")
    .withIndex("by_order", (q: any) => q.eq("orderId", orderId))
    .collect();
}

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
  const shipments = await listShipmentsByOrder(ctx, orderId);

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

function buildShipmentNumber() {
  return `SHP-${Date.now().toString().slice(-8)}`;
}

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const list = query({
  args: listOrdersArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    let orders = await ctx.db.query("commerce_orders").take(2000);
    if (args.status) {
      orders = orders.filter((order: any) => order.status === args.status);
    }
    orders.sort((a: any, b: any) => b.createdAt - a.createdAt);
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return Promise.all(orders.map((order: any) => enrichOrder(ctx, order)));
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const get = query({
  args: getOrderArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");
    const order = await ctx.db.get(args.orderId);
    return order ? enrichOrder(ctx, order) : null;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const listMine = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    await requireCommerceEnabled(ctx);
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const orders = await ctx.db
      .query("commerce_orders")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .collect();

    orders.sort((a: any, b: any) => b.createdAt - a.createdAt);
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    return Promise.all(orders.map((order: any) => enrichOrder(ctx, order)));
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getMineById = query({
  args: getOrderArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const order = await ctx.db.get(args.orderId);
    if (!order) return null;

    if (order.userId?.toString() !== user._id.toString()) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot access this order.",
      });
    }

    return enrichOrder(ctx, order);
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getByCheckoutSession = query({
  args: getOrderByCheckoutSessionArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const order = await ctx.db.get(args.orderId);
    if (!order) return null;

    const session = order.checkoutSessionId
      ? await ctx.db.get(order.checkoutSessionId)
      : null;
    if (!session || session.sessionToken !== args.sessionToken.trim()) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "You cannot access this order.",
      });
    }

    return enrichOrder(ctx, order);
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getByTrackingToken = query({
  args: getOrderByTrackingTokenArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const trackingToken = args.trackingToken.trim();
    if (!trackingToken) return null;

    const order = await ctx.db
      .query("commerce_orders")
      .withIndex("by_trackingToken", (q: any) =>
        q.eq("trackingToken", trackingToken),
      )
      .unique();

    if (!order) return null;

    const enriched = await enrichOrder(ctx, order);
    return {
      _id: enriched._id,
      orderNumber: enriched.orderNumber,
      trackingToken: enriched.trackingToken,
      status: enriched.status,
      paymentStatus: enriched.paymentStatus,
      fulfillmentStatus: enriched.fulfillmentStatus,
      currencyCode: enriched.currencyCode,
      email: enriched.email,
      selectedShippingMethodCode: enriched.selectedShippingMethodCode,
      selectedShippingMethodLabel: enriched.selectedShippingMethodLabel,
      selectedPaymentMethodCode: enriched.selectedPaymentMethodCode,
      selectedPaymentMethodLabel: enriched.selectedPaymentMethodLabel,
      totalAmount: enriched.totalAmount,
      createdAt: enriched.createdAt,
      items: enriched.items.map((item: any) => ({
        _id: item._id,
        productTitle: item.productTitle,
        quantity: item.quantity,
        lineTotalAmount: item.lineTotalAmount,
        metadata: item.metadata,
      })),
      shipments: enriched.shipments.map((shipment: any) => ({
        _id: shipment._id,
        shipmentNumber: shipment.shipmentNumber,
        provider: shipment.provider,
        status: shipment.status,
        carrier: shipment.carrier,
        carrierCode: shipment.carrierCode,
        serviceName: shipment.serviceName,
        trackingNumber: shipment.trackingNumber,
        trackingUrl: shipment.trackingUrl,
        trackingStatus: shipment.trackingStatus,
        shippedAt: shipment.shippedAt,
        deliveredAt: shipment.deliveredAt,
      })),
      history: enriched.history
        .filter((entry: any) =>
          [
            "order_created",
            "status_changed",
            "payment_captured",
            "refund_created",
            "shipment_created",
            "shipment_updated",
            "fulfillment_updated",
          ].includes(entry.eventType),
        )
        .map((entry: any) => ({
          _id: entry._id,
          eventType: entry.eventType,
          message: entry.message,
          createdAt: entry.createdAt,
        })),
    };
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateStatus = mutation({
  args: updateOrderStatusArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const actor = await requireCan(ctx, "manage_options");
    const order = await ctx.db.get(args.orderId);

    if (!order) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Order not found.",
      });
    }

    const now = Date.now();
    const patch: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    if (args.status === "paid" && !order.paidAt) {
      patch.paidAt = now;
      patch.paymentStatus = order.paymentStatus === "pending" ? "paid" : order.paymentStatus;
    }

    if (
      args.status === "paid" &&
      !order.inventoryCommittedAt &&
      !order.inventoryReleasedAt
    ) {
      await adjustInventoryForOrder(ctx, {
        order,
        actorUserId: actor._id,
        mode: "decrement",
        reason: "Inventory allocated after order marked paid",
      });
      patch.inventoryCommittedAt = now;
    }

    if (
      (args.status === "cancelled" || args.status === "failed") &&
      order.inventoryCommittedAt &&
      !order.inventoryReleasedAt
    ) {
      await adjustInventoryForOrder(ctx, {
        order,
        actorUserId: actor._id,
        mode: "restore",
        reason: "Inventory restored after order cancellation/failure",
      });
      patch.inventoryReleasedAt = now;
    }

    if (args.status === "fulfilled") {
      patch.fulfillmentStatus = "fulfilled";
    }

    await ctx.db.patch(order._id, patch);
    await appendOrderHistory(ctx, {
      orderId: order._id,
      eventType: "status_changed",
      message: args.note?.trim()
        ? `Order status changed to ${args.status}: ${args.note.trim()}`
        : `Order status changed to ${args.status}.`,
      actorUserId: actor._id,
      metadata: {
        previousStatus: order.status,
        nextStatus: args.status,
      },
    });

    return order._id;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateFulfillment = mutation({
  args: updateOrderFulfillmentArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const actor = await requireCan(ctx, "manage_options");
    const order = await ctx.db.get(args.orderId);

    if (!order) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Order not found.",
      });
    }

    await ctx.db.patch(order._id, {
      fulfillmentStatus: args.fulfillmentStatus,
      status:
        args.fulfillmentStatus === "fulfilled" && order.status === "paid"
          ? "fulfilled"
          : order.status,
      updatedAt: Date.now(),
    });

    await appendOrderHistory(ctx, {
      orderId: order._id,
      eventType: "fulfillment_updated",
      message: args.note?.trim()
        ? `Fulfillment updated to ${args.fulfillmentStatus}: ${args.note.trim()}`
        : `Fulfillment updated to ${args.fulfillmentStatus}.`,
      actorUserId: actor._id,
      metadata: {
        previousFulfillmentStatus: order.fulfillmentStatus,
        nextFulfillmentStatus: args.fulfillmentStatus,
      },
    });

    return order._id;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const capturePayment = mutation({
  args: captureOrderPaymentArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const actor = await requireCan(ctx, "manage_options");
    const order = await ctx.db.get(args.orderId);

    if (!order) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Order not found.",
      });
    }

    const now = Date.now();
    const capturedAmount = args.amount ?? order.totalAmount;

    if (
      capturedAmount >= order.totalAmount &&
      !order.inventoryCommittedAt &&
      !order.inventoryReleasedAt
    ) {
      await adjustInventoryForOrder(ctx, {
        order,
        actorUserId: actor._id,
        mode: "decrement",
        reason: "Inventory allocated after payment capture",
      });
    }

    await ctx.db.insert("commerce_payment_transactions", {
      orderId: order._id,
      provider: args.provider,
      providerTransactionId: args.providerTransactionId,
      status: "captured",
      amount: {
        amount: capturedAmount,
        currencyCode: order.currencyCode,
      },
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(order._id, {
      paymentStatus: capturedAmount >= order.totalAmount ? "paid" : "partially_paid",
      status:
        order.status === "pending" || order.status === "failed"
          ? "paid"
          : order.status,
      inventoryCommittedAt:
        capturedAmount >= order.totalAmount && !order.inventoryCommittedAt
          ? now
          : order.inventoryCommittedAt,
      paidAt: order.paidAt ?? now,
      updatedAt: now,
    });

    await appendOrderHistory(ctx, {
      orderId: order._id,
      eventType: "payment_captured",
      message: args.note?.trim()
        ? `Payment captured via ${args.provider}: ${args.note.trim()}`
        : `Payment captured via ${args.provider}.`,
      actorUserId: actor._id,
      metadata: {
        provider: args.provider,
        providerTransactionId: args.providerTransactionId,
        amount: capturedAmount,
      },
    });

    return order._id;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createRefund = mutation({
  args: createOrderRefundArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const actor = await requireCan(ctx, "manage_options");
    const order = await ctx.db.get(args.orderId);

    if (!order) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Order not found.",
      });
    }

    if (args.amount <= 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Refund amount must be greater than zero.",
      });
    }

    const refunds = await ctx.db
      .query("commerce_payment_refunds")
      .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
      .collect();
    const refundedAmount = refunds.reduce(
      (sum: number, refund: any) => sum + refund.amount.amount,
      0,
    );

    if (refundedAmount + args.amount > order.totalAmount) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Refund amount exceeds the remaining paid total.",
      });
    }

    const now = Date.now();
    await ctx.db.insert("commerce_payment_refunds", {
      orderId: order._id,
      amount: {
        amount: args.amount,
        currencyCode: order.currencyCode,
      },
      reason: args.reason,
      status: "completed",
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });

    const nextRefundedTotal = refundedAmount + args.amount;
    const isFullyRefunded = nextRefundedTotal >= order.totalAmount;

    if (isFullyRefunded && order.inventoryCommittedAt && !order.inventoryReleasedAt) {
      await adjustInventoryForOrder(ctx, {
        order,
        actorUserId: actor._id,
        mode: "restore",
        reason: "Inventory restored after full refund",
      });
    }

    await ctx.db.patch(order._id, {
      paymentStatus: isFullyRefunded ? "refunded" : "partially_refunded",
      status: isFullyRefunded ? "refunded" : order.status,
      inventoryReleasedAt:
        isFullyRefunded && order.inventoryCommittedAt && !order.inventoryReleasedAt
          ? now
          : order.inventoryReleasedAt,
      updatedAt: now,
    });

    await appendOrderHistory(ctx, {
      orderId: order._id,
      eventType: "refund_created",
      message: args.reason?.trim()
        ? `Refund created for ${args.amount}: ${args.reason.trim()}`
        : `Refund created for ${args.amount}.`,
      actorUserId: actor._id,
      metadata: {
        amount: args.amount,
        refundedTotal: nextRefundedTotal,
      },
    });

    return order._id;
  },
});

/**
 * BUNDLE FULFILLMENT POLICY:
 * Bundles are shipped as a single line item. Component-level pick/pack
 * is not currently supported. If operations need component-level tracking,
 * implement a bundle expansion step in shipment creation.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const createShipment = mutation({
  args: createShipmentArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const actor = await requireCan(ctx, "manage_options");
    const order = await ctx.db.get(args.orderId);

    if (!order) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Order not found.",
      });
    }

    const orderItems = await ctx.db
      .query("commerce_order_items")
      .withIndex("by_order", (q: any) => q.eq("orderId", order._id))
      .collect();
    const shipments = await listShipmentsByOrder(ctx, order._id);

    const alreadyAllocated = new Map<string, number>();
    for (const shipment of shipments) {
      if (!shipmentCountsTowardFulfillment(shipment.status)) continue;
      for (const shipmentItem of shipment.items) {
        const key = shipmentItem.orderItemId.toString();
        alreadyAllocated.set(
          key,
          (alreadyAllocated.get(key) ?? 0) + shipmentItem.quantity,
        );
      }
    }

    const requestedItems = args.items?.length
      ? args.items
      : orderItems.reduce(
          (
            acc: Array<{
              orderItemId: any;
              quantity: number;
            }>,
            item: any,
          ) => {
            const remaining =
              item.quantity - (alreadyAllocated.get(item._id.toString()) ?? 0);
            if (remaining > 0) {
              acc.push({
                orderItemId: item._id,
                quantity: remaining,
              });
            }
            return acc;
          },
          [],
        );

    if (!requestedItems.length) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "No remaining items are available to ship.",
      });
    }

    for (const shipmentItem of requestedItems) {
      const orderItem = orderItems.find(
        (item: any) => item._id.toString() === shipmentItem.orderItemId.toString(),
      );

      if (!orderItem) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Shipment contains an invalid order item.",
        });
      }

      const remaining =
        orderItem.quantity - (alreadyAllocated.get(orderItem._id.toString()) ?? 0);

      if (shipmentItem.quantity <= 0 || shipmentItem.quantity > remaining) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Shipment quantity exceeds remaining quantity for ${orderItem.productTitle}.`,
        });
      }
    }

    const now = Date.now();
    const status = args.status ?? "label_created";
    // PRD A4 — snapshot the ship-from location on every manual shipment so
    // downstream D3 manifest routing works. Prefer the order's stored
    // shipFromLocationId (set at checkout finalize); fall back to the
    // default location.
    let manualShipFromLocationId: any = (order as any).shipFromLocationId;
    if (!manualShipFromLocationId) {
      const defaultLoc: any = await ctx.db
        .query("commerce_ship_from_locations")
        .withIndex("by_default", (q: any) => q.eq("isDefault", true))
        .first();
      manualShipFromLocationId = defaultLoc?._id;
    }
    const shipmentId = await ctx.db.insert("commerce_shipments", {
      orderId: order._id,
      shipmentNumber: buildShipmentNumber(),
      status,
      provider: args.provider?.trim() || undefined,
      carrier: args.carrier?.trim() || undefined,
      trackingNumber: args.trackingNumber?.trim() || undefined,
      trackingUrl: args.trackingUrl?.trim() || undefined,
      shipFromLocationId: manualShipFromLocationId,
      items: requestedItems as any,
      note: args.note?.trim() || undefined,
      shippedAt: status === "shipped" || status === "delivered" ? now : undefined,
      deliveredAt: status === "delivered" ? now : undefined,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });

    await recalculateOrderFulfillment(ctx, order._id);
    await appendOrderHistory(ctx, {
      orderId: order._id,
      eventType: "shipment_created",
      message: args.note?.trim()
        ? `Shipment created: ${args.note.trim()}`
        : "Shipment created.",
      actorUserId: actor._id,
      metadata: {
        shipmentId,
        shipmentStatus: status,
        trackingNumber: args.trackingNumber?.trim() || undefined,
      },
    });

    return shipmentId;
  },
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const updateShipmentStatus = mutation({
  args: updateShipmentStatusArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requireCommerceEnabled(ctx);
    const actor = await requireCan(ctx, "manage_options");
    const shipment = await ctx.db.get(args.shipmentId);

    if (!shipment) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Shipment not found.",
      });
    }

    const now = Date.now();
    await ctx.db.patch(shipment._id, {
      status: args.status,
      provider: args.provider?.trim() || shipment.provider,
      carrier: args.carrier?.trim() || shipment.carrier,
      trackingNumber: args.trackingNumber?.trim() || shipment.trackingNumber,
      trackingUrl: args.trackingUrl?.trim() || shipment.trackingUrl,
      shippedAt:
        args.status === "shipped" || args.status === "delivered"
          ? shipment.shippedAt ?? now
          : shipment.shippedAt,
      deliveredAt: args.status === "delivered" ? now : shipment.deliveredAt,
      updatedAt: now,
    });

    await recalculateOrderFulfillment(ctx, shipment.orderId);
    await appendOrderHistory(ctx, {
      orderId: shipment.orderId,
      eventType: "shipment_updated",
      message: args.note?.trim()
        ? `Shipment updated to ${args.status}: ${args.note.trim()}`
        : `Shipment updated to ${args.status}.`,
      actorUserId: actor._id,
      metadata: {
        shipmentId: shipment._id,
        previousStatus: shipment.status,
        nextStatus: args.status,
      },
    });

    return shipment._id;
  },
});
