import { describe, expect, test } from "bun:test";

import { calculateFlatRate } from "../methods/flatRate";
import { calculateWeightBased, convertWeight } from "../methods/weightBased";
import { calculateDimensional, computeDimWeight, computeBillableWeight } from "../methods/dimensional";
import { calculatePriceBased } from "../methods/priceBased";
import { calculateQuantityBased } from "../methods/quantityBased";
import { calculateFree } from "../methods/free";
import { rankQuotes } from "../rates/ranking";

const baseAddrKey = "addr|key";
const baseCartKey = "cart|key";

describe("Flat Rate (B1)", () => {
  test("per_order mode returns base cost", () => {
    const quotes = calculateFlatRate(
      {
        _id: "m1",
        zoneId: "z1",
        name: "flat",
        label: "Flat",
        baseCost: 5,
        costMode: "per_order",
        enabled: true,
      },
      {
        currencyCode: "USD",
        itemCount: 3,
        classBreakdown: [{ classId: null, itemCount: 3 }],
        addressKey: baseAddrKey,
        cartKey: baseCartKey,
      },
    );
    expect(quotes).toHaveLength(1);
    expect(quotes[0].amount).toBe(500);
  });

  test("per_item mode multiplies by item count", () => {
    const quotes = calculateFlatRate(
      {
        _id: "m1",
        zoneId: "z1",
        name: "flat",
        label: "Flat",
        baseCost: 2,
        costMode: "per_item",
        enabled: true,
      },
      {
        currencyCode: "USD",
        itemCount: 5,
        classBreakdown: [{ classId: null, itemCount: 5 }],
        addressKey: baseAddrKey,
        cartKey: baseCartKey,
      },
    );
    expect(quotes[0].amount).toBe(1000);
  });

  test("min/max cost clamps", () => {
    const quotes = calculateFlatRate(
      {
        _id: "m1",
        zoneId: "z1",
        name: "flat",
        label: "Flat",
        baseCost: 1,
        costMode: "per_item",
        minCost: 5,
        enabled: true,
      },
      {
        currencyCode: "USD",
        itemCount: 2,
        classBreakdown: [{ classId: null, itemCount: 2 }],
        addressKey: baseAddrKey,
        cartKey: baseCartKey,
      },
    );
    expect(quotes[0].amount).toBe(500); // 2 * $1 = $2 → clamped to $5
  });

  test("disabled returns no quotes", () => {
    const quotes = calculateFlatRate(
      {
        _id: "m1",
        zoneId: "z1",
        name: "flat",
        label: "Flat",
        baseCost: 5,
        costMode: "per_order",
        enabled: false,
      },
      {
        currencyCode: "USD",
        itemCount: 1,
        classBreakdown: [{ classId: null, itemCount: 1 }],
        addressKey: baseAddrKey,
        cartKey: baseCartKey,
      },
    );
    expect(quotes).toHaveLength(0);
  });
});

describe("Weight-Based (B2)", () => {
  const tiers = [
    { minWeight: 0, maxWeight: 16, cost: 5 },
    { minWeight: 16, maxWeight: 80, cost: 10 },
    { minWeight: 80, cost: 15, incrementalCost: 1, incrementalWeight: 16 },
  ];

  test("matches first tier", () => {
    const quotes = calculateWeightBased(
      {
        _id: "m1",
        zoneId: "z1",
        name: "wb",
        label: "WB",
        weightUnit: "oz",
        tiers,
        enabled: true,
      },
      {
        currencyCode: "USD",
        totalWeight: 10,
        classes: [],
        addressKey: baseAddrKey,
        cartKey: baseCartKey,
      },
    );
    expect(quotes[0].amount).toBe(500);
  });

  test("matches middle tier on boundary", () => {
    const quotes = calculateWeightBased(
      {
        _id: "m1",
        zoneId: "z1",
        name: "wb",
        label: "WB",
        weightUnit: "oz",
        tiers,
        enabled: true,
      },
      {
        currencyCode: "USD",
        totalWeight: 16,
        classes: [],
        addressKey: baseAddrKey,
        cartKey: baseCartKey,
      },
    );
    expect(quotes[0].amount).toBe(1000);
  });

  test("incremental cost on open-ended top tier", () => {
    const quotes = calculateWeightBased(
      {
        _id: "m1",
        zoneId: "z1",
        name: "wb",
        label: "WB",
        weightUnit: "oz",
        tiers,
        enabled: true,
      },
      {
        currencyCode: "USD",
        totalWeight: 96, // base $15 + 16oz over * $1 per 16oz = $15 + $1 = $16
        classes: [],
        addressKey: baseAddrKey,
        cartKey: baseCartKey,
      },
    );
    expect(quotes[0].amount).toBe(1600);
  });

  test("convertWeight handles oz/lb/g/kg", () => {
    expect(convertWeight(16, "oz", "lb")).toBeCloseTo(1, 5);
    expect(convertWeight(1, "lb", "oz")).toBeCloseTo(16, 5);
    expect(convertWeight(1, "kg", "g")).toBeCloseTo(1000, 1);
  });
});

