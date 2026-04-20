import { v } from "convex/values";

import { internalQuery } from "../../_generated/server";

/** Fetch a rule by id — used by the rate pipeline to resolve method.ruleId. */
export const getById = internalQuery({
  args: { ruleId: v.id("commerce_shipping_rules") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.ruleId);
  },
});
