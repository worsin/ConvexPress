"use node";

import { siteHealthResponseSchema } from "@convexpress/site-contract";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import { internalAction, type ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { parseControllerCredential } from "../connections/controllerCredentials";
import {
  decryptCredentialPayload,
  parseEnvelopeKey,
} from "../connections/crypto";
import type { BackupPurpose } from "./backups";
import { exportConvexSnapshot } from "./snapshotApi";
import { importConvexSnapshot } from "./snapshotImportApi";
import {
  inspectConvexSnapshot,
  verifyConvexSnapshotChecksum,
} from "./snapshotArchive";
import { prepareTargetBoundSnapshot } from "./snapshotRestoreArchive";

const backupPurpose = v.union(
  v.literal("manual"),
  v.literal("pre-clone"),
  v.literal("pre-restore"),
  v.literal("pre-promote"),
  v.literal("clone-source"),
  v.literal("promote-source"),
  v.literal("handoff"),
);

const exportedArtifact = v.object({
  artifactStorageId: v.id("_storage"),
  snapshotId: v.string(),
  reused: v.boolean(),
});

interface PreparedSnapshotTarget {
  operationId: Id<"overseer_siteOperations">;
  operationKey: string;
  operationCreatedAt: number;
  requestedByUserId: Id<"overseer_users">;
  purpose: BackupPurpose;
  snapshotId: string;
  websiteId: Id<"overseer_websites">;
  instanceId: Id<"overseer_websiteInstances">;
  websiteKey: string;
  instanceKey: string;
  environmentKind:
    | "live"
    | "staging"
    | "beta"
    | "preview"
    | "development"
    | "local"
    | "custom";
  deploymentOrigin: string;
  managementOrigin: string;
  siteOrigin: string;
  siteContractVersion: string;
  schemaVersion: string;
  engineVersion: string;
  connectionId: Id<"overseer_connections">;
  credentials: {
    encrypted: string;
    iv: string;
    authTag: string;
    createdAt: number;
    updatedAt: number;
    lastRotatedAt: number;
    version: number;
  };
  existing: {
    backupId: Id<"overseer_siteBackups">;
    artifactStorageId: Id<"_storage">;
    checksumSha256: string;
    sizeBytes: number;
  } | null;
}

interface ExportedArtifactResult {
  artifactStorageId: Id<"_storage">;
  snapshotId: string;
  reused: boolean;
}

interface VerifiedArtifactResult {
  backupId: Id<"overseer_siteBackups">;
  snapshotId: string;
  checksumSha256: string;
  tableCount: number;
  storageObjectCount: number;
  preBackupReceiptId?: string;
}

interface PreparedRestore {
  operationId: Id<"overseer_siteOperations">;
  source: {
    backupId: Id<"overseer_siteBackups">;
    snapshotId: string;
    artifactStorageId: Id<"_storage">;
    checksumSha256: string;
    websiteKey: string;
    instanceKey: string;
    environmentKind: PreparedSnapshotTarget["environmentKind"];
    siteContractVersion: string;
    schemaVersion: string;
    engineVersion: string;
  };
  preBackup: {
    backupId: Id<"overseer_siteBackups">;
    snapshotId: string;
    artifactStorageId: Id<"_storage">;
    checksumSha256: string;
  };
}

interface PreparedReplacement extends PreparedRestore {
  operationCode: "site.clone" | "site.promote";
  targetPurpose: "pre-clone" | "pre-promote";
}

function credentialAad(target: {
  websiteKey: string;
  instanceKey: string;
  connectionId: unknown;
}): string {
  return `${target.websiteKey}|${target.instanceKey}|${String(target.connectionId)}`;
}

async function revalidateManagementIdentity(target: {
  managementOrigin: string;
  websiteKey: string;
  instanceKey: string;
}): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(
      `${target.managementOrigin}/api/convexpress/management/health`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error("unreachable");
    const health = siteHealthResponseSchema.parse(await response.json());
    if (
      health.websiteKey !== target.websiteKey ||
      health.instanceKey !== target.instanceKey
    ) {
      throw new Error("mismatch");
    }
  } catch {
    throw new Error("Lifecycle target identity could not be revalidated");
  } finally {
    clearTimeout(timeout);
  }
}

