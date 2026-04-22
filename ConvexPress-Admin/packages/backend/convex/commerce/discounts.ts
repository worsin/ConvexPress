// @ts-nocheck
import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { requireCommerceEnabled } from "./helpers";
import { createDiscountCodeArgs, updateDiscountCodeArgs } from "./validators";

function normalizeCode(value: string) {
	return value.trim().toUpperCase();
}

function assertNonNegative(value: number | null | undefined, label: string) {
	if (value === null || value === undefined) return;
	if (!Number.isFinite(value) || value < 0) {
		throw new ConvexError({
			code: "VALIDATION_ERROR",
			message: `${label} must be zero or greater.`,
		});
	}
}

function assertPositive(value: number, label: string) {
	if (!Number.isFinite(value) || value <= 0) {
		throw new ConvexError({
			code: "VALIDATION_ERROR",
			message: `${label} must be greater than zero.`,
		});
	}
}

function assertInteger(value: number | null | undefined, label: string) {
	if (value === null || value === undefined) return;
	if (!Number.isInteger(value)) {
		throw new ConvexError({
			code: "VALIDATION_ERROR",
			message: `${label} must be a whole number.`,
		});
	}
}

function assertDiscountAmount(
	discountType: string,
	amount: number,
	label: string,
) {
	assertPositive(amount, label);
	if (discountType === "percent" && amount > 100) {
		throw new ConvexError({
			code: "VALIDATION_ERROR",
			message: `${label} cannot be greater than 100 percent.`,
		});
	}
}

function normalizeIdArray(values: unknown[] | null | undefined) {
	if (!values) return undefined;
	const seen = new Set<string>();
	return values.filter((value: any) => {
		const key = value.toString();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function normalizeTiers(tiers: any[] | null | undefined) {
	if (!tiers || tiers.length === 0) return undefined;

	return tiers.map((tier, index) => {
		const label = tier.label?.trim() || undefined;
		assertNonNegative(tier.minQuantity, `Tier ${index + 1} minimum quantity`);
		assertInteger(tier.minQuantity, `Tier ${index + 1} minimum quantity`);
		assertNonNegative(
			tier.minSubtotalAmount,
			`Tier ${index + 1} minimum subtotal`,
		);
		assertDiscountAmount(
			tier.discountType,
			tier.amount,
			`Tier ${index + 1} amount`,
		);

		if (
			tier.minQuantity === undefined &&
			tier.minSubtotalAmount === undefined
		) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: `Tier ${index + 1} needs a quantity or subtotal threshold.`,
			});
		}

		return {
			label,
			minQuantity: tier.minQuantity ?? undefined,
			minSubtotalAmount: tier.minSubtotalAmount ?? undefined,
			discountType: tier.discountType,
			amount: tier.amount,
		};
	});
}

function validateWindow(
	startsAt: number | undefined,
	endsAt: number | undefined,
) {
	if (startsAt !== undefined && endsAt !== undefined && startsAt > endsAt) {
		throw new ConvexError({
			code: "VALIDATION_ERROR",
			message: "Discount start date must be before the end date.",
		});
	}
}