describe("Dimensional (B3)", () => {
  test("computes DIM weight via L*W*H/divisor", () => {
    expect(computeDimWeight({ lengthIn: 12, widthIn: 10, heightIn: 8 }, 139)).toBeCloseTo(6.91, 1);
  });

  test("billable = max(actual, ceil(DIM))", () => {
    const pkg = { lengthIn: 12, widthIn: 10, heightIn: 8, actualWeight: 2 };
    expect(computeBillableWeight(pkg, 139)).toBe(7);
  });

  test("actual > DIM: actual wins", () => {
    const pkg = { lengthIn: 6, widthIn: 4, heightIn: 4, actualWeight: 10 };
    expect(computeBillableWeight(pkg, 139)).toBe(10);
  });

  test("end-to-end pipeline", () => {
    const quotes = calculateDimensional(
      {
        _id: "m1",
        zoneId: "z1",
        name: "dim",
        label: "DIM",
        divisor: 139,
        weightUnit: "lb",
        tiers: [
          { minWeight: 0, maxWeight: 5, cost: 8 },
          { minWeight: 5, maxWeight: 20, cost: 15 },
        ],
        enabled: true,
      },
      {
        currencyCode: "USD",
        packages: [
          { lengthIn: 12, widthIn: 10, heightIn: 8, actualWeight: 2 }, // billable 7lb → tier 2 → $15
        ],
        classes: [],
        addressKey: baseAddrKey,
        cartKey: baseCartKey,
      },
    );
    expect(quotes[0].amount).toBe(1500);
  });
});

describe("Price-Based (B4)", () => {
  test("subtotal tier match", () => {
    const quotes = calculatePriceBased(
      {
        _id: "m1",
        zoneId: "z1",
        name: "pb",
        label: "Price-Based",
        currencyCode: "USD",
        tiers: [
          { minSubtotal: 0, maxSubtotal: 50, cost: 8 },
          { minSubtotal: 50, maxSubtotal: 100, cost: 5 },
          { minSubtotal: 100, cost: 0 }, // free over $100
        ],
        enabled: true,
      },
      {
        currencyCode: "USD",
        subtotalBeforeDiscount: 75,
        subtotalAfterDiscount: 75,
        addressKey: baseAddrKey,
        cartKey: baseCartKey,
      },
    );
    expect(quotes[0].amount).toBe(500);
  });

  test("uses discounted subtotal by default", () => {
    const quotes = calculatePriceBased(
      {
        _id: "m1",
        zoneId: "z1",
        name: "pb",
        label: "PB",
        currencyCode: "USD",
        tiers: [
          { minSubtotal: 0, maxSubtotal: 50, cost: 8 },
          { minSubtotal: 50, cost: 5 },
        ],
        enabled: true,
      },
      {
        currencyCode: "USD",
        subtotalBeforeDiscount: 75,
        subtotalAfterDiscount: 25, // discounted below threshold
        addressKey: baseAddrKey,
        cartKey: baseCartKey,
      },
    );
    expect(quotes[0].amount).toBe(800); // uses discounted
  });

  test("currency mismatch returns no quotes", () => {
    const quotes = calculatePriceBased(
      {
        _id: "m1",
        zoneId: "z1",
        name: "pb",
        label: "PB",
        currencyCode: "USD",
        tiers: [{ minSubtotal: 0, cost: 5 }],
        enabled: true,
      },
      {
        currencyCode: "EUR",
        subtotalBeforeDiscount: 50,
        subtotalAfterDiscount: 50,
        addressKey: baseAddrKey,
        cartKey: baseCartKey,
      },
    );
    expect(quotes).toHaveLength(0);
  });
});

describe("Quantity-Based (B5)", () => {
  test("total_items mode", () => {
    const quotes = calculateQuantityBased(
      {
        _id: "m1",
        zoneId: "z1",
        name: "qb",
        label: "QB",
        countMode: "total_items",
        tiers: [
          { minCount: 1, maxCount: 2, cost: 5 },
          { minCount: 2, maxCount: 6, cost: 8 },
          { minCount: 6, cost: 12 },
        ],
        enabled: true,
      },
      {
        currencyCode: "USD",
        totalItems: 3,
        totalLineItems: 2,
        classBreakdown: [{ classId: null, itemCount: 3 }],
        addressKey: baseAddrKey,
        cartKey: baseCartKey,
      },
    );
    expect(quotes[0].amount).toBe(800);
  });
});

