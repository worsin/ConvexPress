# September 21 search budget and excerpt repair

Ordinary canonical-body search and title autocomplete failed on ten published pages containing thirty paragraphs each with membership enabled. Registered-handler regressions and the same live disposable staging corpus reproduced both failures. This increment repairs those paths and shortens Search Results excerpts; it does not close full search capacity, the block library or the production goal.

## Changes

Canonical display projection preloads membership rules for the current visible sibling level through a bounded internal exact-index batch. It preserves per-instance, block-name and reusable-occurrence checks, and descends only after ancestor authorization. At most128 distinct bounded keys are read per child query; each target has a256-rule bound, and the whole batch refuses more than2048 raw rows or512KiB. No unrelated policy scan or truncated permissive result is used. The caller charges full raw rows/bytes to its existing request ledger. This reduces nested query calls; it does not claim to eliminate the individual indexed lookups inside the batch. Request-level limits remain unchanged.

Autocomplete requests current title/publication/access information without projecting unused canonical bodies. Ordinary body matching still reads current visitor-visible text. The canonical Search Results resolver now creates a plain-text context window of at most240 characters plus ellipses around a matching term, preserving word boundaries and surrogate pairs. It does not emit HTML, modify authored content or use snippets as access authority.

## Verification

- Before: seven existing/new handler tests passed and two scale regressions failed with CANONICAL_READ_BUDGET. Live search requests b9fe388d427a87a8 and e4b3c03a2ba871dc independently failed for that exact reason, confirmed in server traces. The client intentionally exposed only generic Server Error.
- Final full backend suite:3463 passed, zero failed,23874 assertions across335 files. Focused policy/projection checks cover late deny retention and evaluation,257th-rule refusal, aggregate row/byte overflow, key bounds, raw byte accounting, denied-ancestor pruning, composed/reusable access and authority leases.
- Backend TypeScript and two storage-backed strict deployments passed. Generated consumer contracts are fresh:2283 functions/3033 DTOs;33 compiler fixtures per consumer passed. Focused final lint has zero errors; broader changed-file lint retains the pre-existing deliberate URL control-character rejection diagnostic in search/publicSource.ts, verified against HEAD. Whitespace checks pass.
- Ten real staging pages/300 paragraphs: ordinary search returns all ten, title autocomplete returns ten, body-only autocomplete returns zero. First after-deploy ordinary search took286ms in this one sample; no general performance claim. Private/public transition removes/restores the owned page in search and suggestions.
- Actual Search Results returns all ten through its bounded eight-plus-two pagination. Desktop1440/mobile390 Website checks pass continuation, distinct links, destination navigation, absent/empty-query recovery, no horizontal overflow and no captured page errors. Final backend excerpt output is225–241 characters versus1000 before; settled desktop/mobile screenshots reviewed.

The live harness initially expected a structured client error instead of the generic public error, then expected all ten block results in one response despite the valid continuation cursor. Both were corrected against server/API evidence. One browser invocation used the arrow character in an accessible link name even though it is aria-hidden; its timeout reset the tool kernel. The browser process was confirmed gone before replacement. Initial screenshots caught entrance animation and were superseded by settled captures. None of these harness failures is represented as a product defect or passing acceptance.

## Preservation and remaining scope

All ten owned fixtures are trashed after verification. Exact original page/post/media, template/identity/plugin-settings and listener readbacks are required by the cleanup receipt. Only the owned browser and4322 Website preview are stopped. The original Electron/renderer/BlockDemo/tunnel processes are preserved. Deployment source preserves the generated SDK plugin graph; latest snapshot is ConvexPress-Admin/output/production-checkpoints/search-scale-r2-20260921. No cloud production deployment or push.

MagicTables updates only the existing core/search-results Notes field with all137 records compared before/after; full-block completion flags stay unchanged.

Remaining: remaining block search declarations, approved custom-composition text, reusable-source publication/consumer refresh, existing-site backfill and larger ordinary-search capacity; full block/template/native/live-data/motion and original production requirements. Original audit remains five accepted/nineteen open. Next user-facing priority returns to completing the block/template workflows, with deficiencies named per block rather than treating renderer presence or screenshot counts as completion.

Evidence: output/search-scale-20260921/ contains before.log, before-server-traces.jsonl, backend-tests-final.log, backend-types-final.log, contract-tests.log, contracts-check.log, policy-tests-final.log, excerpt-tests.log, deployment manifests/receipts, live-before.json, live-after.json, excerpt-live.json, browser-summary.json, desktop-settled.png, mobile-settled.png, cleanup.json and MagicTables receipts.
