import { describe, expect, test } from "bun:test";

import { isWishlistItemAvailable } from "../availability";

describe("isWishlistItemAvailable", () => {
	const publishedProduct = {
		status: "publish",
		trackInventory: true,
		productType: "simple",
		stockQuantity: 3,
		allowBackorders: false,
	};

	test("uses variant inventory for variable products", () => {
		expect(
			isWishlistItemAvailable(
				{
					...publishedProduct,
					productType: "variable",
					stockQuantity: 0,
				},
				{ stockQuantity: 2 },
			),
		).toBe(true);

		expect(
			isWishlistItemAvailable(
				{
					...publishedProduct,
					productType: "variable",
					stockQuantity: 99,
				},
				{ stockQuantity: 0 },
			),
		).toBe(false);
	});

	test("marks tracked variable products without a variant as unavailable", () => {
		expect(
			isWishlistItemAvailable(
				{
					...publishedProduct,
					productType: "variable",
					stockQuantity: 99,
				},
				null,
			),
		).toBe(false);
	});

	test("allows variable products through backorders", () => {
		expect(
			isWishlistItemAvailable(
				{
					...publishedProduct,
					productType: "variable",
					allowBackorders: true,
				},
				{ stockQuantity: 0 },
			),
		).toBe(true);
	});

	test("uses product inventory for simple products", () => {
		expect(isWishlistItemAvailable(publishedProduct, null)).toBe(true);
		expect(
			isWishlistItemAvailable(
				{
					...publishedProduct,
					stockQuantity: 0,
				},
				null,
			),
		).toBe(false);
	});

	test("treats untracked published products as available", () => {
		expect(
			isWishlistItemAvailable(
				{
					...publishedProduct,
					trackInventory: false,
					stockQuantity: 0,
				},
				null,
			),
		).toBe(true);
	});

	test("does not expose unpublished products as available", () => {
		expect(
			isWishlistItemAvailable(
				{
					...publishedProduct,
					status: "draft",
					trackInventory: false,
					stockQuantity: 99,
				},
				null,
			),
		).toBe(false);
	});
});
