import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";

const DEFAULT_TAX_CLASS = "standard";
const MAX_TAX_RATE_PERCENT = 100;

type TaxRule = {
	_id: unknown;
	name: string;
	countryCode: string;
	stateCode?: string;
	postalCodePattern?: string;
	taxClass?: string;
	ratePercent: number;
	priority: number;
	isCompound: boolean;
	isActive: boolean;
};

type TaxAddress = {
	countryCode: string;
	state?: string;
	postalCode?: string;
};

type TaxLine = {
	amount: number;
	taxClass?: string;
	taxable?: boolean;
};

function normalizeCountryCode(value: string) {
	return value.trim().toUpperCase();
}

function normalizeStateCode(value?: string) {
	const normalized = value?.trim().toUpperCase();
	return normalized || undefined;
}

function normalizePostalCode(value?: string) {
	const normalized = value?.trim();
	return normalized || undefined;
}

function normalizeTaxClass(value?: string) {
	const normalized = value?.trim().toLowerCase();
	return normalized || DEFAULT_TAX_CLASS;
}

function normalizeOptionalTaxClass(value?: string) {
	const normalized = value?.trim().toLowerCase();
	return normalized || undefined;
}

function assertFiniteAmount(value: number, field: string) {
	if (!Number.isFinite(value)) {
		throw new ConvexError({
			code: "VALIDATION_ERROR",
			message: `${field} must be a finite number.`,
		});
	}
}

function validateRatePercent(value: number) {
	assertFiniteAmount(value, "Tax rate");
	if (value < 0 || value > MAX_TAX_RATE_PERCENT) {
		throw new ConvexError({
			code: "VALIDATION_ERROR",
			message: `Tax rate must be between 0 and ${MAX_TAX_RATE_PERCENT} percent.`,
		});
	}
}

function validatePriority(value: number) {
	assertFiniteAmount(value, "Priority");
	if (!Number.isInteger(value)) {
		throw new ConvexError({
			code: "VALIDATION_ERROR",
			message: "Priority must be a whole number.",
		});
	}
}

function normalizeRuleInput(args: {
	name?: string;
	countryCode?: string;
	stateCode?: string;
	postalCodePattern?: string;
	taxClass?: string;
	ratePercent?: number;
	priority?: number;
}) {
	const normalized: Record<string, unknown> = {};

	if (args.name !== undefined) {
		const name = args.name.trim();
		if (!name) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: "Tax rule name is required.",
			});
		}
		normalized.name = name;
	}

	if (args.countryCode !== undefined) {
		const countryCode = normalizeCountryCode(args.countryCode);
		if (!/^[A-Z]{2}$/.test(countryCode)) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: "Country code must be a two-letter ISO code.",
			});
		}
		normalized.countryCode = countryCode;
	}

	if (args.stateCode !== undefined) {
		normalized.stateCode = normalizeStateCode(args.stateCode);
	}

	if (args.postalCodePattern !== undefined) {
		normalized.postalCodePattern = normalizePostalCode(args.postalCodePattern);
	}

	if (args.taxClass !== undefined) {
		normalized.taxClass = normalizeOptionalTaxClass(args.taxClass);
	}

	if (args.ratePercent !== undefined) {
		validateRatePercent(args.ratePercent);
		normalized.ratePercent = args.ratePercent;
	}

	if (args.priority !== undefined) {
		validatePriority(args.priority);
		normalized.priority = args.priority;
	}

	return normalized;
}

function wildcardPatternToRegex(pattern: string) {
	const escaped = pattern
		.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*");
	return new RegExp(`^${escaped}$`, "i");
}

function matchesPostalPattern(pattern: string, postalCode?: string) {
	if (!postalCode) return false;
	const normalizedPattern = pattern.trim();
	if (!normalizedPattern) return true;

	if (
		normalizedPattern.startsWith("/") &&
		normalizedPattern.lastIndexOf("/") > 0
	) {
		const lastSlash = normalizedPattern.lastIndexOf("/");
		const source = normalizedPattern.slice(1, lastSlash);
		const flags = normalizedPattern.slice(lastSlash + 1) || "i";
		try {
			return new RegExp(source, flags).test(postalCode);
		} catch {
			return false;
		}
	}

	try {
		return wildcardPatternToRegex(normalizedPattern).test(postalCode);
	} catch {
		return normalizedPattern.toLowerCase() === postalCode.toLowerCase();
	}
}

