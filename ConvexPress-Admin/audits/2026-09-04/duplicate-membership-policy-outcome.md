# Duplicate membership policy preservation — source gate

The duplicate operation now snapshots the source document's membership requirements onto the new document while retaining the evaluator's group boundaries. Root integrated the helper into the actual duplicate transaction; this subtask did not edit the duplicate handler.

## Semantics

- The optional `membership_restriction_rules.policyGroup` identifies independent groups. Every group must pass; `allow_only` alternatives within one group remain ORed. An absent group retains exactly the old evaluator path and decision payload. No existing rows require backfill.
- Direct source rules retain their existing groups. Each canonical source route, including its matching exact/wildcard rules, is copied into distinct noncolliding document-scoped groups. A reading-settings homepage alias contributes another independent group. Repeated duplication preserves existing group boundaries.
- Source URL enumeration is shared with `contentMembershipAccess`, retaining both current and legacy reading-settings semantics. Matching and specificity order reuse the existing membership implementation. No global route rule is edited, and no caller entitlement is used to decide which requirements to copy.
- `prepareContentRestrictionCopy` reads through the existing indexed, complete-page policy queries. It accepts the duplicate transaction's remaining row/byte budget and returns policies plus accounted bytes. The helper also caps copied policies at 256 rows / 512 KiB. The parent handler accounts these before subsequent related reads and performs all writes in one transaction.
- The policy read DTO and strict shared promotion authored-data schema retain `policyGroup`. The existing schema-driven exporter/apply projections and whole-row rollback therefore retain it. Public rule edits use patches and retain omitted fields; supported copies, exports and updates do not silently flatten groups.

## Evidence

- The pure regression first failed: a principal with only plan A satisfied independent A and B/C allow-only groups. It now requires A AND (B OR C).
- Real registered duplicate and public page-read handlers prove anonymous body denial, direct-only denial, exact/wildcard alternatives, an independent homepage requirement, and repeated duplication. Published status changes in these tests are explicit fixture operations, not live publication.
- Row/byte limits and an incomplete 257-route source policy page refuse without a new draft or event. Existing duplicate tests additionally cover aggregate metadata limits and stale custom-field media rollback.
- Membership/group/public-copy plus root duplicate tests: **26 tests / 87 assertions pass**, `/tmp/policy-copy-tests.log`.
- Promotion suite: **38 tests / 236 assertions pass**, `/tmp/policy-copy-promotion-tests.log`, including grouped policy export, target apply, mapped update, exact retry and whole-row rollback.
- Backend TypeScript passes, `/tmp/policy-copy-backend-types.log`. Four new files formatted; global diff whitespace check passes.
- Read-only scoped lint reports zero errors and three unused destructuring warnings (two excluded resource identity fields in the helper and one excluded group field in a test). Source was held for root's deployment snapshot before these cosmetic aliases were changed.

## Deployment and limits

Runtime and schema are held for root's final generation/deployment. The optional site schema field and shared control-plane promotion parser must deploy compatibly; no data migration, permission relaxation, new registered endpoint or automatic publication is introduced. This subtask made no provider or live calls. Native/cloud acceptance remains root-owned.

This copies the current source policy snapshot; later changes to a source route do not rewrite an existing copy. New target route policy still applies independently in the public reader. Existing unmapped multi-rule target collections cannot be guessed by the promotion planner's prior single-resource fallback; authoritative mapping updates and new grouped collections are tested, while unrelated preexisting target collections remain a conflict/lookup limitation rather than being merged or weakened.
