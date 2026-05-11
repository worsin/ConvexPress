import { ConvexError } from "convex/values";

import { getSettingsDoc, mergeWithDefaults } from "../settings/helpers";
import { normalizeStoredReturnItems } from "./itemState";

type ReturnsCtx = {
  db: {
    get: (id: any) => Promise<any>;
    query: (table: string) => any;
  };
};

export const CUSTOMER_RETURNABLE_ORDER_STATUSES = new Set([
  "completed",
  "fulfilled",
]);

const NON_BLOCKING_RETURN_STATUSES = new Set(["rejected"]);

export interface ReturnsPolicySettings {
  returnWindowDays: number;
  requireDeliveryBeforeReturn: boolean;
}

export function evaluateReturnPolicyWindow(args: {
  orderStatus: string;
  requireDeliveryBeforeReturn: boolean;
  returnWindowDays: number;
  deliveryTimestamp?: number;
  fallbackTimestamp?: number;
  now: number;
}) {
  const referenceTimestamp =
    typeof args.deliveryTimestamp === "number"
      ? args.deliveryTimestamp
      : args.fallbackTimestamp;
  const hasDeliveredSignal =
    typeof args.deliveryTimestamp === "number" ||
    (!args.requireDeliveryBeforeReturn && typeof referenceTimestamp === "number") ||
    args.orderStatus === "completed";
  const returnWindowEndsAt =
    typeof referenceTimestamp === "number"
      ? referenceTimestamp + args.returnWindowDays * 24 * 60 * 60 * 1000
      : undefined;
  const withinReturnWindow =
    args.returnWindowDays <= 0
      ? true
      : typeof returnWindowEndsAt === "number"
        ? args.now <= returnWindowEndsAt
        : !args.requireDeliveryBeforeReturn;

  return {
    hasDeliveredSignal,
    returnWindowEndsAt,
    withinReturnWindow,
  };
}

export interface ReturnEligibilityItem {
  orderItemId: string;
  productId: string;
  productTitle: string;
  sku?: string;
  quantityOrdered: number;
  quantityAlreadyRequested: number;
  quantityAvailableToReturn: number;
  lineTotalAmount: number;
  eligible: boolean;
}

async function getReturnsPolicySettings(ctx: ReturnsCtx): Promise<ReturnsPolicySettings> {
  const doc = await getSettingsDoc(ctx as any, "commerce.general");
  const settings = mergeWithDefaults(
    "commerce.general",
    doc?.values as Record<string, unknown> | null | undefined,
  );

  return {
    returnWindowDays:
      typeof settings.returnWindowDays === "number" ? settings.returnWindowDays : 30,
    requireDeliveryBeforeReturn:
      settings.requireDeliveryBeforeReturn !== false,
  };
}

async function getOrderDeliveryTimestamp(
  ctx: ReturnsCtx,
  orderId: any,
  order: any,
  requireDeliveryBeforeReturn: boolean,
) {
  const shipments = await ctx.db
    .query("commerce_shipments")
    .withIndex("by_order", (q: any) => q.eq("orderId", orderId))
    .collect();

  const deliveredTimestamps = shipments
    .map((shipment: any) => shipment.deliveredAt)
    .filter((value: any): value is number => typeof value === "number");

  if (deliveredTimestamps.length > 0) {
    return Math.max(...deliveredTimestamps);
  }

  if (!requireDeliveryBeforeReturn && typeof order.paidAt === "number") {
    return order.paidAt;
  }

  if (order.status === "completed") {
    return order.updatedAt ?? order.paidAt ?? order.createdAt;
  }

  return order.paidAt ?? order.createdAt;
}

function normalizeReturnItems(
  returnRequest: any,
  returnItems?: any[],
): Array<{ orderItemId: string; quantity: number }> {
  return normalizeStoredReturnItems(returnRequest, returnItems).map((item) => ({
    orderItemId: item.orderItemId ?? "",
    quantity: item.quantityRequested,
  }));
}

export function buildRequestedQuantityMap(
  returnRequests: any[],
  options?: {
    excludeReturnId?: string;
    returnItemsByReturnId?: Map<string, any[]>;
  },
) {
  const quantities = new Map<string, number>();

  for (const returnRequest of returnRequests) {
    if (!returnRequest) continue;
    if (NON_BLOCKING_RETURN_STATUSES.has(returnRequest.status)) continue;
    if (
      options?.excludeReturnId &&
      returnRequest._id?.toString() === options.excludeReturnId
    ) {
      continue;
    }

    const normalizedItems = normalizeReturnItems(
      returnRequest,
      options?.returnItemsByReturnId?.get(returnRequest._id?.toString()),
    );
    for (const item of normalizedItems) {
      const orderItemId = item.orderItemId?.toString();
      if (!orderItemId) continue;
      quantities.set(orderItemId, (quantities.get(orderItemId) ?? 0) + item.quantity);
    }
  }

  return quantities;
}

