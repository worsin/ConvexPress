import {
  fingerprintCanonicalJson,
  OPERATION_CODES,
  parseContractVersion,
  type OperationCode,
} from "@convexpress/site-contract";

type SnapshotVersions = {
  siteContractVersion: string;
  schemaVersion: string;
  engineVersion: string;
};

export function assertSnapshotCompatibleForTarget(input: {
  source: SnapshotVersions;
  target: SnapshotVersions;
}): void {
  const checks = [
    ["site contract", input.source.siteContractVersion, input.target.siteContractVersion],
    ["schema", input.source.schemaVersion, input.target.schemaVersion],
    ["engine", input.source.engineVersion, input.target.engineVersion],
  ] as const;
  for (const [label, source, target] of checks) {
    try {
      if (parseContractVersion(source).major !== parseContractVersion(target).major) {
        throw new Error("mismatch");
      }
    } catch {
      throw new Error(`Snapshot ${label} version is incompatible with the target`);
    }
  }
}

const EXCLUSIVE_TARGET_OPERATIONS = new Set<OperationCode>([
  OPERATION_CODES.deploy,
  OPERATION_CODES.backupCreate,
  OPERATION_CODES.clone,
  OPERATION_CODES.promote,
  OPERATION_CODES.restore,
  OPERATION_CODES.credentialRotate,
  OPERATION_CODES.authorityGrant,
  OPERATION_CODES.authorityRevoke,
  OPERATION_CODES.handoffExport,
]);

const PRE_BACKUP_OPERATIONS = new Set<OperationCode>([
  OPERATION_CODES.clone,
  OPERATION_CODES.promote,
  OPERATION_CODES.restore,
]);

type EnvironmentKind =
  | "live"
  | "staging"
  | "beta"
  | "preview"
  | "development"
  | "local"
  | "custom";

export function isExclusiveTargetOperation(
  operationCode: OperationCode,
): boolean {
  return EXCLUSIVE_TARGET_OPERATIONS.has(operationCode);
}

export function requiresVerifiedPreBackup(
  operationCode: OperationCode,
): boolean {
  return PRE_BACKUP_OPERATIONS.has(operationCode);
}

export function expectedLifecycleConfirmation(input: {
  operationCode: OperationCode;
  targetInstanceKey: string;
}): string | undefined {
  if (input.operationCode === OPERATION_CODES.restore) {
    return `RESTORE ${input.targetInstanceKey}`;
  }
  if (input.operationCode === OPERATION_CODES.promote) {
    return `PROMOTE TO ${input.targetInstanceKey}`;
  }
  return undefined;
}

export function assertLifecycleRequestSafety(input: {
  operationCode: OperationCode;
  targetInstanceKey: string;
  targetKind: EnvironmentKind;
  sourceInstanceKey?: string;
  snapshotId?: string;
  confirmation?: string;
}): void {
  if (
    (input.operationCode === OPERATION_CODES.clone ||
      input.operationCode === OPERATION_CODES.promote) &&
    input.sourceInstanceKey === input.targetInstanceKey
  ) {
    throw new Error("Lifecycle source and target environments must be different");
  }

  if (
    input.operationCode === OPERATION_CODES.clone &&
    input.targetKind === "live"
  ) {
    throw new Error("Clone destinations must be non-live environments");
  }

  if (
    input.operationCode === OPERATION_CODES.promote &&
    input.targetKind !== "live"
  ) {
    throw new Error("Promotion requires a live destination");
  }

  if (
    (input.operationCode === OPERATION_CODES.clone ||
      input.operationCode === OPERATION_CODES.promote) &&
    !input.sourceInstanceKey
  ) {
    throw new Error("Lifecycle source environment is required");
  }

  if (input.operationCode === OPERATION_CODES.restore && !input.snapshotId) {
    throw new Error("Restore snapshot is required");
  }

  const expected = expectedLifecycleConfirmation(input);
  if (expected !== undefined && input.confirmation !== expected) {
    throw new Error(`Type ${expected} to confirm this operation`);
  }
}

export function createOperationFingerprint(input: {
  operationCode: OperationCode;
  websiteKey: string;
  targetInstanceKey: string;
  sourceInstanceKey?: string;
  snapshotId?: string;
  includeStorage?: boolean;
  includeRunbook?: boolean;
  expiresInMs?: number;
}): string {
  return fingerprintCanonicalJson({
    expiresInMs: input.expiresInMs ?? null,
    includeRunbook: input.includeRunbook ?? null,
    includeStorage: input.includeStorage ?? null,
    operationCode: input.operationCode,
    snapshotId: input.snapshotId ?? null,
    sourceInstanceKey: input.sourceInstanceKey ?? null,
    targetInstanceKey: input.targetInstanceKey,
    websiteKey: input.websiteKey,
  });
}
