import {
  canonicalJson,
  fingerprintCanonicalJson,
  OPERATION_CODES,
  sanitizeReceiptSummary,
  sha256Hex,
  type OperationCode,
} from "@convexpress/site-contract";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  assertLifecycleRequestSafety,
  createOperationFingerprint,
  isExclusiveTargetOperation,
  requiresVerifiedPreBackup,
} from "./policy";
import {
  assertOperationTransition,
  sanitizeOperationFailure,
  type OperationState,
} from "./stateMachine";

type Provider = "manual" | "magicdb";

export interface CreateOperationRecordInput {
  operationCode: OperationCode;
  idempotencyKey: string;
  websiteId: Id<"overseer_websites">;
  instanceId: Id<"overseer_websiteInstances">;
  sourceInstanceId?: Id<"overseer_websiteInstances">;
  requestedByUserId: Id<"overseer_users">;
  provider: Provider;
  includeStorage?: boolean;
  includeRunbook?: boolean;
  expiresInMs?: number;
  snapshotId?: string;
  confirmation?: string;
  expectedRevision?: number;
}

const OPERATION_STEPS: Readonly<Record<OperationCode, readonly string[]>> = {
  [OPERATION_CODES.healthCheck]: ["target.revalidate", "health.verify"],
  [OPERATION_CODES.compatibilityCheck]: [
    "target.revalidate",
    "compatibility.verify",
  ],
  [OPERATION_CODES.register]: ["target.validate", "site.register"],
  [OPERATION_CODES.attach]: ["target.validate", "site.attach"],
  [OPERATION_CODES.deploy]: [
    "target.revalidate",
    "engine.deploy",
    "health.verify",
  ],
  [OPERATION_CODES.select]: ["target.revalidate", "site.select"],
  [OPERATION_CODES.sessionExchange]: [
    "target.revalidate",
    "session.exchange",
  ],
  [OPERATION_CODES.backupCreate]: [
    "target.revalidate",
    "snapshot.export",
    "snapshot.verify",
    "operation.finalize",
  ],
  [OPERATION_CODES.clone]: [
    "source.revalidate",
    "target.revalidate",
    "source.snapshot.export",
    "source.snapshot.verify",
    "target.prebackup.export",
    "target.prebackup.verify",
    "target.snapshot.import",
    "target.verify",
    "operation.finalize",
  ],
  [OPERATION_CODES.promote]: [
    "source.revalidate",
    "target.revalidate",
    "source.snapshot.export",
    "source.snapshot.verify",
    "target.prebackup.export",
    "target.prebackup.verify",
    "target.snapshot.import",
    "target.verify",
    "operation.finalize",
  ],
  [OPERATION_CODES.restore]: [
    "target.revalidate",
    "target.prebackup.export",
    "target.prebackup.verify",
    "snapshot.import",
    "target.verify",
    "operation.finalize",
  ],
  [OPERATION_CODES.credentialRotate]: [
    "target.revalidate",
    "credential.rotate",
    "authority.verify",
  ],
  [OPERATION_CODES.authorityGrant]: [
    "target.revalidate",
    "authority.grant",
    "authority.verify",
  ],
  [OPERATION_CODES.authorityRevoke]: [
    "target.revalidate",
    "authority.revoke",
    "remaining-authority.verify",
  ],
  [OPERATION_CODES.operationResume]: ["operation.revalidate", "operation.resume"],
  [OPERATION_CODES.handoffExport]: [
    "target.revalidate",
    "handoff.manifest",
    "handoff.package",
    "handoff.verify",
  ],
};

function operationKey(instanceKey: string, idempotencyKey: string): string {
  return `operation_${sha256Hex(`${instanceKey}|${idempotencyKey}`).slice(0, 48)}`;
}

function requireSingle<T>(rows: T[], message: string): T | null {
  if (rows.length > 1) throw new Error(message);
  return rows[0] ?? null;
}

