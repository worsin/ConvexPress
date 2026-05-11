import { ConvexError } from "convex/values";

import { mutation } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";
import { emitEvent } from "../../helpers/events";
import { SHIPPING_EVENTS } from "../../events/constants";
import { slugifyClassName } from "../helpers/classResolution";
import {
  assignClassToProductArgs,
  assignClassToVariantArgs,
  bulkAssignClassArgs,
  createShippingClassArgs,
  deleteShippingClassArgs,
  reorderShippingClassesArgs,
  updateShippingClassArgs,
} from "./validators";

const CLASS_SLUG_REGEX = /^[a-z0-9-]+$/;

async function ensureUniqueClassSlug(
  ctx: any,
  desired: string,
  ignoreId?: any,
): Promise<string> {
  let candidate = desired || "class";
  let suffix = 1;
  while (true) {
    const existing = await ctx.db
      .query("commerce_shipping_classes")
      .withIndex("by_slug", (q: any) => q.eq("slug", candidate))
      .unique();
    if (!existing || (ignoreId && existing._id === ignoreId)) return candidate;
    suffix += 1;
    candidate = `${desired}-${suffix}`;
  }
}

async function ensureUniqueClassName(ctx: any, name: string, ignoreId?: any) {
  const all = await ctx.db.query("commerce_shipping_classes").collect();
  const target = name.trim().toLowerCase();
  for (const row of all) {
    if (ignoreId && row._id === ignoreId) continue;
    if (row.name.trim().toLowerCase() === target) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `A shipping class named "${name}" already exists.`,
      });
    }
  }
}

async function getNextClassSortOrder(ctx: any): Promise<number> {
  const all = await ctx.db.query("commerce_shipping_classes").collect();
  const max = all.reduce((acc: number, row: any) => Math.max(acc, row.sortOrder ?? 0), 0);
  return max + 10;
}

export const create = mutation({
  args: createShippingClassArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.classes.manage");
    if (!args.name.trim()) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Shipping class name is required.",
      });
    }
    await ensureUniqueClassName(ctx, args.name);
    const slugBase = args.slug?.trim() || slugifyClassName(args.name);
    if (!CLASS_SLUG_REGEX.test(slugBase)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Invalid slug "${slugBase}". Use lowercase letters, numbers, and dashes only.`,
      });
    }
    const slug = await ensureUniqueClassSlug(ctx, slugBase);

    const now = Date.now();
    const classId = await ctx.db.insert("commerce_shipping_classes", {
      name: args.name.trim(),
      slug,
      description: args.description,
      sortOrder: args.sortOrder ?? (await getNextClassSortOrder(ctx)),
      createdAt: now,
      createdBy: user?._id,
      updatedAt: now,
      updatedBy: user?._id,
    });
    await emitEvent(ctx, SHIPPING_EVENTS.CLASS_CREATED, "shipping", {
      classId,
      name: args.name,
      slug,
    });
    return classId;
  },
});

export const update = mutation({
  args: updateShippingClassArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.classes.manage");
    const existing = await ctx.db.get(args.classId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Shipping class not found." });
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: user?._id };

    if (args.patch.name !== undefined) {
      const trimmed = args.patch.name.trim();
      if (!trimmed) {
        throw new ConvexError({ code: "VALIDATION_ERROR", message: "Name is required." });
      }
      await ensureUniqueClassName(ctx, trimmed, args.classId);
      patch.name = trimmed;
    }

    if (args.patch.slug !== undefined) {
      const normalized = args.patch.slug.trim() || slugifyClassName(args.patch.name ?? existing.name);
      if (!CLASS_SLUG_REGEX.test(normalized)) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Invalid slug "${normalized}".`,
        });
      }
      patch.slug = await ensureUniqueClassSlug(ctx, normalized, args.classId);
    }

    if (args.patch.description !== undefined) patch.description = args.patch.description;
    if (args.patch.sortOrder !== undefined) patch.sortOrder = args.patch.sortOrder;

    await ctx.db.patch(args.classId, patch);
    await emitEvent(ctx, SHIPPING_EVENTS.CLASS_UPDATED, "shipping", {
      classId: args.classId,
      patchKeys: Object.keys(args.patch),
    });
    return args.classId;
  },
});

