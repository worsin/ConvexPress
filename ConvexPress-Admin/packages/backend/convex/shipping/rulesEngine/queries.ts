import { v } from "convex/values";

import { query } from "../../_generated/server";
import { requireCan } from "../../helpers/permissions";
import { validateRuleAST } from "./validator";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "shipping.rules.read");
    return ctx.db.query("commerce_shipping_rules").collect();
  },
});

export const get = query({
  args: { ruleId: v.id("commerce_shipping_rules") },
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.rules.read");
    return ctx.db.get(args.ruleId);
  },
});

export const validateAST = query({
  args: { ruleAST: v.any() },
  handler: async (ctx, args) => {
    await requireCan(ctx, "shipping.rules.read");
    return validateRuleAST(args.ruleAST);
  },
});
