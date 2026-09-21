import {
  backupManifestSchema,
  canonicalJson,
  fingerprintCanonicalJson,
  OPERATION_CODES,
  sanitizeReceiptSummary,
  type BackupManifest,
} from "@convexpress/site-contract";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type BackupPurpose =
  | "manual"
  | "pre-clone"
  | "pre-restore"
  | "pre-promote"
  | "clone-source"
  | "promote-source"
  | "handoff";

const PURPOSE_OPERATION = {
  manual: OPERATION_CODES.backupCreate,
  "pre-clone": OPERATION_CODES.clone,
  "pre-restore": OPERATION_CODES.restore,
  "pre-promote": OPERATION_CODES.promote,
  "clone-source": OPERATION_CODES.clone,
  "promote-source": OPERATION_CODES.promote,
  handoff: OPERATION_CODES.handoffExport,
} as const;

function isSourcePurpose(purpose: BackupPurpose): boolean {
  return purpose === "clone-source" || purpose === "promote-source";
}

function isPreBackupPurpose(purpose: BackupPurpose): boolean {
  return (
    purpose === "pre-clone" ||
    purpose === "pre-restore" ||
    purpose === "pre-promote"
  );
}

async function attachSourceSnapshot(
  ctx: Pick<MutationCtx, "db">,
  operation: Doc<"overseer_siteOperations"> | null,
  purpose: BackupPurpose,
  snapshotId: string,
): Promise<void> {
  if (!isSourcePurpose(purpose) || !operation) return;
  if (!operation.sourceInstanceId) {
    throw new Error("Snapshot source environment is missing");
  }
  if (operation.snapshotId && operation.snapshotId !== snapshotId) {
    throw new Error("Lifecycle source snapshot is immutable");
  }
  if (!operation.snapshotId) {
    await ctx.db.patch(operation._id, {
      snapshotId,
      revision: operation.revision + 1,
      updatedAt: Date.now(),
    });
  }
}

