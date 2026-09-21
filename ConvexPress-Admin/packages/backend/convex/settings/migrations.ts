import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { persistLegacyAppearance } from "./appearanceMigration";

/** Per-site, idempotent persistence of the compatibility projection. Source rows remain for rollback. */
export const migrateLegacyAppearance = mutation({
  args: {},
  returns: v.object({ migrated: v.boolean() }),
  handler: async (ctx) => {
    const user = await requireCan(ctx, "manage_options");
    return { migrated: await persistLegacyAppearance(ctx, user._id) };
  },
});
