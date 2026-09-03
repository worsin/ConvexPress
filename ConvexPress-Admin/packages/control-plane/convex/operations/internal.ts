import { OPERATION_CODES, sha256Hex } from "@convexpress/site-contract";
import { vResultValidator, vWorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";

import { internalMutation, internalQuery } from "../_generated/server";
import { recordVerifiedSnapshot, type BackupPurpose } from "./backups";
import { assertSnapshotCompatibleForTarget } from "./policy";
import {
  checkpointOperationRecord,
  completeOperationRecord,
  interruptOperationRecord,
  setOperationWorkflowId,
  transitionOperationRecord,
} from "./records";

const backupPurpose = v.union(
  v.literal("manual"),
  v.literal("pre-clone"),
  v.literal("pre-restore"),
  v.literal("pre-promote"),
  v.literal("clone-source"),
  v.literal("promote-source"),
  v.literal("handoff"),
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

const credentialEnvelope = v.object({
  encrypted: v.string(),
  iv: v.string(),
  authTag: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastRotatedAt: v.number(),
  version: v.number(),
});

const preparedSnapshot = v.object({
  operationId: v.id("overseer_siteOperations"),
  operationKey: v.string(),
  operationCreatedAt: v.number(),
  requestedByUserId: v.id("overseer_users"),
  purpose: backupPurpose,
  snapshotId: v.string(),
  websiteId: v.id("overseer_websites"),
  instanceId: v.id("overseer_websiteInstances"),
  websiteKey: v.string(),
  instanceKey: v.string(),
  environmentKind,
  deploymentOrigin: v.string(),
  managementOrigin: v.string(),
  siteOrigin: v.string(),
  siteContractVersion: v.string(),
  schemaVersion: v.string(),
  engineVersion: v.string(),
  connectionId: v.id("overseer_connections"),
  credentials: credentialEnvelope,
  existing: v.union(
    v.object({
      backupId: v.id("overseer_siteBackups"),
      artifactStorageId: v.id("_storage"),
      checksumSha256: v.string(),
      sizeBytes: v.number(),
    }),
    v.null(),
  ),
});

const preparedRestore = v.object({
  operationId: v.id("overseer_siteOperations"),
  source: v.object({
    backupId: v.id("overseer_siteBackups"),
    snapshotId: v.string(),
    artifactStorageId: v.id("_storage"),
    checksumSha256: v.string(),
    websiteKey: v.string(),
    instanceKey: v.string(),
    environmentKind,
    siteContractVersion: v.string(),
    schemaVersion: v.string(),
    engineVersion: v.string(),
  }),
  preBackup: v.object({
    backupId: v.id("overseer_siteBackups"),
    snapshotId: v.string(),
    artifactStorageId: v.id("_storage"),
    checksumSha256: v.string(),
  }),
});

const preparedReplacement = v.object({
  operationId: v.id("overseer_siteOperations"),
  operationCode: v.union(v.literal("site.clone"), v.literal("site.promote")),
  targetPurpose: v.union(v.literal("pre-clone"), v.literal("pre-promote")),
  source: preparedRestore.fields.source,
  preBackup: preparedRestore.fields.preBackup,
});

function expectedOperation(purpose: BackupPurpose) {
  switch (purpose) {
    case "manual":
      return OPERATION_CODES.backupCreate;
    case "pre-clone":
      return OPERATION_CODES.clone;
    case "pre-restore":
      return OPERATION_CODES.restore;
    case "pre-promote":
    case "promote-source":
      return OPERATION_CODES.promote;
    case "clone-source":
      return OPERATION_CODES.clone;
    case "handoff":
      return OPERATION_CODES.handoffExport;
  }
}

function usesSource(purpose: BackupPurpose): boolean {
  return purpose === "clone-source" || purpose === "promote-source";
}

export const assignWorkflow = internalMutation({
  args: {
    operationId: v.id("overseer_siteOperations"),
    workflowId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await setOperationWorkflowId(ctx, args);
    return null;
  },
});

export const begin = internalMutation({
  args: { operationId: v.id("overseer_siteOperations") },
  returns: v.object({ state: v.literal("running"), revision: v.number() }),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (!operation) throw new Error("Lifecycle operation not found");
    if (operation.state === "running") {
      return { state: "running" as const, revision: operation.revision };
    }
    const result = await transitionOperationRecord(ctx, {
      operationId: operation._id,
      expectedRevision: operation.revision,
      to: "running",
    });
    return { state: "running" as const, revision: result.revision };
  },
});

export const checkpoint = internalMutation({
  args: {
    operationId: v.id("overseer_siteOperations"),
    stepKey: v.string(),
    state: v.union(v.literal("running"), v.literal("succeeded")),
    checkpointCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await checkpointOperationRecord(ctx, args);
    return null;
  },
});

export const prepareSnapshot = internalQuery({
  args: {
    operationId: v.id("overseer_siteOperations"),
    purpose: backupPurpose,
  },
  returns: preparedSnapshot,
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (
      !operation ||
      operation.operationCode !== expectedOperation(args.purpose) ||
      (operation.state !== "running" && operation.state !== "resuming")
    ) {
      throw new Error("Lifecycle snapshot operation is not ready");
    }
    const user = await ctx.db.get(operation.requestedByUserId);
    if (!user || user.isActive === false) {
      throw new Error("Lifecycle operator is no longer active");
    }
    const instanceId = usesSource(args.purpose)
      ? operation.sourceInstanceId
      : operation.instanceId;
    if (!instanceId) throw new Error("Lifecycle snapshot source is missing");
    const [website, instance] = await Promise.all([
      ctx.db.get(operation.websiteId),
      ctx.db.get(instanceId),
    ]);
    if (
      !website ||
      website.status !== "active" ||
      !instance ||
      instance.status !== "active" ||
      instance.website_id !== website._id ||
      !instance.connection_id ||
      !instance.siteContractVersion ||
      !instance.schemaVersion ||
      !instance.engineVersion
    ) {
      throw new Error("Lifecycle snapshot target identity is inconsistent");
    }
    const connection = await ctx.db.get(instance.connection_id);
    if (
      !connection ||
      !connection.isActive ||
      connection.status !== "connected" ||
      connection.instance_id !== instance._id ||
      connection.website_id !== website._id ||
      !connection.credentials
    ) {
      throw new Error("Lifecycle snapshot connection is unavailable");
    }

    const snapshotId = `snapshot_${sha256Hex(
      `${operation.operationKey}|${args.purpose}`,
    ).slice(0, 48)}`;
    const existingRows = await ctx.db
      .query("overseer_siteBackups")
      .withIndex("by_snapshot_id", (q) => q.eq("snapshotId", snapshotId))
      .take(2);
    if (existingRows.length > 1) {
      throw new Error("Lifecycle snapshot identifier is not unique");
    }
    const existing = existingRows[0];
    return {
      operationId: operation._id,
      operationKey: operation.operationKey,
      operationCreatedAt: operation.createdAt,
      requestedByUserId: operation.requestedByUserId,
      purpose: args.purpose,
      snapshotId,
      websiteId: website._id,
      instanceId: instance._id,
      websiteKey: website.websiteKey,
      instanceKey: instance.instanceKey,
      environmentKind: instance.kind,
      deploymentOrigin: instance.deploymentOrigin,
      managementOrigin: instance.managementOrigin,
      siteOrigin: instance.siteOrigin,
      siteContractVersion: instance.siteContractVersion,
      schemaVersion: instance.schemaVersion,
      engineVersion: instance.engineVersion,
      connectionId: connection._id,
      credentials: {
        encrypted: connection.credentials.encrypted,
        iv: connection.credentials.iv,
        authTag: connection.credentials.authTag,
        createdAt: connection.credentials.createdAt ?? connection.createdAt,
        updatedAt: connection.credentials.updatedAt ?? connection.updatedAt,
        lastRotatedAt:
          connection.credentials.lastRotatedAt ?? connection.updatedAt,
        version: connection.credentials.version ?? 1,
      },
      existing: existing
        ? {
            backupId: existing._id,
            artifactStorageId: existing.artifactStorageId,
            checksumSha256: existing.checksumSha256,
            sizeBytes: existing.sizeBytes,
          }
        : null,
    };
  },
});

