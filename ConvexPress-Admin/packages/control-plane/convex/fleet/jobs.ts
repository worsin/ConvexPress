import { start } from "@convex-dev/workflow";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery } from "../_generated/server";
import { createOperationRecord, setOperationWorkflowId } from "../operations/records";
import { event, incident, policyAccess } from "./policy";

import { connectionTargetRevision, healthEvidence, healthReportValidator } from "../connections/healthEvidence";

export const tick = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const policies = await ctx.db
      .query("overseer_fleetPolicies")
      .withIndex("by_due", (q) => q.eq("enabled", true).lte("nextRunAt", now))
      .take(40);
    for (const policy of policies) {
      await ctx.db.patch(policy._id, { nextRunAt: now + 60000 });
      await ctx.scheduler.runAfter(0, internal.fleet.jobs.dispatch, { policyId: policy._id });
    }
    return null;
  },
});
export const dispatch = internalMutation({
  args: { policyId: v.id("overseer_fleetPolicies") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const policy = await ctx.db.get(args.policyId);
    if (!policy?.enabled) return null;
    let target;
    try {
      target = await policyAccess(ctx, policy);
    } catch {
      await ctx.db.patch(policy._id, {
        enabled: false,
        pauseCode: "POLICY_AUTHORIZATION_LOST",
        healthLease: undefined,
        updatedAt: Date.now(),
      });
      await incident(ctx, policy, "authorization", "POLICY_AUTHORIZATION_LOST", true);
      return null;
    }
    const now = Date.now();
    if (policy.lastBackupOperationId) {
      const previous = await ctx.db.get(policy.lastBackupOperationId);
      if (previous && previous.revision !== policy.observedOperationRevision) {
        await ctx.db.patch(policy._id, {
          observedOperationRevision: previous.revision,
          ...(previous.state === "succeeded"
            ? { lastBackupSuccessAt: previous.completedAt ?? now }
            : {}),
        });
        if (["failed", "interrupted", "cancelled"].includes(previous.state))
          await incident(ctx, policy, "backup", "SCHEDULED_BACKUP_FAILED", true);
        if (previous.state === "succeeded")
          await incident(ctx, policy, "backup", "SCHEDULED_BACKUP_RECOVERED", false);
      }
      if (previous?.state === "queued" && !previous.workflowId)
        await ctx.scheduler.runAfter(0, internal.fleet.jobs.startBackup, {
          operationId: previous._id,
        });
    }
    if (policy.backupEnabled && policy.nextBackupAt <= now) {
      const busy = await ctx.db
        .query("overseer_siteOperations")
        .withIndex("by_instance_exclusive", (q) =>
          q.eq("instanceId", policy.instanceId).eq("exclusiveTargetLock", true),
        )
        .first();
      if (busy) {
        await ctx.db.patch(policy._id, { nextBackupAt: now + 300000 });
        await incident(ctx, policy, "backup_blocked", "SCHEDULED_BACKUP_TARGET_BUSY", true);
      } else {
        const created = await createOperationRecord(ctx, {
          operationCode: "site.backup.create",
          idempotencyKey: `scheduled:${policy._id}:${policy.revision}:${policy.nextBackupAt}`,
          websiteId: target.website._id,
          instanceId: policy.instanceId,
          requestedByUserId: policy.authorizedByUserId,
          provider: "manual",
          includeStorage: true,
        });
        await ctx.db.patch(created.operationId, { schedulePolicyId: policy._id });
        await ctx.db.patch(policy._id, {
          nextBackupAt: now + policy.backupIntervalHours * 3600000,
          lastBackupOperationId: created.operationId,
          observedOperationRevision: undefined,
        });
        await ctx.scheduler.runAfter(0, internal.fleet.jobs.startBackup, {
          operationId: created.operationId,
        });
        await incident(ctx, policy, "backup_blocked", "SCHEDULED_BACKUP_TARGET_READY", false);
        await event(ctx, policy, "backup", "SCHEDULED_BACKUP_QUEUED", {
          operationId: created.operationId,
        });
      }
    }
    if (
      policy.healthEnabled &&
      policy.nextHealthAt <= now &&
      (!policy.healthLease || !policy.healthLeaseExpiresAt || policy.healthLeaseExpiresAt <= now)
    ) {
      const lease = `health:${policy._id}:${policy.revision}:${now}`;
      await ctx.db.patch(policy._id, {
        healthLease: lease,
        healthLeaseExpiresAt: now + 120000,
        nextHealthAt: now + policy.healthIntervalMinutes * 60000,
      });
      await ctx.scheduler.runAfter(0, internal.fleet.health.probe, { policyId: policy._id, lease });
    }
    if (policy.retentionEnabled && policy.nextRetentionAt <= now) {
      await ctx.db.patch(policy._id, { nextRetentionAt: now + 60000 });
      await ctx.scheduler.runAfter(0, internal.fleet.retention.sweep, { policyId: policy._id });
    }
    return null;
  },
});
export const startBackup = internalMutation({
  args: { operationId: v.id("overseer_siteOperations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (!operation || operation.workflowId || operation.state !== "queued") return null;
    const policy = operation.schedulePolicyId ? await ctx.db.get(operation.schedulePolicyId) : null;
    if (!policy?.enabled || !policy.backupEnabled) {
      await ctx.runMutation(internal.operations.internal.finish, {
        operationId: operation._id,
        state: "cancelled",
        failureCode: "POLICY_DISABLED",
      });
      return null;
    }
    try {
      await policyAccess(ctx, policy);
    } catch {
      await ctx.runMutation(internal.operations.internal.finish, {
        operationId: operation._id,
        state: "cancelled",
        failureCode: "POLICY_AUTHORIZATION_LOST",
      });
      return null;
    }
    const workflowId = await start(
      ctx,
      internal.operations.workflows.backupWorkflow,
      { operationId: operation._id },
      {
        onComplete: internal.operations.internal.handleBackupComplete,
        context: { operationId: operation._id },
      },
    );
    await setOperationWorkflowId(ctx, { operationId: operation._id, workflowId });
    return null;
  },
});
export const healthTarget = internalQuery({
  args: { policyId: v.id("overseer_fleetPolicies"), lease: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      managementOrigin: v.string(),
      websiteKey: v.string(),
      instanceKey: v.string(),
      targetRevision: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const policy = await ctx.db.get(args.policyId);
    if (!policy?.enabled || !policy.healthEnabled || policy.healthLease !== args.lease) return null;
    try {
      const { instance, website } = await policyAccess(ctx, policy);
      return {
        managementOrigin: instance.managementOrigin,
        websiteKey: website.websiteKey,
        instanceKey: instance.instanceKey,
        targetRevision: connectionTargetRevision(instance, website.websiteKey),
      };
    } catch {
      return null;
    }
  },
});
export const healthResult = internalMutation({
  args: {
    policyId: v.id("overseer_fleetPolicies"),
    lease: v.string(),
    targetRevision: v.string(),
    report: v.optional(healthReportValidator),
    latencyMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const policy = await ctx.db.get(args.policyId);
    if (!policy?.enabled || !policy.healthEnabled || policy.healthLease !== args.lease) return null;
    let target;
    try {
      target = await policyAccess(ctx, policy);
    } catch {
      return null;
    }
    if (connectionTargetRevision(target.instance, target.website.websiteKey) !== args.targetRevision) return null;
    const now = Date.now();
    const evidence = args.report ? healthEvidence(args.report, { websiteKey: target.website.websiteKey, instanceKey: target.instance.instanceKey }, now) : null;
    const healthy = evidence?.health === "ok";
    await ctx.db.patch(policy._id, {
      healthLease: undefined,
      healthLeaseExpiresAt: undefined,
      lastHealthAt: now,
      lastHealthStatus: healthy ? "healthy" : evidence ? "degraded" : "unreachable",
    });
    await ctx.db.patch(target.instance._id, {
      ...(evidence ?? { health: "unreachable" as const, lastHealthAt: now, lastHealthError: "FLEET_HEALTH_FAILED" }),
      updatedAt: Math.max(now, target.instance.updatedAt + 1),
    });
    // Public site liveness does not prove controller credentials. Keep signed connection health separate.
    await incident(
      ctx,
      policy,
      "health",
      healthy ? "FLEET_HEALTH_RECOVERED" : "FLEET_HEALTH_FAILED",
      !healthy,
    );
    return null;
  },
});
