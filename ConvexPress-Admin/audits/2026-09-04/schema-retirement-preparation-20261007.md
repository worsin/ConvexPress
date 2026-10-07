# Candidate gates and legacy live-field retirement preparation

This is the preparatory checkpoint. Installed cleanup is subsequently verified in [schema-retirement-stage-a-20261007.md](./schema-retirement-stage-a-20261007.md); schema contraction remains open.

The completion audit found a real gap in the earlier Task4 acceptance. The block handoff §3.8/Phase2 requires removal of the obsolete live `posts.content`, `contentMode` and `pageSections` columns after conversion. They remain declared, and canonical writers re-created empty `content`. Existing corpus conversion, immutable original snapshots and native/public evidence remain valid; they do not establish physical schema retirement. E108 reopens only that missing boundary.

## Verified candidate gates and thumbnail correction

At source cd587c50/documentation7cfcaa66, fresh generated drift, block contracts, block-kit, template packs, template SSR, BlockDemo types and Admin types passed. Root tooling passed189tests/18,144assertions. The thumbnail gate failed because the native inserter's generated List description predated the nested-list contract. Regenerated it through the existing `thumbnail-catalog.mjs --write-index` command; only that description changed. All548existing images and their hashes/bytes remain identical; the corrected thumbnail gate passes137blocks/fourpacks/548images. No screenshots were recaptured.

Current receiver, Website build/type/test and installed artifact evidence remains linked by preview-history-fixed-20261006.md and preview-receiver-20261006.md. The new E108 code changes the backend candidate; do not mark final source/installed parity or Task8 candidate freeze complete until the staged rollout and contraction finish.

## Compatibility stage implemented locally

`canonicalDocuments/retirement:retirePostFields` is an internal deployment mutation, not a public authoring API. One call binds the full current record by digest, refuses noncanonical or invalid trees, snapshots retained source values through the existing bounded immutable-history/media writer, and clears only the three obsolete columns. Publication, title, canonical tree/revision, timestamps and ownership stay exact. Repeating against a fresh digest is a no-op. Archive failure rolls the transaction back. Historical source download retains normal authority checks.

Canonical creation, save, duplicate, API import, history restoration and promotion writes now omit/clear obsolete live fields instead of recreating them. Existing archives remain untouched. A broader run caught three promotion rollback failures because the old guard required an empty content string; it now accepts absence or the old exact empty sentinel, still refusing nonempty legacy content. Those actual failing promotion paths pass unchanged tests after the repair.

Tests cover draft/published/trashed cleanup, original archive values, unchanged canonical/publication metadata, stale source and unmigrated/invalid refusal, no-op retry, archive-limit rollback, historical restoration without reintroduced columns, retained media ownership and authorized original-source download/customer denial. The writer inventory now explicitly includes this reviewed central permit; its source fingerprint is regenerated. Retirement does not touch blocks/version, so it leaves reusable occurrences intact and does not clear unrelated dirty-index work.

- Full backend plus both foundations and deployment-gate scripts: **3,712 tests /25,741 assertions**, zero failures,353files.
- Canonical document and promotion suites:282tests/2,430assertions.
- Final additional archive-download assertions:6retirement tests/39assertions.
- Strict `tsc --noEmit -p convex/tsconfig.json` passed with the established8GB Node budget.
- Media/source/consumer writer coverage passed:1,488classified writes,30owner tables,10reviewed canonical permit calls.

Evidence: `output/candidate-gates-20261007/`. The first retirement run failed because the new migration was absent. A separate canonical-writer test failed because initialization still stored content; the repaired behavior passes. Six old assertions were updated from empty content to explicit field absence; other preserved values remain checked. A wrong-directory script attempt changed nothing and is excluded. The first353-file candidate command inventory is not claimed to have run before the correction: its precursor309-file Convex-only pass exposed the promotion failures; the final353-file run above is green.

## Required next stage; not complete

No live deployment, schema removal or database cleanup has occurred in this batch. Current installed artifacts remain cd587c50. The compatibility schema is deliberately still present until existing values are archived and removed.

1. Derive separate staging snapshots from each sealed installed candidate, preserving extension source; back up data and storage.
2. Deploy the compatibility-stage writers plus internal migration, validate the exact function delta, and enumerate every document to a complete bounded result. Clean only reviewed canonical records using full-record digests; preserve immutable originals and reconcile media ownership. Unknown acknowledgements require authoritative readback.
3. Decouple historical revision validation, remove the obsolete live schema fields, and repair the actual remaining consumers/import boundaries. Historical JSON/revision decoding must remain available; no broad archive purge.
4. Compile/deploy the contracted schema, verify native create/save/reopen/history, public output and promotion, and reconcile original records and storage before closing E108/Task4. Refresh only artifacts/checks affected by these changes.

The incoming Claude audit remains advisory. This gap was found against the actual handoff and current source, not inferred from an audit or elapsed time. Four provider workflows and public HTTPS acceptance remain independently open. No push.