export const prepareRestore = internalQuery({
  args: { operationId: v.id("overseer_siteOperations") },
  returns: preparedRestore,
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (
      !operation ||
      operation.operationCode !== OPERATION_CODES.restore ||
      (operation.state !== "running" && operation.state !== "resuming") ||
      !operation.snapshotId ||
      !operation.preBackupId ||
      !operation.preBackupReceiptId
    ) {
      throw new Error("Restore operation is not ready for import");
    }
    const [target, sourceRows, preBackup, receiptRows] = await Promise.all([
      ctx.db.get(operation.instanceId),
      ctx.db
        .query("overseer_siteBackups")
        .withIndex("by_snapshot_id", (q) => q.eq("snapshotId", operation.snapshotId!))
        .take(2),
      ctx.db.get(operation.preBackupId),
      ctx.db
        .query("overseer_operationReceipts")
        .withIndex("by_receipt_id", (q) =>
          q.eq("receiptId", operation.preBackupReceiptId!),
        )
        .take(2),
    ]);
    if (sourceRows.length !== 1 || receiptRows.length !== 1) {
      throw new Error("Restore snapshot evidence is not unique");
    }
    const source = sourceRows[0]!;
    const receipt = receiptRows[0]!;
    if (
      !target ||
      target.status !== "active" ||
      !target.siteContractVersion ||
      !target.schemaVersion ||
      !target.engineVersion ||
      source.verificationStatus !== "verified" ||
      source.websiteId !== operation.websiteId ||
      preBackup?.verificationStatus !== "verified" ||
      preBackup.websiteId !== operation.websiteId ||
      preBackup.instanceId !== operation.instanceId ||
      receipt.operationId !== operation._id ||
      receipt.operationCode !== OPERATION_CODES.backupCreate ||
      receipt.status !== "succeeded" ||
      receipt.preBackupSnapshotId !== preBackup.snapshotId
    ) {
      throw new Error("Restore snapshot evidence does not match the target");
    }
    assertSnapshotCompatibleForTarget({
      source: {
        siteContractVersion: source.siteContractVersion,
        schemaVersion: source.schemaVersion,
        engineVersion: source.engineVersion,
      },
      target: {
        siteContractVersion: target.siteContractVersion,
        schemaVersion: target.schemaVersion,
        engineVersion: target.engineVersion,
      },
    });
    return {
      operationId: operation._id,
      source: {
        backupId: source._id,
        snapshotId: source.snapshotId,
        artifactStorageId: source.artifactStorageId,
        checksumSha256: source.checksumSha256,
        websiteKey: source.websiteKey,
        instanceKey: source.instanceKey,
        environmentKind: source.environmentKind,
        siteContractVersion: source.siteContractVersion,
        schemaVersion: source.schemaVersion,
        engineVersion: source.engineVersion,
      },
      preBackup: {
        backupId: preBackup._id,
        snapshotId: preBackup.snapshotId,
        artifactStorageId: preBackup.artifactStorageId,
        checksumSha256: preBackup.checksumSha256,
      },
    };
  },
});