function ruleSpecificity(rule: TaxRule) {
	return (rule.stateCode ? 10 : 0) + (rule.postalCodePattern ? 20 : 0);
}

function getMatchingRules(
	rules: TaxRule[],
	address: TaxAddress,
	taxClass?: string,
) {
	const normalizedAddress = {
		countryCode: normalizeCountryCode(address.countryCode),
		state: normalizeStateCode(address.state),
		postalCode: normalizePostalCode(address.postalCode),
	};
	const normalizedTaxClass = normalizeTaxClass(taxClass);

	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	return rules
		.filter((rule) => {
			if (!rule.isActive) return false;
			if (
				normalizeCountryCode(rule.countryCode) !== normalizedAddress.countryCode
			)
				return false;
			if (
				rule.stateCode &&
				normalizeStateCode(rule.stateCode) !== normalizedAddress.state
			)
				return false;
			if (
				rule.postalCodePattern &&
				!matchesPostalPattern(
					rule.postalCodePattern,
					normalizedAddress.postalCode,
				)
			)
				return false;
			if (normalizeTaxClass(rule.taxClass) !== normalizedTaxClass) return false;
			return true;
		})
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		.sort((a, b) => {
			if (a.priority !== b.priority) return a.priority - b.priority;
			return ruleSpecificity(b) - ruleSpecificity(a);
		});
}

function calculateRuleGroupTax(
	rules: TaxRule[],
	amount: number,
	pricesIncludeTax = false,
) {
	if (amount <= 0 || rules.length === 0) {
		return { taxAmount: 0, taxRate: 0, rules: [] };
	}

	const hasCompound = rules.some((rule) => rule.isCompound);
	const selectedRules = hasCompound
		? rules
		: rules.filter((rule) => rule.priority === rules[0].priority);

	let runningAmount = amount;
	let additiveRate = 0;
	let exclusiveTax = 0;

	for (const rule of selectedRules) {
		const rate = rule.ratePercent / 100;
		additiveRate += rate;
		const basis = hasCompound ? runningAmount : amount;
		const ruleTax = Math.round(basis * rate);
		exclusiveTax += ruleTax;
		if (rule.isCompound) runningAmount += ruleTax;
	}

	const effectiveRate = amount > 0 ? exclusiveTax / amount : additiveRate;
	const taxAmount = pricesIncludeTax
		? Math.round(amount - amount / (1 + effectiveRate))
		: exclusiveTax;

	return {
		taxAmount,
		taxRate: effectiveRate,
		rules: selectedRules.map((rule) => ({
			_id: rule._id,
			name: rule.name,
			countryCode: rule.countryCode,
			stateCode: rule.stateCode,
			postalCodePattern: rule.postalCodePattern,
			taxClass: normalizeTaxClass(rule.taxClass),
			ratePercent: rule.ratePercent,
			isCompound: rule.isCompound,
			priority: rule.priority,
		})),
	};
}

export function calculateTaxFromRules(
	rules: TaxRule[],
	address: TaxAddress & { taxClass?: string; pricesIncludeTax?: boolean },
	amount: number,
) {
	assertFiniteAmount(amount, "Amount");
	const matchingRules = getMatchingRules(rules, address, address.taxClass);
	return calculateRuleGroupTax(
		matchingRules,
		Math.max(0, amount),
		address.pricesIncludeTax,
	);
}