function normalizeDiscountFields(args: any, existing?: any) {
	const nextDiscountType = args.discountType ?? existing?.discountType;
	const nextAmount = args.amount ?? existing?.amount;
	if (nextDiscountType && nextAmount !== undefined) {
		assertDiscountAmount(nextDiscountType, nextAmount, "Discount amount");
	}

	assertNonNegative(args.minimumSubtotalAmount, "Minimum subtotal");
	assertNonNegative(args.minimumQuantity, "Minimum quantity");
	assertInteger(args.minimumQuantity, "Minimum quantity");
	assertNonNegative(args.maxDiscountAmount, "Maximum discount");
	assertNonNegative(args.usageLimit, "Usage limit");
	assertInteger(args.usageLimit, "Usage limit");

	const startsAt =
		args.startsAt === null ? undefined : (args.startsAt ?? existing?.startsAt);
	const endsAt =
		args.endsAt === null ? undefined : (args.endsAt ?? existing?.endsAt);
	validateWindow(startsAt, endsAt);

	const patch: Record<string, unknown> = {};
	const nullableNumberFields = [
		"minimumSubtotalAmount",
		"minimumQuantity",
		"maxDiscountAmount",
		"usageLimit",
		"startsAt",
		"endsAt",
	];

	for (const field of nullableNumberFields) {
		if (args[field] !== undefined) {
			patch[field] = args[field] ?? undefined;
		}
	}

	if (args.applicability !== undefined) {
		patch.applicability = args.applicability;
	}

	const idFields = [
		"productIds",
		"categoryIds",
		"excludedProductIds",
		"excludedCategoryIds",
	];
	for (const field of idFields) {
		if (args[field] !== undefined) {
			patch[field] = normalizeIdArray(args[field]) ?? undefined;
		}
	}

	if (args.tiers !== undefined) {
		patch.tiers = normalizeTiers(args.tiers) ?? undefined;
	}

	return patch;
}

async function ensureUniqueCode(ctx: any, code: string, excludeId?: string) {
	const existing = await ctx.db
		.query("commerce_discount_codes")
		.withIndex("by_code", (q: any) => q.eq("code", code))
		.unique();

	if (existing && existing._id.toString() !== excludeId) {
		throw new ConvexError({
			code: "VALIDATION_ERROR",
			message: "Discount code already exists.",
		});
	}
}

export const list = query({
	args: {},
	handler: async (ctx) => {
		await requireCommerceEnabled(ctx);
		await requireCan(ctx, "manage_options");
		const discounts = await ctx.db.query("commerce_discount_codes").take(500);
		discounts.sort((a: any, b: any) => b.updatedAt - a.updatedAt);
		return discounts;
	},
});

export const create = mutation({
	args: createDiscountCodeArgs,
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		await requireCan(ctx, "manage_options");

		const code = normalizeCode(args.code);
		if (!code) {
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: "Discount code is required.",
			});
		}

		const normalizedFields = normalizeDiscountFields(args);

		await ensureUniqueCode(ctx, code);
		const now = Date.now();

		return ctx.db.insert("commerce_discount_codes", {
			code,
			description: args.description?.trim() || undefined,
			status: args.status ?? "active",
			discountType: args.discountType,
			amount: args.amount,
			...normalizedFields,
			usageCount: 0,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const update = mutation({
	args: updateDiscountCodeArgs,
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		await requireCan(ctx, "manage_options");

		const discount = await ctx.db.get(
			"commerce_discount_codes",
			args.discountId,
		);
		if (!discount) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: "Discount code not found.",
			});
		}

		const patch: Record<string, unknown> = {
			updatedAt: Date.now(),
		};

		if (args.code !== undefined) {
			const code = normalizeCode(args.code);
			if (!code) {
				throw new ConvexError({
					code: "VALIDATION_ERROR",
					message: "Discount code is required.",
				});
			}
			await ensureUniqueCode(ctx, code, args.discountId.toString());
			patch.code = code;
		}

		if (args.description !== undefined) {
			patch.description = args.description?.trim() || undefined;
		}
		if (args.status !== undefined) patch.status = args.status;
		if (args.discountType !== undefined) patch.discountType = args.discountType;
		if (args.amount !== undefined) patch.amount = args.amount;
		Object.assign(patch, normalizeDiscountFields(args, discount));

		await ctx.db.patch("commerce_discount_codes", args.discountId, patch);
		return args.discountId;
	},
});

export const remove = mutation({
	args: {
		discountId: v.id("commerce_discount_codes"),
	},
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		await requireCan(ctx, "manage_options");

		const discount = await ctx.db.get(
			"commerce_discount_codes",
			args.discountId,
		);
		if (!discount) return null;

		await ctx.db.delete("commerce_discount_codes", args.discountId);
		return args.discountId;
	},
});