export const remove = mutation({
  args: deleteShippingClassArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.classes.manage");
    const existing = await ctx.db.get(args.classId);
    if (!existing) {
      return { deleted: false, reassignedProducts: 0, reassignedVariants: 0 };
    }

    const products = await ctx.db
      .query("commerce_products")
      .withIndex("by_shipping_class", (q: any) => q.eq("shippingClassId", args.classId))
      .collect();

    const variants = await ctx.db
      .query("commerce_product_variants")
      .withIndex("by_shipping_class", (q: any) => q.eq("shippingClassId", args.classId))
      .collect();

    // reassignTo: undefined means "fail if references exist". null means "clear to no-class". Id means "reassign".
    if (args.reassignTo === undefined) {
      if (products.length > 0 || variants.length > 0) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Cannot delete class while ${products.length} products and ${variants.length} variants reference it. Pass reassignTo=null to clear or an id to reassign.`,
        });
      }
    } else {
      const target = args.reassignTo; // null or Id
      for (const product of products) {
        await ctx.db.patch(product._id, {
          shippingClassId: target ?? undefined,
          updatedAt: Date.now(),
        });
      }
      for (const variant of variants) {
        await ctx.db.patch(variant._id, {
          shippingClassId: target ?? undefined,
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.db.delete(args.classId);
    await emitEvent(ctx, SHIPPING_EVENTS.CLASS_DELETED, "shipping", {
      classId: args.classId,
      reassignedProducts: products.length,
      reassignedVariants: variants.length,
    });
    return {
      deleted: true,
      reassignedProducts: products.length,
      reassignedVariants: variants.length,
    };
  },
});

export const reorder = mutation({
  args: reorderShippingClassesArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.classes.manage");
    const now = Date.now();
    let updated = 0;
    for (let i = 0; i < args.orderedIds.length; i++) {
      const classId = args.orderedIds[i]!;
      const existing = await ctx.db.get(classId);
      if (!existing) continue;
      await ctx.db.patch(classId, {
        sortOrder: (i + 1) * 10,
        updatedAt: now,
        updatedBy: user?._id,
      });
      updated += 1;
    }
    return { updated };
  },
});

export const assignToProduct = mutation({
  args: assignClassToProductArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.classes.manage");
    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Product not found." });
    }
    await ctx.db.patch(args.productId, {
      shippingClassId: args.classId ?? undefined,
      updatedAt: Date.now(),
    });
    return args.productId;
  },
});

export const assignToVariant = mutation({
  args: assignClassToVariantArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.classes.manage");
    const variant = await ctx.db.get(args.variantId);
    if (!variant) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Variant not found." });
    }

    if (args.classId === "inherit") {
      await ctx.db.patch(args.variantId, {
        shippingClassId: undefined,
        shippingClassOverrideNone: undefined,
        updatedAt: Date.now(),
      });
    } else if (args.classId === null) {
      await ctx.db.patch(args.variantId, {
        shippingClassId: undefined,
        shippingClassOverrideNone: true,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(args.variantId, {
        shippingClassId: args.classId,
        shippingClassOverrideNone: undefined,
        updatedAt: Date.now(),
      });
    }
    return args.variantId;
  },
});

export const bulkAssign = mutation({
  args: bulkAssignClassArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.classes.manage");
    const now = Date.now();
    let updated = 0;
    for (const productId of args.productIds) {
      const product = await ctx.db.get(productId);
      if (!product) continue;
      await ctx.db.patch(productId, {
        shippingClassId: args.classId ?? undefined,
        updatedAt: now,
      });
      updated += 1;
    }
    return { updated };
  },
});
