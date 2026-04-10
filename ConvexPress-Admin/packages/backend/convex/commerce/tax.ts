// @ts-nocheck
// ============================================
// TAX RULE MANAGEMENT — CRUD + seed defaults
// Works against commerce_tax_rules table from commerce schema
// ============================================

import { ConvexError, v } from "convex/values";

import { query, mutation } from "../_generated/server";
import { getCurrentUser, requireCan } from "../helpers/permissions";
import { requireCommerceEnabled } from "./helpers";

// ============================================
// QUERIES
// ============================================

/**
 * List all tax rules.
 */
export const list = query({
  args: {},
  handler: async (ctx: any) => {
    await requireCommerceEnabled(ctx);
    const rules = await ctx.db.query("commerce_tax_rules").collect();
    return rules.sort((a: any, b: any) => a.priority - b.priority);
  },
});

/**
 * Get a single tax rule.
 */
export const get = query({
  args: { ruleId: v.id("commerce_tax_rules") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    return ctx.db.get(args.ruleId);
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a tax rule.
 */
export const create = mutation({
  args: {
    name: v.string(),
    countryCode: v.string(),
    stateCode: v.optional(v.string()),
    postalCodePattern: v.optional(v.string()),
    ratePercent: v.number(),
    priority: v.optional(v.number()),
    isCompound: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const now = Date.now();
    return ctx.db.insert("commerce_tax_rules", {
      name: args.name,
      countryCode: args.countryCode.toUpperCase(),
      stateCode: args.stateCode,
      postalCodePattern: args.postalCodePattern,
      ratePercent: args.ratePercent,
      priority: args.priority ?? 10,
      isCompound: args.isCompound ?? false,
      isActive: args.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update a tax rule.
 */
export const update = mutation({
  args: {
    ruleId: v.id("commerce_tax_rules"),
    name: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    stateCode: v.optional(v.string()),
    postalCodePattern: v.optional(v.string()),
    ratePercent: v.optional(v.number()),
    priority: v.optional(v.number()),
    isCompound: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const rule = await ctx.db.get(args.ruleId);
    if (!rule) throw new ConvexError({ code: "not_found", message: "Tax rule not found" });

    const { ruleId, ...updates } = args;
    const patch: any = { updatedAt: Date.now() };

    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.countryCode !== undefined) patch.countryCode = updates.countryCode.toUpperCase();
    if (updates.stateCode !== undefined) patch.stateCode = updates.stateCode;
    if (updates.postalCodePattern !== undefined) patch.postalCodePattern = updates.postalCodePattern;
    if (updates.ratePercent !== undefined) patch.ratePercent = updates.ratePercent;
    if (updates.priority !== undefined) patch.priority = updates.priority;
    if (updates.isCompound !== undefined) patch.isCompound = updates.isCompound;
    if (updates.isActive !== undefined) patch.isActive = updates.isActive;

    await ctx.db.patch(args.ruleId, patch);
    return args.ruleId;
  },
});

/**
 * Toggle a tax rule active/inactive.
 */
export const toggleActive = mutation({
  args: { ruleId: v.id("commerce_tax_rules") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const rule = await ctx.db.get(args.ruleId);
    if (!rule) throw new ConvexError({ code: "not_found", message: "Tax rule not found" });

    await ctx.db.patch(args.ruleId, {
      isActive: !rule.isActive,
      updatedAt: Date.now(),
    });

    return { isActive: !rule.isActive };
  },
});

/**
 * Delete a tax rule.
 */
export const remove = mutation({
  args: { ruleId: v.id("commerce_tax_rules") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    const rule = await ctx.db.get(args.ruleId);
    if (!rule) throw new ConvexError({ code: "not_found", message: "Tax rule not found" });

    await ctx.db.delete(args.ruleId);
    return { success: true };
  },
});

/**
 * Seed default US tax rules.
 */
export const seedDefaultTaxRules = mutation({
  args: {},
  handler: async (ctx: any) => {
    await requireCommerceEnabled(ctx);
    await requireCan(ctx, "manage_options");

    // Check if rules already exist
    const existing = await ctx.db.query("commerce_tax_rules").collect();
    if (existing.length > 0) {
      throw new ConvexError({
        code: "already_seeded",
        message: `${existing.length} tax rules already exist. Delete them first to re-seed.`,
      });
    }

    const now = Date.now();

    const defaults = [
      { name: "US - California", countryCode: "US", stateCode: "CA", ratePercent: 7.25, priority: 10 },
      { name: "US - New York", countryCode: "US", stateCode: "NY", ratePercent: 8.0, priority: 10 },
      { name: "US - Texas", countryCode: "US", stateCode: "TX", ratePercent: 6.25, priority: 10 },
      { name: "US - Florida", countryCode: "US", stateCode: "FL", ratePercent: 6.0, priority: 10 },
      { name: "US - Washington", countryCode: "US", stateCode: "WA", ratePercent: 6.5, priority: 10 },
      { name: "US - Illinois", countryCode: "US", stateCode: "IL", ratePercent: 6.25, priority: 10 },
      { name: "US - Pennsylvania", countryCode: "US", stateCode: "PA", ratePercent: 6.0, priority: 10 },
      { name: "US - Ohio", countryCode: "US", stateCode: "OH", ratePercent: 5.75, priority: 10 },
      { name: "US - Georgia", countryCode: "US", stateCode: "GA", ratePercent: 4.0, priority: 10 },
      { name: "US - North Carolina", countryCode: "US", stateCode: "NC", ratePercent: 4.75, priority: 10 },
      { name: "CA - Standard GST", countryCode: "CA", ratePercent: 5.0, priority: 10 },
      { name: "CA - Ontario HST", countryCode: "CA", stateCode: "ON", ratePercent: 13.0, priority: 5 },
      { name: "CA - British Columbia", countryCode: "CA", stateCode: "BC", ratePercent: 12.0, priority: 5 },
      { name: "GB - Standard VAT", countryCode: "GB", ratePercent: 20.0, priority: 10 },
      { name: "DE - Standard VAT", countryCode: "DE", ratePercent: 19.0, priority: 10 },
      { name: "AU - GST", countryCode: "AU", ratePercent: 10.0, priority: 10 },
    ];

    let created = 0;
    for (const rule of defaults) {
      await ctx.db.insert("commerce_tax_rules", {
        name: rule.name,
        countryCode: rule.countryCode,
        stateCode: rule.stateCode,
        ratePercent: rule.ratePercent,
        priority: rule.priority,
        isCompound: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    return { created };
  },
});