export const revalidateSnapshotTarget = internalAction({
  args: {
    operationId: v.id("overseer_siteOperations"),
    purpose: backupPurpose,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const target = await ctx.runQuery(internal.operations.internal.prepareSnapshot, {
      operationId: args.operationId,
      purpose: args.purpose,
    }) as PreparedSnapshotTarget;
    await revalidateManagementIdentity(target);
    return null;
  },
});

export const exportSnapshotArtifact = internalAction({
  args: {
    operationId: v.id("overseer_siteOperations"),
    purpose: backupPurpose,
  },
  returns: exportedArtifact,
  handler: async (ctx, args): Promise<ExportedArtifactResult> => {
    const target = await ctx.runQuery(internal.operations.internal.prepareSnapshot, {
      operationId: args.operationId,
      purpose: args.purpose,
    }) as PreparedSnapshotTarget;
    if (target.existing) {
      const blob = await ctx.storage.get(target.existing.artifactStorageId);
      if (!blob) throw new Error("Stored snapshot artifact is unavailable");
      verifyConvexSnapshotChecksum(
        new Uint8Array(await blob.arrayBuffer()),
        target.existing.checksumSha256,
      );
      return {
        artifactStorageId: target.existing.artifactStorageId,
        snapshotId: target.snapshotId,
        reused: true,
      };
    }

    await revalidateManagementIdentity(target);
    const key = parseEnvelopeKey(
      process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS,
      target.credentials.version,
    );
    const credential = parseControllerCredential(
      decryptCredentialPayload({
        envelope: target.credentials,
        key,
        aad: credentialAad(target),
      }),
    );
    const exported = await exportConvexSnapshot({
      deploymentOrigin: target.deploymentOrigin,
      deploymentAdminKey: credential.deploymentAdminKey,
      includeStorage: true,
    });
    const snapshotBuffer = exported.bytes.buffer.slice(
      exported.bytes.byteOffset,
      exported.bytes.byteOffset + exported.bytes.byteLength,
    ) as ArrayBuffer;
    const artifactStorageId = await ctx.storage.store(
      new Blob([snapshotBuffer], { type: "application/zip" }),
    );
    return {
      artifactStorageId,
      snapshotId: target.snapshotId,
      reused: false,
    };
  },
});

