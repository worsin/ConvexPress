# Control-plane authored-content promotion preview/review

Implemented and tested in source. No live calls, deployment, browser/native operations, commit or push were performed by this agent. Design: [content-promotion-broker-design.md](content-promotion-broker-design.md).

## Public contract

`api.contentPromotion.review.preview` accepts:

```ts
{
  sourceConnectionId, // CP overseer_connections ID, staging
  targetConnectionId, // same website, live
  requestKey,          // stable 8–100 character [A-Za-z0-9_-] idempotency key
  selection: {
    pageIds: [], postIds: [], menuIds: [], mediaIds: [], eventIds: [],
    // Optional: productIds, productCategoryIds, courseIds, planIds
    includePresentation: false,
  },
  mediaBindings: [],      // { key, storageId } for existing target uploads
  dependencyBindings: [], // { key, targetId } for explicit existing target dependencies
}
```

The result is an operator-bound receipt view. `api.contentPromotion.records.get({receiptId})` returns that same authorized view: source/target identities, connection IDs, request/authority/manifest/source-revision hashes, status and expiry, incoming allowlisted authored records, changed fields, issues, required/provided media counts, media readiness and review readiness. **`canApply` is always false.** There is no broker apply endpoint or apply transport. Native review can display actual incoming authored values, not merely counts. Before-value diffs are not yet exposed by the site dry-run API.

The raw transport-manifest JSON, target site receipt handle/digest, controller credentials, session tokens and source download URLs remain private. Authored record projections are safe validated content for an operator who must currently hold source and target administration/promotion access. Query access is also restricted to the initiating operator. Unknown remote error messages are never logged, returned or persisted; a small known-code allowlist retains useful unsupported-adapter/permission/plugin failure codes without their remote body.

## Authority and transport

Both environments must be active, connected and provisioned/compatible instances of the same active ConvexPress website, with matching hierarchy stamps and schema versions. Source is staging, target is live, and instance/deployment identities must differ. This transport accepts canonical paired `https://<deployment>.convex.cloud` / `.convex.site` origins and a canonical HTTPS site origin. Self-host/custom management transports fail explicitly and need a separate adapter.

Stored CP RBAC checks source and target `site.read`, `site.promote`, `site.administer`, plus `environment.live.operate` on the target. The existing `siteBroker.session.exchange` performs its signed controller exchange and its own current authorization checks; the new broker does not mint alternate credentials. Requested administrator sessions carry `session.exchange`, `site.select`, and `site.promote`. Session audience, role, capabilities, site origin and expiry are checked before remote content calls.

Remote content calls use ordinary authenticated `ConvexHttpClient` APIs with bearer operator sessions: source `contentPromotion/operations:exportManifest`, then target `contentPromotion/operations:dryRun`. No admin authentication, direct database access, snapshot export/import, user/runtime-data import, or apply call exists in this path. Site handlers independently enforce authoring permissions, plugins, model compatibility, dependency identities and uploaded-media hashes. HTTP requests cannot redirect, must stay on the exact expected origin/query-or-mutation path, have a 15-second deadline, and cap streamed responses at 2 MB. Echoed session material is rejected before forwarding an exported manifest to the target and before persisting a review response.

## Durable review state

Added one CP table, `overseer_contentPromotionReviews`, with operator/request and operator/time indexes. Each receipt stores a maximum 100 KB request, 500 KB authored manifest and 250 KB review result. Begin validates the request and connection authority before allocation. Exact retry returns existing state without issuing sessions again; request-key reuse for different arguments, changed authority or expiry fails and requires a new key. A concurrent `reviewing` receipt is reported instead of duplicated.

Review TTL is 10 minutes. Finalization re-resolves current authorization and connection identity after remote work, checks exact manifest source/target/selection, refuses omitted explicitly selected records, mismatched record kinds/fields and false media-ready claims, and captures immutable hashes. Credential rotation changes the authority hash without invalidating reviews merely because health polling updated timestamps. Identity changes surface as conflict; expired receipts cannot report ready media or apply readiness. Generic failures are durable; an operator whose authentication is revoked may leave an inaccessible `reviewing` row that expires rather than allowing unauthorized finalization.

Missing target uploads produce a durable blocked review with media issues. The broker accepts already uploaded target media bindings and delegates actual byte verification to the canonical site dry-run. It does not copy/upload files in this phase. Review is a point-in-time authored snapshot, not an apply guarantee; target/source changes after review require future apply-time reconciliation.

## Verification

- **38 tests /164 assertions pass** across four CP test files (`/tmp/promotion-broker-integrated-tests-final.log`), including **13 focused broker tests /79 assertions** plus existing signed-session policy, authorization lifecycle and schema checks.
- A registered preview-handler test runs the normal HTTP client through intercepted offline responses and proves the only public site calls are export query and dry-run mutation with bearer sessions and redirects disabled. This is offline transport/handler proof; existing exchange is reused, and no live signature/session exchange was performed.
- Regressions cover idempotent retry; cross-website/same-instance/wrong-kind/version/revoked-connection/restricted-operator refusal before exchange; request collisions; credential changes during review; receipt privacy; expiry; missing media; source identity substitution; false readiness; wrong record kinds; omitted selected content; secret echoes and remote errors; oversized streaming bodies and wrong destinations.
- Genuine failing regressions captured before fixes: `/tmp/promotion-broker-red.log` (wrong returned record kind), `/tmp/promotion-broker-secret-media-red.log` (secret forwarding / false media readiness), `/tmp/promotion-broker-selection-red.log` (omitted selected content). All are covered by the passing suite.
- CP API bindings generated and checked offline: **103 modules /2 components**. No site API/compact regeneration was needed. Existing full snapshot replacement guards remain untouched.
- Final CP and Admin typechecks both pass (`/tmp/promotion-broker-types-complete.log` and `/tmp/promotion-broker-admin-types-complete.log`, exit 0). Generated binding check and global `git diff --check` pass. All verification processes completed.

## Remaining work and deployment prerequisite

Root must deploy the updated control-plane schema/functions and ensure the canonical site promotion APIs are deployed to both environments before live preview acceptance. Native UI wiring, verified/resumable media transfer, before/after value diffs, durable apply authorization/reconciliation, receipt-retention cleanup and large-graph job orchestration remain. The broker has no automatic expired-review retries, no apply, no rollback orchestration, and no snapshot fallback. Existing site adapters retain all their explicit unsupported model refusals and operational-data boundaries.

## Follow-up: native review and finite return DTO (2026-09-05)

Native preview wiring and strict return validators are now implemented and tested; see [content-promotion-native-review-outcome.md](content-promotion-native-review-outcome.md). Public `authoredRecords` entries now expose validated `dataJson` instead of arbitrary nested `data`; private manifest storage is unchanged. Every registered broker endpoint has an explicit finite return validator, including literal `canApply: false`. Deploy CP before accepting the new native view. The follow-up integrated suite passes 51 tests / 237 assertions; both CP and Admin types pass; bindings are 104 modules / 2 components. Media transfer, apply orchestration and other limitations above remain.
