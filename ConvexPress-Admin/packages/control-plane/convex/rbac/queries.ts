import { v } from "convex/values";

import { authenticatedQuery } from "./functions";
import { resolveStoredAccess, targetFromArgs } from "./runtime";

const selectorType = v.union(
  v.literal("route"),
  v.literal("capability"),
  v.literal("action"),
);

const decisionResult = v.object({
  allowed: v.boolean(),
  reason: v.union(
    v.literal("actor_inactive"),
    v.literal("explicit_deny"),
    v.literal("platform_administrator"),
    v.literal("explicit_allow"),
    v.literal("role_assignment"),
    v.literal("no_matching_grant"),
  ),
  winningRuleId: v.union(v.string(), v.null()),
  roleSlug: v.union(v.string(), v.null()),
});

export const checkMyAccess = authenticatedQuery({
  args: {
    selectorType,
    code: v.string(),
    organizationId: v.optional(v.string()),
    businessId: v.optional(v.string()),
    websiteId: v.optional(v.string()),
    instanceId: v.optional(v.string()),
  },
  returns: decisionResult,
  handler: async (ctx, args) => {
    const code = args.code.trim();
    if (!code || code.length > 240 || /[\u0000-\u001f\u007f]/u.test(code)) {
      throw new Error("Invalid access selector code");
    }
    return await resolveStoredAccess(ctx, ctx.operator, {
      selector: { type: args.selectorType, code },
      target: targetFromArgs(args),
    });
  },
});
