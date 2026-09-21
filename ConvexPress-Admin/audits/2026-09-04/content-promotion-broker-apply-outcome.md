# Authored-content broker apply checkpoint

Implemented and verified in source. Design: [content-promotion-broker-apply-design.md](content-promotion-broker-apply-design.md). This agent performed no live API calls, deployment, browser/native operations, commit, or push. Root owns code review, deployment and live authoritative acceptance. The native UI remains preview-only with `canApply: false` and no apply button.

## Public API and confirmation

Preview/get now return a server-computed `reviewFingerprint`. It binds the CP receipt ID, request/authority/manifest/source-revision hashes, original private target receipt/digest and expiry. Clients copy this value rather than reconstructing a private digest.

```ts
const review = await control.query(api.contentPromotion.records.get, { receiptId });
// Run only after explicitly confirming this exact ready review for production.
const result = await control.action(api.contentPromotion.apply.execute, {
  receiptId: review.receiptId,
  expectedReviewFingerprint: review.reviewFingerprint,
  confirmLive: true,
});
// Explicit readback; no automatic retry or write is hidden in this query.
const state = await control.query(api.contentPromotion.applyRecords.get, {
  receiptId: review.receiptId,
});
```

Reusing execute with the same confirmation performs idempotent status-first recovery or an eligible retry; it never makes a replacement dry-run. A changed fingerprint, blocked/unready receipt, expired first attempt, different operator, changed identity or denied current scope is refused. Target receipt IDs/digests remain private. No media upload or new dependency binding arguments are accepted by execute: only the reviewed, immutable bindings can be applied.

## Durable outcomes

New table: `overseer_contentPromotionApplies`, uniquely selected by reviewed receipt. It records operator/fingerprint, status, leased attempt ownership, attempt and dispatch counts, source-check/dispatch/finish timestamps, sanitized failure code and optional validated mappings. Schema indexes are `by_receipt` and `by_operator`. No existing review rows need migration.

States are `checking`, `submitting`, `uncertain`, `applied`, `rejected` and `rolled-back`. Each explicit attempt takes a 120-second lease. Concurrent calls return the current record; a stale lease can be claimed and old owners cannot dispatch or finalize. A mutation rechecks current RBAC, exact identities, original credential authority, expiry and the reconciled source manifest before writing the durable submitting marker.

The action first queries the original target receipt. An exact applied/rolled-back status establishes the prior outcome without a write or source re-export. A ready status permits a source re-export and possible retry only while the original review and authority still qualify. Unknown/missing/mismatched status after prior dispatch stays uncertain. Expired review or credential rotation can permit authenticated read-only recovery under unchanged identities, but never another dispatch. Revoked permissions or changed identities block access until an authorized operator restores the exact valid context.

Only the canonical target apply RPC's explicit atomic refusal from its first dispatched call proves a post-dispatch rejection. A CP finalization/acknowledgement failure cannot be confused with that proof. Prior ambiguous dispatches remain uncertain until target status establishes an outcome. Pre-dispatch source drift, expiry or invalid identity can reject without a write. Transient pre-dispatch transport errors permit a fresh explicit attempt.

Successful direct responses have complete unique mappings validated against the reviewed keys/kinds. Recovery through receiptStatus reports `mappings: null` because that endpoint does not return mappings. The broker does not invent target IDs. `applied` is the last authoritatively confirmed outcome, not continuous monitoring of subsequent direct target changes/rollback.

## Source and target reconciliation

The source re-export uses the original selection. Strict schema validation and exact manifest/revision fingerprints bind authored values, source/target identity, selection, dependencies and media metadata. Generated download URLs are discarded before hashing; a changing signed URL does not invalidate the reviewed snapshot. Tokens are audience/capability/expiry checked and never persisted. Transport is normal authenticated public site APIs only, HTTPS with redirects disabled, bounded responses and timeouts. Clients clear auth after use.

Canonical target apply remains the write authority. It rechecks the target plan, identities, permissions, plugin/dependency/media state and before-revision fingerprints in the same transaction as authored writes/backups/mappings. It reuses an applied receipt without replaying writes. Existing target inventory, users, grants, enrollments, orders, payments, provider identities and queues retain the existing adapter protections. This broker has no snapshot, file-transfer, provider, scheduler or hook-replay path.

