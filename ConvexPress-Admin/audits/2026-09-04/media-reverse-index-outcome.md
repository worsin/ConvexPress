# Maintained media reverse-reference index — source outcome

## Delivered

Media deletion can use a maintained reverse-reference index instead of scanning every authored table. The source-derived inventory covers 26 owners, including nested product/variant galleries, private drafts, revision/history records, settings/template containers, imported content, and canonical block data. Matched opaque/history references retain the existing conservative refusal to rewrite them.

Typed insert/patch/replace/delete helpers validate attachments and reconcile edges in the same transaction. Legacy dynamic-ID writers classify the actual Convex table identity with `normalizeId` before selecting the guarded path. Explicit nonowner writes name their table. The canonical service's one-use authoring permit and optional shared read ledger are preserved; prior document, media, and reverse-edge reads participate in that ledger. No database/context proxies were added.

The offline gate classifies 1,255 database writes with no unresolved owner writes. It checks the actual schema-derived inventory, common DB aliases/captures/escapes, and exact trusted central boundaries. The generated version hashes the inventory and reviewed extraction/backfill/write semantics. A new direct owner write or stale central-boundary version fails the real checker. Normal backend deploy, native setup/site deployment, and portable provisioning preparation invoke the check; portable preparation copies its schema/compiler/check dependencies. Manual direct CLI deployments must run the same checker before capturing their source.

Deletion requires the external deployment epoch, generated writer version, completed owner traversal, and no pending cursor ranges to agree. It queries only edges for the selected media, then reads each bounded current owner and compares its exact evidence. Duplicate/corrupt/stale edges, missing owners, incomplete readiness, or exhausted budgets refuse deletion. Shared storage ownership remains on the existing independent indexes; the prior inert `splitCursor` fix remains intact.

Backfill uses one bounded owner page per mutation, durable cursor/range/sequence state, and exact retry semantics. It never skips a requested split. Oversized or unsupported owners remain blocked at the same page and can resume after explicit repair. Current hooked writes maintain edges throughout backfill. Obsolete generation cleanup deletes at most eight infrastructure rows per call and requires current readiness plus an exact generation; it never deletes current-generation edges, authored content, or media files.

Managed raw snapshot replacement now rotates and reads back a fresh `MEDIA_REFERENCE_INDEX_EPOCH` before any upload dispatch or archive consumption on **every retry**. A lost update response or mismatched readback stops the import. Because this epoch is outside the archive, restoring old ready rows cannot restore authority. Dev-only raw content/storage purge invalidates database readiness before its destructive loops, including paths that tolerate historical storage failures.

WordPress `patchEntity` now verifies that the requested table matches the actual ID. Only a confirmed missing entity is skipped; invalid attachments and canonical authoring refusals propagate instead of appearing successfully repaired.

## Admin controls

Media → **Media deletion safety** is available only to operators with `manage_options`. The panel shows unconfigured/stale/building/blocked/ready status, checked content groups, indexed records, and optional technical generation details. A click performs one begin/resume call and at most 25 bounded page mutations; pause, unmount, operator change, or site change prevents the next request. A blocked page never loops automatically. Cleanup is an explicit separate bounded action. No UI control changes deployment environment variables.

The unconfigured state truthfully retains existing reference scans. Configured but incomplete indexing pauses deletion. The panel's DOM/model tests are green; native acceptance is still pending.

## Verification

- Full backend suite before the final maintenance additions: **2,129 tests / 8,671 assertions**, all pass (`/tmp/media-writers-backend-suite-final.log`).
- Final focused media/coverage suite: **71 tests / 394 assertions**, all pass (`/tmp/media-reverse-final-focused.log`). This includes actual transaction backfill/removal over 300 unrelated posts, bounded indexed reads, owner/edge rollback, exact split traversal, retry, oversized-owner recovery, obsolete-generation cleanup, purge fencing, and readiness consistency.
- Additional actual WordPress import-writer regression: **1 test / 5 assertions**, pass (`/tmp/media-import-writer-tests.log`).
- Admin rendered/model progress controls: **4 tests / 29 assertions**, pass (`/tmp/media-index-ui-tests.log`).
- Snapshot import/streaming epoch protocol: **9 tests / 37 assertions**, pass (`/tmp/media-import-epoch-tests.log`).
- The actual isolated deployment-checker test creates a new direct owner write and changes a trusted central boundary; both correctly fail. Portable/native checker wiring is also asserted (included above).
- Site backend, control-plane, Admin web, Website web, and exact Electron `tsconfig.electron.json` typechecks pass. Compact contracts regenerated for **2,037 functions / 2,345 terminal DTOs**.
- Schema/writer coverage check passes: **17 typed-reference tables, 26 total owners, 1,255 classified writes**, zero bypasses. Global `git diff --check` passed.

