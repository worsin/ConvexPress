/** Full database copies are not content promotion. Keep this guard independent
 * of UI controls and workflow checkpoints so old queued work cannot bypass it. */
export const FULL_REPLACEMENT_DISABLED =
  "Full snapshot replacement between environments is disabled. Content promotion and cross-environment cloning require an explicit data-isolation policy. Same-environment disaster restore remains available.";

export function assertFullSnapshotOperationAllowed(operationCode: string): void {
  if (operationCode === "site.clone" || operationCode === "site.promote") {
    throw new Error(FULL_REPLACEMENT_DISABLED);
  }
}

type SnapshotIdentity = {
  websiteId?: unknown;
  instanceId?: unknown;
  websiteKey?: unknown;
  instanceKey?: unknown;
  environmentKind?: unknown;
};

export function assertSameEnvironmentRestore(source: SnapshotIdentity, target: SnapshotIdentity): void {
  for (const field of ["websiteId", "instanceId", "websiteKey", "instanceKey", "environmentKind"] as const) {
    if (typeof source[field] !== "string" || !source[field] || source[field] !== target[field]) {
      throw new Error("Full snapshot restore requires verified identity from the same environment. Select a backup of this exact environment; cross-environment and unknown-source imports are disabled.");
    }
  }
}
