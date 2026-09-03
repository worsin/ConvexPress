import {
  createHandoffBundle,
  parseHandoffBundle,
  type EnvironmentKind,
  type HandoffBundle,
} from "@convexpress/site-contract";

interface HandoffWebsiteRecord {
  websiteKey: string;
  title: string;
  primaryDomain: string;
}

interface HandoffEnvironmentRecord {
  instanceKey: string;
  kind: EnvironmentKind;
  label?: string | null;
  deploymentOrigin: string;
  managementOrigin: string;
  siteOrigin: string;
  siteContractVersion?: string | null;
  schemaVersion?: string | null;
  engineVersion?: string | null;
}

interface HandoffBackupRecord {
  instanceKey: string;
  snapshotId: string;
  checksumSha256: string;
  sizeBytes: number;
  tableCount: number;
  storageObjectCount: number;
  siteContractVersion: string;
  schemaVersion: string;
  engineVersion: string;
  verificationStatus: "pending" | "verified" | "failed" | "deleted";
  createdAt: number;
}

export interface BuildHandoffBundleInput {
  handoffId: string;
  sourceControllerId: string;
  website: HandoffWebsiteRecord;
  environments: readonly HandoffEnvironmentRecord[];
  backups: readonly HandoffBackupRecord[];
  includeSnapshots: boolean;
  includeRunbook: boolean;
  now: number;
  expiresAt: number;
}

const RUNBOOK_STEPS = [
  "Install the standalone ConvexPress control plane and create its owner account.",
  "Import this package into the organization and business that will own the website.",
  "Attach every environment using deployment credentials supplied through a separate secure channel.",
  "Verify the site contract, identity, versions, and health from the receiving control plane.",
  "Confirm the receiving controller works before revoking any prior controller authority.",
] as const;

function latestVerifiedSnapshot(
  environment: HandoffEnvironmentRecord,
  backups: readonly HandoffBackupRecord[],
): HandoffBackupRecord | null {
  const matches = backups
    .filter(
      (backup) =>
        backup.instanceKey === environment.instanceKey &&
        backup.verificationStatus === "verified" &&
        backup.siteContractVersion === environment.siteContractVersion &&
        backup.schemaVersion === environment.schemaVersion &&
        backup.engineVersion === environment.engineVersion,
    )
    .sort((left, right) => right.createdAt - left.createdAt);
  return matches[0] ?? null;
}

export function buildHandoffBundleFromRecords(
  input: BuildHandoffBundleInput,
): HandoffBundle {
  if (!Number.isSafeInteger(input.now) || !Number.isSafeInteger(input.expiresAt)) {
    throw new Error("Handoff timestamps are invalid");
  }
  if (input.environments.length === 0) {
    throw new Error("Handoff requires at least one active environment");
  }

  const environments = input.environments.map((environment) => {
    if (
      !environment.siteContractVersion ||
      !environment.schemaVersion ||
      !environment.engineVersion
    ) {
      throw new Error(
        `Environment ${environment.instanceKey} has incomplete compatibility versions`,
      );
    }
    const backup = input.includeSnapshots
      ? latestVerifiedSnapshot(environment, input.backups)
      : null;
    if (input.includeSnapshots && !backup) {
      throw new Error(
        `Environment ${environment.instanceKey} needs a current verified snapshot`,
      );
    }
    return {
      instanceKey: environment.instanceKey,
      environmentKind: environment.kind,
      label: environment.label?.trim() || null,
      deploymentOrigin: environment.deploymentOrigin,
      managementOrigin: environment.managementOrigin,
      siteOrigin: environment.siteOrigin,
      siteContractVersion: environment.siteContractVersion,
      schemaVersion: environment.schemaVersion,
      engineVersion: environment.engineVersion,
      ...(backup
        ? {
            snapshot: {
              snapshotId: backup.snapshotId,
              checksumSha256: backup.checksumSha256,
              sizeBytes: backup.sizeBytes,
              tableCount: backup.tableCount,
              storageObjectCount: backup.storageObjectCount,
              createdAt: new Date(backup.createdAt).toISOString(),
            },
          }
        : {}),
    };
  });

  return createHandoffBundle({
    handoffId: input.handoffId,
    sourceControllerId: input.sourceControllerId,
    exportedAt: new Date(input.now).toISOString(),
    expiresAt: new Date(input.expiresAt).toISOString(),
    website: input.website,
    environments,
    ...(input.includeRunbook
      ? { runbook: { version: "1.0.0", steps: [...RUNBOOK_STEPS] } }
      : {}),
  });
}

export function buildHandoffImportPlan(input: {
  bundle: unknown;
  now: number;
}) {
  const bundle = parseHandoffBundle(input.bundle);
  if (Date.parse(bundle.manifest.expiresAt) <= input.now) {
    throw new Error("Handoff package has expired");
  }
  return {
    handoffId: bundle.manifest.handoffId,
    manifestSha256: bundle.manifestSha256,
    website: bundle.manifest.website,
    environments: bundle.manifest.environments.map((environment) => ({
      instanceKey: environment.instanceKey,
      kind: environment.environmentKind,
      label: environment.label,
      deploymentOrigin: environment.deploymentOrigin,
      managementOrigin: environment.managementOrigin,
      siteOrigin: environment.siteOrigin,
      siteContractVersion: environment.siteContractVersion,
      schemaVersion: environment.schemaVersion,
      engineVersion: environment.engineVersion,
    })),
  };
}
