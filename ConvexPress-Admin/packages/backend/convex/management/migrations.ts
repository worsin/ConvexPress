import { v } from "convex/values";
import { internalMutationGeneric as internalMutation } from "convex/server";

import type { ManagementMutationCtx } from "./model";

const looseV: any = v;
const defineInternalMutation: any = internalMutation;

/**
 * Removes only pre-JWT management sessions that cannot authenticate under the
 * current contract. Session rows are ephemeral and authority/audit rows remain
 * intact. Run during widen -> migrate -> tighten schema evolution.
 */
export const purgeLegacySessions = defineInternalMutation({
  args: { batchSize: looseV.optional(looseV.number()) },
  returns: looseV.object({
    deleted: looseV.number(),
    remaining: looseV.boolean(),
  }),
  handler: async (
    ctx: ManagementMutationCtx,
    args: { batchSize?: number },
  ) => {
    const batchSize = args.batchSize ?? 100;
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500) {
      throw new Error("Migration batch size is invalid");
    }
    const rows = await ctx.db
      .query("convexpress_managementSessions")
      .take(batchSize + 1);
    const legacy = rows
      .filter(
        (row: any) =>
          !row.userId ||
          !row.siteRoleSlug ||
          !Array.isArray(row.siteCapabilities),
      )
      .slice(0, batchSize);
    for (const row of legacy) await ctx.db.delete(row._id);
    return {
      deleted: legacy.length,
      remaining:
        rows.length > batchSize ||
        rows.some(
          (row: any) =>
            !row.userId ||
            !row.siteRoleSlug ||
            !Array.isArray(row.siteCapabilities),
        ) && legacy.length === batchSize,
    };
  },
});
