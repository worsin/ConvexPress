import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";

import {
  assertValidRequestedItems,
  buildRequestedQuantityMap,
  evaluateReturnPolicyWindow,
} from "../eligibility";

describe("buildRequestedQuantityMap", () => {
  test("ignores rejected returns and aggregates active quantities", () => {
    const quantities = buildRequestedQuantityMap([
      {
        _id: "ret_1",
        status: "requested",
        items: [
          { orderItemId: "item_1", quantity: 1 },
          { orderItemId: "item_2", quantity: 2 },
        ],
      },
      {
        _id: "ret_2",
        status: "refund_pending",
        items: [{ orderItemId: "item_1", quantity: 1 }],
      },
      {
        _id: "ret_3",
        status: "rejected",
        items: [{ orderItemId: "item_1", quantity: 99 }],
      },
    ]);

    expect(quantities.get("item_1")).toBe(2);
    expect(quantities.get("item_2")).toBe(2);
  });

  test("can exclude a return during recalculation", () => {
    const quantities = buildRequestedQuantityMap(
      [
        {
          _id: "ret_1",
          status: "requested",
          items: [{ orderItemId: "item_1", quantity: 2 }],
        },
        {
          _id: "ret_2",
          status: "received",
          items: [{ orderItemId: "item_1", quantity: 1 }],
        },
      ],
      { excludeReturnId: "ret_1" },
    );

    expect(quantities.get("item_1")).toBe(1);
  });

  test("prefers normalized return item records when available", () => {
    const quantities = buildRequestedQuantityMap(
      [
        {
          _id: "ret_1",
          status: "requested",
          items: [{ orderItemId: "item_1", quantity: 99 }],
        },
      ],
      {
        returnItemsByReturnId: new Map([
          [
            "ret_1",
            [{ orderItemId: "item_1", quantityRequested: 2 }],
          ],
        ]),
      },
    );

    expect(quantities.get("item_1")).toBe(2);
  });
});

describe("assertValidRequestedItems", () => {
  test("rejects empty selections", () => {
    expect(() => assertValidRequestedItems([], new Map())).toThrow(ConvexError);
  });

  test("rejects duplicate rows that exceed remaining quantity", () => {
    expect(() =>
      assertValidRequestedItems(
        [
          { orderItemId: "item_1", quantity: 1 },
          { orderItemId: "item_1", quantity: 2 },
        ],
        new Map([["item_1", 2]]),
      ),
    ).toThrow(ConvexError);
  });

  test("accepts valid aggregated quantities", () => {
    expect(() =>
      assertValidRequestedItems(
        [
          { orderItemId: "item_1", quantity: 1 },
          { orderItemId: "item_2", quantity: 2 },
        ],
        new Map([
          ["item_1", 1],
          ["item_2", 3],
        ]),
      ),
    ).not.toThrow();
  });
});

describe("evaluateReturnPolicyWindow", () => {
  test("enforces delivered confirmation when required", () => {
    const result = evaluateReturnPolicyWindow({
      orderStatus: "fulfilled",
      requireDeliveryBeforeReturn: true,
      returnWindowDays: 30,
      fallbackTimestamp: 100,
      now: 200,
    });

    expect(result.hasDeliveredSignal).toBe(false);
    expect(result.returnWindowEndsAt).toBe(100 + 30 * 24 * 60 * 60 * 1000);
    expect(result.withinReturnWindow).toBe(true);
  });

  test("expires returns outside the configured return window", () => {
    const day = 24 * 60 * 60 * 1000;
    const result = evaluateReturnPolicyWindow({
      orderStatus: "completed",
      requireDeliveryBeforeReturn: true,
      returnWindowDays: 30,
      deliveryTimestamp: 100,
      now: 100 + 31 * day,
    });

    expect(result.hasDeliveredSignal).toBe(true);
    expect(result.returnWindowEndsAt).toBe(100 + 30 * day);
    expect(result.withinReturnWindow).toBe(false);
  });

  test("allows open-ended windows when the policy is disabled", () => {
    const result = evaluateReturnPolicyWindow({
      orderStatus: "completed",
      requireDeliveryBeforeReturn: false,
      returnWindowDays: 0,
      fallbackTimestamp: 100,
      now: 100000,
    });

    expect(result.hasDeliveredSignal).toBe(true);
    expect(result.withinReturnWindow).toBe(true);
  });
});
