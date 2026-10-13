import { ConvexError, v, type ObjectType } from "convex/values";

import { mutation, query, type QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { requireCan } from "../helpers/permissions";
import { requireCommerceEnabled } from "./helpers";
import { createDiscountCodeArgs, updateDiscountCodeArgs } from "./validators";

import { commerceDocs } from "../schema/commerce.docs.generated";
type DiscountDoc = Doc<"commerce_discount_codes">;
type DiscountFieldArgs = Omit<ObjectType<typeof updateDiscountCodeArgs>, "discountId">;
type DiscountTierInput = NonNullable<DiscountFieldArgs["tiers"]>[number];

const DISCOUNT_STATUSES: readonly DiscountDoc["status"][] = ["active", "inactive"];
const DISCOUNT_TYPES: readonly DiscountDoc["discountType"][] = ["fixed_cart", "percent", "fixed_product", "free_shipping"];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/** The literal from `allowed` equal to `value`, if any. */
function matchLiteral<T extends string>(allowed: readonly T[], value: string | undefined): T | undefined {
	return allowed.find((candidate) => candidate === value);
}

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

function normalizeIdArray<T extends string>(values: T[] | null | undefined): T[] | undefined {
	if (!values) return undefined;
	const seen = new Set<string>();
	return values.filter((value) => {
		const key = value.toString();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function normalizeTiers(tiers: DiscountTierInput[] | null | undefined) {
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

function normalizeDiscountFields(args: DiscountFieldArgs, existing?: DiscountDoc): Partial<DiscountDoc> {
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

	const patch: Partial<DiscountDoc> = {};
	// `null` clears a field; `undefined` leaves it untouched.
	if (args.minimumSubtotalAmount !== undefined) patch.minimumSubtotalAmount = args.minimumSubtotalAmount ?? undefined;
	if (args.minimumQuantity !== undefined) patch.minimumQuantity = args.minimumQuantity ?? undefined;
	if (args.maxDiscountAmount !== undefined) patch.maxDiscountAmount = args.maxDiscountAmount ?? undefined;
	if (args.usageLimit !== undefined) patch.usageLimit = args.usageLimit ?? undefined;
	if (args.startsAt !== undefined) patch.startsAt = args.startsAt ?? undefined;
	if (args.endsAt !== undefined) patch.endsAt = args.endsAt ?? undefined;

	if (args.applicability !== undefined) {
		patch.applicability = args.applicability;
	}

	if (args.productIds !== undefined) patch.productIds = normalizeIdArray(args.productIds);
	if (args.categoryIds !== undefined) patch.categoryIds = normalizeIdArray(args.categoryIds);
	if (args.excludedProductIds !== undefined) patch.excludedProductIds = normalizeIdArray(args.excludedProductIds);
	if (args.excludedCategoryIds !== undefined) patch.excludedCategoryIds = normalizeIdArray(args.excludedCategoryIds);

	if (args.tiers !== undefined) {
		patch.tiers = normalizeTiers(args.tiers) ?? undefined;
	}

	return patch;
}

async function ensureUniqueCode(ctx: Pick<QueryCtx, "db">, code: string, excludeId?: string) {
	const existing = await ctx.db
		.query("commerce_discount_codes")
		.withIndex("by_code", (q) => q.eq("code", code))
		.unique();

	if (existing && existing._id.toString() !== excludeId) {
		throw new ConvexError({
			code: "VALIDATION_ERROR",
			message: "Discount code already exists.",
		});
	}
}

export const list = query({
	args: {
		status: v.optional(v.string()),
		discountType: v.optional(v.string()),
		search: v.optional(v.string()),
		orderBy: v.optional(v.string()),
		orderDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
		page: v.optional(v.number()),
		perPage: v.optional(v.number()),
	},
	returns: v.object({
   items: v.array(commerceDocs.commerce_discount_codes),
   total: v.number(),
   page: v.number(),
   perPage: v.number(),
   totalPages: v.number(),
 }),
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		await requireCan(ctx, "commerce.discount.update");

		const page = Math.max(1, args.page ?? 1);
		const perPage = Math.min(100, Math.max(1, args.perPage ?? 20));

		// Filters name schema values; an unknown status or type matches nothing.
		const status = args.status ? matchLiteral(DISCOUNT_STATUSES, args.status) : undefined;
		const discountType = args.discountType ? matchLiteral(DISCOUNT_TYPES, args.discountType) : undefined;
		const unknownFilter = (Boolean(args.status) && !status) || (Boolean(args.discountType) && !discountType);

		let scoped: DiscountDoc[];
		if (unknownFilter) {
			scoped = [];
		} else if (args.search && args.search.trim()) {
			const term = args.search.trim();
			scoped = await ctx.db
				.query("commerce_discount_codes")
				.withSearchIndex("search_discount_codes", (q) => {
					let sq = q.search("code", term);
					if (status) sq = sq.eq("status", status);
					if (discountType) sq = sq.eq("discountType", discountType);
					return sq;
				})
				.take(2000);
		} else if (status) {
			scoped = await ctx.db
				.query("commerce_discount_codes")
				.withIndex("by_status", (q) => q.eq("status", status))
				.take(20000);
		} else {
			scoped = await ctx.db
				.query("commerce_discount_codes")
				.withIndex("by_updatedAt")
				.order("desc")
				.take(20000);
		}

		let filtered = scoped;
		if (args.discountType) {
			filtered = filtered.filter((d) => d.discountType === args.discountType);
		}
		// Search needs to ALSO match description, plus an extra filter pass
		if (args.search && args.search.trim()) {
			const term = args.search.trim().toLowerCase();
			filtered = filtered.filter((d) => {
				const haystack = [d.code, d.description].filter(Boolean).join(" ").toLowerCase();
				return haystack.includes(term);
			});
		}

		const dir = args.orderDir === "asc" ? 1 : -1;
		const key = args.orderBy ?? "updatedAt";
		filtered.sort((a, b) => {
			let av: string | number;
			let bv: string | number;
			switch (key) {
				case "code":
					av = (a.code ?? "").toLowerCase();
					bv = (b.code ?? "").toLowerCase();
					break;
				case "amount":
					av = a.amount ?? 0;
					bv = b.amount ?? 0;
					break;
				case "usage":
					av = a.usageCount ?? 0;
					bv = b.usageCount ?? 0;
					break;
				case "status":
					av = a.status ?? "";
					bv = b.status ?? "";
					break;
				case "endsAt":
					av = a.endsAt ?? Number.MAX_SAFE_INTEGER;
					bv = b.endsAt ?? Number.MAX_SAFE_INTEGER;
					break;
				case "updatedAt":
				default:
					av = a.updatedAt ?? 0;
					bv = b.updatedAt ?? 0;
					break;
			}
			if (av < bv) return -1 * dir;
			if (av > bv) return 1 * dir;
			return 0;
		});

		const total = filtered.length;
		const totalPages = Math.ceil(total / perPage);
		const slice = filtered.slice((page - 1) * perPage, page * perPage);
		return { items: slice, total, page, perPage, totalPages };
	},
});

export const counts = query({
	args: {
		search: v.optional(v.string()),
		discountType: v.optional(v.string()),
	},
	returns: v.object({
   all: v.number(),
   active: v.number(),
   inactive: v.number(),
   scheduled: v.number(),
   expired: v.number(),
 }),
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		await requireCan(ctx, "commerce.discount.update");

		let pool: DiscountDoc[];
		if (args.search && args.search.trim()) {
			const term = args.search.trim();
			pool = await ctx.db
				.query("commerce_discount_codes")
				.withSearchIndex("search_discount_codes", (q) => q.search("code", term))
				.take(2000);
		} else {
			pool = await ctx.db.query("commerce_discount_codes").take(20000);
		}

		if (args.discountType) {
			pool = pool.filter((d) => d.discountType === args.discountType);
		}

		const now = Date.now();
		const out = {
			all: pool.length,
			active: 0,
			inactive: 0,
			scheduled: 0,
			expired: 0,
		};
		for (const d of pool) {
			if (d.status === "active") out.active++;
			else out.inactive++;
			if (d.startsAt && d.startsAt > now) out.scheduled++;
			if (d.endsAt && d.endsAt < now) out.expired++;
		}
		return out;
	},
});

export const bulkSetStatus = mutation({
	args: {
		discountIds: v.array(v.id("commerce_discount_codes")),
		status: v.union(v.literal("active"), v.literal("inactive")),
	},
	returns: v.object({ count: v.number() }),
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		await requireCan(ctx, "commerce.discount.update");
		const now = Date.now();
		let count = 0;
		for (const id of args.discountIds) {
			const existing = await ctx.db.get(id);
			if (!existing) continue;
			await ctx.db.patch("commerce_discount_codes", id, { status: args.status, updatedAt: now });
			count++;
		}
		return { count };
	},
});

export const bulkDelete = mutation({
	args: {
		discountIds: v.array(v.id("commerce_discount_codes")),
	},
	returns: v.object({ count: v.number() }),
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		await requireCan(ctx, "commerce.discount.update");
		let count = 0;
		for (const id of args.discountIds) {
			const existing = await ctx.db.get(id);
			if (!existing) continue;
			await ctx.db.delete("commerce_discount_codes", id);
			count++;
		}
		return { count };
	},
});

export const create = mutation({
	args: createDiscountCodeArgs,
	returns: v.id("commerce_discount_codes"),
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		await requireCan(ctx, "commerce.discount.update");

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
	returns: v.id("commerce_discount_codes"),
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		await requireCan(ctx, "commerce.discount.update");

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

		const patch: Partial<DiscountDoc> = {
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
	returns: v.union(v.null(), v.id("commerce_discount_codes")),
	handler: async (ctx, args) => {
		await requireCommerceEnabled(ctx);
		await requireCan(ctx, "commerce.discount.update");

		const discount = await ctx.db.get(
			"commerce_discount_codes",
			args.discountId,
		);
		if (!discount) return null;

		await ctx.db.delete("commerce_discount_codes", args.discountId);
		return args.discountId;
	},
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTOMATIC DISCOUNTS (Wave 12.2)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List active automatic discounts ordered by updatedAt.
 * Called from cart.apply to evaluate auto-discounts on every cart mutation.
 */
export const listAutomatic = query({
	args: {},
	returns: v.array(commerceDocs.commerce_discount_codes),
	handler: async (ctx) => {
		await requireCommerceEnabled(ctx);
		const rows = await ctx.db
			.query("commerce_discount_codes")
			.withIndex("by_auto", (q) => q.eq("auto", true))
			.collect();
		return rows.filter((r) => r.status === "active");
	},
});

/**
 * Evaluate serialized `autoConditions` against a cart context. Returns true
 * if the auto-discount should apply. Conditions object is intentionally
 * simple; extend as needed.
 *
 * Supported shapes:
 *   { minSubtotal: number }
 *   { newCustomersOnly: true } — delegated to userContext.priorOrderCount
 *   { hasProductId: string }   — at least one line matches
 *   { hasCategoryId: string }  — at least one line's categories match
 */
export function matchesAutoConditions(
	conditions: unknown,
	ctx: {
		cartSubtotal: number;
		priorOrderCount?: number;
		productIds: string[];
		categoryIds: string[];
	},
): boolean {
	if (!isRecord(conditions)) return true;
	if (
		typeof conditions.minSubtotal === "number" &&
		ctx.cartSubtotal < conditions.minSubtotal
	) {
		return false;
	}
	if (conditions.newCustomersOnly) {
		if (
			typeof ctx.priorOrderCount !== "number" ||
			ctx.priorOrderCount > 0
		) {
			return false;
		}
	}
	if (
		typeof conditions.hasProductId === "string" &&
		!ctx.productIds.includes(conditions.hasProductId)
	) {
		return false;
	}
	if (
		typeof conditions.hasCategoryId === "string" &&
		!ctx.categoryIds.includes(conditions.hasCategoryId)
	) {
		return false;
	}
	return true;
}
