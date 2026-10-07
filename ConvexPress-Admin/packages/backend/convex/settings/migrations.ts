import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { persistLegacyAppearance } from "./appearanceMigration";

/** Per-site, idempotent persistence of the compatibility projection. Retained settings sections remain unchanged. */
export const migrateLegacyAppearance = mutation({
  args: {},
  returns: v.object({ migrated: v.boolean() }),
  handler: async (ctx) => {
    const user = await requireCan(ctx, "manage_options");
    return { migrated: await persistLegacyAppearance(ctx, user._id) };
  },
});

/** Operator-only recovery/export. Archives are not active template settings. */
export const listArchivedAppearance = query({
  args: { table: v.union(v.literal("themes"), v.literal("layouts")), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ page: v.array(v.any()), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, { table, cursor }) => {
    await requireCan(ctx, "manage_options");
    const result = await ctx.db.query("legacyAppearanceArchives").withIndex("by_source", q => q.eq("sourceTable", table)).paginate({ cursor, numItems: 4 });
    return { page: result.page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});
