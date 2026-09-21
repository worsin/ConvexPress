# Proposed recovery of media transfers across operators — 2026-09-05

Status: design only, pending root review. No recovery API, table, permission, or native control is activated by this proposal.

## Current evidence and boundary

`control-plane/convex/contentPromotion/mediaTransferRecords.ts` checks the immutable blob identity and `row.operatorId === current operator`. Target `backend/convex/contentPromotion/mediaUploads.ts` additionally checks the authenticated target-site user against the intent creator. The shared transfer key omits review and operator IDs to prevent duplicate POSTs across reviews. Together these controls intentionally stop a second operator at both layers, even if the first operator has left. Changing only the controller owner check would leave the target blocked; removing either check without a replacement would weaken provenance.

Root reports the initial live flow verified one POST, zero authored media rows before Apply, then one authored media row after a new review and a separate Apply. Final repeat/readback evidence remains root-owned. This proposal extends recovery of existing bytes, not upload availability or authored Apply.

## Recommended design: audited grants per new review

Retain the original creator on both existing transfer and target intent rows. Add append-only recovery receipts and narrowly scoped grants for another currently authorized operator. Do not reassign ownership: exclusive custody switching across two deployments can strand both operators after a partial failure. A grant permits only scoped inspection and reconciliation of existing bytes; it never supplies general site permissions.

The beneficiary must first create their own fresh normal source-to-target preview. The new review must contain the exact source and target website/instance/deployment identities, source media identity and immutable byte hash/size/MIME. It can remain blocked because those bytes have not yet been bound; unrelated plugin/dependency conflicts remain visible. The beneficiary cannot adopt someone else's review, use its authored payload, or change its fingerprint. Fresh source re-export must match the new review's stable authored projection, revisions, selection and dependencies; generated download URLs and transport timestamps are excluded from this comparison as in normal Apply.

Authorization remains current on every inspection, confirmation and recovery call: controller `site.read`, `site.promote` and `site.administer` for both instances, plus `environment.live.operate` on the live target; fresh signed site sessions and the target's `manage_options` and `media.upload` capabilities. Same website, distinct staging/live instances, version compatibility, healthy identity and signed authority remain mandatory. No client-supplied beneficiary IDs, URLs or storage IDs are accepted. The authenticated controller and target-site principals identify the beneficiary independently.

## Concrete protocol

1. **Inspect recovery.** Accept the new own review ID, its server-issued fingerprint, and reviewed media key. Resolve the global transfer identity internally. Return bounded status/provenance and whether existing bytes can be reconciled. Do not expose the previous operator's other records, original manifest, signed credentials, upload token or raw failure messages. A target-only authenticated inspection endpoint may reveal only the exact matching intent/spec and verified evidence to a currently privileged site operator. It must not enumerate storage.
2. **Prepare an immutable recovery receipt.** Bind the own review/fingerprint, blob key, target intent identity, existing recorded storage evidence (if any), original creator IDs, current beneficiary IDs, authority hashes, server evidence digest, reason (bounded plain text), expiry and idempotency key. Record the current phase and dispatch count. UI confirmation names the destination and explains that it reuses existing stored bytes; there is no upload or Apply in this operation.
3. **Confirm recovery explicitly.** Accept only the receipt ID and exact server evidence fingerprint plus explicit acknowledgement. Reauthorize and repeat source/target evidence checks. Reject while an existing transfer lease is active. Atomically serialize the controller confirmation and compare the expected evidence. A changed storage ID, identity, spec, phase or authority requires refreshed inspection rather than silently confirming different work.
4. **Grant at the target.** Through the fresh signed management session, atomically create an idempotent grant for the authenticated target user, exact existing intent/blob evidence, and confirmation identity. Target metadata must still match SHA-256, bytes and MIME. Preserve creator, intent status and storage ID. Append an audit event with both principals and reason. The target must never bind a user-selected storage ID or issue an upload URL for this operation.
5. **Acknowledge in the controller.** Persist the target grant identity/evidence and activate the controller grant for the current actor and own review/fingerprint. Append a matching audit event. Keep original review, transfer creator, dispatch count and storage evidence intact. Each subsequent recovery reauthorizes and checks both grant scopes plus the unchanged blob identity.
6. **Reconcile, then review separately.** Use the existing global lease and same known storage ID to finish target/controller verification, or discover already verified target evidence. Once verified, generate a NEW normal dry-run/review receipt using the bound media. Apply remains a separate explicit reviewed confirmation. Neither adoption nor reconciliation authors media rows, fires processing hooks or enables plugins.

