# Legacy demo content seed retired — October 5, 2026

Task 4/E07 removes the old marketing-site content seed and its legacy link repair from both isolated sites. They could erase retained content and reintroduce the old document format. The full delivery goal remains active: 117 Verified / 20 In progress unchanged.

The complete caller search found `packages/backend/scripts/seed-demo-site.mjs`, which the earlier app-only search missed. Neither installed backend has other wrappers calling `seedMarketingSite` or `repairSeededPageLinks`. The old seed deletes posts/pages, revision snapshots, metadata, comments, taxonomy and menus before inserting legacy bodies. It was **not executed** during this work.

The two obsolete registered mutations and their private content helpers are removed. Their CLI now exits 1 with a clear retirement message, without imports, environment loading, network, storage or database work. Shared `createImportedMediaRecord` and its author helper retain their implementation; the separate media action, shop functions, catalogs and shop CLI remain unchanged. No default-template example-site acceptance is inferred from this retirement.

## Verification and installed evidence

Evidence: `output/demo-seed-retirement-20261005/`.

- `caller-review.json` and `retirement-check.json`: full source/installed caller review, retained media implementation comparison and safe CLI exit.
- Root writer gate: 1,480 classified writes, no bypasses; nine canonical permit calls and 24 versioned boundaries unchanged. Root backend types, both deployment typechecks and all four Admin typecheck tasks pass.
- Generated contracts: 2,299 functions / 3,068 DTOs with 377 unchanged unknown boundaries. All 39 compiler fixtures pass for each consumer (`contracts-check.txt`).
- `source-parity.json` / `target-parity.json`: exactly two functions removed, none added or changed; final counts 2,410 / 2,375. All remaining signatures unchanged, including media/shop APIs.
- `installed-preservation.json`: source108 / target86 extension files exact; each site's catalogs/packs exact. A final tracked-source terminal blank-line cleanup has no runtime semantic difference from the installed module.
- `preservation.json`: source116 documents / 434 revisions and target29 / 88, appearance and email queue/templates exact. This batch created no content/media fixtures. Readback sessions revoked (`api-cleanup.json`). Both consumer and media indexes remain ready with unchanged generations (`final-indexes.json`). Earlier owned runtimes remain stopped; no Git push.

Next deployment bases: **`output/demo-seed-retirement-20261005/{source,target}-source-installed.json`**. Separate storage-inclusive backups precede both deployments. Preserve these site-specific snapshots rather than deploying the whole working backend over either site.

E07 remains open. The bounded [remaining consumer inventory](legacy-consumer-inventory-20261005.md) identifies the unreachable native legacy layout/hook, generic metadata endpoints that still accept obsolete authoring fields, old block/AI consumers, and discriminators used by current canonical/history/promotion contracts. Retire actual live assumptions without deleting retained source/recovery fields prematurely. Tasks5–8 and the remaining block-specific gates are still required.
