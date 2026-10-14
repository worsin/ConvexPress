import { ConvexError, v } from "convex/values";

import { mutation, query, type MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireCan } from "../helpers/permissions";
import { parseOptionalJsonObjectArgument } from "../helpers/jsonArgs";
import { patchDynamicWithMediaReferences } from "../media/attachmentGuard";


import { commerceDocs } from "../schema/commerce.docs.generated";
const regionArgs = {
  name: v.string(),
  currencyCode: v.string(),
  countryCodes: v.array(v.string()),
  automaticTaxes: v.boolean(),
  isDefault: v.optional(v.boolean()),
  /** Open-ended integrator metadata as a JSON object, JSON-encoded. */
  metadataJson: v.optional(v.string()),
};

async function clearDefault(ctx: Pick<MutationCtx, "db">, table: "commerce_regions", currentId?: Id<"commerce_regions">) {
  const current = await ctx.db
    .query(table)
    .withIndex("by_default", (q) => q.eq("isDefault", true))
    .collect();
  for (const record of current) {
    if (!currentId || record._id.toString() !== currentId.toString()) {
      await patchDynamicWithMediaReferences(ctx, record._id, { isDefault: false, updatedAt: Date.now() });
    }
  }
}

export const list = query({
  args: {},
  returns: v.array(commerceDocs.commerce_regions),
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");
    return await ctx.db.query("commerce_regions").collect();
  },
});

export const create = mutation({
  args: regionArgs,
  returns: v.id("commerce_regions"),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    if (args.isDefault) await clearDefault(ctx, "commerce_regions");
    const now = Date.now();
    const { metadataJson, ...region } = args;
    return await ctx.db.insert("commerce_regions", {
      ...region,
      metadata: parseOptionalJsonObjectArgument(metadataJson, "metadataJson"),
      currencyCode: args.currencyCode.toUpperCase(),
      countryCodes: args.countryCodes.map((code) => code.toUpperCase()),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { regionId: v.id("commerce_regions"), patch: v.object(regionArgs) },
  returns: v.id("commerce_regions"),
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const region = await ctx.db.get(args.regionId);
    if (!region) throw new ConvexError({ code: "NOT_FOUND", message: "Region not found." });
    if (args.patch.isDefault) await clearDefault(ctx, "commerce_regions", args.regionId);
    const { metadataJson, ...patch } = args.patch;
    await ctx.db.patch("commerce_regions", args.regionId, {
      ...patch,
      ...(metadataJson === undefined ? {} : { metadata: parseOptionalJsonObjectArgument(metadataJson, "patch.metadataJson") }),
      currencyCode: args.patch.currencyCode.toUpperCase(),
      countryCodes: args.patch.countryCodes.map((code) => code.toUpperCase()),
      updatedAt: Date.now(),
    });
    return args.regionId;
  },
});