## State-specific rules

| Existing state | Permitted initial recovery | Never permitted |
| --- | --- | --- |
| Verified target intent and actual matching storage | Grant scoped reuse, refresh controller evidence, then new normal review | Another POST or altered storage binding |
| Controller has durably recorded storage ID, target completion pending | Grant and complete that same ID after actual target metadata verification | Caller-provided replacement ID |
| Controller ID absent, target intent already verified | Discover only that exact intent's verified ID, record it and reconcile | Storage scan or guessed ID |
| Dispatched, unknown ID, target intent still issued | Status-only receipt with explicit unresolved possible orphan; later recheck may find target verification | Lease-expiry reset, another POST, cleanup or fabricated completion |
| Active lease | Show busy and retry status later | Taking over in-flight dispatch or completion |
| Planned and never dispatched, no existing bytes | Outside this initial recovery slice | Treating recovery consent as first-upload permission |

The last two unresolved states remain bounded limitations. Grant creation does not make an unknown-ID upload recoverable or prove that no POST happened. The global fence survives every new actor, review, grant and expired lease. The initial cloud-origin/image/cap restrictions remain unchanged.

## Durability, concurrency and audit

Use separate bounded recovery receipt/grant records rather than appending an unbounded list to a transfer row. Index by transfer key + beneficiary + review identity and by immutable recovery request identity; enforce uniqueness transactionally. Persist original creator and the actual currently associated receipt reference in audit. The existing controller `receiptId` changes across claims, so old rows must not be mislabeled as providing the original first review; add future creation provenance only when it is actually known.

Target grant creation and its audit are one transaction. An uncertain target response retries or queries that exact recovery identity; it never requests an upload. Controller completion uses the same identity. A committed target grant without controller acknowledgement does not permit controller work. Recovery grants only relax the creator equality check for their exact beneficiary and scope; current permissions, identity/spec checks, global lease and dispatch fence still apply.

Grants are shared authorization records, not exclusive ownership. Concurrent qualified operators may receive their own grants; execution still uses one global lease and immutable storage binding. A departing actor's pending receipt cannot hold exclusive custody forever. Revoking either actor's actual permissions immediately prevents future use even if grant provenance remains. The original authorized operator can continue their own work without impersonating the beneficiary. New reviews require a fresh scoped recovery confirmation; expired recovery receipts cannot activate grants. Authorized read-only status may remain available after expiry, as with existing uncertain-operation recovery.

Audit data is bounded and contains no bearer, raw upload URL, binary data or authored manifest. Record attempted/confirmed/reconciled/refused outcomes with safe reason codes. Define audit retention separately; do not garbage-collect global dispatch fences as part of receipt expiry.

## Required offline acceptance before activation

- Distinct controller and target principals: operator B cannot use operator A's review or baseline owner path; B's own fresh review and full current permissions permit only an explicit scoped grant.
- Wrong website/instance/deployment, source hash/revision/media mismatch, expired review, disabled/mismatched version, insufficient or revoked scope fail without transfer changes.
- Original creator and all original review bytes/fingerprints remain unchanged. Audit binds both actors, exact new review and target evidence.
- Verified reuse and known-ID completion produce zero native POSTs and zero authored records, jobs or Apply calls. Normal new review and separate Apply still enforce their existing protections.
- Concurrent grants and original-owner recovery share the global lease. A second confirmation cannot overwrite target evidence or reset dispatch count. Active lease refuses confirmation; expiry never authorizes POST.
- Lost target grant, controller grant and completion acknowledgements reconcile the same IDs. Actor B leaving mid-grant does not strand authorized actor C.
- Unknown-ID uncertainty remains unresolved across actor changes and new reviews unless the exact target intent later reports verified evidence. No enumeration, arbitrary IDs, deletion or upload URL issuance is available.
- Revoke beneficiary access between every distributed step; fail closed while retaining audit and dispatch evidence. A stored grant never substitutes for fresh permissions.
- Return validators and public DTO tests prove that only bounded validated recovery metadata is returned and prior authored payloads/credentials cannot be echoed.

Initial implementation should remain backend-only until root reviews its source, handler proofs and live recovery acceptance. Native activation is a separate slice.
