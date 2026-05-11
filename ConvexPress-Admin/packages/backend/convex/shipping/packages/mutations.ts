import { ConvexError } from "convex/values";

import { mutation } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";
import { emitEvent } from "../../helpers/events";
import { SHIPPING_EVENTS } from "../../events/constants";
import {
  createShippingPackageArgs,
  deleteShippingPackageArgs,
  setDefaultPackageArgs,
  updateShippingPackageArgs,
} from "./validators";

async function ensureUniqueCode(ctx: any, code: string, ignoreId?: any) {
  const existing = await ctx.db
    .query("commerce_shipping_packages")
    .withIndex("by_code", (q: any) => q.eq("code", code))
    .unique();
  if (existing && existing._id !== ignoreId) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Package code "${code}" already exists.`,
    });
  }
}

async function clearDefaultInScope(
  ctx: any,
  shipFromLocationId: any,
  ignoreId?: any,
) {
  const scope = await ctx.db
    .query("commerce_shipping_packages")
    .withIndex("by_default_scope", (q: any) =>
      q.eq("shipFromLocationId", shipFromLocationId).eq("isDefault", true),
    )
    .collect();
  for (const row of scope) {
    if (ignoreId && row._id === ignoreId) continue;
    await ctx.db.patch(row._id, { isDefault: false, updatedAt: Date.now() });
  }
}

export const create = mutation({
  args: createShippingPackageArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.packages.manage");
    await ensureUniqueCode(ctx, args.code);

    if (args.isDefault) {
      await clearDefaultInScope(ctx, args.shipFromLocationId ?? undefined);
    }

    const now = Date.now();
    const packageId = await ctx.db.insert("commerce_shipping_packages", {
      code: args.code,
      label: args.label,
      packageType: args.packageType,
      packageSource: args.packageSource ?? "custom",
      carrierPackageCode: args.carrierPackageCode,
      shipFromLocationId: args.shipFromLocationId,
      isDefault: args.isDefault ?? false,
      dimensionUnit: args.dimensionUnit ?? "in",
      weightUnit: args.weightUnit ?? "oz",
      dimensions: args.dimensions,
      innerDimensions: args.innerDimensions,
      tareWeight: args.tareWeight,
      maxLoadWeight: args.maxLoadWeight,
      shipStationPackageId: args.shipStationPackageId,
      shipStationCarrierCode: args.shipStationCarrierCode,
      carrierCode: args.carrierCode,
      notes: args.notes,
      sortOrder: args.sortOrder,
      createdAt: now,
      updatedAt: now,
    });
    await emitEvent(ctx, SHIPPING_EVENTS.PACKAGE_CREATED, "shipping", {
      packageId,
      code: args.code,
    });
    return packageId;
  },
});

export const update = mutation({
  args: updateShippingPackageArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.packages.manage");
    const existing = await ctx.db.get(args.packageId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Package not found." });
    }

    if (args.patch.code !== undefined && args.patch.code !== existing.code) {
      await ensureUniqueCode(ctx, args.patch.code, args.packageId);
    }

    if (args.patch.isDefault === true) {
      await clearDefaultInScope(
        ctx,
        args.patch.shipFromLocationId ?? existing.shipFromLocationId,
        args.packageId,
      );
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(args.patch)) {
      if (value !== undefined) patch[key] = value;
    }
    await ctx.db.patch(args.packageId, patch);
    await emitEvent(ctx, SHIPPING_EVENTS.PACKAGE_UPDATED, "shipping", {
      packageId: args.packageId,
    });
    return args.packageId;
  },
});

export const remove = mutation({
  args: deleteShippingPackageArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.packages.manage");
    const existing = await ctx.db.get(args.packageId);
    if (!existing) return { deleted: false };

    // Soft-delete (archive) instead of hard delete — historical label references.
    await ctx.db.patch(args.packageId, {
      isArchived: true,
      isDefault: false,
      updatedAt: Date.now(),
    });
    await emitEvent(ctx, SHIPPING_EVENTS.PACKAGE_DELETED, "shipping", {
      packageId: args.packageId,
    });
    return { deleted: true };
  },
});

export const setDefault = mutation({
  args: setDefaultPackageArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.packages.manage");
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Package not found." });
    }
    const scope = args.shipFromLocationId ?? pkg.shipFromLocationId;
    await clearDefaultInScope(ctx, scope, args.packageId);
    await ctx.db.patch(args.packageId, {
      isDefault: true,
      shipFromLocationId: scope,
      updatedAt: Date.now(),
    });
    return args.packageId;
  },
});