export function assertValidRequestedItems(
  requestedItems: Array<{ orderItemId: string; quantity: number }>,
  availableQuantities: Map<string, number>,
) {
  if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Select at least one item to return.",
    });
  }

  const aggregated = new Map<string, number>();

  for (const item of requestedItems) {
    const orderItemId = item.orderItemId?.toString();
    if (!orderItemId) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Each return item must include an order item id.",
      });
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Return quantities must be positive whole numbers.",
      });
    }

    aggregated.set(orderItemId, (aggregated.get(orderItemId) ?? 0) + item.quantity);
  }

  for (const [orderItemId, quantity] of aggregated) {
    const available = availableQuantities.get(orderItemId);
    if (available === undefined) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "One or more selected items do not belong to this order.",
      });
    }

    if (quantity > available) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "One or more selected quantities exceed the remaining returnable amount.",
      });
    }
  }
}

export async function getCustomerOrderReturnEligibility(
  ctx: ReturnsCtx,
  args: {
    orderId: any;
    userId: any;
    excludeReturnId?: string;
  },
) {
  const order = await ctx.db.get(args.orderId);
  if (!order) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Order not found.",
    });
  }

  const policy = await getReturnsPolicySettings(ctx);

  if (order.userId?.toString() !== args.userId.toString()) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "You can only access your own orders.",
    });
  }

  const orderItems = await ctx.db
    .query("commerce_order_items")
    .withIndex("by_order", (q: any) => q.eq("orderId", args.orderId))
    .collect();

  const existingReturns = await ctx.db
    .query("commerce_return_requests")
    .withIndex("by_order", (q: any) => q.eq("orderId", args.orderId))
    .collect();

  const returnItemsByReturnId = new Map<string, any[]>();
  await Promise.all(
    existingReturns.map(async (returnRequest: any) => {
      const returnItems = await ctx.db
        .query("commerce_return_items")
        .withIndex("by_return_request", (q: any) =>
          q.eq("returnRequestId", returnRequest._id),
        )
        .collect();
      if (returnItems.length > 0) {
        returnItemsByReturnId.set(returnRequest._id.toString(), returnItems);
      }
    }),
  );

  const requestedQuantities = buildRequestedQuantityMap(existingReturns, {
    excludeReturnId: args.excludeReturnId,
    returnItemsByReturnId,
  });

  const orderItemsList: any[] = orderItems as any[];
  const items: ReturnEligibilityItem[] = orderItemsList.map((item: any) => {
    const alreadyRequested = requestedQuantities.get(item._id.toString()) ?? 0;
    const available = Math.max(0, item.quantity - alreadyRequested);

    return {
      orderItemId: item._id.toString(),
      productId: item.productId?.toString(),
      productTitle: item.productTitle,
      sku: item.sku,
      quantityOrdered: item.quantity,
      quantityAlreadyRequested: alreadyRequested,
      quantityAvailableToReturn: available,
      lineTotalAmount: item.lineTotalAmount,
      eligible: available > 0,
    };
  });

  const statusEligible = CUSTOMER_RETURNABLE_ORDER_STATUSES.has(order.status);
  const deliveryTimestamp = await getOrderDeliveryTimestamp(
    ctx,
    args.orderId,
    order,
    policy.requireDeliveryBeforeReturn,
  );
  const {
    hasDeliveredSignal,
    returnWindowEndsAt,
    withinReturnWindow,
  } = evaluateReturnPolicyWindow({
    orderStatus: order.status,
    requireDeliveryBeforeReturn: policy.requireDeliveryBeforeReturn,
    returnWindowDays: policy.returnWindowDays,
    deliveryTimestamp,
    fallbackTimestamp: order.paidAt ?? order.createdAt,
    now: Date.now(),
  });
  let hasEligibleItems = false;
  for (const item of items) {
    if (item.eligible) {
      hasEligibleItems = true;
      break;
    }
  }

  let ineligibleReason: string | null = null;
  if (!statusEligible) {
    ineligibleReason = `Order status ${order.status} is not eligible for returns.`;
  } else if (policy.requireDeliveryBeforeReturn && !hasDeliveredSignal) {
    ineligibleReason = "This order is not eligible for returns until delivery is confirmed.";
  } else if (!withinReturnWindow) {
    ineligibleReason = `This order is outside the ${policy.returnWindowDays}-day return window.`;
  } else if (!hasEligibleItems) {
    ineligibleReason = "All items from this order have already been requested for return.";
  }

  return {
    order,
    items,
    existingReturns,
    policy,
    deliveryTimestamp,
    returnWindowEndsAt,
    isEligible:
      statusEligible &&
      hasEligibleItems &&
      (!policy.requireDeliveryBeforeReturn || hasDeliveredSignal) &&
      withinReturnWindow,
    ineligibleReason,
  };
}