A final combined rerun briefly caught the separate, expected red test for canonical redundant-autosave initialization while the auth agent implemented its live repair. That failure is not concealed; the final green rerun result is appended below when complete.

## Deployment and acceptance order

1. Deploy the control-plane snapshot-import epoch fence before enabling indexed authority. It is additive and does not itself change any site's epoch.
2. Deploy the latest site schema/hooks/readiness/GC functions and matching generated coverage version. An earlier immutable canonical snapshot with epoch unset is safe but is not the complete index rollout.
3. Set a fresh nonsecret deployment `MEDIA_REFERENCE_INDEX_EPOCH` (16–128 alphanumeric/underscore/hyphen characters) for the target instance. This intentionally closes deletion until indexing finishes.
4. Through the authenticated normal API, call `media/reverseBackfill:begin {}`. Continue `media/reverseBackfill:step {generation, expectedSequence}` using the returned values until `status === "ready"`. The Admin panel drives this same protocol. Never infer completion from a timeout or partial page.
5. Verify live reference blocking, force-clear restrictions, unrelated-library scaling, attach/remove invalidation, and storage ownership. Only then claim that instance's indexed deletion accepted.
6. After any raw restore, expect a new epoch and closed readiness; complete the new backfill. Optionally run `cleanupObsolete {generation}` until it returns `{deleted:0, remaining:false}` to reclaim obsolete infrastructure rows.

No provider calls, deployments, live environment changes, native/browser operations, commits, or pushes were performed by this subagent. Root owns deployment and live acceptance.

## Explicit bounds and remaining limitations

Index lookup retains conservative per-media limits (100 edge owners, 1,000 references, 512 KiB owner/evidence budget) and the existing shared transaction budget. One owner supports at most 100 distinct media attachments with bounded structural/text inspection. Large or unsupported records refuse rather than silently omitting edges; limits were not raised. Backfill and cleanup are explicit resumable maintenance operations; no automatic scheduling is added. Old-generation cleanup is intentionally incremental.

Unconfigured installations retain the existing bounded legacy scan and its scaling limit. Arbitrary encrypted/third-party encodings are not decoded; the supported boundary remains typed IDs plus literal/JSON IDs in the reviewed opaque roots. Unsupported force-clear adapters remain refused. Raw external database/storage operations outside the guarded application and managed restore/purge paths require explicit invalidation/epoch rotation; source checks do not make arbitrary administrator bypasses safe.

## Final combined source checkpoint

After the auth agent completed its separate redundant-autosave repair, the full backend suite passed **2,134 tests / 8,713 assertions across 147 files** (`/tmp/media-reverse-complete-backend-tests-green.log`). The final schema/writer gate again passed 1,255 classified writes with zero bypasses. Current generated version: `media-edges-13307be7aa0ff27f592d2a7b` (read the generated file again before live activation rather than relying on this historical string). All reverse-index runtime/schema/scripts and Admin panel sources are stable for root's deployment snapshot. Native progress-panel acceptance and live configured-epoch/backfill/deletion acceptance have not been performed by this subagent.

The subsequent handoff freshness check caught concurrent canonical-migration work outside this slice: `canonicalDocuments.ts:108` had a misplaced `migrationValidator` property and `canonicalDocuments/validators.ts:71–73` had inference diagnostics (`/tmp/media-reverse-handoff-backend-types.log`). The earlier verified media/source gates above remain historical evidence, but a new combined snapshot must wait for the canonical owner to restore the integrated gate. No media/index diagnostic was reported; root and the canonical owner were notified. Reverse-index runtime/schema/UI/scripts are held stable.

The canonical owner then restored backend typechecking (`/tmp/canonical-authored-migration-types2.log`, empty successful log) and took ownership of the next offline API/compact regeneration for its new migration exports. No reverse-index sources changed during that repair. Root should use that owner's final regenerated combined gate for its next snapshot.
