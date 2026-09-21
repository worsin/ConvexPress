# Broker apply: reviewed immutable authored content

Source-only implementation plan. Native apply controls stay absent and `canApply` stays false until root reviews and accepts this backend path. No full snapshot fallback, media transport, replacement dry-run, user/runtime import, or provider calls are added.

## Existing canonical target contract

`contentPromotion/operations:apply({receiptId, expectedDigest, confirmLive})` applies the saved manifest and bindings in one target mutation. It checks the target operator and identity, explicit live confirmation, ready/unexpired site receipt, and a freshly recomputed target plan. Changed target content, plugin/dependency/media state or fingerprints abort the transaction. An already-applied receipt returns its original result instead of replaying writes/hooks. The site implementation writes its backups/mappings atomically and does not enqueue outbound jobs.

`receiptStatus({receiptId})` is an authenticated query returning ready/applied/rolled-back plus exact receipt ID, digest, target instance key and expiry. It returns no mapping results. A recovered applied receipt can therefore be confirmed with mappings unknown/null; the broker must not invent IDs or call unrelated runtime APIs.

## Confirmation and durable state

Add a server-computed `reviewFingerprint` to the public preview DTO. It binds receipt ID, request hash, authority hash, manifest hash, source-revision hash, original target receipt/digest and expiry. The new apply action requires the CP receipt ID, that exact expected fingerprint, and literal `confirmLive: true`. Existing saved review rows require no rewrite.

Use a separate `overseer_contentPromotionApplies` table, one row per reviewed receipt, with operator/receipt binding, immutable confirmation fingerprint, leased attempt ownership, dispatch history, source-check timestamp, bounded sanitized failure code, optional validated mappings and terminal/uncertain result. Existing review state and its public preview-only meaning are retained. Every new registered function has finite args/return validators.

State machine: checking → submitting → applied. Pre-dispatch incompatibility can reject. A transport interruption after the durable submitting marker becomes uncertain, never a fabricated failure or success. Calls while a live lease exists return the same durable state. A stale lease can be claimed by an explicit retry/recovery action; only its current owner may dispatch or finalize. The original site receipt/digest never changes. There is no scheduler retry and no new dry-run behind an existing confirmation.

## Reconciliation and authority

Before first dispatch: reauthorize the initiating operator for source/target read, promote and administer plus production operation; verify same active website, exact instance/deployment/site identity, schemas and stored credential authority; require genuinely reviewed/unexpired receipt with no issues and all reviewed bindings. Exchange the existing signed source/target administrator sessions and verify their audience, capabilities and expiry. Re-export the exact original selection and compare the validated manifest and canonical record-revision fingerprints against the reviewed projection. Transport download URLs are discarded and do not enter these hashes. Manifest identity, selection, authored values, dependencies and media metadata remain bound. Original bindings remain private and immutable. Canonical exporter source revisions currently hash source rows, so operational/timestamp changes can conservatively require a fresh review even when authored values are unchanged; this implementation does not loosen those existing revisions.

Immediately before transport, a mutation checks current lease, authorization, exact reviewed authority/identity and expiry again, then durably marks submitting. The target's atomic apply provides the final optimistic target checks. Source and target cannot share a transaction: an edit after the last source export is not atomically prevented; the authorized immutable reviewed snapshot is what can be applied. Record the source-check time and disclose this limit.

Recovery queries the original target receipt first. Exact applied status confirms success without another write; rolled-back status is reported distinctly. Ready status permits only a rechecked retry of the same target receipt while the original CP review and authority remain valid. Recovery after review expiry or credential rotation may read and confirm a prior outcome under current RBAC and unchanged identities, but cannot dispatch again. If status cannot establish an outcome, preserve uncertainty. A missing, mismatched or expired-ready status never proves an earlier mutation did not commit. Changed identity or revoked access blocks recovery until an authorized operator restores the exact valid context; stale stored endpoint credentials are never used as a bypass.

The target apply response and recovery status must match exact receipt/digest/identity. Mappings must be complete, unique, of the reviewed kinds and keys, and bounded. Session material must never appear in persisted outputs or error details. Canonical HTTPS transport remains redirect-disabled, bounded and timed out.

## Verification targets and limits

Real registered-handler regressions: no confirmation/wrong fingerprint, blocked/expired review, wrong operator/revoked scope, source revision/selection/dependency/media drift, unchanged export with changing download URLs, optimistic target rejection, duplicate/concurrent calls, stale lease before dispatch, lost response after successful target commit, CP acknowledgement loss, status-first recovery, uncertain status, safe exact retry, recovery after expiry/rotation without dispatch, exact mapping validation and token/error redaction. Preserve preview tests and no outbound/snapshot behavior.

This slice supports only already resolved reviewed dependencies/media. It does not add transfer, apply UI, retention cleanup, a rollback broker, large-graph chunking, automatic retries or new content adapters. Limits remain 100 records / 500 KB manifest, 100 reviewed media bindings / 200 dependency bindings, and existing canonical unsupported-model refusals.

## Implemented outcome refinement

An explicit known atomic refusal is terminal only when it came from the exact first target apply RPC. Controller finalization errors are never used as evidence of target refusal. A prior interrupted source read does not count as a target dispatch; the persisted dispatch count distinguishes those histories. Outcome/verification: [content-promotion-broker-apply-outcome.md](content-promotion-broker-apply-outcome.md).
