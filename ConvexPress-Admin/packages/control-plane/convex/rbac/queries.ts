import { v } from "convex/values";

import { authenticatedQuery } from "./functions";
import { createStoredAccessResolver, resolveStoredAccess, targetFromArgs } from "./runtime";

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

const accessCheck = v.object({
  selectorType,
  code: v.string(),
  organizationId: v.optional(v.string()),
  businessId: v.optional(v.string()),
  websiteId: v.optional(v.string()),
  instanceId: v.optional(v.string()),
});

/**
 * Resolve several access decisions in one subscription. Every screen that
 * needs a handful of capability checks should use this instead of one
 * `checkMyAccess` per capability: self-hosted and starter-plan backends cap
 * concurrent query executions (8 on the test fleet), and a burst of small
 * queries on reconnect trips that cap and keeps the socket cycling.
 */
export const checkManyAccess = authenticatedQuery({
  args: { checks: v.array(accessCheck) },
  returns: v.array(decisionResult),
  handler: async (ctx, args) => {
    if (args.checks.length > 32) {
      throw new Error("At most 32 access checks can be resolved at once");
    }
    const results = [];
    const resolveAccess = createStoredAccessResolver(ctx, ctx.operator);
    for (const check of args.checks) {
      const code = check.code.trim();
      if (!code || code.length > 240 || /[\u0000-\u001f\u007f]/u.test(code)) {
        throw new Error("Invalid access selector code");
      }
      results.push(
        await resolveAccess({
          selector: { type: check.selectorType, code },
          target: targetFromArgs(check),
        }),
      );
    }
    return results;
  },
});