export const prepareReplacement = internalQuery({
  args: { operationId: v.id("overseer_siteOperations") },
  returns: preparedReplacement,
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (
      !operation ||
      (operation.operationCode !== OPERATION_CODES.clone &&
        operation.operationCode !== OPERATION_CODES.promote) ||
      (operation.state !== "running" && operation.state !== "resuming") ||
      !operation.sourceInstanceId ||
      !operation.snapshotId ||
      !operation.preBackupId ||
      !operation.preBackupReceiptId
    ) {
      throw new Error("Replacement operation is not ready for import");
    }
    const [target, sourceRows, preBackup, receiptRows] = await Promise.all([
      ctx.db.get(operation.instanceId),
      ctx.db
        .query("overseer_siteBackups")
        .withIndex("by_snapshot_id", (q) =>
          q.eq("snapshotId", operation.snapshotId!),
        )
        .take(2),
      ctx.db.get(operation.preBackupId),
      ctx.db
        .query("overseer_operationReceipts")
        .withIndex("by_receipt_id", (q) =>
          q.eq("receiptId", operation.preBackupReceiptId!),
        )
        .take(2),
    ]);
    if (sourceRows.length !== 1 || receiptRows.length !== 1) {
      throw new Error("Replacement snapshot evidence is not unique");
    }
    const source = sourceRows[0]!;
    const receipt = receiptRows[0]!;
    const sourcePurpose =
      operation.operationCode === OPERATION_CODES.clone
        ? "clone-source"
        : "promote-source";
    const targetPurpose: "pre-clone" | "pre-promote" =
      operation.operationCode === OPERATION_CODES.clone
        ? "pre-clone"
        : "pre-promote";
    if (
      !target ||
      target.status !== "active" ||
      !target.siteContractVersion ||
      !target.schemaVersion ||
      !target.engineVersion ||
      source.verificationStatus !== "verified" ||
      source.sourceOperationId !== operation._id ||
      source.purpose !== sourcePurpose ||
      source.websiteId !== operation.websiteId ||
      source.instanceId !== operation.sourceInstanceId ||
      preBackup?.verificationStatus !== "verified" ||
      preBackup.sourceOperationId !== operation._id ||
      preBackup.purpose !== targetPurpose ||
      preBackup.websiteId !== operation.websiteId ||
      preBackup.instanceId !== operation.instanceId ||
      receipt.operationId !== operation._id ||
      receipt.operationCode !== OPERATION_CODES.backupCreate ||
      receipt.status !== "succeeded" ||
      receipt.preBackupSnapshotId !== preBackup.snapshotId
    ) {
      throw new Error("Replacement snapshot evidence does not match the target");
    }
    assertSnapshotCompatibleForTarget({
      source: {
        siteContractVersion: source.siteContractVersion,
        schemaVersion: source.schemaVersion,
        engineVersion: source.engineVersion,
      },
      target: {
        siteContractVersion: target.siteContractVersion,
        schemaVersion: target.schemaVersion,
        engineVersion: target.engineVersion,
      },
    });
    return {
      operationId: operation._id,
      operationCode: operation.operationCode,
      targetPurpose,
      source: {
        backupId: source._id,
        snapshotId: source.snapshotId,
        artifactStorageId: source.artifactStorageId,
        checksumSha256: source.checksumSha256,
        websiteKey: source.websiteKey,
        instanceKey: source.instanceKey,
        environmentKind: source.environmentKind,
        siteContractVersion: source.siteContractVersion,
        schemaVersion: source.schemaVersion,
        engineVersion: source.engineVersion,
      },
      preBackup: {
        backupId: preBackup._id,
        snapshotId: preBackup.snapshotId,
        artifactStorageId: preBackup.artifactStorageId,
        checksumSha256: preBackup.checksumSha256,
      },
    };
  },
});

