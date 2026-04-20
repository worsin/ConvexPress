export interface StoredReturnLineItem {
  orderItemId?: string;
  quantity?: number;
  quantityRequested?: number;
  quantityApproved?: number;
  quantityReceived?: number;
  quantityRestocked?: number;
  reason?: string;
  reasonCode?: string;
  reasonText?: string;
  conditionCode?: string;
  resolutionType?: string;
}

export interface NormalizedReturnLineItem {
  orderItemId?: string;
  quantity: number;
  quantityRequested: number;
  quantityApproved: number;
  quantityReceived: number;
  quantityRestocked: number;
  reason?: string;
  conditionCode?: string;
  resolutionType?: string;
}

export interface ReturnItemUpdateInput {
  orderItemId?: string;
  quantityApproved?: number;
  quantityReceived?: number;
  conditionCode?: string;
  resolutionType?: string;
}

export interface ReturnOrderItemPricingInput {
  _id?: string;
  quantity?: number;
  lineTotalAmount?: number;
  unitPriceAmount?: number;
}

export function getRequestedQuantity(item: StoredReturnLineItem) {
  return Math.max(0, item.quantityRequested ?? item.quantity ?? 0);
}

export function getApprovedQuantity(item: StoredReturnLineItem) {
  return Math.max(0, item.quantityApproved ?? getRequestedQuantity(item));
}

export function getReceivedQuantity(item: StoredReturnLineItem) {
  return Math.max(0, item.quantityReceived ?? getApprovedQuantity(item));
}

export function getRemainingRestockQuantity(item: StoredReturnLineItem) {
  return Math.max(
    0,
    getReceivedQuantity(item) - Math.max(0, item.quantityRestocked ?? 0),
  );
}

export function shouldRestockReturnItem(item: StoredReturnLineItem) {
  return !item.resolutionType || item.resolutionType === "restock";
}

function normalizeOptionalString(value: string | undefined) {
  const next = value?.trim();
  return next ? next : undefined;
}

function assertUniqueOrderItemIds(itemUpdates: ReturnItemUpdateInput[]) {
  const seen = new Set<string>();
  for (const update of itemUpdates) {
    const orderItemId = update.orderItemId?.toString();
    if (!orderItemId) {
      throw new Error("Each item update must include an orderItemId.");
    }
    if (seen.has(orderItemId)) {
      throw new Error(`Duplicate item update provided for order item ${orderItemId}.`);
    }
    seen.add(orderItemId);
  }
}

function assertWholeQuantity(
  quantity: number,
  label: "approved" | "received",
  orderItemId: string,
) {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error(
      `Quantity ${label} for order item ${orderItemId} must be a whole number greater than or equal to 0.`,
    );
  }
}

export function buildApprovedItemUpdates(
  storedItems: StoredReturnLineItem[],
  itemUpdates?: ReturnItemUpdateInput[],
) {
  if (!Array.isArray(storedItems) || storedItems.length === 0) {
    throw new Error("Return does not contain any items to approve.");
  }

  const updates = Array.isArray(itemUpdates) ? itemUpdates : [];
  assertUniqueOrderItemIds(updates);

  const updateMap = new Map(
    updates.map((update) => [update.orderItemId?.toString(), update]),
  );

  const normalized = storedItems.map((storedItem) => {
    const orderItemId = storedItem.orderItemId?.toString();
    if (!orderItemId) {
      throw new Error("Stored return item is missing an orderItemId.");
    }

    const requestedQuantity = getRequestedQuantity(storedItem);
    const update = updateMap.get(orderItemId);
    const quantityApproved = update?.quantityApproved ?? requestedQuantity;

    assertWholeQuantity(quantityApproved, "approved", orderItemId);
    if (quantityApproved > requestedQuantity) {
      throw new Error(
        `Approved quantity for order item ${orderItemId} cannot exceed requested quantity ${requestedQuantity}.`,
      );
    }

    return {
      orderItemId,
      quantityApproved,
      conditionCode: normalizeOptionalString(update?.conditionCode),
      resolutionType: normalizeOptionalString(update?.resolutionType),
    };
  });

  for (const orderItemId of updateMap.keys()) {
    if (!normalized.some((item) => item.orderItemId === orderItemId)) {
      throw new Error(`Order item ${orderItemId} is not part of this return.`);
    }
  }

  if (!normalized.some((item) => item.quantityApproved > 0)) {
    throw new Error("At least one return item must be approved with a quantity greater than 0.");
  }

  return normalized;
}

