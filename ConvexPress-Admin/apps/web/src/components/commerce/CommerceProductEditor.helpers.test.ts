import { describe, expect, test } from "bun:test";

import {
	type VariantDraft,
	applyBulkEditToVariants,
	buildOptionSummaryFromPairs,
	buildVariantDraft,
	countVariantsUsingOptionType,
	displayToMoney,
	emptyBulkEditFields,
	getProductTypeLabel,
	parseOptionValueInput,
} from "./CommerceProductEditor.helpers";

/** Build a full VariantDraft with sensible defaults for testing. */
function testDraft(overrides: Partial<VariantDraft> = {}): VariantDraft {
	return {
		title: "",
		sku: "",
		price: "",
		salePrice: "",
		stockQuantity: "",
		description: "",
		globalUniqueId: "",
		weight: "",
		shippingLengthIn: "",
		shippingWidthIn: "",
		shippingHeightIn: "",
		manageStock: "parent",
		stockStatus: "instock",
		backorders: "no",
		lowStockAmount: "",
		taxClass: "",
		shippingClassId: "",
		isVirtual: false,
		isDownloadable: false,
		downloadLimit: "",
		downloadExpiry: "",
		status: "publish",
		salePriceFrom: "",
		salePriceTo: "",
		menuOrder: "",
		...overrides,
	};
}

describe("CommerceProductEditor helpers", () => {
	test("parses comma-separated option values into a unique trimmed list", () => {
		expect(parseOptionValueInput(" Black, White,Black ,  ,  Green ")).toEqual([
			"Black",
			"White",
			"Green",
		]);
	});

	test("builds a stable variant draft from stored money and stock fields", () => {
		expect(
			buildVariantDraft({
				title: "Large / Black",
				sku: "SKU-L-BLK",
				price: { amount: 2499 },
				salePrice: { amount: 1999 },
				stockQuantity: 8,
			}, {trackInventory:true}),
		).toEqual(
			testDraft({
				title: "Large / Black",
				sku: "SKU-L-BLK",
				price: "24.99",
				salePrice: "19.99",
				stockQuantity: "8",
				manageStock: "yes",
			}),
		);
	});

	test("derives a variable product label when variants already exist", () => {
		expect(getProductTypeLabel("simple", 2)).toBe("Variable");
		expect(getProductTypeLabel("simple", 0)).toBe("Simple");
	});

	test("converts display currency values into integer cents", () => {
		expect(displayToMoney("24.99")).toEqual({
			amount: 2499,
			currencyCode: "USD",
		});
	});

	test("counts variants using a specific option type", () => {
		const variants = [
			{ selections: [{ optionTypeId: "color" }, { optionTypeId: "size" }] },
			{ selections: [{ optionTypeId: "size" }] },
			{ selections: [] },
			{},
		];
		expect(countVariantsUsingOptionType(variants, "color")).toBe(1);
		expect(countVariantsUsingOptionType(variants, "size")).toBe(2);
		expect(countVariantsUsingOptionType(variants, "material")).toBe(0);
	});

	test("builds option summary from pairs", () => {
		expect(
			buildOptionSummaryFromPairs([
				{ optionTypeName: "Size", optionValueLabel: "Large" },
				{ optionTypeName: "Color", optionValueLabel: "Red" },
			]),
		).toBe("Large / Red");
		expect(buildOptionSummaryFromPairs([])).toBe("");
	});

	test("produces an empty bulk edit state", () => {
		expect(emptyBulkEditFields()).toEqual({
			price: "",
			salePrice: "",
			skuPrefix: "",
			stockQuantity: "",
		});
	});

	test("applies bulk edit only to non-empty fields for selected variants", () => {
		const drafts = {
			v1: testDraft({
				title: "Large / Black",
				sku: "SKU-L-BLK",
				price: "24.99",
				salePrice: "19.99",
				stockQuantity: "8",
			}),
			v2: testDraft({
				title: "Small / White",
				sku: "SKU-S-WHT",
				price: "29.99",
				salePrice: "",
				stockQuantity: "5",
			}),
			v3: testDraft({
				title: "Medium / Blue",
				sku: "SKU-M-BLU",
				price: "24.99",
				salePrice: "",
				stockQuantity: "3",
			}),
		};

		const result = applyBulkEditToVariants(drafts, ["v1", "v2"], {
			price: "39.99",
			salePrice: "",
			skuPrefix: "",
			stockQuantity: "20",
		});

		// v1 and v2 should have price and stockQuantity updated
		expect(result.v1.price).toBe("39.99");
		expect(result.v1.stockQuantity).toBe("20");
		expect(result.v1.sku).toBe("SKU-L-BLK"); // unchanged
		expect(result.v1.salePrice).toBe("19.99"); // unchanged

		expect(result.v2.price).toBe("39.99");
		expect(result.v2.stockQuantity).toBe("20");
		expect(result.v2.sku).toBe("SKU-S-WHT"); // unchanged

		// v3 should be untouched
		expect(result.v3.price).toBe("24.99");
		expect(result.v3.stockQuantity).toBe("3");
	});

	test("applies skuPrefix to selected variants", () => {
		const drafts = {
			v1: testDraft({
				title: "Large",
				sku: "OLD-SKU",
				price: "10.00",
				salePrice: "",
				stockQuantity: "",
			}),
		};
		const result = applyBulkEditToVariants(drafts, ["v1"], {
			price: "",
			salePrice: "",
			skuPrefix: "NEW-SKU",
			stockQuantity: "",
		});
		expect(result.v1.sku).toBe("NEW-SKU");
	});
});

test("sale editor uses local wall time and preserves unchanged instants including epoch zero", async () => {
  const { formatSaleDateLocal, saleDateChange } = await import("./CommerceProductEditor.helpers");
  for (const time of [0, Date.parse("2026-09-06T16:00:00.123Z"), Date.parse("2026-11-01T08:30:00.000Z")]) {
    const formatted = formatSaleDateLocal(time);
    const date = new Date(time);
    expect(formatted).toContain(`T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`);
    expect(saleDateChange(formatted, time)).toBeUndefined();
    expect(saleDateChange("", time)).toBeNull();
  }
  expect(saleDateChange("", undefined)).toBeUndefined();
  expect(saleDateChange("2026-09-06T10:00:00.123", undefined)).toBe(new Date("2026-09-06T10:00:00.123").getTime());
  expect(() => saleDateChange("invalid", undefined)).toThrow("Choose a valid sale date.");
});
