import { describe, expect, test } from "bun:test";

import { getVariantLabel } from "./variantLabel";

describe("getVariantLabel", () => {
	test("prefers optionSummary over all other fields", () => {
		expect(
			getVariantLabel({
				optionSummary: "Color: Black / Size: Large",
				title: "Black / Large",
				name: "variant-1",
				sku: "BLK-LG",
			}),
		).toBe("Color: Black / Size: Large");
	});

	test("falls back to title when optionSummary is missing", () => {
		expect(
			getVariantLabel({
				title: "Black / Large",
				name: "variant-1",
				sku: "BLK-LG",
			}),
		).toBe("Black / Large");
	});

	test("falls back to name when optionSummary and title are missing", () => {
		expect(
			getVariantLabel({
				name: "variant-1",
				sku: "BLK-LG",
			}),
		).toBe("variant-1");
	});

	test("falls back to sku as last resort", () => {
		expect(
			getVariantLabel({
				sku: "BLK-LG",
			}),
		).toBe("BLK-LG");
	});

	test("returns null when variant is null", () => {
		expect(getVariantLabel(null)).toBeNull();
	});

	test("returns null when variant is undefined", () => {
		expect(getVariantLabel(undefined)).toBeNull();
	});

	test("returns null when variant has no label fields", () => {
		expect(getVariantLabel({})).toBeNull();
	});
});
