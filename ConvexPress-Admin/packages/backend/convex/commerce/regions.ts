// @ts-nocheck
import { ConvexError, v } from "convex/values";

import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";

const regionArgs = {
  name: v.string(),
  currencyCode: v.string(),
  countryCodes: v.array(v.string()),
  automaticTaxes: v.boolean(),
  isDefault: v.optional(v.boolean()),
  metadata: v.optional(v.any()),
};

async function clearDefault(ctx: any, table: string, currentId?: any) {
  const current = await ctx.db
    .query(table)
    .withIndex("by_default", (q: any) => q.eq("isDefault", true))
    .collect();
  for (const record of current) {
    if (!currentId || record._id.toString() !== currentId.toString()) {
      await ctx.db.patch(record._id, { isDefault: false, updatedAt: Date.now() });
    }
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");
    return await ctx.db.query("commerce_regions").collect();
  },
});

export const create = mutation({
  args: regionArgs,
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    if (args.isDefault) await clearDefault(ctx, "commerce_regions");
    const now = Date.now();
    return await ctx.db.insert("commerce_regions", {
      ...args,
      currencyCode: args.currencyCode.toUpperCase(),
      countryCodes: args.countryCodes.map((code) => code.toUpperCase()),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { regionId: v.id("commerce_regions"), patch: v.object(regionArgs) },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const region = await ctx.db.get(args.regionId);
    if (!region) throw new ConvexError({ code: "NOT_FOUND", message: "Region not found." });
    if (args.patch.isDefault) await clearDefault(ctx, "commerce_regions", args.regionId);
    await ctx.db.patch(args.regionId, {
      ...args.patch,
      currencyCode: args.patch.currencyCode.toUpperCase(),
      countryCodes: args.patch.countryCodes.map((code) => code.toUpperCase()),
      updatedAt: Date.now(),
    });
    return args.regionId;
  },
});
