/**
 * PRDs B1-B9 — CRUD mutations for every method type.
 *
 * Each method type has its own table (`commerce_shipping_method_*`). The
 * mutations share a uniform shape: create, update, remove, plus toggleEnabled.
 * Method config and patch shapes come from the schema definition (see
 * configValidators.ts); business rules are checked by validateMethodConfig.
 */

import { ConvexError, v } from "convex/values";

import { mutation, type MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireCan } from "../../helpers/permissions";
import { emitEvent } from "../../helpers/events";
import { SHIPPING_EVENTS } from "../../events/constants";
import { insertDynamicWithMediaReferences, patchDynamicWithMediaReferences, deleteDynamicWithMediaReferences } from "../../media/attachmentGuard";
import { listMethodRowsForZone, methodTableFor, normalizeMethodId, type MethodTable, type MethodType } from "./tables";
import { anyMethodConfigValidator, anyMethodPatchValidator, requireMethodConfig, requireMethodPatch } from "./configValidators";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Ids from another table never address a method of this type. */
function requireMethodId(ctx: Pick<MutationCtx, "db">, methodType: MethodType, methodId: string): Id<MethodTable> {
  const id = normalizeMethodId(ctx, methodType, methodId);
  if (!id) throw new ConvexError({ code: "NOT_FOUND", message: "Method not found." });
  return id;
}

/**
 * PRD B1-B9 — shared business validation for method config payloads.
 * Schema validators catch shape; this catches semantics (tier gaps, currency,
 * duplicate names within a zone, referenced-rule existence).
 */
async function validateMethodConfig(
  ctx: Pick<MutationCtx, "db">,
  methodType: MethodType,
  config: Record<string, unknown>,
  existingId?: Id<MethodTable>,
): Promise<void> {
  // Common required fields.
  const zoneId = typeof config.zoneId === "string" ? ctx.db.normalizeId("commerce_shipping_zones", config.zoneId) : null;
  if (!zoneId) throw new ConvexError({ code: "VALIDATION_ERROR", message: "zoneId is required." });
  if (!config.name || !String(config.name).trim())
    throw new ConvexError({ code: "VALIDATION_ERROR", message: "name is required." });
  if (!config.label || !String(config.label).trim())
    throw new ConvexError({ code: "VALIDATION_ERROR", message: "label is required." });

  // Duplicate name within the same zone + method type.
  const siblings = await listMethodRowsForZone(ctx, methodType, zoneId);
  const dup = siblings.find(
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
    const ruleId = typeof config.ruleId === "string" ? ctx.db.normalizeId("commerce_shipping_rules", config.ruleId) : null;
    const rule = ruleId ? await ctx.db.get(ruleId) : null;
    if (!rule)
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Referenced shipping rule no longer exists.",
      });
  }

  // Tier-based types: gap + overlap detection.
  if (["weight_based", "dimensional", "price_based", "quantity_based"].includes(methodType)) {
    const rawTiers: unknown[] = Array.isArray(config.tiers) ? config.tiers : [];
    const tiers: Record<string, unknown>[] = rawTiers.map((tier) => (isRecord(tier) ? tier : {}));
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
    config: anyMethodConfigValidator,
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.methods.manage");
    const table = methodTableFor(args.methodType);
    const config = requireMethodConfig(args.methodType, args.config);
    await validateMethodConfig(ctx, args.methodType, config);
    const now = Date.now();
    // PRD B1 §4 — audit stamps on flat rate. Other method types take them too
    // when present; the schema makes these fields optional so it's harmless.
    const auditStamps =
      args.methodType === "flat_rate" && user?._id
        ? { createdBy: user._id, updatedBy: user._id }
        : {};
    const id = await insertDynamicWithMediaReferences(ctx, table, {
      ...config,
      ...auditStamps,
      enabled: config.enabled ?? true,
      sortOrder: config.sortOrder ?? 100,
      createdAt: now,
      updatedAt: now,
    });
    await emitEvent(ctx, SHIPPING_EVENTS.METHOD_CREATED, "shipping", {
      methodId: id,
      methodType: args.methodType,
      zoneId: config.zoneId,
    });
    return id;
  },
});

export const updateMethod = mutation({
  args: {
    methodType: methodTypeValidator,
    methodId: v.string(),
    patch: anyMethodPatchValidator,
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.methods.manage");
    const id = requireMethodId(ctx, args.methodType, args.methodId);
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Method not found." });
    }
    const patch: Record<string, unknown> = { ...requireMethodPatch(args.methodType, args.patch) };
    // Audit stamps are the server's: the editor sends a loaded row back with them, but they are never written from a patch.
    delete patch.createdBy;
    delete patch.updatedBy;
    // Validate merged config against business rules.
    const merged: Record<string, unknown> = { ...existing, ...patch };
    await validateMethodConfig(ctx, args.methodType, merged, id);
    const auditStamp =
      args.methodType === "flat_rate" && user?._id ? { updatedBy: user._id } : {};
    await patchDynamicWithMediaReferences(ctx, id, { ...patch, ...auditStamp, updatedAt: Date.now() });
    await emitEvent(ctx, SHIPPING_EVENTS.METHOD_UPDATED, "shipping", {
      methodId: id,
      methodType: args.methodType,
    });
    const methodId: string = id;
    return methodId;
  },
});

export const deleteMethod = mutation({
  args: {
    methodType: methodTypeValidator,
    methodId: v.string(),
  },
  returns: v.object({ deleted: v.boolean() }),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.methods.manage");
    const id = requireMethodId(ctx, args.methodType, args.methodId);
    await deleteDynamicWithMediaReferences(ctx, id);
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
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.methods.manage");
    const id = requireMethodId(ctx, args.methodType, args.methodId);
    await patchDynamicWithMediaReferences(ctx, id, { enabled: args.enabled, updatedAt: Date.now() });
    await emitEvent(ctx, SHIPPING_EVENTS.METHOD_UPDATED, "shipping", {
      methodId: id,
      methodType: args.methodType,
      enabled: args.enabled,
    });
    const methodId: string = id;
    return methodId;
  },
});