const backupManifest = v.object({
  snapshotId: v.string(),
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
  createdByControllerId: v.string(),
  verificationStatus: v.literal("verified"),
  createdAt: v.string(),
});

export const recordSnapshot = internalMutation({
  args: {
    operationId: v.id("overseer_siteOperations"),
    purpose: backupPurpose,
    artifactStorageId: v.id("_storage"),
    manifest: backupManifest,
  },
  returns: v.object({
    backupId: v.id("overseer_siteBackups"),
    artifactStorageId: v.id("_storage"),
    snapshotId: v.string(),
    preBackupReceiptId: v.optional(v.string()),
    idempotent: v.boolean(),
  }),
  handler: async (ctx, args) =>
    await recordVerifiedSnapshot(ctx, {
      ...args,
      purpose: args.purpose as BackupPurpose,
    }),
});

export const finish = internalMutation({
  args: {
    operationId: v.id("overseer_siteOperations"),
    state: v.union(
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    summary: v.optional(v.any()),
    failureCode: v.optional(v.string()),
  },
  returns: v.object({ receiptId: v.string(), status: v.string() }),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (!operation) throw new Error("Lifecycle operation not found");
    return await completeOperationRecord(ctx, {
      operationId: operation._id,
      expectedRevision: operation.revision,
      state: args.state,
      summary: args.summary,
      failureCode: args.failureCode,
      failure: args.failureCode,
    });
  },
});

export const handleBackupComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ operationId: v.id("overseer_siteOperations") }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.context.operationId);
    if (!operation) throw new Error("Lifecycle operation not found");
    if (
      operation.state === "succeeded" ||
      operation.state === "failed" ||
      operation.state === "cancelled"
    ) {
      return null;
    }
    const state =
      args.result.kind === "success"
        ? "succeeded"
        : args.result.kind === "canceled"
          ? "cancelled"
          : "interrupted";
    const steps = await ctx.db
      .query("overseer_operationSteps")
      .withIndex("by_operation_sequence", (q) =>
        q.eq("operationId", operation._id),
      )
      .take(32);
    const current = steps.find((step) => step.stepKey === operation.currentStep);
    if (current && current.state === "running") {
      await ctx.db.patch(current._id, {
        state: state === "succeeded" ? "succeeded" : "failed",
        checkpointCode:
          state === "succeeded" ? "workflow.completed" : undefined,
        errorCode:
          state === "succeeded" ? undefined : "SITE_OPERATION_FAILED",
        completedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    if (state === "interrupted") {
      await interruptOperationRecord(ctx, {
        operationId: operation._id,
        expectedRevision: operation.revision,
        failureCode: "SITE_OPERATION_INTERRUPTED",
        failure: args.result.kind,
      });
      return null;
    }
    await completeOperationRecord(ctx, {
      operationId: operation._id,
      expectedRevision: operation.revision,
      state,
      summary:
        args.result.kind === "success"
          ? args.result.returnValue
          : { workflowStatus: state },
      failureCode: undefined,
      failure: undefined,
    });
    return null;
  },
});
