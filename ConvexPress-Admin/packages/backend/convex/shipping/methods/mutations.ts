/**
 * PRDs B1-B9 — CRUD mutations for every method type.
 *
 * Each method type has its own table (`commerce_shipping_method_*`). The
 * mutations share a uniform shape: create, update, remove, plus toggleEnabled.
 * Method config validators come from the schema definition; we accept v.any()
 * for the config payload here and let the schema do the validation.
 */

import { ConvexError, v } from "convex/values";

import { mutation } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";
import { emitEvent } from "../../helpers/events";
import { SHIPPING_EVENTS } from "../../events/constants";

const METHOD_TABLES = [
  "commerce_shipping_method_flat_rate",
  "commerce_shipping_method_weight_based",
  "commerce_shipping_method_dimensional",
  "commerce_shipping_method_price_based",
  "commerce_shipping_method_quantity_based",
  "commerce_shipping_method_free",
  "commerce_shipping_method_local_pickup",
  "commerce_shipping_method_local_delivery",
  "commerce_shipping_method_table_rate",
] as const;

const methodTypeValidator = v.union(
  v.literal("flat_rate"),
  v.literal("weight_based"),
  v.literal("dimensional"),
  v.literal("price_based"),
  v.literal("quantity_based"),
  v.literal("free"),
  v.literal("local_pickup"),
  v.literal("local_delivery"),
  v.literal("table_rate"),
);

function tableForType(methodType: string): string {
  const t = `commerce_shipping_method_${methodType}`;
  if (!(METHOD_TABLES as readonly string[]).includes(t)) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Unknown method type "${methodType}".`,
    });
  }
  return t;
}

/**
 * PRD B1-B9 — shared business validation for method config payloads.
 * Schema validators catch shape; this catches semantics (tier gaps, currency,
 * duplicate names within a zone, referenced-rule existence).
 */
async function validateMethodConfig(
  ctx: any,
  methodType: string,
  config: any,
  existingId?: any,
): Promise<void> {
  // Common required fields.
  if (!config.zoneId) throw new ConvexError({ code: "VALIDATION_ERROR", message: "zoneId is required." });
  if (!config.name || !String(config.name).trim())
    throw new ConvexError({ code: "VALIDATION_ERROR", message: "name is required." });
  if (!config.label || !String(config.label).trim())
    throw new ConvexError({ code: "VALIDATION_ERROR", message: "label is required." });

  // Duplicate name within the same zone + method type.
  const table = `commerce_shipping_method_${methodType}` as any;
  const siblings = await ctx.db
    .query(table)
    .withIndex("by_zone", (q: any) => q.eq("zoneId", config.zoneId))
    .collect();
  const dup = (siblings as any[]).find(
    (s) =>
      (existingId ? s._id !== existingId : true) &&
      String(s.name).trim().toLowerCase() ===
        String(config.name).trim().toLowerCase(),
  );
  if (dup) {
    throw new ConvexError({
      code: "DUPLICATE_METHOD_NAME",
      message: `A ${methodType} method named "${config.name}" already exists in this zone.`,
    });
  }

  // Referenced rule must exist when set.
  if (config.ruleId) {
    const rule = await ctx.db.get(config.ruleId);
    if (!rule)
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Referenced shipping rule no longer exists.",
      });
  }

  // Tier-based types: gap + overlap detection.
  if (["weight_based", "dimensional", "price_based", "quantity_based"].includes(methodType)) {
    const tiers: any[] = Array.isArray(config.tiers) ? config.tiers : [];
    const keyMin =
      methodType === "weight_based" || methodType === "dimensional"
        ? "minWeight"
        : methodType === "price_based"
          ? "minSubtotal"
          : "minCount";
    const keyMax = keyMin.replace("min", "max");
    const sorted = [...tiers].sort(
      (a, b) => Number(a[keyMin] ?? 0) - Number(b[keyMin] ?? 0),
    );
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      if (t[keyMin] === undefined || Number.isNaN(Number(t[keyMin]))) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Tier ${i + 1} is missing ${keyMin}.`,
        });
      }
      if (t[keyMax] !== undefined && Number(t[keyMax]) < Number(t[keyMin])) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Tier ${i + 1} has ${keyMax} < ${keyMin}.`,
        });
      }
      if (i > 0) {
        const prev = sorted[i - 1];
        const prevMax = prev[keyMax];
        if (prevMax !== undefined && Number(t[keyMin]) < Number(prevMax)) {
          throw new ConvexError({
            code: "VALIDATION_ERROR",
            message: `Tier ${i + 1} overlaps tier ${i}: ${keyMin} < previous ${keyMax}.`,
          });
        }
      }
    }
  }

  // Price-based currency.
  if (methodType === "price_based" && !config.currencyCode) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "currencyCode is required for price-based methods.",
    });
  }
}

export const createMethod = mutation({
  args: {
    methodType: methodTypeValidator,
    config: v.any(),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.methods.manage");
    const table = tableForType(args.methodType);
    await validateMethodConfig(ctx, args.methodType, args.config);
    const now = Date.now();
    // PRD B1 §4 — audit stamps on flat rate. Other method types take them too
    // when present; the schema makes these fields optional so it's harmless.
    const auditStamps =
      args.methodType === "flat_rate" && user?._id
        ? { createdBy: user._id, updatedBy: user._id }
        : {};
    const id = await ctx.db.insert(table as any, {
      ...args.config,
      ...auditStamps,
      enabled: args.config.enabled ?? true,
      sortOrder: args.config.sortOrder ?? 100,
      createdAt: now,
      updatedAt: now,
    });
    await emitEvent(ctx, SHIPPING_EVENTS.METHOD_CREATED, "shipping", {
      methodId: id,
      methodType: args.methodType,
      zoneId: args.config.zoneId,
    });
    return id;
  },
});

export const updateMethod = mutation({
  args: {
    methodType: methodTypeValidator,
    methodId: v.string(),
    patch: v.any(),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.methods.manage");
    const table = tableForType(args.methodType);
    const id = args.methodId as any;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Method not found." });
    }
    // Validate merged config against business rules.
    const merged = { ...(existing as any), ...args.patch };
    await validateMethodConfig(ctx, args.methodType, merged, id);
    const auditStamp =
      args.methodType === "flat_rate" && user?._id ? { updatedBy: user._id } : {};
    await ctx.db.patch(id, { ...args.patch, ...auditStamp, updatedAt: Date.now() });
    await emitEvent(ctx, SHIPPING_EVENTS.METHOD_UPDATED, "shipping", {
      methodId: id,
      methodType: args.methodType,
    });
    return id;
  },
});

export const deleteMethod = mutation({
  args: {
    methodType: methodTypeValidator,
    methodId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.methods.manage");
    const id = args.methodId as any;
    await ctx.db.delete(id);
    await emitEvent(ctx, SHIPPING_EVENTS.METHOD_DELETED, "shipping", {
      methodId: id,
      methodType: args.methodType,
    });
    return { deleted: true };
  },
});

export const toggleMethodEnabled = mutation({
  args: {
    methodType: methodTypeValidator,
    methodId: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.methods.manage");
    const id = args.methodId as any;
    await ctx.db.patch(id, { enabled: args.enabled, updatedAt: Date.now() });
    await emitEvent(ctx, SHIPPING_EVENTS.METHOD_UPDATED, "shipping", {
      methodId: id,
      methodType: args.methodType,
      enabled: args.enabled,
    });
    return id;
  },
});
