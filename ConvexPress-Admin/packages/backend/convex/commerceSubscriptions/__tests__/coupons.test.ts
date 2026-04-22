/**
 * Commerce Subscriptions — Coupon & Discount Logic Tests (Wave 7 Task 7.2)
 *
 * Tests the coupon/discount pure-function layer from `helpers/proration.ts`
 * and the discount-application logic replicated from `helpers/coupons.ts`.
 *
 * Coverage:
 *   1. `applyDiscount` — percent and fixed modes (from helpers/proration.ts)
 *   2. Coupon validation decision logic (pure simulation of validateCoupon)
 *   3. Redemption `remainingApplications` seeding logic
 *   4. Multi-redemption ordering (first applies before second)
 *   5. Coupon exhaustion guard (remainingApplications <= 0 → skip)
 *
 * All tests are pure (no Convex ctx). The ctx-bound functions
 * (`validateCoupon`, `applyCouponToInvoice`, `initializeRedemption`) are
 * tested via inline simulations that replicate their decision trees.
 *
 * Run with: bun test convex/commerceSubscriptions/__tests__/coupons.test.ts
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import { applyDiscount } from "../../helpers/proration";

// ═══════════════════════════════════════════════════════════════════════════
// applyDiscount — re-exported from helpers/proration (used by coupons.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe("applyDiscount: coupon discount scenarios", () => {
  test("15% off subscription price", () => {
    // $29.99/mo = 2999 cents; 15% off
    const result = applyDiscount(2999, "percent", 15);
    // 2999 * 0.85 = 2549.15
    expect(result).toBeCloseTo(2549.15, 1);
  });

  test("fixed $5 off any price", () => {
    expect(applyDiscount(2999, "fixed", 500)).toBe(2499);
  });

  test("100% off (free trial coupon equivalent)", () => {
    expect(applyDiscount(2999, "percent", 100)).toBe(0);
  });

  test("percent > 100 is clamped → free (0)", () => {
    expect(applyDiscount(2999, "percent", 200)).toBe(0);
  });

  test("fixed bigger than price → clamped to 0", () => {
    expect(applyDiscount(500, "fixed", 1000)).toBe(0);
  });

  test("stacked 20% then $5 off — sequential application", () => {
    // First coupon: 20% off $100
    const afterFirst = applyDiscount(10000, "percent", 20); // 8000
    expect(afterFirst).toBe(8000);

    // Second coupon: $5 fixed off the reduced price
    const afterSecond = applyDiscount(afterFirst, "fixed", 500); // 7500
    expect(afterSecond).toBe(7500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Coupon validation decision logic (pure simulation)
// ═══════════════════════════════════════════════════════════════════════════

type CouponValidationFailureReason =
  | "not_found"
  | "not_active"
  | "starts_in_future"
  | "expired"
  | "not_valid_for_offer"
  | "max_redemptions_reached"
  | "customer_limit_reached";

type CouponValidationResult =
  | { valid: true }
  | { valid: false; reason: CouponValidationFailureReason };

/**
 * Pure simulation of `validateCoupon` decision logic.
 * Replicates the sequential validation gates from helpers/coupons.ts.
 */
function validateCouponPure(params: {
  coupon?: {
    status?: string;
    startsAt?: number;
    expiresAt?: number;
    offerIds?: string[];
    maxRedemptions?: number;
    perCustomerLimit?: number;
  } | null;
  now: number;
  targetOfferId: string;
  allRedemptionCount?: number;
  customerRedemptionCount?: number;
}): CouponValidationResult {
  const { coupon, now, targetOfferId, allRedemptionCount = 0, customerRedemptionCount = 0 } = params;

  if (!coupon) return { valid: false, reason: "not_found" };
  if (coupon.status !== "active") return { valid: false, reason: "not_active" };
  if (typeof coupon.startsAt === "number" && now < coupon.startsAt) {
    return { valid: false, reason: "starts_in_future" };
  }
  if (typeof coupon.expiresAt === "number" && now > coupon.expiresAt) {
    return { valid: false, reason: "expired" };
  }

  const offerScope = coupon.offerIds ?? [];
  if (offerScope.length > 0 && !offerScope.includes(targetOfferId)) {
    return { valid: false, reason: "not_valid_for_offer" };
  }

  if (typeof coupon.maxRedemptions === "number" && allRedemptionCount >= coupon.maxRedemptions) {
    return { valid: false, reason: "max_redemptions_reached" };
  }

  if (typeof coupon.perCustomerLimit === "number" && customerRedemptionCount >= coupon.perCustomerLimit) {
    return { valid: false, reason: "customer_limit_reached" };
  }

  return { valid: true };
}

