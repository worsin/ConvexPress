import { ConvexError } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { requireCommerceEnabled } from "./helpers";
import {
  createDiscountCodeArgs,
  updateDiscountCodeArgs,
} from "./validators";

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
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

    if (args.amount <= 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Discount amount must be greater than zero.",
      });
    }

    await ensureUniqueCode(ctx, code);
    const now = Date.now();

    return ctx.db.insert("commerce_discount_codes", {
      code,
      description: args.description?.trim() || undefined,
      status: args.status ?? "active",
      discountType: args.discountType,
      amount: args.amount,
      usageCount: 0,
      usageLimit: args.usageLimit ?? undefined,
      startsAt: args.startsAt ?? undefined,
      endsAt: args.endsAt ?? undefined,
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

    const discount = await ctx.db.get(args.discountId);
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
    if (args.amount !== undefined) {
      if (args.amount <= 0) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Discount amount must be greater than zero.",
        });
      }
      patch.amount = args.amount;
    }
    if (args.usageLimit !== undefined) patch.usageLimit = args.usageLimit ?? undefined;
    if (args.startsAt !== undefined) patch.startsAt = args.startsAt ?? undefined;
    if (args.endsAt !== undefined) patch.endsAt = args.endsAt ?? undefined;

    await ctx.db.patch(args.discountId, patch);
    return args.discountId;
  },
});
