import { describe, expect, test } from "bun:test";

import { calculateTaxForLinesFromRules, calculateTaxFromRules } from "../tax";

const baseRule = {
	_id: "tax_rule",
	name: "California",
	countryCode: "US",
	stateCode: "CA",
	ratePercent: 7.25,
	priority: 10,
	isCompound: false,
	isActive: true,
};

describe("commerce tax helpers", () => {
	test("matches wildcard postal patterns", () => {
		const result = calculateTaxFromRules(
			[{ ...baseRule, postalCodePattern: "90*" }],
			{ countryCode: "US", state: "CA", postalCode: "90210" },
			10_000,
		);

		expect(result.taxAmount).toBe(725);
	});

	test("uses tax classes when calculating multiple lines", () => {
		const result = calculateTaxForLinesFromRules(
			[
				baseRule,
				{
					...baseRule,
					_id: "reduced",
					name: "Reduced",
					taxClass: "reduced-rate",
					ratePercent: 2.5,
				},
			],
			{ countryCode: "US", state: "CA", postalCode: "90210" },
			[{ amount: 10_000 }, { amount: 4_000, taxClass: "reduced-rate" }],
		);

		expect(result.taxAmount).toBe(825);
		expect(result.breakdown).toHaveLength(2);
	});

	test("keeps separately calculated shipping tax auditable by class", () => {
		const rules = [
			baseRule,
			{
				...baseRule,
				_id: "shipping",
				name: "Shipping",
				taxClass: "shipping",
				ratePercent: 5,
			},
		];
		const itemTax = calculateTaxForLinesFromRules(
			rules,
			{ countryCode: "US", state: "CA", postalCode: "90210" },
			[{ amount: 10_000, taxClass: "standard" }],
		);
		const shippingTax = calculateTaxForLinesFromRules(
			rules,
			{ countryCode: "US", state: "CA", postalCode: "90210" },
			[{ amount: 1_500, taxClass: "shipping" }],
		);

		expect(itemTax.taxAmount).toBe(725);
		expect(shippingTax.taxAmount).toBe(75);
		expect(shippingTax.breakdown[0].taxClass).toBe("shipping");
	});

	test("extracts tax from inclusive prices", () => {
		const result = calculateTaxFromRules(
			[baseRule],
			{
				countryCode: "US",
				state: "CA",
				postalCode: "90210",
				pricesIncludeTax: true,
			},
			10_725,
		);

		expect(result.taxAmount).toBe(725);
	});
});