const NOW = 1_000_000_000;

describe("validateCoupon: not found", () => {
  test("null coupon → not_found", () => {
    const result = validateCouponPure({
      coupon: null,
      now: NOW,
      targetOfferId: "offer_1",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("not_found");
  });

  test("undefined coupon → not_found", () => {
    const result = validateCouponPure({
      coupon: undefined,
      now: NOW,
      targetOfferId: "offer_1",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("not_found");
  });
});

describe("validateCoupon: status gate", () => {
  test("status=active → passes status gate", () => {
    const result = validateCouponPure({
      coupon: { status: "active" },
      now: NOW,
      targetOfferId: "offer_1",
    });
    expect(result.valid).toBe(true);
  });

  test("status=draft → not_active", () => {
    const result = validateCouponPure({
      coupon: { status: "draft" },
      now: NOW,
      targetOfferId: "offer_1",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("not_active");
  });

  test("status=archived → not_active", () => {
    const result = validateCouponPure({
      coupon: { status: "archived" },
      now: NOW,
      targetOfferId: "offer_1",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("not_active");
  });
});

describe("validateCoupon: time gates", () => {
  test("startsAt in future → starts_in_future", () => {
    const result = validateCouponPure({
      coupon: { status: "active", startsAt: NOW + 1000 },
      now: NOW,
      targetOfferId: "offer_1",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("starts_in_future");
  });

  test("startsAt in past → passes starts gate", () => {
    const result = validateCouponPure({
      coupon: { status: "active", startsAt: NOW - 1000 },
      now: NOW,
      targetOfferId: "offer_1",
    });
    expect(result.valid).toBe(true);
  });

  test("expiresAt in past → expired", () => {
    const result = validateCouponPure({
      coupon: { status: "active", expiresAt: NOW - 1000 },
      now: NOW,
      targetOfferId: "offer_1",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("expired");
  });

  test("expiresAt in future → passes expiry gate", () => {
    const result = validateCouponPure({
      coupon: { status: "active", expiresAt: NOW + 1000 },
      now: NOW,
      targetOfferId: "offer_1",
    });
    expect(result.valid).toBe(true);
  });

  test("no startsAt, no expiresAt → passes time gates", () => {
    const result = validateCouponPure({
      coupon: { status: "active" },
      now: NOW,
      targetOfferId: "offer_1",
    });
    expect(result.valid).toBe(true);
  });
});

describe("validateCoupon: offer scope gate", () => {
  test("empty offerIds → valid for all offers", () => {
    const result = validateCouponPure({
      coupon: { status: "active", offerIds: [] },
      now: NOW,
      targetOfferId: "offer_anything",
    });
    expect(result.valid).toBe(true);
  });

  test("absent offerIds → valid for all offers", () => {
    const result = validateCouponPure({
      coupon: { status: "active" },
      now: NOW,
      targetOfferId: "offer_anything",
    });
    expect(result.valid).toBe(true);
  });

  test("offerIds includes target → valid", () => {
    const result = validateCouponPure({
      coupon: { status: "active", offerIds: ["offer_1", "offer_2"] },
      now: NOW,
      targetOfferId: "offer_1",
    });
    expect(result.valid).toBe(true);
  });

  test("offerIds does NOT include target → not_valid_for_offer", () => {
    const result = validateCouponPure({
      coupon: { status: "active", offerIds: ["offer_1", "offer_2"] },
      now: NOW,
      targetOfferId: "offer_3",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("not_valid_for_offer");
  });
});

describe("validateCoupon: global redemption cap", () => {
  test("maxRedemptions not set → no cap", () => {
    const result = validateCouponPure({
      coupon: { status: "active" },
      now: NOW,
      targetOfferId: "offer_1",
      allRedemptionCount: 999,
    });
    expect(result.valid).toBe(true);
  });

  test("allRedemptionCount < maxRedemptions → valid", () => {
    const result = validateCouponPure({
      coupon: { status: "active", maxRedemptions: 10 },
      now: NOW,
      targetOfferId: "offer_1",
      allRedemptionCount: 9,
    });
    expect(result.valid).toBe(true);
  });

  test("allRedemptionCount === maxRedemptions → max_redemptions_reached", () => {
    const result = validateCouponPure({
      coupon: { status: "active", maxRedemptions: 10 },
      now: NOW,
      targetOfferId: "offer_1",
      allRedemptionCount: 10,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("max_redemptions_reached");
  });

  test("allRedemptionCount > maxRedemptions → max_redemptions_reached", () => {
    const result = validateCouponPure({
      coupon: { status: "active", maxRedemptions: 5 },
      now: NOW,
      targetOfferId: "offer_1",
      allRedemptionCount: 7, // over cap
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("max_redemptions_reached");
  });
});

describe("validateCoupon: per-customer cap", () => {
  test("perCustomerLimit not set → no per-customer cap", () => {
    const result = validateCouponPure({
      coupon: { status: "active" },
      now: NOW,
      targetOfferId: "offer_1",
      customerRedemptionCount: 999,
    });
    expect(result.valid).toBe(true);
  });

  test("customerRedemptionCount < perCustomerLimit → valid", () => {
    const result = validateCouponPure({
      coupon: { status: "active", perCustomerLimit: 2 },
      now: NOW,
      targetOfferId: "offer_1",
      customerRedemptionCount: 1,
    });
    expect(result.valid).toBe(true);
  });

  test("customerRedemptionCount === perCustomerLimit → customer_limit_reached", () => {
    const result = validateCouponPure({
      coupon: { status: "active", perCustomerLimit: 1 },
      now: NOW,
      targetOfferId: "offer_1",
      customerRedemptionCount: 1,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("customer_limit_reached");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Redemption seeding: remainingApplications from coupon.duration
// ═══════════════════════════════════════════════════════════════════════════

const FOREVER_SENTINEL = 9999;

/**
 * Pure simulation of `initializeRedemption` remainingApplications seeding.
 */
function seedRemainingApplications(coupon: {
  duration: "once" | "forever" | "n_months";
  durationMonths?: number;
}): number | "error" {
  if (coupon.duration === "once") return 1;
  if (coupon.duration === "forever") return FOREVER_SENTINEL;
  // n_months
  if (typeof coupon.durationMonths !== "number" || coupon.durationMonths <= 0) {
    return "error";
  }
  return coupon.durationMonths;
}

describe("redemption seeding: remainingApplications", () => {
  test("duration=once → 1 application", () => {
    expect(seedRemainingApplications({ duration: "once" })).toBe(1);
  });

  test("duration=forever → 9999 sentinel", () => {
    expect(seedRemainingApplications({ duration: "forever" })).toBe(FOREVER_SENTINEL);
  });

  test("duration=n_months with durationMonths=6 → 6 applications", () => {
    expect(seedRemainingApplications({ duration: "n_months", durationMonths: 6 })).toBe(6);
  });

  test("duration=n_months with durationMonths=12 → 12 applications", () => {
    expect(seedRemainingApplications({ duration: "n_months", durationMonths: 12 })).toBe(12);
  });

  test("duration=n_months with durationMonths=0 → error", () => {
    expect(seedRemainingApplications({ duration: "n_months", durationMonths: 0 })).toBe("error");
  });

  test("duration=n_months with no durationMonths → error", () => {
    expect(seedRemainingApplications({ duration: "n_months" })).toBe("error");
  });

  test("duration=n_months with negative durationMonths → error", () => {
    expect(seedRemainingApplications({ duration: "n_months", durationMonths: -3 })).toBe("error");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Coupon exhaustion guard (mirrors applyCouponToInvoice guard)
// ═══════════════════════════════════════════════════════════════════════════

describe("coupon exhaustion guard: remainingApplications <= 0", () => {
  function shouldSkipRedemption(remainingApplications: number): boolean {
    return remainingApplications <= 0;
  }

  test("remaining=0 → skip (exhausted)", () => {
    expect(shouldSkipRedemption(0)).toBe(true);
  });

  test("remaining=-1 → skip (defensive: negative is also exhausted)", () => {
    expect(shouldSkipRedemption(-1)).toBe(true);
  });

  test("remaining=1 → do not skip", () => {
    expect(shouldSkipRedemption(1)).toBe(false);
  });

  test("remaining=FOREVER_SENTINEL=9999 → do not skip", () => {
    expect(shouldSkipRedemption(FOREVER_SENTINEL)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Multi-redemption application pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe("multi-coupon discount pipeline: sequential application", () => {
  /**
   * Simulates the coupon loop in applyUpgradeProration:
   *   for each active redemption with remaining > 0, apply discount cumulatively.
   */
  function applyAllCoupons(
    initialSubtotal: number,
    redemptions: Array<{
      remainingApplications: number;
      discountType: "percent" | "fixed";
      amount: number;
    }>,
  ): number {
    let subtotal = initialSubtotal;
    for (const redemption of redemptions) {
      if (redemption.remainingApplications <= 0) continue;
      subtotal = applyDiscount(subtotal, redemption.discountType, redemption.amount);
    }
    return subtotal;
  }

  test("single 20% coupon on $100 → $80", () => {
    const result = applyAllCoupons(10000, [
      { remainingApplications: 3, discountType: "percent", amount: 20 },
    ]);
    expect(result).toBe(8000);
  });

  test("two coupons applied sequentially: 20% then $5 fixed", () => {
    const result = applyAllCoupons(10000, [
      { remainingApplications: 2, discountType: "percent", amount: 20 },
      { remainingApplications: 1, discountType: "fixed", amount: 500 },
    ]);
    // 10000 * 0.8 = 8000 → 8000 - 500 = 7500
    expect(result).toBe(7500);
  });

  test("exhausted redemption is skipped, others still apply", () => {
    const result = applyAllCoupons(10000, [
      { remainingApplications: 0, discountType: "percent", amount: 50 }, // skipped
      { remainingApplications: 1, discountType: "percent", amount: 10 }, // applied
    ]);
    // Only 10% applied: 10000 * 0.9 = 9000
    expect(result).toBe(9000);
  });

  test("all exhausted → subtotal unchanged", () => {
    const result = applyAllCoupons(10000, [
      { remainingApplications: 0, discountType: "percent", amount: 50 },
      { remainingApplications: 0, discountType: "fixed", amount: 500 },
    ]);
    expect(result).toBe(10000);
  });

  test("no redemptions → subtotal unchanged", () => {
    const result = applyAllCoupons(5000, []);
    expect(result).toBe(5000);
  });

  test("massive stacked discounts → floored at 0 (never negative)", () => {
    const result = applyAllCoupons(1000, [
      { remainingApplications: 1, discountType: "percent", amount: 60 },
      { remainingApplications: 1, discountType: "fixed", amount: 900 }, // 400 - 900 → clamped 0
    ]);
    expect(result).toBe(0);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Coupon validation: sequential gate ordering (first failure wins)
// ═══════════════════════════════════════════════════════════════════════════

describe("validateCoupon: gate priority ordering", () => {
  test("not_active fires before starts_in_future", () => {
    // Even if startsAt is in the future, not_active fires first
    const result = validateCouponPure({
      coupon: {
        status: "draft",
        startsAt: NOW + 1000,
      },
      now: NOW,
      targetOfferId: "offer_1",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("not_active");
  });

  test("starts_in_future fires before expired", () => {
    // startsAt in future AND expiresAt in past: starts_in_future should fire first
    // (because starts gate runs before expires gate in the implementation)
    const result = validateCouponPure({
      coupon: {
        status: "active",
        startsAt: NOW + 1000,
        expiresAt: NOW - 1000,
      },
      now: NOW,
      targetOfferId: "offer_1",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("starts_in_future");
  });

  test("expired fires before not_valid_for_offer", () => {
    const result = validateCouponPure({
      coupon: {
        status: "active",
        expiresAt: NOW - 1000,
        offerIds: ["offer_other"],
      },
      now: NOW,
      targetOfferId: "offer_1",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toBe("expired");
  });
});
