import { v } from "convex/values";
import { authenticatedMutation } from "../rbac/functions";
import { targetAccess, validateSettings, event, incident } from "./policy";
export const save = authenticatedMutation({
  args: {
    instanceId: v.id("overseer_websiteInstances"),
    expectedRevision: v.number(),
    backupEnabled: v.boolean(),
    backupIntervalHours: v.number(),
    healthEnabled: v.boolean(),
    healthIntervalMinutes: v.number(),
    retentionEnabled: v.boolean(),
    retentionDays: v.number(),
    keepBackups: v.number(),
  },
  returns: v.object({ policyId: v.id("overseer_fleetPolicies"), revision: v.number() }),
  handler: async (ctx, args) => {
    validateSettings(args);
    // Editing or disabling a policy requires the same management permissions as enabling it.
    const { website } = await targetAccess(
      ctx,
      ctx.operator,
      args.instanceId,
      "site.backup.create",
      true,
    );
    await targetAccess(ctx, ctx.operator, args.instanceId, "connection.manage", true);
    const existing = await ctx.db
      .query("overseer_fleetPolicies")
      .withIndex("by_instance", (q) => q.eq("instanceId", args.instanceId))
      .unique();
    if ((existing?.revision ?? 0) !== args.expectedRevision)
      throw Error("Policy changed; reload before saving");
    const now = Date.now();
    const { expectedRevision, ...settings } = args;
    const values = {
      ...settings,
      websiteId: website._id,
      authorizedByUserId: ctx.operator._id,
      enabled: args.backupEnabled || args.healthEnabled || args.retentionEnabled,
      revision: expectedRevision + 1,
      nextRunAt: now,
      nextBackupAt: now + args.backupIntervalHours * 3600000,
      nextHealthAt: now,
      nextRetentionAt: now + 86400000,
      healthLease: undefined,
      healthLeaseExpiresAt: undefined,
      retentionCursor: undefined,
      pauseCode: undefined,
      updatedAt: now,
    };
    const policyId = existing
      ? existing._id
      : await ctx.db.insert("overseer_fleetPolicies", { ...values, createdAt: now });
    if (existing) await ctx.db.patch(policyId, values);
    const policy = (await ctx.db.get(policyId))!;
    await incident(ctx, policy, "authorization", "POLICY_AUTHORIZED", false);
    await event(ctx, policy, "policy", "POLICY_SAVED");
    return { policyId, revision: values.revision };
  },
});
export const remove = authenticatedMutation({
  args: { policyId: v.id("overseer_fleetPolicies"), expectedRevision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const policy = await ctx.db.get(args.policyId);
    if (!policy) throw Error("Policy not found");
    await targetAccess(ctx, ctx.operator, policy.instanceId, "site.backup.create", true);
    await targetAccess(ctx, ctx.operator, policy.instanceId, "connection.manage", true);
    if (policy.revision !== args.expectedRevision)
      throw Error("Policy changed; reload before removing");
    // Retain policy provenance and receipts; removal disables its scheduled work.
    await ctx.db.patch(policy._id, {
      enabled: false,
      backupEnabled: false,
      healthEnabled: false,
      retentionEnabled: false,
      healthLease: undefined,
      revision: policy.revision + 1,
      updatedAt: Date.now(),
    });
    await event(ctx, policy, "policy", "POLICY_REMOVED");
    return null;
  },
});
export const acknowledge = authenticatedMutation({
  args: { incidentId: v.id("overseer_fleetIncidents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db.get(args.incidentId);
    if (!current) throw Error("Incident not found");
    await targetAccess(ctx, ctx.operator, current.instanceId, "connection.manage", true);
    await ctx.db.patch(current._id, { acknowledgedBy: ctx.operator._id, updatedAt: Date.now() });
    return null;
  },
});
