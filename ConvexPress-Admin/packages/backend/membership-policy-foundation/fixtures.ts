/** Test-only registered callers: never deploy this fixture. */
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { internalQuery, internalMutation } from "../convex/_generated/server";
import { evaluateMembershipAccess } from "../convex/membership/access";
const rules = makeFunctionReference<"query">("membership/policyReads:rules");
const grants = makeFunctionReference<"query">("membership/policyReads:grants");
export const nested = internalQuery({
  args: { userId: v.id("users") }, returns: v.object({ own: v.number(), rules: v.number(), active: v.number(), grace: v.number() }),
  handler: async (ctx, args) => {
    const own = await ctx.db.query("membership_plans").paginate({ cursor: null, numItems: 1 });
    const ruleRows = await ctx.runQuery(rules, { resourceType: "route", resourceIdOrKey: "/member" });
    const active = await ctx.runQuery(grants, { userId: args.userId, status: "active" });
    const grace = await ctx.runQuery(grants, { userId: args.userId, status: "grace" });
    return { own: own.page.length, rules: ruleRows.length, active: active.length, grace: grace.length };
  },
});
export const pending = internalMutation({
  args: { userId: v.id("users"), planId: v.id("membership_plans") },
  returns: v.object({ before: v.number(), after: v.number(), grantsAfterRevoke: v.number(), allowedBefore: v.boolean(), allowedAfterRevoke: v.boolean() }),
  handler: async (ctx, args) => {
    const ruleId = await ctx.db.insert("membership_restriction_rules", { resourceType: "page", resourceIdOrKey: "pending", ruleMode: "allow_only", planIds: [args.planId], teaserMode: "hide", loginRequired: true, createdAt: 1, updatedAt: 1 });
    const grantId = await ctx.db.insert("membership_grants", { ...args, status: "active", sourceType: "manual", startsAt: 1, createdAt: 1, updatedAt: 1 });
    const before = await ctx.runQuery(rules, { resourceType: "page", resourceIdOrKey: "pending" });
    const current = await ctx.runQuery(grants, { userId: args.userId, status: "active" });
    if (!current.some((item: any) => item.planId === args.planId)) throw Error("Pending grant invisible");
    const allowedBefore = (await evaluateMembershipAccess(ctx, { resourceType: "page", resourceIdOrKey: "pending", userId: args.userId })).allowed;
    await ctx.db.patch("membership_grants", grantId, { status: "revoked" });
    const allowedAfterRevoke = (await evaluateMembershipAccess(ctx, { resourceType: "page", resourceIdOrKey: "pending", userId: args.userId })).allowed;
    await ctx.db.delete("membership_restriction_rules", ruleId);
    const after = await ctx.runQuery(rules, { resourceType: "page", resourceIdOrKey: "pending" });
    const afterGrants = await ctx.runQuery(grants, { userId: args.userId, status: "active" });
    return { before: before.length, after: after.length, grantsAfterRevoke: afterGrants.length, allowedBefore, allowedAfterRevoke };
  },
});

export const decision = internalQuery({
  args: { userId: v.id("users"), resourceIdOrKey: v.string() }, returns: v.boolean(),
  handler: async (ctx, args) => (await evaluateMembershipAccess(ctx, { ...args, resourceType: "route" })).allowed,
});