export const verifySnapshotArtifact = internalAction({
  args: {
    operationId: v.id("overseer_siteOperations"),
    purpose: backupPurpose,
    artifactStorageId: v.id("_storage"),
    snapshotId: v.string(),
  },
  returns: v.object({
    backupId: v.id("overseer_siteBackups"),
    snapshotId: v.string(),
    checksumSha256: v.string(),
    tableCount: v.number(),
    storageObjectCount: v.number(),
    preBackupReceiptId: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<VerifiedArtifactResult> => {
    const target = await ctx.runQuery(internal.operations.internal.prepareSnapshot, {
      operationId: args.operationId,
      purpose: args.purpose,
    }) as PreparedSnapshotTarget;
    if (target.snapshotId !== args.snapshotId) {
      throw new Error("Snapshot artifact identity is inconsistent");
    }
    const blob = await ctx.storage.get(args.artifactStorageId);
    if (!blob) throw new Error("Snapshot artifact is unavailable");
    const inspected = await inspectConvexSnapshot({
      bytes: new Uint8Array(await blob.arrayBuffer()),
      snapshotId: target.snapshotId,
      expectedWebsiteKey: target.websiteKey,
      expectedInstanceKey: target.instanceKey,
      expectedEnvironmentKind: target.environmentKind,
      createdByControllerId: "controller_convexpress_standalone",
      createdAt: new Date(target.operationCreatedAt),
    });
    const recorded: {
      backupId: Id<"overseer_siteBackups">;
      artifactStorageId: Id<"_storage">;
      snapshotId: string;
      preBackupReceiptId?: string;
      idempotent: boolean;
    } = await ctx.runMutation(
      internal.operations.internal.recordSnapshot,
      {
        operationId: target.operationId,
        purpose: args.purpose as BackupPurpose,
        artifactStorageId: args.artifactStorageId,
        manifest: inspected.manifest,
      },
    );
    return {
      backupId: recorded.backupId,
      snapshotId: recorded.snapshotId,
      checksumSha256: inspected.manifest.checksumSha256,
      tableCount: inspected.manifest.tableCount,
      storageObjectCount: inspected.manifest.storageObjectCount,
      preBackupReceiptId: recorded.preBackupReceiptId,
    };
  },
});

const importedSnapshot = v.object({
  importId: v.string(),
  rowsWritten: v.number(),
  sourceSnapshotId: v.string(),
  preparedChecksumSha256: v.string(),
  preservedManagementTableCount: v.number(),
});

type ImportedSnapshot = {
  importId: string;
  rowsWritten: number;
  sourceSnapshotId: string;
  preparedChecksumSha256: string;
  preservedManagementTableCount: number;
};

async function importTargetBoundSnapshot(
  ctx: ActionCtx,
  target: PreparedSnapshotTarget,
  replacement: PreparedRestore,
): Promise<ImportedSnapshot> {
    if (
      !target.existing ||
      target.existing.backupId !== replacement.preBackup.backupId ||
      target.existing.artifactStorageId !==
        replacement.preBackup.artifactStorageId
    ) {
      throw new Error("Replacement pre-backup is not attached to the target");
    }
    const [sourceBlob, preBackupBlob] = await Promise.all([
      ctx.storage.get(replacement.source.artifactStorageId),
      ctx.storage.get(replacement.preBackup.artifactStorageId),
    ]);
    if (!sourceBlob || !preBackupBlob) {
      throw new Error("Replacement snapshot artifact is unavailable");
    }
    const prepared = await prepareTargetBoundSnapshot({
      sourceBytes: new Uint8Array(await sourceBlob.arrayBuffer()),
      sourceChecksumSha256: replacement.source.checksumSha256,
      sourceSnapshotId: replacement.source.snapshotId,
      sourceIdentity: {
        websiteKey: replacement.source.websiteKey,
        instanceKey: replacement.source.instanceKey,
        environmentKind: replacement.source.environmentKind,
      },
      targetPreBackupBytes: new Uint8Array(await preBackupBlob.arrayBuffer()),
      targetPreBackupChecksumSha256: replacement.preBackup.checksumSha256,
      targetPreBackupSnapshotId: replacement.preBackup.snapshotId,
      targetIdentity: {
        websiteKey: target.websiteKey,
        instanceKey: target.instanceKey,
        environmentKind: target.environmentKind,
      },
    });
    const key = parseEnvelopeKey(
      process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS,
      target.credentials.version,
    );
    const credential = parseControllerCredential(
      decryptCredentialPayload({
        envelope: target.credentials,
        key,
        aad: credentialAad(target),
      }),
    );
    const imported = await importConvexSnapshot({
      deploymentOrigin: target.deploymentOrigin,
      deploymentAdminKey: credential.deploymentAdminKey,
      bytes: prepared.bytes,
      approvedReplaceAll: true,
    });
    await revalidateManagementIdentity(target);
    return {
      importId: imported.importId,
      rowsWritten: imported.rowsWritten,
      sourceSnapshotId: replacement.source.snapshotId,
      preparedChecksumSha256: prepared.checksumSha256,
      preservedManagementTableCount: prepared.preservedTables.length,
    };
}

export const importRestoreSnapshot = internalAction({
  args: { operationId: v.id("overseer_siteOperations") },
  returns: importedSnapshot,
  handler: async (ctx, args): Promise<ImportedSnapshot> => {
    const [target, restore] = await Promise.all([
      ctx.runQuery(internal.operations.internal.prepareSnapshot, {
        operationId: args.operationId,
        purpose: "pre-restore",
      }) as Promise<PreparedSnapshotTarget>,
      ctx.runQuery(internal.operations.internal.prepareRestore, {
        operationId: args.operationId,
      }) as Promise<PreparedRestore>,
    ]);
    return await importTargetBoundSnapshot(ctx, target, restore);
  },
});

export const importReplacementSnapshot = internalAction({
  args: { operationId: v.id("overseer_siteOperations") },
  returns: importedSnapshot,
  handler: async (ctx, args): Promise<ImportedSnapshot> => {
    const replacement = (await ctx.runQuery(
      internal.operations.internal.prepareReplacement,
      { operationId: args.operationId },
    )) as PreparedReplacement;
    const target = (await ctx.runQuery(
      internal.operations.internal.prepareSnapshot,
      {
        operationId: args.operationId,
        purpose: replacement.targetPurpose,
      },
    )) as PreparedSnapshotTarget;
    return await importTargetBoundSnapshot(ctx, target, replacement);
  },
});