export function calculateTaxForLinesFromRules(
	rules: TaxRule[],
	address: TaxAddress,
	lines: TaxLine[],
	options: { pricesIncludeTax?: boolean } = {},
) {
	const taxableLines = lines.filter(
		(line) => line.taxable !== false && line.amount > 0,
	);
	const byClass = new Map<string, number>();

	for (const line of taxableLines) {
		assertFiniteAmount(line.amount, "Line amount");
		const taxClass = normalizeTaxClass(line.taxClass);
		byClass.set(taxClass, (byClass.get(taxClass) ?? 0) + line.amount);
	}

	let taxAmount = 0;
	let taxableAmount = 0;
	const breakdown: Array<{
		taxClass: string;
		taxableAmount: number;
		taxAmount: number;
		taxRate: number;
		rules: Array<Record<string, unknown>>;
	}> = [];

	for (const [taxClass, amount] of byClass.entries()) {
		taxableAmount += amount;
		const result = calculateTaxFromRules(
			rules,
			{ ...address, taxClass, pricesIncludeTax: options.pricesIncludeTax },
			amount,
		);
		taxAmount += result.taxAmount;
		breakdown.push({
			taxClass,
			taxableAmount: amount,
			taxAmount: result.taxAmount,
			taxRate: result.taxRate,
			rules: result.rules,
		});
	}

	return {
		taxAmount,
		taxableAmount,
		breakdown,
	};
}

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getById = query({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		id: v.id("commerce_tax_rules"),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCan(ctx, "commerce.tax.manage");
		return ctx.db.get("commerce_tax_rules", args.id);
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const list = query({
	args: {},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx) => {
		await requireCan(ctx, "commerce.tax.manage");

		const rules = await ctx.db.query("commerce_tax_rules").collect();
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		return rules.sort((a, b) => {
			if (a.priority !== b.priority) return a.priority - b.priority;
			if (a.countryCode !== b.countryCode)
				return a.countryCode.localeCompare(b.countryCode);
			return ruleSpecificity(b) - ruleSpecificity(a);
		});
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const calculate = query({
	args: {
		countryCode: v.string(),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		state: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		postalCode: v.optional(v.string()),
		amount: v.number(),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		taxClass: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		pricesIncludeTax: v.optional(v.boolean()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		assertFiniteAmount(args.amount, "Amount");
		const rules = await ctx.db
			.query("commerce_tax_rules")
			// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
			.withIndex("by_active", (q) => q.eq("isActive", true))
			.collect();

		return calculateTaxFromRules(rules, args, Math.max(0, args.amount));
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const create = mutation({
	args: {
		name: v.string(),
		countryCode: v.string(),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		stateCode: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		postalCodePattern: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		taxClass: v.optional(v.string()),
		ratePercent: v.number(),
		priority: v.number(),
		isCompound: v.boolean(),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		isActive: v.optional(v.boolean()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCan(ctx, "commerce.tax.manage");

		const normalized = normalizeRuleInput(args) as {
			name: string;
			countryCode: string;
			stateCode?: string;
			postalCodePattern?: string;
			taxClass?: string;
			ratePercent: number;
			priority: number;
		};
		const now = Date.now();

		return ctx.db.insert("commerce_tax_rules", {
			...normalized,
			isCompound: args.isCompound,
			isActive: args.isActive ?? true,
			createdAt: now,
			updatedAt: now,
		});
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const update = mutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		id: v.id("commerce_tax_rules"),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		name: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		countryCode: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		stateCode: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		postalCodePattern: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		taxClass: v.optional(v.string()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		ratePercent: v.optional(v.number()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		priority: v.optional(v.number()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		isCompound: v.optional(v.boolean()),
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		isActive: v.optional(v.boolean()),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCan(ctx, "commerce.tax.manage");

		const rule = await ctx.db.get("commerce_tax_rules", args.id);
		if (!rule) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Tax rule not found.",
			});
		}

		const { id: _id, isCompound, isActive, ...candidate } = args;
		const patch: Record<string, unknown> = {
			...normalizeRuleInput(candidate),
			updatedAt: Date.now(),
		};
		if (isCompound !== undefined) patch.isCompound = isCompound;
		if (isActive !== undefined) patch.isActive = isActive;

		await ctx.db.patch("commerce_tax_rules", args.id, patch);
		return { success: true };
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const remove = mutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		id: v.id("commerce_tax_rules"),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCan(ctx, "commerce.tax.manage");

		const rule = await ctx.db.get("commerce_tax_rules", args.id);
		if (!rule) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Tax rule not found.",
			});
		}

		await ctx.db.delete("commerce_tax_rules", args.id);
		return { success: true };
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const toggleActive = mutation({
	args: {
		// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
		id: v.id("commerce_tax_rules"),
	},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx, args) => {
		await requireCan(ctx, "commerce.tax.manage");

		const rule = await ctx.db.get("commerce_tax_rules", args.id);
		if (!rule) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Tax rule not found.",
			});
		}

		await ctx.db.patch("commerce_tax_rules", args.id, {
			isActive: !rule.isActive,
			updatedAt: Date.now(),
		});

		return { success: true, isActive: !rule.isActive };
	},
});

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const seedDefaultTaxRules = mutation({
	args: {},
	// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
	handler: async (ctx) => {
		await requireCan(ctx, "commerce.tax.manage");

		const existing = await ctx.db.query("commerce_tax_rules").first();
		if (existing !== null) {
			return {
				seeded: false,
				count: 0,
				reason: "rules already exist",
			} as const;
		}

		const now = Date.now();
		const defaults: Array<{
			name: string;
			countryCode: string;
			stateCode?: string;
			taxClass?: string;
			ratePercent: number;
			priority: number;
		}> = [
			{ name: "US Default", countryCode: "US", ratePercent: 5, priority: 100 },
			{
				name: "California",
				countryCode: "US",
				stateCode: "CA",
				ratePercent: 7.25,
				priority: 10,
			},
			{
				name: "New York",
				countryCode: "US",
				stateCode: "NY",
				ratePercent: 8,
				priority: 10,
			},
			{
				name: "Texas",
				countryCode: "US",
				stateCode: "TX",
				ratePercent: 6.25,
				priority: 10,
			},
			{
				name: "Florida",
				countryCode: "US",
				stateCode: "FL",
				ratePercent: 6,
				priority: 10,
			},
			{
				name: "Washington",
				countryCode: "US",
				stateCode: "WA",
				ratePercent: 6.5,
				priority: 10,
			},
			{
				name: "Pennsylvania",
				countryCode: "US",
				stateCode: "PA",
				ratePercent: 6,
				priority: 10,
			},
			{
				name: "Illinois",
				countryCode: "US",
				stateCode: "IL",
				ratePercent: 6.25,
				priority: 10,
			},
			{
				name: "Ohio",
				countryCode: "US",
				stateCode: "OH",
				ratePercent: 5.75,
				priority: 10,
			},
			{
				name: "Georgia",
				countryCode: "US",
				stateCode: "GA",
				ratePercent: 4,
				priority: 10,
			},
			{
				name: "North Carolina",
				countryCode: "US",
				stateCode: "NC",
				ratePercent: 4.75,
				priority: 10,
			},
			{
				name: "Oregon - No Tax",
				countryCode: "US",
				stateCode: "OR",
				ratePercent: 0,
				priority: 10,
			},
			{
				name: "Montana - No Tax",
				countryCode: "US",
				stateCode: "MT",
				ratePercent: 0,
				priority: 10,
			},
			{
				name: "Delaware - No Tax",
				countryCode: "US",
				stateCode: "DE",
				ratePercent: 0,
				priority: 10,
			},
			{
				name: "New Hampshire - No Tax",
				countryCode: "US",
				stateCode: "NH",
				ratePercent: 0,
				priority: 10,
			},
			{
				name: "Alaska - No Tax",
				countryCode: "US",
				stateCode: "AK",
				ratePercent: 0,
				priority: 10,
			},
			{
				name: "Reduced Rate Example",
				countryCode: "US",
				taxClass: "reduced-rate",
				ratePercent: 2.5,
				priority: 100,
			},
		];

		for (const rule of defaults) {
			await ctx.db.insert("commerce_tax_rules", {
				name: rule.name,
				countryCode: rule.countryCode,
				stateCode: rule.stateCode,
				taxClass: rule.taxClass,
				ratePercent: rule.ratePercent,
				priority: rule.priority,
				isCompound: false,
				isActive: true,
				createdAt: now,
				updatedAt: now,
			});
		}

		return { seeded: true, count: defaults.length } as const;
	},
});
