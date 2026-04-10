// @ts-nocheck
import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireCan } from "../helpers/permissions";

// ============================================
// SHARED HELPER — usable from mutations
// ============================================

/**
 * Calculate tax given an array of tax rules and an address + amount.
 * This is a pure function (no DB access) so it can be called from
 * both queries and mutations.
 */
export function calculateTaxFromRules(
  rules: Array<{
    _id: any;
    name: string;
    countryCode: string;
    stateCode?: string;
    postalCodePattern?: string;
    ratePercent: number;
    priority: number;
    isCompound: boolean;
    isActive: boolean;
  }>,
  address: {
    countryCode: string;
    state?: string;
    postalCode?: string;
  },
  amount: number,
) {
  // Filter to active rules that match the address
  const matchingRules: typeof rules = [];

  for (const rule of rules) {
    if (!rule.isActive) continue;
    if (rule.countryCode !== address.countryCode) continue;

    // If the rule specifies a state, it must match
    if (rule.stateCode && rule.stateCode !== address.state) continue;

    // If the rule specifies a postal code pattern, it must match
    if (rule.postalCodePattern && address.postalCode) {
      try {
        const regex = new RegExp(`^${rule.postalCodePattern}$`, "i");
        if (!regex.test(address.postalCode)) continue;
      } catch {
        // Invalid regex pattern — treat as literal match
        if (rule.postalCodePattern !== address.postalCode) continue;
      }
    } else if (rule.postalCodePattern && !address.postalCode) {
      continue;
    }

    matchingRules.push(rule);
  }

  if (matchingRules.length === 0) {
    return { taxAmount: 0, taxRate: 0, rules: [] };
  }

  // Sort by priority (lower number = higher priority)
  matchingRules.sort((a, b) => a.priority - b.priority);

  // Check if any matching rules are compound
  const hasCompound = matchingRules.some((r) => r.isCompound);

  if (hasCompound) {
    // Compound taxes: apply sequentially, each on the running total
    let runningAmount = amount;
    let totalTax = 0;

    for (const rule of matchingRules) {
      const ruleTax = Math.round(runningAmount * (rule.ratePercent / 100));
      totalTax += ruleTax;
      if (rule.isCompound) {
        runningAmount += ruleTax;
      }
    }

    const effectiveRate = amount > 0 ? totalTax / amount : 0;

    return {
      taxAmount: totalTax,
      taxRate: effectiveRate,
      rules: matchingRules.map((r) => ({
        _id: r._id,
        name: r.name,
        ratePercent: r.ratePercent,
        isCompound: r.isCompound,
      })),
    };
  }

  // Non-compound: use the highest-priority (lowest priority number) matching rule
  const bestRule = matchingRules[0];
  const taxAmount = Math.round(amount * (bestRule.ratePercent / 100));
  const taxRate = bestRule.ratePercent / 100;

  return {
    taxAmount,
    taxRate,
    rules: [
      {
        _id: bestRule._id,
        name: bestRule.name,
        ratePercent: bestRule.ratePercent,
        isCompound: bestRule.isCompound,
      },
    ],
  };
}

// ============================================
// QUERIES
// ============================================

/**
 * List all tax rules (admin)
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");

    const rules = await ctx.db.query("commerce_tax_rules").collect();
    return rules.sort((a, b) => a.priority - b.priority);
  },
});

/**
 * Calculate tax for a given address and amount
 */
export const calculate = query({
  args: {
    countryCode: v.string(),
    state: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const rules = await ctx.db
      .query("commerce_tax_rules")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    return calculateTaxFromRules(rules, args, args.amount);
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a tax rule
 */
export const create = mutation({
  args: {
    name: v.string(),
    countryCode: v.string(),
    stateCode: v.optional(v.string()),
    postalCodePattern: v.optional(v.string()),
    ratePercent: v.number(),
    priority: v.number(),
    isCompound: v.boolean(),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");

    const now = Date.now();
    return ctx.db.insert("commerce_tax_rules", {
      name: args.name,
      countryCode: args.countryCode,
      stateCode: args.stateCode,
      postalCodePattern: args.postalCodePattern,
      ratePercent: args.ratePercent,
      priority: args.priority,
      isCompound: args.isCompound,
      isActive: args.isActive,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update a tax rule
 */
export const update = mutation({
  args: {
    id: v.id("commerce_tax_rules"),
    name: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    stateCode: v.optional(v.string()),
    postalCodePattern: v.optional(v.string()),
    ratePercent: v.optional(v.number()),
    priority: v.optional(v.number()),
    isCompound: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");

    const rule = await ctx.db.get(args.id);
    if (!rule) {
      throw new Error("Tax rule not found");
    }

    const { id, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, val]) => val !== undefined),
    );

    await ctx.db.patch(args.id, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Delete a tax rule
 */
export const remove = mutation({
  args: {
    id: v.id("commerce_tax_rules"),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");

    const rule = await ctx.db.get(args.id);
    if (!rule) {
      throw new Error("Tax rule not found");
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});

/**
 * Toggle active status on a tax rule
 */
export const toggleActive = mutation({
  args: {
    id: v.id("commerce_tax_rules"),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");

    const rule = await ctx.db.get(args.id);
    if (!rule) {
      throw new Error("Tax rule not found");
    }

    await ctx.db.patch(args.id, {
      isActive: !rule.isActive,
      updatedAt: Date.now(),
    });

    return { success: true, isActive: !rule.isActive };
  },
});
