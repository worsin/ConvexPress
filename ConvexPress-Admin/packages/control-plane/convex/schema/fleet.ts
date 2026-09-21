import { defineTable } from "convex/server";
import { v } from "convex/values";
export const fleetTables = {
  overseer_fleetPolicies: defineTable({
    instanceId: v.id("overseer_websiteInstances"),
    websiteId: v.id("overseer_websites"),
    authorizedByUserId: v.id("overseer_users"),
    enabled: v.boolean(),
    backupEnabled: v.boolean(),
    backupIntervalHours: v.number(),
    healthEnabled: v.boolean(),
    healthIntervalMinutes: v.number(),
    retentionEnabled: v.boolean(),
    retentionDays: v.number(),
    keepBackups: v.number(),
    revision: v.number(),
    nextRunAt: v.number(),
    nextBackupAt: v.number(),
    nextHealthAt: v.number(),
    nextRetentionAt: v.number(),
    retentionCursor: v.optional(v.string()),
    healthLease: v.optional(v.string()),
    healthLeaseExpiresAt: v.optional(v.number()),
    lastBackupOperationId: v.optional(v.id("overseer_siteOperations")),
    observedOperationRevision: v.optional(v.number()),
    lastBackupSuccessAt: v.optional(v.number()),
    lastHealthAt: v.optional(v.number()),
    lastHealthStatus: v.optional(v.string()),
    pauseCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_instance", ["instanceId"])
    .index("by_due", ["enabled", "nextRunAt"]),
  overseer_fleetIncidents: defineTable({
    policyId: v.id("overseer_fleetPolicies"),
    instanceId: v.id("overseer_websiteInstances"),
    kind: v.string(),
    open: v.boolean(),
    code: v.string(),
    occurrences: v.number(),
    acknowledgedBy: v.optional(v.id("overseer_users")),
    openedAt: v.number(),
    updatedAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_policy_kind", ["policyId", "kind"])
    .index("by_instance_open", ["instanceId", "open"]),
  overseer_fleetEvents: defineTable({
    policyId: v.id("overseer_fleetPolicies"),
    instanceId: v.id("overseer_websiteInstances"),
    kind: v.string(),
    code: v.string(),
    operationId: v.optional(v.id("overseer_siteOperations")),
    snapshotId: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_instance_created", ["instanceId", "createdAt"]),
};
