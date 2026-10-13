import { v } from "convex/values";

import { query } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";
import { validateRuleAST } from "./validator";

import { tableDocs } from "../../schema/tableDocs.generated";
export const list = query({
  args: {},
  returns: v.array(tableDocs.commerce_shipping_rules),
  handler: async (ctx) => {
    await requireCan(ctx, "shipping.rules.read");
    return ctx.db.query("commerce_shipping_rules").collect();
  },
});

export const get = query({
  args: { ruleId: v.id("commerce_shipping_rules") },
  returns: v.union(v.null(), tableDocs.commerce_shipping_rules),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.rules.read");
    return ctx.db.get(args.ruleId);
  },
});

export const validateAST = query({
  args: { ruleAST: v.any() },
  returns: v.array(v.object({ path: v.string(), message: v.string() })),
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.rules.read");
    return validateRuleAST(args.ruleAST);
  },
});