## Verification

- **108 tests / 607 assertions / 10 files pass**, including broker preview/apply, signed-session policy, authorization/schema, canonical target promotion handlers and native preview parsing/rendering. `/tmp/promotion-apply-integrated-tests-complete.log`.
- Apply-specific coverage: **23 tests / 153 assertions**. Actual registered CP handlers exercise leases, confirmation, drift, retries, malformed mappings, privacy, expired/rotated recovery and revoked-operator recovery.
- Chain tests invoke actual canonical target dryRun/apply/receiptStatus through Convex's test runtime: a committed mutation with lost response produces one target page and one site receipt; users remain unchanged, orders/jobs remain empty. A production editorial change made after review remains intact after a rejected apply. Verified pre-existing target storage is reused; deleting that blob after review rejects without recreating storage/media/pages.
- The registered public apply action runs its real ConvexHttpClient path against offline intercepted responses. The only site operations are receiptStatus query, exportManifest query and apply mutation with exact original receipt/digest, scoped bearer and redirect rejection.
- Captured failing regressions fixed: `/tmp/promotion-apply-ack-refusal-red.log` (CP finalization refusal falsely became target rejection), `/tmp/promotion-apply-preflight-retry-red.log` (a prior source-read interruption obscured a later definitive first target refusal).
- CP typecheck `/tmp/promotion-apply-cp-types-complete.log`, process 76074, exit 0. Admin web typecheck `/tmp/promotion-apply-admin-types-final.log`, process 40500, exit 0.
- CP bindings generated and verified offline: **107 modules / 2 components**. Global `git diff --check` passes. No site backend or compact Website contract edits are required by this slice.

## Deployment and explicit limits

### Root cloud acceptance, September 5

The controller apply table/functions and new connection signed verification were deployed successfully. A fresh ready review `p971mrm9j6jwvhhby1vfdd27wh8dtrfw` contained only the fictional staging Materials and care draft. The target slug was absent before application. Apply `pd70d5cd70p107n9tdqdy6bz2d8dtq2d` created production draft `x17xawwc9skr1vpfexpn2rsv3d8dt633`; direct authenticated target reads matched its reviewed article JSON exactly, including the bold first paragraph. Repeating the exact confirmation returned the same apply record and one dispatch, and target content remained byte-for-byte unchanged. Durable controller readback also reports applied. Evidence: `output/aster-house/content-promotion/cloud-apply-acceptance.json`. No production Worker was published. Native apply UI, live conflict/recovery, media transfer and rollback remain pending.

The initial controller deployment and small reviewed apply/readback/retry acceptance are complete as recorded above. Canonical site APIs already support the required receiptStatus/apply semantics. No native apply controls have been activated. A separate target conflict and an authoritative recovery case remain live acceptance work.

- Source and target cannot share a transaction. An edit after the final source read is not atomically prevented; the already confirmed immutable reviewed snapshot is what the target applies. `sourceCheckedAt` records the broker's final reconciliation time.
- Canonical source revisions currently hash source rows, so source operational/timestamp-only changes can conservatively require a new review. This patch does not weaken those revisions.
- A prior dispatch with an unreachable/unknown target or an expired still-ready receipt may remain uncertain. Expiry is not proof that a timed-out mutation never committed. No automatic retry, cancellation, replacement dry-run or snapshot fallback hides that uncertainty.
- Verified media transfer, dependency-binding UI, apply/rollback UI, broker rollback orchestration, receipt retention and large-graph jobs remain outside this slice. Limits remain the existing 100-record / 500-KB manifest and bounded bindings. Existing unsupported catalog/learning/block model refusals remain intact.


## Root live target-conflict acceptance

Root deployed the broker and confirmed a care-draft apply/readback with one dispatch and idempotent retry (`output/aster-house/content-promotion/cloud-apply-acceptance.json`). Editing the production target after review then correctly rejected the old receipt with `PROMOTION_CONFLICT`, preserving the production edit (`output/aster-house/content-promotion/cloud-target-conflict-acceptance.json`). Native apply confirmation, cancellation, saved-result reopening and blocked-media acceptance are recorded in `content-promotion-native-apply-outcome.md`. These live actions were performed by root.
