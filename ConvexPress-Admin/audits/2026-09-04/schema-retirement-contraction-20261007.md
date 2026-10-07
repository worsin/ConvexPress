# Contracted live authoring schema: local verification

E108 remains open until the contracted candidate is installed and verified on all six sites. Stage A has already archived and cleared the three obsolete fields from 203 original live records, preserving 724 prior revisions and 81 storage files. This checkpoint completes the local contraction regression gate; it does not claim deployment or native acceptance.

## Changes

- Remove `content`, `contentMode`, and `pageSections` from live posts validators. Keep independent historical validators in immutable revisions.
- Canonical create, duplicate, save, restore, and promotion omit retired columns. Explicit legacy import decoding remains available; historical snapshots retain original source values. Transitional migration only sends field removal patches when the source actually owns those keys.
- Remove the completed Stage A internal retirement endpoint. Public function argument contracts remain unchanged.
- Remove current DTO/search/feed/dashboard/SEO reads of obsolete live fields. Canonical feed behavior retains the public excerpt; raw historical body columns are not a feed source.
- Repair a demonstrated promotion boundary: legacy manifests previously received ready receipts and then attempted obsolete live writes. Export/review now returns `CANONICAL_SOURCE_MIGRATION_REQUIRED`; all page/post application uses the canonical writer. Explicit source migration and re-export are required. A regression reproduced ready=true before the repair and now proves no receipt, posts, or backups are created.

## Regression evidence

`output/schema-retirement-20261007/contracted-full-tests-final.log`: **3,711 passed, zero failed, 25,740 assertions, 354 files**. The initial contracted run had 276 failures, mainly fixtures seeding removed columns. Current fixtures now store canonical bodies with the original private-text markers and byte budgets. Tests specifically proving pre-upgrade conversion/refusal explicitly use a historical schema fixture; production schema remains contracted. The five retired temporary endpoint tests remain in accepted Stage A commit ad2e3701, alongside deployed cleanup receipts. Three schema-retirement tests and one promotion-boundary regression replace that temporary coverage.

Actual canonical publication, duplication and render APIs now drive affected publication/membership fixtures. Canonical rollback compares preserved authored fields while requiring fresh revisions. Media safety continues to reject unavailable references in current nested blocks and historical serialized/escaped revision bodies. Promotion retains target media remapping, explicit data selection, historical refusal, authorization, revision, rollback, and byte-bound checks.

- Strict backend `tsc --noEmit -p convex/tsconfig.json`: passed (`contracted-types-3.log`).
- Admin `bun run check-types`: passed (`admin-types.log`).
- Website `bun run check-types`: passed (`website-types.log`).
- Generated inventory/writer checks: 18 typed media tables, 1,488 classified writes, 30 owner tables, nine reviewed canonical permits and 25 versioned boundaries; no bypasses.
- Latest available Claude audit remains 61; no new advisory scope change or wait.

## Next acceptance

Build sealed candidates from each Stage A installed snapshot, retaining site-specific extension sources. Strictly preflight schema compatibility against each cleaned corpus. Before installing, preserve fresh private database/storage backups; require only removal of the temporary internal retirement function in function-contract comparison. Verify original data/history/storage afterward, reconcile affected reference/consumer indexes, then exercise native save/reopen/history and actual public/promotion workflows. No push or closure on local tests alone.