export async function createOperationRecord(
  ctx: Pick<MutationCtx, "db">,
  input: CreateOperationRecordInput,
) {
  const [website, instance, user] = await Promise.all([
    ctx.db.get(input.websiteId),
    ctx.db.get(input.instanceId),
    ctx.db.get(input.requestedByUserId),
  ]);
  if (!website || website.status !== "active" || website.engine !== "convexpress") {
    throw new Error("Lifecycle website is not active");
  }
  if (
    !instance ||
    instance.status !== "active" ||
    instance.website_id !== website._id ||
    instance.organization_id !== website.organization_id ||
    instance.business_id !== website.business_id
  ) {
    throw new Error("Lifecycle target identity is inconsistent");
  }
  if (!user || user.isActive === false) {
    throw new Error("Lifecycle operator is not active");
  }
  if (
    input.expectedRevision !== undefined &&
    input.expectedRevision !== instance.updatedAt
  ) {
    throw new Error("Lifecycle target revision is stale");
  }

  const source = input.sourceInstanceId
    ? await ctx.db.get(input.sourceInstanceId)
    : null;
  if (
    input.sourceInstanceId &&
    (!source || source.status !== "active" || source.website_id !== website._id)
  ) {
    throw new Error("Lifecycle source identity is inconsistent");
  }

  assertLifecycleRequestSafety({
    operationCode: input.operationCode,
    targetInstanceKey: instance.instanceKey,
    targetKind: instance.kind,
    sourceInstanceKey: source?.instanceKey,
    snapshotId: input.snapshotId,
    confirmation: input.confirmation,
  });

  const requestFingerprint = createOperationFingerprint({
    operationCode: input.operationCode,
    websiteKey: website.websiteKey,
    targetInstanceKey: instance.instanceKey,
    sourceInstanceKey: source?.instanceKey,
    snapshotId: input.snapshotId,
    includeStorage: input.includeStorage,
    includeRunbook: input.includeRunbook,
    expiresInMs: input.expiresInMs,
  });
  const key = operationKey(instance.instanceKey, input.idempotencyKey);
  const existing = requireSingle(
    await ctx.db
      .query("overseer_siteOperations")
      .withIndex("by_operation_key", (q) => q.eq("operationKey", key))
      .take(2),
    "Lifecycle operation key is not unique",
  );
  if (existing) {
    if (existing.requestFingerprint !== requestFingerprint) {
      throw new Error("Idempotency key was already used for a different request");
    }
    return {
      operationId: existing._id,
      operationKey: existing.operationKey,
      idempotent: true,
    };
  }

  const exclusiveTargetLock = isExclusiveTargetOperation(input.operationCode);
  if (exclusiveTargetLock) {
    const active = await ctx.db
      .query("overseer_siteOperations")
      .withIndex("by_instance_exclusive", (q) =>
        q.eq("instanceId", instance._id).eq("exclusiveTargetLock", true),
      )
      .take(1);
    if (active.length > 0) {
      throw new Error("Another exclusive lifecycle operation is already active");
    }
  }

  const requestJson = canonicalJson({
    expiresInMs: input.expiresInMs ?? null,
    includeRunbook: input.includeRunbook ?? null,
    includeStorage: input.includeStorage ?? null,
    operationCode: input.operationCode,
    snapshotId: input.snapshotId ?? null,
    sourceInstanceKey: source?.instanceKey ?? null,
    targetInstanceKey: instance.instanceKey,
    websiteKey: website.websiteKey,
  });
  const now = Date.now();
  const operationId = await ctx.db.insert("overseer_siteOperations", {
    operationKey: key,
    idempotencyKey: input.idempotencyKey,
    operationCode: input.operationCode,
    websiteId: website._id,
    instanceId: instance._id,
    websiteKey: website.websiteKey,
    instanceKey: instance.instanceKey,
    sourceInstanceId: source?._id,
    sourceInstanceKey: source?.instanceKey,
    snapshotId: input.snapshotId,
    requestedByUserId: user._id,
    provider: input.provider,
    requestFingerprint,
    requestJson,
    exclusiveTargetLock,
    state: "queued",
    liveTarget: instance.kind === "live",
    expectedRevision: input.expectedRevision,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  });

  const steps = OPERATION_STEPS[input.operationCode];
  for (let sequence = 0; sequence < steps.length; sequence += 1) {
    await ctx.db.insert("overseer_operationSteps", {
      operationId,
      stepKey: steps[sequence]!,
      sequence,
      state: "pending",
      attempt: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { operationId, operationKey: key, idempotent: false };
}

export async function setOperationWorkflowId(
  ctx: Pick<MutationCtx, "db">,
  input: {
    operationId: Id<"overseer_siteOperations">;
    workflowId: string;
  },
): Promise<void> {
  const operation = await ctx.db.get(input.operationId);
  if (!operation) throw new Error("Lifecycle operation not found");
  if (operation.workflowId && operation.workflowId !== input.workflowId) {
    throw new Error("Lifecycle workflow is already assigned");
  }
  if (!operation.workflowId) {
    await ctx.db.patch(operation._id, {
      workflowId: input.workflowId,
      updatedAt: Date.now(),
    });
  }
}

export async function transitionOperationRecord(
  ctx: Pick<MutationCtx, "db">,
  input: {
    operationId: Id<"overseer_siteOperations">;
    expectedRevision: number;
    to: OperationState;
  },
): Promise<{ revision: number; state: OperationState }> {
  const operation = await ctx.db.get(input.operationId);
  if (!operation) throw new Error("Lifecycle operation not found");
  if (operation.revision !== input.expectedRevision) {
    throw new Error("Lifecycle operation revision is stale");
  }
  const state = assertOperationTransition({
    from: operation.state,
    to: input.to,
    operationCode: operation.operationCode,
    preBackupReceiptId: operation.preBackupReceiptId,
  });
  const now = Date.now();
  const revision = operation.revision + 1;
  const terminal = state === "succeeded" || state === "failed" || state === "cancelled";
  await ctx.db.patch(operation._id, {
    state,
    revision,
    exclusiveTargetLock: terminal ? false : operation.exclusiveTargetLock,
    startedAt:
      operation.startedAt ?? (state === "running" ? now : undefined),
    completedAt: terminal ? now : undefined,
    updatedAt: now,
  });
  return { revision, state };
}

export async function checkpointOperationRecord(
  ctx: Pick<MutationCtx, "db">,
  input: {
    operationId: Id<"overseer_siteOperations">;
    stepKey: string;
    state: "running" | "succeeded";
    checkpointCode?: string;
  },
): Promise<void> {
  const operation = await ctx.db.get(input.operationId);
  if (
    !operation ||
    (operation.state !== "running" && operation.state !== "resuming")
  ) {
    throw new Error("Lifecycle operation is not running");
  }
  const steps = await ctx.db
    .query("overseer_operationSteps")
    .withIndex("by_operation_sequence", (query) =>
      query.eq("operationId", operation._id),
    )
    .take(32);
  const matches = steps.filter((step) => step.stepKey === input.stepKey);
  if (matches.length !== 1) throw new Error("Lifecycle checkpoint is invalid");
  const step = matches[0]!;
  if (input.state === "running") {
    if (step.state === "succeeded") return;
    await ctx.db.patch(step._id, {
      state: "running",
      attempt: step.attempt + 1,
      startedAt: step.startedAt ?? Date.now(),
      errorCode: undefined,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(operation._id, {
      currentStep: step.stepKey,
      updatedAt: Date.now(),
    });
    return;
  }
  if (step.state === "succeeded") return;
  if (step.state !== "running") {
    throw new Error("Lifecycle checkpoint was not started");
  }
  await ctx.db.patch(step._id, {
    state: "succeeded",
    checkpointCode: input.checkpointCode?.slice(0, 160),
    completedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export async function interruptOperationRecord(
  ctx: Pick<MutationCtx, "db">,
  input: {
    operationId: Id<"overseer_siteOperations">;
    expectedRevision: number;
    failure: unknown;
    failureCode: string;
  },
): Promise<{ revision: number; state: "interrupted" }> {
  const operation = await ctx.db.get(input.operationId);
  if (!operation) throw new Error("Lifecycle operation not found");
  if (operation.revision !== input.expectedRevision) {
    throw new Error("Lifecycle operation revision is stale");
  }
  const state = assertOperationTransition({
    from: operation.state,
    to: "interrupted",
    operationCode: operation.operationCode,
    preBackupReceiptId: operation.preBackupReceiptId,
  });
  const failure = sanitizeOperationFailure(input.failure, input.failureCode);
  const revision = operation.revision + 1;
  await ctx.db.patch(operation._id, {
    state,
    revision,
    failureCode: failure.code,
    failureMessage: failure.message,
    updatedAt: Date.now(),
  });
  return { revision, state: "interrupted" };
}

export async function resumeOperationRecord(
  ctx: Pick<MutationCtx, "db">,
  input: {
    operationId: Id<"overseer_siteOperations">;
    expectedRevision: number;
  },
): Promise<{ revision: number; state: "running" }> {
  const operation = await ctx.db.get(input.operationId);
  if (!operation) throw new Error("Lifecycle operation not found");
  if (operation.revision !== input.expectedRevision) {
    throw new Error("Lifecycle operation revision is stale");
  }
  const resuming = await transitionOperationRecord(ctx, {
    operationId: operation._id,
    expectedRevision: operation.revision,
    to: "resuming",
  });
  const running = await transitionOperationRecord(ctx, {
    operationId: operation._id,
    expectedRevision: resuming.revision,
    to: "running",
  });
  await ctx.db.patch(operation._id, {
    failureCode: undefined,
    failureMessage: undefined,
    updatedAt: Date.now(),
  });
  if (operation.currentStep) {
    const steps = await ctx.db
      .query("overseer_operationSteps")
      .withIndex("by_operation_sequence", (q) =>
        q.eq("operationId", operation._id),
      )
      .take(32);
    const matches = steps.filter(
      (step) => step.stepKey === operation.currentStep,
    );
    if (matches.length !== 1) {
      throw new Error("Lifecycle resume checkpoint is invalid");
    }
    const checkpoint = matches[0]!;
    await ctx.db.patch(checkpoint._id, {
      state: "running",
      attempt: checkpoint.attempt + 1,
      errorCode: undefined,
      completedAt: undefined,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  return { revision: running.revision, state: "running" };
}

async function verifiedPreBackup(
  ctx: Pick<MutationCtx, "db">,
  operation: Doc<"overseer_siteOperations">,
) {
  if (!operation.preBackupId || !operation.preBackupReceiptId) return null;
  const [backup, receipts] = await Promise.all([
    ctx.db.get(operation.preBackupId),
    ctx.db
      .query("overseer_operationReceipts")
      .withIndex("by_receipt_id", (q) =>
        q.eq("receiptId", operation.preBackupReceiptId!),
      )
      .take(2),
  ]);
  const receipt = requireSingle(receipts, "Pre-backup receipt is not unique");
  if (
    !backup ||
    backup.verificationStatus !== "verified" ||
    backup.websiteId !== operation.websiteId ||
    backup.instanceId !== operation.instanceId ||
    !receipt ||
    receipt.operationId !== operation._id ||
    receipt.operationCode !== OPERATION_CODES.backupCreate ||
    receipt.status !== "succeeded" ||
    receipt.preBackupSnapshotId !== backup.snapshotId
  ) {
    return null;
  }
  return { backup, receipt };
}

export async function attachVerifiedPreBackup(
  ctx: Pick<MutationCtx, "db">,
  input: {
    operationId: Id<"overseer_siteOperations">;
    backupId: Id<"overseer_siteBackups">;
    receiptId: string;
  },
): Promise<void> {
  const [operation, backup, receipts] = await Promise.all([
    ctx.db.get(input.operationId),
    ctx.db.get(input.backupId),
    ctx.db
      .query("overseer_operationReceipts")
      .withIndex("by_receipt_id", (q) => q.eq("receiptId", input.receiptId))
      .take(2),
  ]);
  if (!operation || !requiresVerifiedPreBackup(operation.operationCode)) {
    throw new Error("Lifecycle operation does not accept a pre-backup");
  }
  const receipt = requireSingle(receipts, "Pre-backup receipt is not unique");
  if (
    !backup ||
    backup.verificationStatus !== "verified" ||
    backup.websiteId !== operation.websiteId ||
    backup.instanceId !== operation.instanceId ||
    !receipt ||
    receipt.operationId !== operation._id ||
    receipt.operationCode !== OPERATION_CODES.backupCreate ||
    receipt.status !== "succeeded" ||
    receipt.instanceKey !== operation.instanceKey ||
    receipt.preBackupSnapshotId !== backup.snapshotId
  ) {
    throw new Error("A verified pre-backup receipt for this target is required");
  }
  await ctx.db.patch(operation._id, {
    preBackupId: backup._id,
    preBackupReceiptId: receipt.receiptId,
    revision: operation.revision + 1,
    updatedAt: Date.now(),
  });
}

export async function completeOperationRecord(
  ctx: Pick<MutationCtx, "db">,
  input: {
    operationId: Id<"overseer_siteOperations">;
    expectedRevision: number;
    state: "succeeded" | "failed" | "cancelled";
    summary?: unknown;
    failure?: unknown;
    failureCode?: string;
  },
): Promise<{ receiptId: string; status: "succeeded" | "failed" | "cancelled" }> {
  const operation = await ctx.db.get(input.operationId);
  if (!operation) throw new Error("Lifecycle operation not found");
  if (operation.revision !== input.expectedRevision) {
    throw new Error("Lifecycle operation revision is stale");
  }
  if (requiresVerifiedPreBackup(operation.operationCode)) {
    const proof = await verifiedPreBackup(ctx, operation);
    if (!proof) {
      throw new Error("A verified pre-backup receipt is required");
    }
  }
  assertOperationTransition({
    from: operation.state,
    to: input.state,
    operationCode: operation.operationCode,
    preBackupReceiptId: operation.preBackupReceiptId,
  });

  const now = Date.now();
  const summary =
    input.summary === undefined ? undefined : sanitizeReceiptSummary(input.summary);
  const failure =
    input.state === "failed"
      ? sanitizeOperationFailure(
          input.failure,
          input.failureCode ?? "SITE_OPERATION_FAILED",
        )
      : undefined;
  const receiptId = `receipt_${fingerprintCanonicalJson({
    operationKey: operation.operationKey,
    revision: operation.revision + 1,
    status: input.state,
  }).slice(0, 40)}`;

  await ctx.db.patch(operation._id, {
    state: input.state,
    revision: operation.revision + 1,
    exclusiveTargetLock: false,
    failureCode: failure?.code,
    failureMessage: failure?.message,
    completedAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("overseer_operationReceipts", {
    receiptId,
    operationId: operation._id,
    operationCode: operation.operationCode,
    websiteKey: operation.websiteKey,
    instanceKey: operation.instanceKey,
    status: input.state,
    preBackupSnapshotId:
      operation.preBackupId === undefined
        ? undefined
        : (await ctx.db.get(operation.preBackupId))?.snapshotId,
    preBackupReceiptId: operation.preBackupReceiptId,
    summaryJson: summary === undefined ? undefined : canonicalJson(summary),
    startedAt: operation.startedAt ?? operation.createdAt,
    completedAt: now,
    createdAt: now,
  });
  return { receiptId, status: input.state };
}
