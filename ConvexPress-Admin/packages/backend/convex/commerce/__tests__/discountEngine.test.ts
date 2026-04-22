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