export function buildReceivedItemUpdates(
  storedItems: StoredReturnLineItem[],
  itemUpdates?: ReturnItemUpdateInput[],
) {
  if (!Array.isArray(storedItems) || storedItems.length === 0) {
    throw new Error("Return does not contain any items to receive.");
  }

  const updates = Array.isArray(itemUpdates) ? itemUpdates : [];
  assertUniqueOrderItemIds(updates);

  const updateMap = new Map(
    updates.map((update) => [update.orderItemId?.toString(), update]),
  );

  const normalized = storedItems.map((storedItem) => {
    const orderItemId = storedItem.orderItemId?.toString();
    if (!orderItemId) {
      throw new Error("Stored return item is missing an orderItemId.");
    }

    const approvedQuantity = getApprovedQuantity(storedItem);
    const update = updateMap.get(orderItemId);
    const quantityReceived = update?.quantityReceived ?? approvedQuantity;

    assertWholeQuantity(quantityReceived, "received", orderItemId);
    if (quantityReceived > approvedQuantity) {
      throw new Error(
        `Received quantity for order item ${orderItemId} cannot exceed approved quantity ${approvedQuantity}.`,
      );
    }

    return {
      orderItemId,
      quantityReceived,
      conditionCode:
        normalizeOptionalString(update?.conditionCode) ??
        normalizeOptionalString(storedItem.conditionCode),
      resolutionType:
        normalizeOptionalString(update?.resolutionType) ??
        normalizeOptionalString(storedItem.resolutionType),
    };
  });

  for (const orderItemId of updateMap.keys()) {
    if (!normalized.some((item) => item.orderItemId === orderItemId)) {
      throw new Error(`Order item ${orderItemId} is not part of this return.`);
    }
  }

  if (!normalized.some((item) => item.quantityReceived > 0)) {
    throw new Error("At least one return item must be received with a quantity greater than 0.");
  }

  return normalized;
}

export function calculateApprovedRefundLimit(
  approvedItems: Array<{ orderItemId?: string; quantityApproved?: number }>,
  orderItemsById: Map<string, ReturnOrderItemPricingInput>,
) {
  return approvedItems.reduce((sum, item) => {
    const orderItemId = item.orderItemId?.toString();
    if (!orderItemId) {
      throw new Error("Each approved item must include an orderItemId.");
    }

    const orderItem = orderItemsById.get(orderItemId);
    if (!orderItem) {
      throw new Error(`Order item ${orderItemId} could not be found for refund validation.`);
    }

    const orderedQuantity = Math.max(0, orderItem.quantity ?? 0);
    const approvedQuantity = Math.max(0, item.quantityApproved ?? 0);
    if (orderedQuantity <= 0 || approvedQuantity <= 0) {
      return sum;
    }

    const lineTotal =
      typeof orderItem.lineTotalAmount === "number"
        ? orderItem.lineTotalAmount
        : Math.max(0, orderItem.unitPriceAmount ?? 0) * orderedQuantity;

    return sum + Math.round((lineTotal * approvedQuantity) / orderedQuantity);
  }, 0);
}

export function normalizeStoredReturnItems(
  returnRequest: {
    items?: StoredReturnLineItem[];
  } | null | undefined,
  returnItems?: StoredReturnLineItem[],
): NormalizedReturnLineItem[] {
  if (Array.isArray(returnItems) && returnItems.length > 0) {
    const items: StoredReturnLineItem[] = returnItems;
    return items.map((item) => ({
      orderItemId: item.orderItemId?.toString(),
      quantity: getRequestedQuantity(item),
      quantityRequested: getRequestedQuantity(item),
      quantityApproved: getApprovedQuantity(item),
      quantityReceived: getReceivedQuantity(item),
      quantityRestocked: Math.max(0, item.quantityRestocked ?? 0),
      reason: item.reasonText ?? item.reasonCode,
      conditionCode: item.conditionCode,
      resolutionType: item.resolutionType,
    }));
  }

  if (!Array.isArray(returnRequest?.items)) {
    return [];
  }

  const items: StoredReturnLineItem[] = returnRequest.items;
  return items.map((item) => ({
    orderItemId: item.orderItemId?.toString(),
    quantity: Math.max(0, item.quantity ?? 0),
    quantityRequested: Math.max(0, item.quantity ?? 0),
    quantityApproved: Math.max(0, item.quantity ?? 0),
    quantityReceived: Math.max(0, item.quantity ?? 0),
    quantityRestocked: 0,
    reason: item.reason,
    conditionCode: undefined,
    resolutionType: undefined,
  }));
}
