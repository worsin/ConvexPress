/**
 * Commerce Subscriptions — Proration pure-function tests (Wave 7 Task 7.2)
 *
 * Tests the proration math from `helpers/proration.ts`:
 *   - `computeProration`  Mid-cycle upgrade/downgrade arithmetic.
 *   - `applyDiscount`     Percent and fixed discount application.
 *
 * These are pure functions (no Convex ctx, no DB). Safe to run with bun:test.
 *
 * Run with: bun test convex/commerceSubscriptions/__tests__/proration.test.ts
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import { computeProration, applyDiscount } from "../../helpers/proration";

const DAY = 24 * 60 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════════
// computeProration — core math
// ═══════════════════════════════════════════════════════════════════════════

describe("computeProration: upgrade math (netCharge > 0)", () => {
  test("upgrade mid-cycle — half the period remaining", () => {
    const cycleStart = 0;
    const cycleEnd = 30 * DAY;
    const now = 15 * DAY; // exactly half-way through
    const result = computeProration({
      cycleStart,
      cycleEnd,
      now,
      oldOfferPrice: 1000, // $10/mo
      newOfferPrice: 2000, // $20/mo
    });

    expect(result.daysInCycle).toBe(30);
    expect(result.daysRemaining).toBe(15);
    expect(result.unusedOldAmount).toBe(500); // 1000 * 15/30
    expect(result.proratedNewAmount).toBe(1000); // 2000 * 15/30
    expect(result.netCharge).toBe(500); // 1000 - 500 → upgrade charge
  });

  test("upgrade at start of cycle — nearly full charge", () => {
    const cycleStart = 0;
    const cycleEnd = 30 * DAY;
    const now = 1 * DAY; // 1 day into 30-day cycle
    const result = computeProration({
      cycleStart,
      cycleEnd,
      now,
      oldOfferPrice: 1000,
      newOfferPrice: 3000,
    });

    expect(result.daysRemaining).toBeCloseTo(29, 1);
    // unusedOldAmount ≈ 1000 * 29/30 ≈ 966.67
    expect(result.unusedOldAmount).toBeCloseTo(966.67, 1);
    // proratedNewAmount ≈ 3000 * 29/30 ≈ 2900
    expect(result.proratedNewAmount).toBeCloseTo(2900, 1);
    // netCharge ≈ 1933.33
    expect(result.netCharge).toBeCloseTo(1933.33, 1);
    expect(result.netCharge).toBeGreaterThan(0);
  });

  test("upgrade near end of cycle — tiny charge", () => {
    const cycleStart = 0;
    const cycleEnd = 30 * DAY;
    const now = 29 * DAY; // 1 day left
    const result = computeProration({
      cycleStart,
      cycleEnd,
      now,
      oldOfferPrice: 1000,
      newOfferPrice: 2000,
    });

    expect(result.daysRemaining).toBeCloseTo(1, 1);
    expect(result.unusedOldAmount).toBeCloseTo(33.33, 1);
    expect(result.proratedNewAmount).toBeCloseTo(66.67, 1);
    expect(result.netCharge).toBeCloseTo(33.33, 1);
    expect(result.netCharge).toBeGreaterThan(0);
  });
});

describe("computeProration: downgrade math (netCharge <= 0)", () => {
  test("downgrade mid-cycle — net credit (negative charge)", () => {
    const cycleStart = 0;
    const cycleEnd = 30 * DAY;
    const now = 15 * DAY;
    const result = computeProration({
      cycleStart,
      cycleEnd,
      now,
      oldOfferPrice: 2000,
      newOfferPrice: 1000,
    });

    expect(result.daysRemaining).toBe(15);
    expect(result.unusedOldAmount).toBe(1000); // 2000 * 15/30
    expect(result.proratedNewAmount).toBe(500); // 1000 * 15/30
    expect(result.netCharge).toBe(-500); // credit back (NOT clamped)
    expect(result.netCharge).toBeLessThan(0);
  });

  test("same-price plan switch — netCharge is exactly 0", () => {
    const result = computeProration({
      cycleStart: 0,
      cycleEnd: 30 * DAY,
      now: 10 * DAY,
      oldOfferPrice: 1500,
      newOfferPrice: 1500,
    });
    expect(result.netCharge).toBe(0);
    expect(result.unusedOldAmount).toBe(result.proratedNewAmount);
  });
});

describe("computeProration: edge cases", () => {
  test("now past cycleEnd — daysRemaining clamped to 0, all amounts zero", () => {
    const result = computeProration({
      cycleStart: 0,
      cycleEnd: 30 * DAY,
      now: 35 * DAY, // past end of cycle
      oldOfferPrice: 1000,
      newOfferPrice: 2000,
    });
    expect(result.daysRemaining).toBe(0);
    expect(result.unusedOldAmount).toBe(0);
    expect(result.proratedNewAmount).toBe(0);
    expect(result.netCharge).toBe(0);
  });

  test("zero-length cycle (cycleEnd === cycleStart) — daysInCycle floored at 1", () => {
    const result = computeProration({
      cycleStart: 1000,
      cycleEnd: 1000, // degenerate
      now: 1000,
      oldOfferPrice: 1000,
      newOfferPrice: 2000,
    });
    // daysInCycle = max(1, 0) = 1. daysRemaining = max(0, 0) = 0.
    expect(result.daysInCycle).toBe(1);
    expect(result.daysRemaining).toBe(0);
    expect(result.netCharge).toBe(0);
  });

  test("cycleEnd < cycleStart — daysInCycle floored at 1, daysRemaining 0", () => {
    const result = computeProration({
      cycleStart: 100 * DAY,
      cycleEnd: 50 * DAY, // inverted (shouldn't happen, but guarded)
      now: 75 * DAY,
      oldOfferPrice: 1000,
      newOfferPrice: 2000,
    });
    expect(result.daysInCycle).toBe(1);
    expect(result.daysRemaining).toBe(0);
    expect(result.netCharge).toBe(0);
  });

  test("free → paid upgrade at half-cycle — netCharge equals half the new price", () => {
    const result = computeProration({
      cycleStart: 0,
      cycleEnd: 30 * DAY,
      now: 15 * DAY,
      oldOfferPrice: 0, // free tier
      newOfferPrice: 2000,
    });
    expect(result.unusedOldAmount).toBe(0);
    expect(result.proratedNewAmount).toBe(1000); // 2000 * 15/30
    expect(result.netCharge).toBe(1000);
  });

  test("paid → free downgrade — credit equals half old price (negative netCharge)", () => {
    const result = computeProration({
      cycleStart: 0,
      cycleEnd: 30 * DAY,
      now: 15 * DAY,
      oldOfferPrice: 2000,
      newOfferPrice: 0, // free downgrade
    });
    expect(result.proratedNewAmount).toBe(0);
    expect(result.unusedOldAmount).toBe(1000);
    expect(result.netCharge).toBe(-1000); // credit, not clamped
  });

  test("rounding: 30-day cycle, prices that produce repeating decimals", () => {
    // $10/3 per day = non-terminating decimal when spread over partial period
    const result = computeProration({
      cycleStart: 0,
      cycleEnd: 30 * DAY,
      now: 20 * DAY, // 10 days left
      oldOfferPrice: 1000,
      newOfferPrice: 2500,
    });
    // unusedOldAmount = 1000 * 10/30 = 333.33
    expect(result.unusedOldAmount).toBe(333.33);
    // proratedNewAmount = 2500 * 10/30 = 833.33
    expect(result.proratedNewAmount).toBe(833.33);
    // netCharge = 833.33 - 333.33 = 500
    expect(result.netCharge).toBe(500);
  });

  test("annual cycle (365 days) — correct daysInCycle", () => {
    const cycleStart = 0;
    const cycleEnd = 365 * DAY;
    const now = 182 * DAY; // roughly half-year
    const result = computeProration({
      cycleStart,
      cycleEnd,
      now,
      oldOfferPrice: 12000, // $120/yr
      newOfferPrice: 24000, // $240/yr
    });
    expect(result.daysInCycle).toBe(365);
    expect(result.daysRemaining).toBe(183);
    // netCharge should be positive (upgrade)
    expect(result.netCharge).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// applyDiscount
// ═══════════════════════════════════════════════════════════════════════════

describe("applyDiscount: percent discounts", () => {
  test("20% off $100 → $80", () => {
    expect(applyDiscount(10000, "percent", 20)).toBe(8000);
  });

  test("100% off → $0 (floored, not negative)", () => {
    expect(applyDiscount(5000, "percent", 100)).toBe(0);
  });

  test("0% off → unchanged", () => {
    expect(applyDiscount(5000, "percent", 0)).toBe(5000);
  });

  test("50% off $19.99 → rounds to 2 decimals", () => {
    // 1999 * (1 - 0.5) = 999.5 → rounded to 999.5
    expect(applyDiscount(1999, "percent", 50)).toBe(999.5);
  });

  test("percent > 100 is clamped to 100 (result is 0)", () => {
    expect(applyDiscount(5000, "percent", 150)).toBe(0);
  });

  test("negative percent is clamped to 0 (no-op)", () => {
    // clamp at [0, 100] → 0% → unchanged
    expect(applyDiscount(5000, "percent", -10)).toBe(5000);
  });
});

describe("applyDiscount: fixed discounts", () => {
  test("$5 fixed off $20 → $15", () => {
    expect(applyDiscount(2000, "fixed", 500)).toBe(1500);
  });

  test("fixed discount larger than amount → clamped at 0", () => {
    expect(applyDiscount(500, "fixed", 1000)).toBe(0);
  });

  test("fixed discount equal to amount → exactly $0", () => {
    expect(applyDiscount(1000, "fixed", 1000)).toBe(0);
  });

  test("fixed discount of 0 → unchanged", () => {
    expect(applyDiscount(2000, "fixed", 0)).toBe(2000);
  });

  test("rounding: $10.999 fixed off $50 → round2 result", () => {
    // 5000 - 1099.9 = 3900.1 → rounded to 3900.1
    expect(applyDiscount(5000, "fixed", 1099.9)).toBeCloseTo(3900.1, 1);
  });
});

describe("applyDiscount: zero amount base", () => {
  test("0 amount, any discount → stays 0", () => {
    expect(applyDiscount(0, "percent", 20)).toBe(0);
    expect(applyDiscount(0, "fixed", 100)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Proration decision logic (inline simulation — mirrors applyUpgradeProration)
// ═══════════════════════════════════════════════════════════════════════════

describe("proration decision: upgrade vs downgrade routing", () => {
  function routeProration(fromPrice: number, toPrice: number, now = 15 * DAY) {
    const result = computeProration({
      cycleStart: 0,
      cycleEnd: 30 * DAY,
      now,
      oldOfferPrice: fromPrice,
      newOfferPrice: toPrice,
    });
    if (result.netCharge > 0) return "upgrade";
    if (result.netCharge < 0) return "downgrade";
    return "neutral";
  }

  test("higher price → upgrade path", () => {
    expect(routeProration(1000, 2000)).toBe("upgrade");
  });

  test("lower price → downgrade path", () => {
    expect(routeProration(2000, 1000)).toBe("downgrade");
  });

  test("same price → neutral", () => {
    expect(routeProration(1000, 1000)).toBe("neutral");
  });

  test("free → paid is always upgrade", () => {
    expect(routeProration(0, 1000)).toBe("upgrade");
  });

  test("paid → free is always downgrade", () => {
    expect(routeProration(1000, 0)).toBe("downgrade");
  });

  test("upgrade at very end of cycle (1 day left) still routes upgrade", () => {
    // Even with tiny remaining time, if the new price > old price → upgrade
    expect(routeProration(1000, 2000, 29 * DAY)).toBe("upgrade");
  });

  test("upgrade past cycleEnd — netCharge is 0, routes neutral", () => {
    // When now >= cycleEnd, daysRemaining=0 → netCharge=0
    expect(routeProration(1000, 2000, 31 * DAY)).toBe("neutral");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Combined proration + discount pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe("proration + discount: combined pipeline", () => {
  test("20% coupon reduces upgrade charge", () => {
    const proration = computeProration({
      cycleStart: 0,
      cycleEnd: 30 * DAY,
      now: 15 * DAY,
      oldOfferPrice: 1000,
      newOfferPrice: 3000,
    });
    // netCharge = 3000*15/30 - 1000*15/30 = 1500 - 500 = 1000
    expect(proration.netCharge).toBe(1000);

    const afterDiscount = applyDiscount(proration.netCharge, "percent", 20);
    // 1000 * 0.8 = 800
    expect(afterDiscount).toBe(800);
  });

  test("$3 fixed coupon on $10 upgrade charge → $7 net", () => {
    const proration = computeProration({
      cycleStart: 0,
      cycleEnd: 30 * DAY,
      now: 15 * DAY,
      oldOfferPrice: 1000,
      newOfferPrice: 3000,
    });
    expect(proration.netCharge).toBe(1000);
    const afterDiscount = applyDiscount(proration.netCharge, "fixed", 300);
    expect(afterDiscount).toBe(700);
  });

  test("coupon larger than upgrade charge → free (clamped at 0)", () => {
    const proration = computeProration({
      cycleStart: 0,
      cycleEnd: 30 * DAY,
      now: 15 * DAY,
      oldOfferPrice: 1000,
      newOfferPrice: 2000,
    });
    expect(proration.netCharge).toBe(500);
    // $10 coupon on a $5 charge → $0
    const afterDiscount = applyDiscount(proration.netCharge, "fixed", 1000);
    expect(afterDiscount).toBe(0);
  });
});
