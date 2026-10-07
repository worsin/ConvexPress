# Target canonical historical import — 2026-10-05

Task 4 / E07 remains open. Both preserved installations now support deliberate canonical imports of saved historical content and retained unsaved drafts, plus exact-source downloads. TARGET 4870 passed the native sequence through import, reload, download and canonical undo. The old downgrade API/permit and live legacy editor/renderer dispatch are still present; historical formats and references must be reconciled before retirement.

## Deployment boundary

The target's prior snapshot predates saved-block protection, authored tab-action checks, nested-list conversion, reviewed plain-text/HTML conversion, trash migration/validated restoration and retained-autosave archival. Those dependencies were backported from reviewed commits `5a88b772`, `470a1cce`, `ed6f368d`, `02ddd719`, `61709a98`, `4073ff89`, `a5f78b52`, `4b4c22be`, and `6ca97a78`. No whole-source backend overlay was used.

The target's own 137-entry catalog and four pack definitions drove regeneration. Only `blocks/tabbed-content` authoring actions and `core/list` nesting change in the catalog. Existing target promotion metadata remains byte-identical. The checkpoint captures the generator input and file hashes. All 86 existing extension files remain exact. Of 1,620 manifest files, 55 changed or were added before deployment; generated API bindings were recorded separately afterward.

A storage-inclusive backup preceded the successful deployment. Function inventory: 2,375 before / 2,378 after, zero removed; 2,372 unchanged signatures; three expected migration/history signature changes; three new history operations. Explicit backend TypeScript and deployment typechecks pass. Consumer index rebuilt through 69 acknowledged operations and media index through 330; both ready.

## Verification

- Target document, history-backport and private-draft suites: **106 passing tests / 1,012 assertions**. This combines the preserved target regression suite with reviewed source tests for history, locks, trash, text/HTML and autosave preservation. Three old expectations were replaced by their reviewed source equivalents because the supported behavior changed; no assertions were removed merely to pass.
- An isolated native Electron process, PID 57823, connected to target 4870 through the existing Admin 4105. Its separate Website process, PID 58190, served the current nested-list-compatible build at the target's configured local origin 4321.
- Saved-original import advanced the owned page to revision 2. Retained unsaved HTML import advanced it to 3. Reload retained the unsaved title, heading, bold text and link. Canonical undo advanced it to 4 and reopened the saved body in the actual Website preview.
- Saved preview retains bold prose and its link. Unsaved previews at actual frame widths 486 and 349 retain heading, bold text and the separate link without horizontal overflow. Screenshots visually inspected. Review refresh clears HTML acknowledgement. No page/console/hydration errors observed.
- Native JSON download completed; saved body, autosave title/body and timestamp match the archived original exactly.

## Acceptance interruptions

The fixture migration was initially attempted while consumer-index rebuilding was still active. Convex exhausted optimistic-concurrency retries and rejected it. Before retrying, readback proved the owned original post was exact and no revision had been created. Both indexes then reached ready; one journaled retry succeeded. This was acceptance ordering, not a content-loss failure.

A history harness wait incorrectly expected the history panel to close after import. It timed out; readback proved exactly one import at revision 2 and the still-open panel was refreshed. No write was repeated. The Website process was initially started on source's former test port; it was replaced on the target's configured port before preview acceptance. No site configuration was changed.

## Preservation and cleanup

After deleting the owned page and its four revisions, all original **SOURCE 116 posts / 434 revisions** and **TARGET 29 posts / 88 revisions** match the baseline as decoded database values. Both appearance snapshots, email queues and templates are exact. No publication or Git push.

Native signout, API-session revocation, owned Electron/Website shutdown and profile removal verified. Owner Electron 39198, Admin 62672, BlockDemo 65092 and the separate RSVP fixtures remain untouched.

Evidence: `output/target-history-import-20261005/` contains the backport journal, preserved generator inputs, 1,620-file installed manifest, deployment/spec/backup receipts, index journals, test/type logs, native screenshots and outcomes, exact-download proof, original-record preservation and cleanup proofs. Private backup/original/download files stay outside the repository.

Latest preservation bases:

- SOURCE: `output/history-import-20261005/deployment-source-final.json`.
- TARGET: `output/target-history-import-20261005/target-source-installed.json`, snapshot `ConvexPress-Admin/output/production-checkpoints/target-history-import-20261005`.

Next: reconcile actual historical formats and references, then remove the obsolete downgrade route and live legacy dispatch while retaining deliberate imports and exact original archives. Full goal active/incomplete; 117 Verified / 20 In progress unchanged. No new Claude audit beyond 34 was present during this batch; its prior advisory dispositions remain unchanged.
