import { ConvexError } from "convex/values";

import { mutation } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";
import { emitEvent } from "../../helpers/events";
import { SHIPPING_EVENTS } from "../../events/constants";
import { slugifyZoneName, validatePostcodeRule } from "../helpers/zoneMatching";
import {
  createZoneArgs,
  deleteZoneArgs,
  reorderZonesArgs,
  setFallbackZoneArgs,
  toggleZoneEnabledArgs,
  updateZoneArgs,
} from "./validators";

const FALLBACK_SORT_ORDER = Number.MAX_SAFE_INTEGER;
const DEFAULT_SORT_STEP = 10;

async function ensureUniqueSlug(ctx: any, desired: string, ignoreId?: any): Promise<string> {
  let candidate = desired || "zone";
  let suffix = 1;
  while (true) {
    const existing = await ctx.db
      .query("commerce_shipping_zones")
      .withIndex("by_slug", (q: any) => q.eq("slug", candidate))
      .unique();
    if (!existing || (ignoreId && existing._id === ignoreId)) return candidate;
    suffix += 1;
    candidate = `${desired}-${suffix}`;
  }
}

function validateZonePayload(input: {
  countries: string[];
  states?: string[];
  postalCodeRules?: string[];
  isFallback?: boolean;
}) {
  // State codes not permitted across multiple countries (WooCommerce quirk).
  if ((input.states?.length ?? 0) > 0 && input.countries.length > 1) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "State codes cannot be specified when a zone covers multiple countries.",
    });
  }

  // Country codes: ISO 3166-1 alpha-2 strict.
  for (const code of input.countries) {
    if (!/^[A-Z]{2}$/.test(code)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Invalid country code: ${code}. Expected ISO 3166-1 alpha-2 (e.g. "US").`,
      });
    }
  }

  // State codes: 1–3 uppercase letters/digits.
  for (const state of input.states ?? []) {
    if (!/^[A-Z0-9]{1,3}$/.test(state)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Invalid state code: ${state}. Expected 1–3 uppercase letters/digits without country prefix.`,
      });
    }
  }

  // Postcode rules per grammar.
  for (const rule of input.postalCodeRules ?? []) {
    const reason = validatePostcodeRule(rule);
    if (reason) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Invalid postcode rule "${rule}": ${reason}`,
      });
    }
  }

  // Fallback zones must have empty countries (they match anything not claimed).
  if (input.isFallback && input.countries.length > 0) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Fallback zone must not specify countries.",
    });
  }
}

async function getNextSortOrder(ctx: any): Promise<number> {
  const last = await ctx.db
    .query("commerce_shipping_zones")
    .withIndex("by_sort")
    .order("desc")
    .first();
  if (!last) return DEFAULT_SORT_STEP;
  const lastOrder = Number(last.sortOrder);
  // Skip the fallback sentinel; fallback sits at MAX_SAFE_INTEGER.
  if (lastOrder >= FALLBACK_SORT_ORDER) {
    // Pull the next-highest non-fallback zone instead.
    const zones = await ctx.db
      .query("commerce_shipping_zones")
      .withIndex("by_sort")
      .collect();
    const nonFallback = zones.filter((z: any) => z.sortOrder < FALLBACK_SORT_ORDER);
    if (nonFallback.length === 0) return DEFAULT_SORT_STEP;
    return nonFallback[nonFallback.length - 1]!.sortOrder + DEFAULT_SORT_STEP;
  }
  return lastOrder + DEFAULT_SORT_STEP;
}

export const createZone = mutation({
  args: createZoneArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.zones.manage");

    const isFallback = args.isFallback ?? false;
    validateZonePayload({
      countries: args.countries,
      states: args.states,
      postalCodeRules: args.postalCodeRules,
      isFallback,
    });

    // Only one fallback zone allowed per store.
    if (isFallback) {
      const existing = await ctx.db
        .query("commerce_shipping_zones")
        .withIndex("by_fallback", (q: any) => q.eq("isFallback", true))
        .unique();
      if (existing) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "A fallback zone already exists. Use setFallbackZone to reassign it.",
        });
      }
    }

    const slugBase = args.slug?.trim() || slugifyZoneName(args.name);
    const slug = await ensureUniqueSlug(ctx, slugBase);
    const sortOrder = isFallback
      ? FALLBACK_SORT_ORDER
      : (args.sortOrder ?? (await getNextSortOrder(ctx)));

    const now = Date.now();
    const zoneId = await ctx.db.insert("commerce_shipping_zones", {
      name: args.name,
      slug,
      description: args.description,
      countries: args.countries,
      states: args.states ?? [],
      postalCodeRules: args.postalCodeRules ?? [],
      enabled: args.enabled ?? true,
      isFallback,
      sortOrder,
      createdAt: now,
      createdBy: user?._id,
      updatedAt: now,
      updatedBy: user?._id,
    });

    await emitEvent(ctx, SHIPPING_EVENTS.ZONE_CREATED, "shipping", {
      zoneId,
      name: args.name,
      slug,
      isFallback,
    });

    return zoneId;
  },
});

export const updateZone = mutation({
  args: updateZoneArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.zones.manage");
    const zone = await ctx.db.get(args.zoneId);
    if (!zone) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Zone not found." });
    }

    const merged = {
      countries: args.patch.countries ?? zone.countries,
      states: args.patch.states ?? zone.states,
      postalCodeRules: args.patch.postalCodeRules ?? zone.postalCodeRules,
      isFallback: zone.isFallback,
    };
    validateZonePayload(merged);

    const patch: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: user?._id };
    if (args.patch.name !== undefined) patch.name = args.patch.name;
    if (args.patch.description !== undefined) patch.description = args.patch.description;
    if (args.patch.countries !== undefined) patch.countries = args.patch.countries;
    if (args.patch.states !== undefined) patch.states = args.patch.states;
    if (args.patch.postalCodeRules !== undefined) patch.postalCodeRules = args.patch.postalCodeRules;
    if (args.patch.enabled !== undefined) patch.enabled = args.patch.enabled;
    if (args.patch.sortOrder !== undefined && !zone.isFallback) {
      patch.sortOrder = args.patch.sortOrder;
    }

    if (args.patch.slug !== undefined) {
      const normalized = args.patch.slug.trim() || slugifyZoneName(args.patch.name ?? zone.name);
      patch.slug = await ensureUniqueSlug(ctx, normalized, args.zoneId);
    }

    await ctx.db.patch(args.zoneId, patch);

    await emitEvent(ctx, SHIPPING_EVENTS.ZONE_UPDATED, "shipping", {
      zoneId: args.zoneId,
      patchKeys: Object.keys(args.patch),
    });

    return args.zoneId;
  },
});

export const deleteZone = mutation({
  args: deleteZoneArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.zones.manage");
    const zone = await ctx.db.get(args.zoneId);
    if (!zone) {
      return { deleted: false, cascadedMethodCount: 0 };
    }

    // If this is the fallback and other zones exist, unset fallback first.
    if (zone.isFallback) {
      const otherZones = await ctx.db.query("commerce_shipping_zones").collect();
      const others = otherZones.filter((z: any) => z._id !== args.zoneId);
      if (others.length > 0) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Cannot delete the fallback zone while other zones exist. Unset fallback first.",
        });
      }
    }

    // Cascade: delete zone_methods AND every B1-B9 method-type row
    // attached to this zone. Leaving orphaned method configs creates
    // ghosts the rate pipeline would still pick up via
    // listEnabledMethodsForZone.
    const methodTables = [
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
    let cascadedMethodCount = 0;
    for (const table of methodTables) {
      const rows = await ctx.db
        .query(table as any)
        .withIndex("by_zone", (q: any) => q.eq("zoneId", args.zoneId))
        .collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
        cascadedMethodCount++;
      }
    }
    const zmRows = await ctx.db
      .query("commerce_shipping_zone_methods")
      .withIndex("by_zone", (q: any) => q.eq("zoneId", args.zoneId))
      .collect();
    for (const zm of zmRows) {
      await ctx.db.delete(zm._id);
      cascadedMethodCount++;
    }

    await ctx.db.delete(args.zoneId);

    await emitEvent(ctx, SHIPPING_EVENTS.ZONE_DELETED, "shipping", {
      zoneId: args.zoneId,
      cascadedMethodCount,
    });

    return { deleted: true, cascadedMethodCount };
  },
});

export const reorderZones = mutation({
  args: reorderZonesArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.zones.manage");
    const now = Date.now();
    let updated = 0;
    for (let i = 0; i < args.orderedIds.length; i++) {
      const zoneId = args.orderedIds[i]!;
      const zone = await ctx.db.get(zoneId);
      if (!zone || zone.isFallback) continue;
      await ctx.db.patch(zoneId, {
        sortOrder: (i + 1) * DEFAULT_SORT_STEP,
        updatedAt: now,
        updatedBy: user?._id,
      });
      updated += 1;
    }

    await emitEvent(ctx, SHIPPING_EVENTS.ZONE_REORDERED, "shipping", {
      orderedIds: args.orderedIds,
      updated,
    });

    return { updated };
  },
});

export const setFallbackZone = mutation({
  args: setFallbackZoneArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.zones.manage");
    const existing = await ctx.db
      .query("commerce_shipping_zones")
      .withIndex("by_fallback", (q: any) => q.eq("isFallback", true))
      .unique();

    const previousFallbackId = existing?._id ?? null;
    const now = Date.now();

    if (existing && (!args.zoneId || existing._id !== args.zoneId)) {
      // Demote prior fallback. Assign it a normal sort order.
      const nextOrder = await getNextSortOrder(ctx);
      await ctx.db.patch(existing._id, {
        isFallback: false,
        sortOrder: nextOrder,
        updatedAt: now,
        updatedBy: user?._id,
      });
    }

    if (args.zoneId) {
      const target = await ctx.db.get(args.zoneId);
      if (!target) {
        throw new ConvexError({ code: "NOT_FOUND", message: "Target zone not found." });
      }
      // Fallback zones should not carry country/state/postcode restrictions.
      // Warn via clearing these to empty on promotion (merchant is notified in UI).
      await ctx.db.patch(args.zoneId, {
        isFallback: true,
        sortOrder: FALLBACK_SORT_ORDER,
        countries: [],
        states: [],
        postalCodeRules: [],
        updatedAt: now,
        updatedBy: user?._id,
      });
    }

    return {
      previousFallbackId,
      currentFallbackId: args.zoneId ?? null,
    };
  },
});

export const toggleZoneEnabled = mutation({
  args: toggleZoneEnabledArgs,
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "shipping.zones.manage");
    const zone = await ctx.db.get(args.zoneId);
    if (!zone) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Zone not found." });
    }
    await ctx.db.patch(args.zoneId, {
      enabled: args.enabled,
      updatedAt: Date.now(),
      updatedBy: user?._id,
    });
    return args.zoneId;
  },
});