describe("Free Shipping (B6)", () => {
  test("conditionType=always always qualifies", () => {
    const quotes = calculateFree(
      {
        _id: "m1",
        zoneId: "z1",
        name: "free",
        label: "Free",
        conditionType: "always",
        enabled: true,
      },
      {
        currencyCode: "USD",
        subtotalAmount: 10,
        shippingClasses: [],
        customerTags: [],
        addressKey: baseAddrKey,
        cartKey: baseCartKey,
        ruleContext: {} as any,
      },
    );
    expect(quotes).toHaveLength(1);
    expect(quotes[0].amount).toBe(0);
    expect(quotes[0].isCheapest).toBe(true);
  });

  test("min_amount qualifies above threshold", () => {
    const config = {
      _id: "m1",
      zoneId: "z1",
      name: "free",
      label: "Free",
      conditionType: "min_amount" as const,
      minAmount: 50,
      enabled: true,
    };
    const cart = (subtotal: number) => ({
      currencyCode: "USD",
      subtotalAmount: subtotal,
      shippingClasses: [],
      customerTags: [],
      addressKey: baseAddrKey,
      cartKey: baseCartKey,
      ruleContext: {} as any,
    });
    expect(calculateFree(config, cart(75))).toHaveLength(1);
    expect(calculateFree(config, cart(25))).toHaveLength(0);
  });

  test("excluded shipping class disqualifies", () => {
    const quotes = calculateFree(
      {
        _id: "m1",
        zoneId: "z1",
        name: "free",
        label: "Free",
        conditionType: "always",
        excludeShippingClassIds: ["fragile-id"],
        enabled: true,
      },
      {
        currencyCode: "USD",
        subtotalAmount: 100,
        shippingClasses: ["fragile-id", "small"],
        customerTags: [],
        addressKey: baseAddrKey,
        cartKey: baseCartKey,
        ruleContext: {} as any,
      },
    );
    expect(quotes).toHaveLength(0);
  });

  test("required tags must all be present", () => {
    const config = {
      _id: "m1",
      zoneId: "z1",
      name: "free",
      label: "Free",
      conditionType: "always" as const,
      requireCustomerTags: ["vip", "wholesale"],
      enabled: true,
    };
    const baseCtx = {
      currencyCode: "USD",
      subtotalAmount: 100,
      shippingClasses: [],
      addressKey: baseAddrKey,
      cartKey: baseCartKey,
      ruleContext: {} as any,
    };
    expect(
      calculateFree(config, { ...baseCtx, customerTags: ["vip", "wholesale"] }),
    ).toHaveLength(1);
    expect(
      calculateFree(config, { ...baseCtx, customerTags: ["vip"] }),
    ).toHaveLength(0);
  });
});

describe("rankQuotes", () => {
  test("flags isCheapest, isFastest, isBestValue", () => {
    const ranked = rankQuotes([
      {
        quoteKey: "a",
        provider: "manual",
        carrierCode: "x",
        carrierName: "X",
        serviceCode: "s",
        serviceName: "S",
        amount: 1000,
        currency: "USD",
        estimatedDaysMin: 5,
        estimatedDaysMax: 5,
        expiresAt: 0,
      },
      {
        quoteKey: "b",
        provider: "manual",
        carrierCode: "x",
        carrierName: "X",
        serviceCode: "s",
        serviceName: "S",
        amount: 2000,
        currency: "USD",
        estimatedDaysMin: 1,
        estimatedDaysMax: 1,
        expiresAt: 0,
      },
      {
        quoteKey: "c",
        provider: "manual",
        carrierCode: "x",
        carrierName: "X",
        serviceCode: "s",
        serviceName: "S",
        amount: 1500,
        currency: "USD",
        estimatedDaysMin: 3,
        estimatedDaysMax: 3,
        expiresAt: 0,
      },
    ]);
    const a = ranked.find((q) => q.quoteKey === "a")!;
    const b = ranked.find((q) => q.quoteKey === "b")!;
    expect(a.isCheapest).toBe(true);
    expect(b.isFastest).toBe(true);
    // Best value should be the one with the lowest combined rank.
    expect(ranked.filter((q) => q.isBestValue)).toHaveLength(1);
  });

  test("empty input returns empty array", () => {
    expect(rankQuotes([])).toEqual([]);
  });
});