export async function recordVerifiedSnapshot(
  ctx: Pick<MutationCtx, "db">,
  input: {
    operationId: Id<"overseer_siteOperations">;
    purpose: BackupPurpose;
    artifactStorageId: Id<"_storage">;
    manifest: BackupManifest;
  },
): Promise<{
  backupId: Id<"overseer_siteBackups">;
  artifactStorageId: Id<"_storage">;
  snapshotId: string;
  preBackupReceiptId?: string;
  idempotent: boolean;
}> {
  const manifest = backupManifestSchema.parse(input.manifest);
  if (manifest.verificationStatus !== "verified") {
    throw new Error("Only verified snapshots may be recorded");
  }
  const operation = await ctx.db.get(input.operationId);
  if (!operation) throw new Error("Lifecycle operation not found");
  if (operation.operationCode !== PURPOSE_OPERATION[input.purpose]) {
    throw new Error("Snapshot purpose does not match its lifecycle operation");
  }
  if (operation.state !== "running" && operation.state !== "resuming") {
    throw new Error("Lifecycle operation is not running");
  }

  const instanceId = isSourcePurpose(input.purpose)
    ? operation.sourceInstanceId
    : operation.instanceId;
  if (!instanceId) throw new Error("Snapshot source environment is missing");
  const instance = await ctx.db.get(instanceId);
  if (!instance || instance.status !== "active") {
    throw new Error("Snapshot source environment is not active");
  }
  if (
    manifest.websiteKey !== operation.websiteKey ||
    manifest.instanceKey !== instance.instanceKey ||
    manifest.environmentKind !== instance.kind ||
    manifest.siteContractVersion !== instance.siteContractVersion ||
    manifest.schemaVersion !== instance.schemaVersion ||
    manifest.engineVersion !== instance.engineVersion
  ) {
    throw new Error("Snapshot manifest identity does not match its source");
  }

  const manifestJson = canonicalJson(manifest);
  const existingRows = await ctx.db
    .query("overseer_siteBackups")
    .withIndex("by_snapshot_id", (q) => q.eq("snapshotId", manifest.snapshotId))
    .take(2);
  if (existingRows.length > 1) {
    throw new Error("Snapshot identifier is not unique");
  }
  const existing = existingRows[0];
  if (existing) {
    if (
      existing.sourceOperationId !== operation._id ||
      existing.purpose !== input.purpose ||
      existing.artifactStorageId !== input.artifactStorageId ||
      existing.manifestJson !== manifestJson ||
      existing.checksumSha256 !== manifest.checksumSha256
    ) {
      throw new Error("Snapshot metadata is immutable");
    }
    await attachSourceSnapshot(ctx, operation, input.purpose, existing.snapshotId);
    return {
      backupId: existing._id,
      artifactStorageId: existing.artifactStorageId,
      snapshotId: existing.snapshotId,
      preBackupReceiptId: operation.preBackupReceiptId,
      idempotent: true,
    };
  }

  const createdAt = Date.parse(manifest.createdAt);
  if (!Number.isFinite(createdAt)) {
    throw new Error("Snapshot creation time is invalid");
  }
  const backupId = await ctx.db.insert("overseer_siteBackups", {
    snapshotId: manifest.snapshotId,
    sourceOperationId: operation._id,
    ...(operation.schedulePolicyId ? {schedulePolicyId: operation.schedulePolicyId} : {}),
    purpose: input.purpose,
    websiteId: operation.websiteId,
    instanceId: instance._id,
    websiteKey: manifest.websiteKey,
    instanceKey: manifest.instanceKey,
    environmentKind: manifest.environmentKind,
    siteContractVersion: manifest.siteContractVersion,
    schemaVersion: manifest.schemaVersion,
    engineVersion: manifest.engineVersion,
    checksumSha256: manifest.checksumSha256,
    sizeBytes: manifest.sizeBytes,
    tableCount: manifest.tableCount,
    storageObjectCount: manifest.storageObjectCount,
    artifactStorageId: input.artifactStorageId,
    manifestJson,
    verificationStatus: "verified",
    createdByControllerId: manifest.createdByControllerId,
    createdByUserId: operation.requestedByUserId,
    immutableAt: createdAt,
    verifiedAt: Date.now(),
    createdAt,
  });

  await attachSourceSnapshot(ctx, operation, input.purpose, manifest.snapshotId);

  let preBackupReceiptId: string | undefined;
  if (isPreBackupPurpose(input.purpose)) {
    preBackupReceiptId = `receipt_${fingerprintCanonicalJson({
      operationKey: operation.operationKey,
      purpose: input.purpose,
      snapshotId: manifest.snapshotId,
    }).slice(0, 40)}`;
    const summary = sanitizeReceiptSummary({
      kind: "verified-pre-backup",
      purpose: input.purpose,
      snapshotId: manifest.snapshotId,
      checksumSha256: manifest.checksumSha256,
      tableCount: manifest.tableCount,
      storageObjectCount: manifest.storageObjectCount,
    });
    await ctx.db.insert("overseer_operationReceipts", {
      receiptId: preBackupReceiptId,
      operationId: operation._id,
      operationCode: OPERATION_CODES.backupCreate,
      websiteKey: operation.websiteKey,
      instanceKey: instance.instanceKey,
      status: "succeeded",
      preBackupSnapshotId: manifest.snapshotId,
      summaryJson: canonicalJson(summary),
      startedAt: operation.startedAt ?? operation.createdAt,
      completedAt: Date.now(),
      createdAt: Date.now(),
    });
    await ctx.db.patch(operation._id, {
      preBackupId: backupId,
      preBackupReceiptId,
      revision: operation.revision + 1,
      updatedAt: Date.now(),
    });
  }

  return {
    backupId,
    artifactStorageId: input.artifactStorageId,
    snapshotId: manifest.snapshotId,
    preBackupReceiptId,
    idempotent: false,
  };
}
