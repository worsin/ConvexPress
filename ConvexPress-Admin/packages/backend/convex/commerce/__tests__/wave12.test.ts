/**
 * Wave 12 unit tests — Stripe mirror payload, Stripe Tax payload +
 * response parser, WooCommerce coupon mapper, matchesAutoConditions.
 */

import { describe, expect, test } from "bun:test";

import { buildStripeCouponPayload } from "../discountStripeMirror";
import {
  buildStripeTaxPayload,
  parseStripeTaxResponse,
} from "../taxStripe";
import { matchesAutoConditions } from "../discounts";
import { mapWooCouponToUpsertArgs } from "../../wordpressSync/phases/commerceTransactions";

// ─── Stripe coupon mirror ────────────────────────────────────────────────────

describe("buildStripeCouponPayload", () => {
  test("percent discount builds percent_off payload", () => {
    const p = buildStripeCouponPayload({
      discountType: "percent",
      amount: 15,
      code: "SAVE15",
      description: "Save 15 percent",
    });
    expect(p.percent_off).toBe(15);
    expect(p.duration).toBe("once");
    expect(p.name).toBe("Save 15 percent");
  });

  test("fixed_cart builds amount_off payload with currency", () => {
    const p = buildStripeCouponPayload({
      discountType: "fixed_cart",
      amount: 500,
    });
    expect(p.amount_off).toBe(500);
    expect(p.currency).toBe("usd");
  });

  test("fixed_product behaves like fixed_cart", () => {
    const p = buildStripeCouponPayload({
      discountType: "fixed_product",
      amount: 250,
    });
    expect(p.amount_off).toBe(250);
    expect(p.currency).toBe("usd");
  });

  test("percent clamps amount between 0-100", () => {
    const p = buildStripeCouponPayload({
      discountType: "percent",
      amount: 150,
    });
    expect(p.percent_off).toBe(100);
  });

  test("free_shipping returns null (not mirrorable to Stripe Coupon)", () => {
    const p = buildStripeCouponPayload({
      discountType: "free_shipping",
      amount: 0,
    });
    expect(p).toBeNull();
  });
});

// ─── Stripe Tax payload + parser ────────────────────────────────────────────

describe("buildStripeTaxPayload", () => {
  test("shapes address + line items for calculations.create", () => {
    const payload: any = buildStripeTaxPayload(
      { country: "US", state: "CA", postalCode: "94110" },
      [
        { amount: 2500, reference: "item_a" },
        { amount: 4000, reference: "item_b", taxCode: "txcd_99999999" },
      ],
    );
    expect(payload.currency).toBe("usd");
    expect(payload.customer_details.address.country).toBe("US");
    expect(payload.customer_details.address.state).toBe("CA");
    expect(payload.line_items).toHaveLength(2);
    expect(payload.line_items[0].amount).toBe(2500);
    expect(payload.line_items[0].tax_behavior).toBe("exclusive");
  });

  test("honors custom currency", () => {
    const p: any = buildStripeTaxPayload(
      { country: "DE" },
      [{ amount: 1000, reference: "a" }],
      "eur",
    );
    expect(p.currency).toBe("eur");
  });
});

describe("parseStripeTaxResponse", () => {
  test("flattens Stripe calculation response into our shape", () => {
    const resp = {
      amount_total: 11000,
      tax_amount_exclusive: 1000,
      line_items: [
        {
          amount: 10000,
          amount_tax: 1000,
          tax_code: "txcd_99999999",
          tax_breakdown: [
            { jurisdiction: { display_name: "California" } },
          ],
        },
      ],
    };
    const result = parseStripeTaxResponse(resp);
    expect(result.taxAmount).toBe(1000);
    expect(result.taxableAmount).toBe(10000);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].taxRate).toBeCloseTo(0.1, 2);
    expect(result.breakdown[0].jurisdiction).toBe("California");
    expect(result.provider).toBe("stripe");
  });

  test("handles empty line items gracefully", () => {
    const r = parseStripeTaxResponse({ amount_total: 0, tax_amount_exclusive: 0 });
    expect(r.taxAmount).toBe(0);
    expect(r.breakdown).toEqual([]);
  });

  test("handles line_items under .data shape too", () => {
    const r = parseStripeTaxResponse({
      amount_total: 1100,
      tax_amount_exclusive: 100,
      line_items: { data: [{ amount: 1000, amount_tax: 100 }] },
    });
    expect(r.breakdown).toHaveLength(1);
  });
});

// ─── Auto-discount condition matcher ────────────────────────────────────────

