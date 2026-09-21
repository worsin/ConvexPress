/** A learner can recover a progress rollback, never an administrator decision.
 * Legacy revocations without explicit provenance require the admin reissue path. */
export function canResumeProgressRevocation(issue: {
  status: "issued" | "revoked";
  revocationKind?: "progress" | "administrator";
  revokedBy?: string;
}): boolean {
  return issue.status === "revoked" && issue.revocationKind === "progress" && !issue.revokedBy;
}
