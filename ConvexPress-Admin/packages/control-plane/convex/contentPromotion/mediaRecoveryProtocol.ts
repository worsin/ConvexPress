import { canonicalJson, sha256Hex } from "@convexpress/site-contract";
export type RecoveryEvidence = {
	transferKey: string;
	targetIntentId: string | null;
	storageId: string | null;
	phase: "planned" | "uploading" | "uploaded" | "verified" | "uncertain";
	dispatchCount: number;
	leaseExpiresAt: number;
};
export type TargetEvidence = {
	intentId: string;
	storageId: string | null;
	status: "issued" | "verified";
};
/** Lease expiry can permit reconciliation of existing bytes, never a new upload. */
export function recoveryDisposition(
	row: RecoveryEvidence,
	target: TargetEvidence | null,
	now: number,
): "busy" | "unresolved" | "known-storage" | "verified" {
	if (
		target &&
		(row.targetIntentId !== target.intentId ||
			(row.storageId && target.storageId && row.storageId !== target.storageId))
	)
		throw new Error("MEDIA_RECOVERY_EVIDENCE_CHANGED");
	if (row.leaseExpiresAt > now) return "busy";
	if (target?.status === "verified" && target.storageId) return "verified";
	if (row.targetIntentId && row.storageId && row.dispatchCount === 1)
		return "known-storage";
	return "unresolved";
}
export function recoveryEvidenceHash(row: RecoveryEvidence): string {
	return sha256Hex(
		canonicalJson({
			transferKey: row.transferKey,
			targetIntentId: row.targetIntentId,
			storageId: row.storageId,
			phase: row.phase,
			dispatchCount: row.dispatchCount,
		}),
	);
}