describe("matchesAutoConditions", () => {
  const base = {
    cartSubtotal: 5000,
    priorOrderCount: 0,
    productIds: ["p1", "p2"],
    categoryIds: ["c1"],
  };

  test("null/empty conditions always match", () => {
    expect(matchesAutoConditions(null, base)).toBe(true);
    expect(matchesAutoConditions({}, base)).toBe(true);
  });

  test("minSubtotal blocks under-threshold carts", () => {
    expect(
      matchesAutoConditions({ minSubtotal: 10000 }, base),
    ).toBe(false);
    expect(matchesAutoConditions({ minSubtotal: 1000 }, base)).toBe(true);
  });

  test("newCustomersOnly requires priorOrderCount === 0", () => {
    expect(
      matchesAutoConditions({ newCustomersOnly: true }, { ...base, priorOrderCount: 3 }),
    ).toBe(false);
    expect(
      matchesAutoConditions({ newCustomersOnly: true }, { ...base, priorOrderCount: 0 }),
    ).toBe(true);
  });

  test("hasProductId requires cart to contain product", () => {
    expect(
      matchesAutoConditions({ hasProductId: "p1" }, base),
    ).toBe(true);
    expect(
      matchesAutoConditions({ hasProductId: "p99" }, base),
    ).toBe(false);
  });

  test("hasCategoryId requires cart to contain category", () => {
    expect(
      matchesAutoConditions({ hasCategoryId: "c1" }, base),
    ).toBe(true);
    expect(
      matchesAutoConditions({ hasCategoryId: "c99" }, base),
    ).toBe(false);
  });

  test("multiple conditions must all match", () => {
    expect(
      matchesAutoConditions(
        { minSubtotal: 1000, hasCategoryId: "c1" },
        base,
      ),
    ).toBe(true);
    expect(
      matchesAutoConditions(
        { minSubtotal: 10000, hasCategoryId: "c1" },
        base,
      ),
    ).toBe(false);
  });
});

// ─── WooCommerce coupon mapper ──────────────────────────────────────────────

describe("mapWooCouponToUpsertArgs", () => {
  test("maps a full WooCommerce coupon payload losslessly", () => {
    const woo = {
      id: 12345,
      code: "save25",
      amount: "25.00",
      discount_type: "fixed_cart",
      description: "$25 off orders",
      date_expires: "2026-12-31T23:59:59",
      usage_limit: 100,
      usage_count: 7,
      usage_limit_per_user: 2,
      individual_use: true,
      exclude_sale_items: true,
      minimum_amount: "50.00",
      maximum_amount: "500.00",
      product_ids: [101, 102],
      excluded_product_ids: [999],
      product_categories: [10, 11],
      excluded_product_categories: [99],
      email_restrictions: ["vip@example.com"],
      meta_data: [{ key: "_foo", value: "bar" }],
    };
    const args = mapWooCouponToUpsertArgs(woo);
    expect(args.code).toBe("SAVE25");
    expect(args.discountType).toBe("fixed_cart");
    expect(args.amount).toBe(2500); // 25.00 → 2500 cents
    expect(args.minimumSubtotalAmount).toBe(5000);
    expect(args.maximumSubtotalAmount).toBe(50000);
    expect(args.individualUse).toBe(true);
    expect(args.excludeSaleItems).toBe(true);
    expect(args.perUserUsageLimit).toBe(2);
    expect(args.allowedEmails).toEqual(["vip@example.com"]);
    expect(args.productIds).toEqual(["101", "102"]);
    expect(args.excludedProductIds).toEqual(["999"]);
    expect(args.usageCount).toBe(7);
    expect(args.usageLimit).toBe(100);
    const raw = JSON.parse(args.rawSourceMeta);
    expect(raw.wpId).toBe(12345);
    expect(raw.product_categories).toEqual([10, 11]);
    expect(raw.excluded_product_categories).toEqual([99]);
  });

  test("percent discount keeps amount as-is (Stripe/Woo both raw 0-100)", () => {
    const args = mapWooCouponToUpsertArgs({
      code: "P10",
      amount: "10",
      discount_type: "percent",
      usage_count: 0,
    });
    expect(args.discountType).toBe("percent");
    expect(args.amount).toBe(10);
  });

  test("free_shipping type passes through", () => {
    const args = mapWooCouponToUpsertArgs({
      code: "FREE",
      amount: "0",
      discount_type: "free_shipping",
      usage_count: 0,
    });
    expect(args.discountType).toBe("free_shipping");
  });

  test("missing optional fields produce undefined (not null)", () => {
    const args = mapWooCouponToUpsertArgs({
      code: "BARE",
      amount: "5",
      discount_type: "fixed_cart",
      usage_count: 0,
    });
    expect(args.minimumSubtotalAmount).toBeUndefined();
    expect(args.allowedEmails).toBeUndefined();
    expect(args.individualUse).toBe(false);
  });

  test("unknown discount_type defaults to fixed_cart", () => {
    const args = mapWooCouponToUpsertArgs({
      code: "WEIRD",
      amount: "1",
      discount_type: "unknown_type",
      usage_count: 0,
    });
    expect(args.discountType).toBe("fixed_cart");
  });
});
