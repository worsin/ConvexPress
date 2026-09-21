# Derived state and native restore recovery — September 6

The actual streaming restore now invalidates derived indexes and counters for target-local rebuilding. Two fresh same-environment restores completed on Aster House staging. This advances C04 and the Calendar/Post Grid/author-count recovery requirements; it does not complete the full production audit. Renderer acceptance remains 94/136.

## Source repair

The prior Calendar patch changed only `prepareTargetBoundSnapshot`, the buffered helper. Production operations invoke `prepareRemoteTargetBoundSnapshot`; that path previously copied event buckets unchanged. A regression against the real streaming path failed with the stale source bucket before this repair.

Shared `snapshotDerivedState.ts` now removes `extension_events.calendarBucket`, the four `termRelationships.discovery*` fields, and cached `users.postCount/postCountReady`. Imported `authorPostCounts` job rows are cleared so source job cursors/readiness cannot be mistaken for target state. Authored fields, record IDs, nested user metadata and unrelated archive entries remain intact. Tagged int64 values, float syntax, negative zero and Unicode survive rewriting.

Rewriting retains one bounded JSON row, uses streaming deflate, respects downstream backpressure, closes on cancellation, and rejects malformed or oversized rows. Tests include more than 8 MiB of transformed records, byte-split UTF-8, CRLF and unterminated rows, and the existing 600 MiB virtual archive case. Full control-plane suite: 348 tests / 1,975 assertions. Type checks pass.

Deployed immutable 132-file checkpoint `ConvexPress-Admin/output/control-plane-checkpoints/derived-restore-20260906` to the verified Linux test container `convexpress-test-control-plane` through port 14720 → worker 4720. Dry run and actual deploy passed, with no index deletions. Website bundle and both site backend code deployments were unchanged during this turn.

## Live acceptance

- Fresh native staging backup: `snapshot_0cfc5aedf838e8d151fce13e8456c90fa353ab675f7373e4`, 280 tables, 15 stored files, approximately 1.5 MB; checksum verified.
- First restore created verified pre-backup `snapshot_431ef932f5fa55faddfaad402b3183416fa4cb10e6d3d80e`, completed six steps and receipt `receipt_588b1795b82e4c4d8154a9f0f634b08f3921210d`.
- Second restore used the same fresh source, created its own pre-backup and completed all six steps: receipt `receipt_46e494713af9f45858c339844e5847df94e10da2`.
- All ten posts and four events retained authored hashes. User IDs and cached totals were restored correctly. All three author-count state IDs differ from the source, proving they were rebuilt. Independently recomputed published-post totals are 0, 1 and 2. An intermediate post-restore observation captured zero author job rows; the later observation shows all three ready, documenting actual asynchronous repair.
- Final media epoch is `mi_ready_c97bb885410b4b3a834e05782c0ea3b9`; do not reuse the old pre-restore staging epoch in later deployment commands.
- Anonymous Website returned HTTP 200 and rendered Post Grid plus Calendar agenda from the restored database. The existing Electron PID 45019 retained the selected staging site and signed-in operator. Its six-block document and saved Website preview rendered after recovery.

## Native recovery defect and repair

The first restore exposed `EVENT_CALENDAR_INDEX_PENDING` during a legitimate rebuild. `useQuery` threw it into a permanent editor error boundary; automatic session renewal alone did not clear that boundary. The new document query hook uses the installed Convex `useQueries` observer with stable memoized arguments. Only structured Calendar/taxonomy preparation codes enter a waiting state. The live subscription continues and resumes automatically when the server result changes. Other errors still reach the error boundary.

While waiting, the last validated editor remains mounted, hidden and inert, retaining unsaved edits; saved previews and resource selection are cleared. A real React/Convex-observer regression verifies pending-to-ready delivery, unchanged subscription count and preserved unsaved editor state. Exact-code tests reject message-only spoofing, permission failures and stale-index failures. Canonical editor suite: 13 passing entry tests across eight files, including seven workspace DOM cases. Admin types and git diff checks pass.

The first implementation pass exposed unstable query arguments causing a render loop; stable memoization repaired it and the observer regression covers it. One explicit Reload was used to leave the old failed boundary while installing the repair. The subsequent restore returned All changes saved without Reload. The final preview was verified after its connected-state acknowledgement; the earlier screenshot was captured before that acknowledgement.

## Evidence and remaining scope

Root `output/derived-restore-20260906` contains sanitized before/after inventories, intermediate pending state, authored hashes, verification JSON, epoch, native/public receipts, tests and screenshots. Use `native-restored-preview-ready.png` for acknowledged native preview evidence.

This live fixture has no taxonomy assignments; nonempty taxonomy rewrite/recovery has automated coverage, not live restored-category acceptance. No claim of maximum 3 GiB capacity, every interruption/retry boundary, unsupported canonical archive validation, packaged clean-machine acceptance, production restore or Vercel deployment. The full original goal remains active. MagicTables updates append Notes only for Calendar, Post Grid, Author Bio and extension_events; full completion flags remain unchanged.
