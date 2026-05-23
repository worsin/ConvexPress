import { ConvexError, v } from "convex/values";

import { mutation } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";
import { emitEvent } from "../../helpers/events";
import { SHIPPING_EVENTS } from "../../events/constants";
import {
  archiveLocationArgs,
  assignProductLocationArgs,
  createLocationArgs,
  removeProductLocationArgs,
  setDefaultLocationArgs,
  updateLocationArgs,
} from "./validators";

async function ensureUniqueCode(ctx: any, code: string, ignoreId?: any) {
  const existing = await ctx.db
    .query("commerce_ship_from_locations")
    .withIndex("by_code", (q: any) => q.eq("code", code))
    .unique();
  if (existing && existing._id !== ignoreId) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Location code "${code}" already exists.`,
    });
  }
}

async function clearOtherDefaults(ctx: any, ignoreId?: any) {
  const defaults = await ctx.db
    .query("commerce_ship_from_locations")
    .withIndex("by_default", (q: any) => q.eq("isDefault", true))
    .collect();
  for (const row of defaults) {
    if (ignoreId && row._id === ignoreId) continue;
    await ctx.db.patch(row._id, { isDefault: false, updatedAt: Date.now() });
  }
}

export const create = mutation({
  args: createLocationArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.locations.manage");
    await ensureUniqueCode(ctx, args.code);

    const isDefault = args.isDefault ?? false;
    if (isDefault) await clearOtherDefaults(ctx);

    const now = Date.now();
    const locationId = await ctx.db.insert("commerce_ship_from_locations", {
      name: args.name,
      code: args.code,
      locationType: args.locationType,
      address: args.address,
      isActive: args.isActive ?? true,
      isDefault,
      isArchived: false,
      isPickupEnabled: args.isPickupEnabled,
      timezone: args.timezone,
      cutoffTime: args.cutoffTime,
      operatingDays: args.operatingDays,
      operatingHours: args.operatingHours,
      handlingTimeDays: args.handlingTimeDays,
      priority: args.priority ?? 100,
      fulfillmentProvider: args.fulfillmentProvider ?? "manual",
      externalProviderLocationId: args.externalProviderLocationId,
      fulfillmentProviderConfig: args.fulfillmentProviderConfig,
      createdAt: now,
      updatedAt: now,
      createdByUserId: user?._id,
      updatedByUserId: user?._id,
    });
    await emitEvent(ctx, SHIPPING_EVENTS.LOCATION_CREATED, "shipping", {
      locationId,
      code: args.code,
      name: args.name,
    });
    return locationId;
  },
});

export const update = mutation({
  args: updateLocationArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.locations.manage");
    const existing = await ctx.db.get(args.locationId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Location not found." });
    }
    if (args.patch.code !== undefined && args.patch.code !== existing.code) {
      await ensureUniqueCode(ctx, args.patch.code, args.locationId);
    }
    const patch: Record<string, unknown> = {
      updatedAt: Date.now(),
      updatedByUserId: user?._id,
    };
    for (const [key, value] of Object.entries(args.patch)) {
      if (value !== undefined) patch[key] = value;
    }
    await ctx.db.patch(args.locationId, patch);
    await emitEvent(ctx, SHIPPING_EVENTS.LOCATION_UPDATED, "shipping", {
      locationId: args.locationId,
    });
    return args.locationId;
  },
});

export const archive = mutation({
  args: archiveLocationArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.locations.manage");
    const existing = await ctx.db.get(args.locationId);
    if (!existing) return { archived: false };
    if (existing.isDefault) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Cannot archive the default location. Promote another first.",
      });
    }
    await ctx.db.patch(args.locationId, {
      isArchived: true,
      isActive: false,
      updatedAt: Date.now(),
    });
    await emitEvent(ctx, SHIPPING_EVENTS.LOCATION_ARCHIVED, "shipping", {
      locationId: args.locationId,
    });
    return { archived: true };
  },
});

/**
 * PRD A4 — toggle an active (non-archived) location on/off without archiving.
 * Disabled locations are excluded from rate pipeline selection but retained
 * for historical orders. Default location cannot be deactivated.
 */
export const setActive = mutation({
  args: {
    locationId: v.id("commerce_ship_from_locations"),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.locations.manage");
    const existing = await ctx.db.get(args.locationId);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Location not found." });
    }
    if (!args.active && existing.isDefault) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Cannot deactivate the default location. Promote another first.",
      });
    }
    await ctx.db.patch(args.locationId, {
      isActive: args.active,
      updatedAt: Date.now(),
    });
    await emitEvent(ctx, SHIPPING_EVENTS.LOCATION_UPDATED, "shipping", {
      locationId: args.locationId,
      isActive: args.active,
    });
    return { isActive: args.active };
  },
});

export const setDefault = mutation({
  args: setDefaultLocationArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.locations.manage");
    const target = await ctx.db.get(args.locationId);
    if (!target) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Location not found." });
    }
    if (target.isArchived) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Archived location cannot be default.",
      });
    }
    await clearOtherDefaults(ctx, args.locationId);
    await ctx.db.patch(args.locationId, { isDefault: true, updatedAt: Date.now() });
    await emitEvent(ctx, SHIPPING_EVENTS.LOCATION_DEFAULT_CHANGED, "shipping", {
      locationId: args.locationId,
    });
    return args.locationId;
  },
});

export const assignProductLocation = mutation({
  args: assignProductLocationArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.locations.manage");

    // Prevent duplicates of the exact same mapping key.
    const existing = await ctx.db
      .query("commerce_product_location_fulfillment")
      .withIndex("by_product_location", (q: any) =>
        q.eq("productId", args.productId).eq("locationId", args.locationId),
      )
      .collect();
    const match = existing.find(
      (row: any) => (row.variantId ?? null) === (args.variantId ?? null),
    );

    const now = Date.now();
    if (match) {
      await ctx.db.patch(match._id, {
        priority: args.priority,
        enabled: args.enabled ?? true,
        notes: args.notes,
        updatedAt: now,
      });
      return match._id;
    }

    return ctx.db.insert("commerce_product_location_fulfillment", {
      productId: args.productId,
      variantId: args.variantId,
      locationId: args.locationId,
      priority: args.priority,
      enabled: args.enabled ?? true,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const removeProductLocation = mutation({
  args: removeProductLocationArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.locations.manage");
    const existing = await ctx.db.get(args.mappingId);
    if (!existing) return { removed: false };
    await ctx.db.delete(args.mappingId);
    return { removed: true };
  },
});
