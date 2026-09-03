import { defineTable } from "convex/server";
import { v } from "convex/values";

export const operationCode = v.union(
  v.literal("site.health.check"),
  v.literal("site.compatibility.check"),
  v.literal("site.register"),
  v.literal("site.attach"),
  v.literal("site.engine.deploy"),
  v.literal("site.select"),
  v.literal("site.session.exchange"),
  v.literal("site.backup.create"),
  v.literal("site.clone"),
  v.literal("site.promote"),
  v.literal("site.restore"),
  v.literal("site.credential.rotate"),
  v.literal("site.authority.grant"),
  v.literal("site.authority.revoke"),
  v.literal("site.operation.resume"),
  v.literal("site.handoff.export"),
);

export const operationState = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("waiting"),
  v.literal("interrupted"),
  v.literal("resuming"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelled"),
);

const environmentKind = v.union(
  v.literal("live"),
  v.literal("staging"),
  v.literal("beta"),
  v.literal("preview"),
  v.literal("development"),
  v.literal("local"),
  v.literal("custom"),
);

export const lifecycleTables = {
  overseer_siteOperations: defineTable({
    operationKey: v.string(),
    idempotencyKey: v.string(),
    operationCode,
    websiteId: v.id("overseer_websites"),
    instanceId: v.id("overseer_websiteInstances"),
    websiteKey: v.string(),
    instanceKey: v.string(),
    sourceInstanceId: v.optional(v.id("overseer_websiteInstances")),
    sourceInstanceKey: v.optional(v.string()),
    requestedByUserId: v.id("overseer_users"),
    provider: v.union(v.literal("manual"), v.literal("magicdb")),
    state: operationState,
    currentStep: v.optional(v.string()),
    liveTarget: v.boolean(),
    expectedRevision: v.optional(v.number()),
    revision: v.number(),
    preBackupId: v.optional(v.id("overseer_siteBackups")),
    preBackupReceiptId: v.optional(v.string()),
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_operation_key", ["operationKey"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_instance_state", ["instanceId", "state"])
    .index("by_website_created", ["websiteId", "createdAt"])
    .index("by_requested_by", ["requestedByUserId", "createdAt"])
    .index("by_state_updated", ["state", "updatedAt"]),

  overseer_operationSteps: defineTable({
    operationId: v.id("overseer_siteOperations"),
    stepKey: v.string(),
    sequence: v.number(),
    state: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    attempt: v.number(),
    checkpointCode: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_operation_sequence", ["operationId", "sequence"])
    .index("by_operation_state", ["operationId", "state"]),

  overseer_siteBackups: defineTable({
    snapshotId: v.string(),
    websiteId: v.id("overseer_websites"),
    instanceId: v.id("overseer_websiteInstances"),
    websiteKey: v.string(),
    instanceKey: v.string(),
    environmentKind,
    siteContractVersion: v.string(),
    schemaVersion: v.string(),
    engineVersion: v.string(),
    checksumSha256: v.string(),
    sizeBytes: v.number(),
    tableCount: v.number(),
    storageObjectCount: v.number(),
    artifactRef: v.string(),
    verificationStatus: v.union(
      v.literal("pending"),
      v.literal("verified"),
      v.literal("failed"),
      v.literal("deleted"),
    ),
    createdByControllerId: v.string(),
    createdByUserId: v.id("overseer_users"),
    immutableAt: v.number(),
    verifiedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_snapshot_id", ["snapshotId"])
    .index("by_instance_created", ["instanceId", "createdAt"])
    .index("by_verification", ["verificationStatus", "createdAt"]),

  overseer_operationReceipts: defineTable({
    receiptId: v.string(),
    operationId: v.id("overseer_siteOperations"),
    operationCode,
    websiteKey: v.string(),
    instanceKey: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    preBackupSnapshotId: v.optional(v.string()),
    preBackupReceiptId: v.optional(v.string()),
    summaryJson: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_receipt_id", ["receiptId"])
    .index("by_operation", ["operationId", "createdAt"])
    .index("by_instance", ["instanceKey", "createdAt"]),

  overseer_siteHandoffs: defineTable({
    handoffId: v.string(),
    websiteId: v.id("overseer_websites"),
    websiteKey: v.string(),
    requestedByUserId: v.id("overseer_users"),
    packageManifestJson: v.string(),
    status: v.union(
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("downloaded"),
      v.literal("revoked"),
      v.literal("failed"),
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_handoff_id", ["handoffId"])
    .index("by_website", ["websiteId", "createdAt"])
    .index("by_status", ["status", "updatedAt"]),
};
