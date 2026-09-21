# Author totals and bounded recovery

Verified September 6, 2026 UTC in the isolated hardening worktree. This closes the stored author-count defect found during Latest Posts acceptance. Renderer coverage remains 90/136 and the production objective remains active.

## Implementation and checks

Site-local `authorPostCounts` records maintain an authoritative published-post total per author. Standard guarded post insert, patch, replacement and deletion apply count changes in the same transaction. Promotion and rollback use the same reconciliation at their reviewed direct-write boundaries. Reassignment changes both authors; content-only edits leave the count revision alone. New users start at zero, deleted users lose their count state. Administrator totals include private published posts and are excluded from public profile projections.

Existing users initialize through the minute recovery cron. Each internal continuation reads at most 32 source rows with a 1 MiB pagination budget. Generation/cursor checks make duplicate and stale continuations inert; source revisions invalidate a scan before publication. A failed continuation can be resumed by the recovery sweep. Pending admin totals display an updating state instead of a fabricated zero. Both old recount entrypoints delegate to this mechanism; their unbounded collections and catch-all zero fallback are removed.

Full backend suite: 2,197 tests, 9,141 assertions, 153 files. Tests cover source transitions, same-transaction rollback, real promotion/rollback operations, legacy pagination, concurrent edits, duplicate delivery, deleted authors and registered recovery handlers. Backend and frontend type checks and both 19-case consumer contract suites passed. Media writer coverage reports 1,272 classified writes, 26 owner tables, 17 typed media-reference tables and no bypasses. `git diff --check` passed.

## Live acceptance

Captured 1,068 backend/config/catalog/contract files in `output/production-checkpoints/author-counts-20260906`. Staging dry-run added three indexes with no index deletions. Deployment to `careful-cormorant-268` preserved the existing media epoch, Aster House website/instance identity, and healthy auth/storage. Production and the control plane were not deployed.

The existing native Electron process (PID45019, CDP62025, renderer4105) initially showed Aster Editor with zero despite owning one published article. The cron repaired it to one without manual recount or restart. Native Quick Edit reassigned Objects with a place to River Guest: the directory immediately showed Aster/River totals 0/1. Restoring Aster Editor returned the totals to 1/0. Both users remained Subscribers. The native console reported zero errors and one pre-existing warning.

Media deletion safety automatically rebuilt and returned Ready with generation `staging_2b3b1656f22543efa6f5d9d68b6e1aac:media-edges-5e6d673520d43455a6cb5e1a`, 30 completed pages. Native Users and Media screenshots were visually inspected. Evidence and source hashes: root `output/author-counts-20260906/receipt.json`; screenshots: root `output/playwright/author-counts-20260906`.

MagicTables registered the new site-local table in the Standalone Roadmap AppTables registry: 343 existing rows preserved, one added. Latest Posts Notes records acceptance without changing renderer/full-completion flags. This is a lean table registration, not a claim of complete linked schema-field/index registry parity.

## Remaining scope

Sustained count-affecting writes can postpone an initial or forced baseline; partial or stale totals are never published. Full backup/restore integration and raw/partial restore acceptance remain open. No production or Vercel acceptance is claimed. Continue Post Grid and the remaining 46 block renderers, template/demo polish, sparse-taxonomy discovery, and every remaining item in the original production-readiness objective.
