import { describe, expect, test } from "bun:test";

import { evaluateDiscount } from "../discountEngine";

const productA = {
	productId: "product_a",
	quantity: 1,
	lineTotalAmount: 1_000,
	product: {
		categoryIds: ["category_a"],
	},
};

const productB = {
	productId: "product_b",
	quantity: 1,
	lineTotalAmount: 2_000,
	product: {
		categoryIds: ["category_b"],
	},
};

describe("commerce discount engine", () => {
	test("selects the best qualifying quantity tier", () => {
		const result = evaluateDiscount(
			{
				discountType: "percent",
				amount: 5,
				tiers: [
					{
						label: "10+",
						minQuantity: 10,
						discountType: "percent",
						amount: 5,
					},
					{
						label: "25+",
						minQuantity: 25,
						discountType: "percent",
						amount: 10,
					},
					{
						label: "50+",
						minQuantity: 50,
						discountType: "percent",
						amount: 15,
					},
				],
			},
			[{ ...productA, quantity: 30, lineTotalAmount: 30_000 }],
		);

		expect(result.eligible).toBe(true);
		expect(result.appliedTier?.label).toBe("25+");
		expect(result.discountAmount).toBe(3_000);
	});

	test("rejects carts below a subtotal threshold", () => {
		const result = evaluateDiscount(
			{
				discountType: "fixed_cart",
				amount: 2_500,
				minimumSubtotalAmount: 15_000,
			},
			[{ ...productA, quantity: 10, lineTotalAmount: 10_000 }],
		);

		expect(result.eligible).toBe(false);
		expect(result.discountAmount).toBe(0);
		expect(result.message).toContain("subtotal");
	});

	test("applies fixed per-item discounts only to matching products", () => {
		const result = evaluateDiscount(
			{
				discountType: "fixed_product",
				amount: 300,
				productIds: ["product_a"],
			},
			[
				{ ...productA, quantity: 6, lineTotalAmount: 6_000 },
				{ ...productB, quantity: 4, lineTotalAmount: 8_000 },
			],
		);

		expect(result.eligible).toBe(true);
		expect(result.eligibleQuantity).toBe(6);
		expect(result.discountAmount).toBe(1_800);
	});

	test("can qualify on matching products while applying to the cart", () => {
		const result = evaluateDiscount(
			{
				discountType: "percent",
				amount: 10,
				applicability: "cart",
				productIds: ["product_a"],
				minimumQuantity: 5,
			},
			[
				{ ...productA, quantity: 5, lineTotalAmount: 5_000 },
				{ ...productB, quantity: 2, lineTotalAmount: 4_000 },
			],
		);

		expect(result.eligible).toBe(true);
		expect(result.eligibleSubtotalAmount).toBe(9_000);
		expect(result.discountAmount).toBe(900);
	});

	test("excludes products before calculating category discounts", () => {
		const result = evaluateDiscount(
			{
				discountType: "percent",
				amount: 20,
				categoryIds: ["category_a"],
				excludedProductIds: ["product_a"],
			},
			[{ ...productA, quantity: 5, lineTotalAmount: 5_000 }],
		);

		expect(result.eligible).toBe(false);
		expect(result.message).toContain("No cart items");
	});
});

describe("Wave 11.7 — new parity fields", () => {
	test("newCustomersOnly rejects returning customers", () => {
		const result = evaluateDiscount(
			{ discountType: "percent", amount: 10, newCustomersOnly: true },
			[productA],
			{ priorOrderCount: 3 },
		);
		expect(result.eligible).toBe(false);
		expect(result.message).toMatch(/new customers/i);
	});

	test("newCustomersOnly allows first-time buyers", () => {
		const result = evaluateDiscount(
			{ discountType: "percent", amount: 10, newCustomersOnly: true },
			[productA],
			{ priorOrderCount: 0 },
		);
		expect(result.eligible).toBe(true);
	});

	test("allowedEmails rejects non-allowlisted emails", () => {
		const result = evaluateDiscount(
			{
				discountType: "percent",
				amount: 10,
				allowedEmails: ["vip@example.com"],
			},
			[productA],
			{ email: "other@example.com" },
		);
		expect(result.eligible).toBe(false);
	});

	test("allowedEmails accepts allowlisted email (case-insensitive)", () => {
		const result = evaluateDiscount(
			{
				discountType: "percent",
				amount: 10,
				allowedEmails: ["vip@example.com"],
			},
			[productA],
			{ email: "VIP@Example.com" },
		);
		expect(result.eligible).toBe(true);
	});

	test("perUserUsageLimit rejects when limit reached", () => {
		const result = evaluateDiscount(
			{ discountType: "percent", amount: 10, perUserUsageLimit: 2 },
			[productA],
			{ priorCodeUsageCount: 2 },
		);
		expect(result.eligible).toBe(false);
		expect(result.message).toMatch(/maximum uses/i);
	});

	test("excludeSaleItems skips on-sale items", () => {
		const result = evaluateDiscount(
			{ discountType: "percent", amount: 10, excludeSaleItems: true },
			[
				{ ...productA, onSale: true },
				{ ...productB, onSale: false },
			],
		);
		expect(result.eligible).toBe(true);
		// Only productB ($2000) should contribute; 10% of 2000 = 200.
		expect(result.discountAmount).toBe(200);
	});

	test("maximumSubtotalAmount blocks above-cap carts", () => {
		const result = evaluateDiscount(
			{
				discountType: "percent",
				amount: 10,
				maximumSubtotalAmount: 1_500,
			},
			[productA, productB], // $3000 total
		);
		expect(result.eligible).toBe(false);
		expect(result.message).toMatch(/exceeds/i);
	});

	test("free_shipping short-circuits with suppressShipping flag", () => {
		const result = evaluateDiscount(
			{ discountType: "free_shipping", amount: 0 },
			[productA],
		);
		expect(result.eligible).toBe(true);
		expect(result.discountAmount).toBe(0);
		expect(result.suppressShipping).toBe(true);
	});

	test("free_shipping honors minimumSubtotalAmount", () => {
		const result = evaluateDiscount(
			{
				discountType: "free_shipping",
				amount: 0,
				minimumSubtotalAmount: 5_000,
			},
			[productA],
		);
		expect(result.eligible).toBe(false);
	});
});

describe("filterForIndividualUse", () => {
	test("returns all when none are individualUse", () => {
		const list = [
			{ individualUse: false, discountAmount: 100 },
			{ individualUse: false, discountAmount: 200 },
		];
		const { filterForIndividualUse } = require("../discountEngine");
		expect(filterForIndividualUse(list)).toHaveLength(2);
	});

	test("returns only the best individualUse when present", () => {
		const list = [
			{ individualUse: false, discountAmount: 500 },
			{ individualUse: true, discountAmount: 300 },
			{ individualUse: true, discountAmount: 400 },
		];
		const { filterForIndividualUse } = require("../discountEngine");
		const filtered = filterForIndividualUse(list);
		expect(filtered).toHaveLength(1);
		expect(filtered[0].discountAmount).toBe(400);
	});
});
