import { describe, expect, test } from "bun:test";

import {
  buildApprovedItemUpdates,
  buildReceivedItemUpdates,
  calculateApprovedRefundLimit,
  getApprovedQuantity,
  getReceivedQuantity,
  getRemainingRestockQuantity,
  normalizeStoredReturnItems,
  shouldRestockReturnItem,
} from "../itemState";

describe("return item state helpers", () => {
  test("defaults approved and received quantities from requested quantity", () => {
    const item = {
      orderItemId: "item_1",
      quantityRequested: 3,
    };

    expect(getApprovedQuantity(item)).toBe(3);
    expect(getReceivedQuantity(item)).toBe(3);
  });

  test("computes remaining restock quantity from received minus already restocked", () => {
    expect(
      getRemainingRestockQuantity({
        quantityRequested: 3,
        quantityApproved: 2,
        quantityReceived: 2,
        quantityRestocked: 1,
      }),
    ).toBe(1);
  });

  test("restocks only items with restock or legacy unset disposition", () => {
    expect(shouldRestockReturnItem({ resolutionType: "restock" })).toBe(true);
    expect(shouldRestockReturnItem({})).toBe(true);
    expect(shouldRestockReturnItem({ resolutionType: "quarantine" })).toBe(false);
    expect(shouldRestockReturnItem({ resolutionType: "dispose" })).toBe(false);
    expect(shouldRestockReturnItem({ resolutionType: "return_to_vendor" })).toBe(false);
  });

  test("normalizes legacy embedded items when normalized rows are absent", () => {
    const items = normalizeStoredReturnItems({
      items: [{ orderItemId: "item_1", quantity: 2, reason: "damaged" }],
    });

    expect(items).toEqual([
      {
        orderItemId: "item_1",
        quantity: 2,
        quantityRequested: 2,
        quantityApproved: 2,
        quantityReceived: 2,
        quantityRestocked: 0,
        reason: "damaged",
        conditionCode: undefined,
        resolutionType: undefined,
      },
    ]);
  });

  test("normalizes stored return item rows when present", () => {
    const items = normalizeStoredReturnItems(
      {
        items: [{ orderItemId: "item_1", quantity: 99 }],
      },
      [
        {
          orderItemId: "item_1",
          quantityRequested: 2,
          quantityApproved: 1,
          quantityReceived: 1,
          quantityRestocked: 0,
          reasonText: "damaged",
          conditionCode: "opened",
          resolutionType: "restock",
        },
      ],
    );

    expect(items).toEqual([
      {
        orderItemId: "item_1",
        quantity: 2,
        quantityRequested: 2,
        quantityApproved: 1,
        quantityReceived: 1,
        quantityRestocked: 0,
        reason: "damaged",
        conditionCode: "opened",
        resolutionType: "restock",
      },
    ]);
  });

  test("builds item-level approval updates from explicit payload", () => {
    const updates = buildApprovedItemUpdates(
      [
        { orderItemId: "item_1", quantityRequested: 3 },
        { orderItemId: "item_2", quantityRequested: 1 },
      ],
      [
        {
          orderItemId: "item_1",
          quantityApproved: 2,
          resolutionType: "refund",
        },
        {
          orderItemId: "item_2",
          quantityApproved: 1,
          resolutionType: "exchange",
        },
      ],
    );

    expect(updates).toEqual([
      {
        orderItemId: "item_1",
        quantityApproved: 2,
        conditionCode: undefined,
        resolutionType: "refund",
      },
      {
        orderItemId: "item_2",
        quantityApproved: 1,
        conditionCode: undefined,
        resolutionType: "exchange",
      },
    ]);
  });

  test("rejects approval payloads that exceed requested quantity", () => {
    expect(() =>
      buildApprovedItemUpdates(
        [{ orderItemId: "item_1", quantityRequested: 1 }],
        [{ orderItemId: "item_1", quantityApproved: 2 }],
      ),
    ).toThrow(/cannot exceed requested quantity/i);
  });

  test("calculates approved refund limit from item-level approved quantities", () => {
    const limit = calculateApprovedRefundLimit(
      [
        { orderItemId: "item_1", quantityApproved: 1 },
        { orderItemId: "item_2", quantityApproved: 2 },
      ],
      new Map([
        ["item_1", { _id: "item_1", quantity: 2, lineTotalAmount: 5000 }],
        ["item_2", { _id: "item_2", quantity: 4, unitPriceAmount: 1000 }],
      ]),
    );

    expect(limit).toBe(4500);
  });

  test("rejects refund limit calculation when an order item is missing", () => {
    expect(() =>
      calculateApprovedRefundLimit(
        [{ orderItemId: "missing_item", quantityApproved: 1 }],
        new Map(),
      ),
    ).toThrow(/could not be found/i);
  });

  test("builds item-level receipt updates from explicit payload", () => {
    const updates = buildReceivedItemUpdates(
      [
        {
          orderItemId: "item_1",
          quantityRequested: 3,
          quantityApproved: 2,
          resolutionType: "refund",
        },
      ],
      [
        {
          orderItemId: "item_1",
          quantityReceived: 1,
          conditionCode: "opened",
          resolutionType: "quarantine",
        },
      ],
    );

    expect(updates).toEqual([
      {
        orderItemId: "item_1",
        quantityReceived: 1,
        conditionCode: "opened",
        resolutionType: "quarantine",
      },
    ]);
  });

  test("rejects receipt payloads that exceed approved quantity", () => {
    expect(() =>
      buildReceivedItemUpdates(
        [{ orderItemId: "item_1", quantityRequested: 2, quantityApproved: 1 }],
        [{ orderItemId: "item_1", quantityReceived: 2 }],
      ),
    ).toThrow(/cannot exceed approved quantity/i);
  });
});
