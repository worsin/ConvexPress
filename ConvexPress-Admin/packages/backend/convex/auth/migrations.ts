import { internalMutation } from "../_generated/server";
import { patchWithMediaReferences } from "../media/attachmentGuard";

import { v } from "convex/values";
/**
 * Backfill: Set authSource="local" on all existing users that have no authSource.
 * Run once after deploying the schema change.
 *
 * Call from Convex Dashboard: internal.auth.migrations.backfillAuthSource
 */
export const backfillAuthSource = internalMutation({
  args: {},
  returns: v.object({ updated: v.number(), total: v.number() }),
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    let updated = 0;

    for (const user of users) {
      if (!user.authSource) {
        await patchWithMediaReferences<"users">(ctx, "users", user._id, {
          authSource: "local",
          updatedAt: Date.now(),
        });
        updated++;
      }
    }

    return { updated, total: users.length };
  },
});
