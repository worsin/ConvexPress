# Automatic media-index provisioning source checkpoint

Source implementation is complete; live automatic fresh-provisioning, multi-controller contention and pending-import recovery are not yet claimed. Root separately proved manual staging Start → Continue → ready (26 owners, 61 documents, 30 pages), including the bounded first 25-page batch.

The implementation replaces the provisional read-then-set initializer with a common site transaction authority. It preserves existing epochs, gives competing initializers one allocation/dispatch, fences unresolved environment writes, and makes snapshot-import epochs non-authoritative until the provider reports completion. Known-ID imports and interrupted final acknowledgement reconcile without a second upload or epoch write. Target-preserved completion receipts prevent completed replay; unknown upload identities stay visibly unresolved.

Automatic authorized backfill now runs for fleet initialization/CP upgrades and after standalone first-administrator sign-in. Normal public maintenance APIs retain their signatures. Native progress is durable, generation-aware and bounded; stale scope, blockers and errors stop without reporting ready. No fake operator session or arbitrary endpoint is introduced.

## Source inventory

- Shared protocol: `packages/site-contract/src/media-index-epoch.ts` and package export; `packages/runtime-clients/src/media-index-maintenance.ts` and export.
- Site: `schema/media.ts` adds `media_epoch_claim` and `media_epoch_import_receipts`; `media/epochAuthority.ts` adds internal `coordinate` and `completedImport`; `reverseIndex.ts`/`reverseBackfill.ts` enforce pending import refusal; writer coverage regenerated. Authored owner inventory remains 26 tables.
- CP: `siteBroker/mediaIndex.ts` scoped action; `operations/snapshotImportApi.ts` and action caller stable review key; `snapshotRestoreArchive.ts` / `remoteSnapshotArchive.ts` target completion-receipt/schema preservation and explicit transient claim reset.
- Native: `deployment/mediaIndex.ts`, `journal.ts`, `ipc/setup.ts`, `ipc/siteDeploy.ts`; new `media-index` phase/progress field and real handler recovery tests.
- Admin: `MediaIndexAutoMaintenance.tsx`, `MediaIndexAutoRunner.tsx`, authenticated Admin layout mount, actual DOM cancellation/scope/blocker regressions.

## Verification

Final test/type/process results are appended below. Tests use the actual site registered coordinator and real Convex transactions, with provider transport injected and no real network. They cover concurrent claims, one dispatch, unknown response fencing, preserved configured epoch, blocked real backfill/deletion/writes during import, stream backpressure, known-ID timeout recovery, lost final verification request, independent ready readback, revoked scope and native journal retry. No live/provider/browser operation or deployment was performed.

## Explicit recovery/rollout limits

Deploy site first, CP second, automatic native/UI last; no old-CP import during that window. Site APIs must exist before the native post-deploy coordinator runs. Existing valid epochs are reused, while the changed source coverage generation requires a fresh backfill. A pre-backup missing the new target-preserved receipt table must be refreshed. Unknown upload IDs and unacknowledged writes without exact persisted evidence remain blocked for explicit reconciliation, with no automatic takeover or reupload. Direct external provider edits/imports are outside the managed protocol. Root owns live rollout and acceptance.

Final source gate: **155 tests / 899 assertions across 33 files passed**, `/tmp/media-auto-final-focused.log`. Backend `/tmp/media-auto-final-backend-types.log`, CP `/tmp/media-auto-final-cp-types3.log`, Admin `/tmp/media-auto-regenerated-admin-types.log`, Website `/tmp/media-auto-regenerated-website-types.log` and Electron `/tmp/media-auto-final-desktop-types.log` all completed with exit 0. Fresh offline API: **750 modules**. Compact contracts: **2045 functions / 2373 terminal DTOs / 429 pre-existing unknown boundaries**. Root refreshed combined CP bindings to **120 modules / 2 components**. Media schema inventory verified 17 typed reference tables; writer coverage verified **1262 classified writes / 26 owner tables / no bypasses**. Source file hashes are recorded in `media-index-automatic-source-manifest.json`. Runtime/schema edits are held for root snapshot capture.

Final verification after the recovery/archive refinements: **155 tests / 899 assertions**. Transient source claim data is reset in both archive paths while its target schema is retained; completed target receipts remain preserved. Fresh compact contract `--check` and combined CP binding `--check` both exit 0 (`/tmp/media-auto-final-contract-check.log`, `/tmp/media-auto-final-cp-bindings-check.log`). All final type processes completed successfully. No runtime/schema changes remain in progress.
