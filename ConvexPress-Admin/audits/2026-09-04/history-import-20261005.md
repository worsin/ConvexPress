# Canonical historical import — 2026-10-05

Task 4 / E07 remains open. The source installation now offers deliberate imports of a saved original or its retained unsaved draft into canonical blocks. It also downloads the complete original revision as JSON, preserving the exact stored strings and timestamp. New imports never downgrade the document to version 1. The target installation still advertises its older recovery action; its existing native recovery flow remains available until the replacement is deployed there. The old recovery mutation and legacy editor/renderer dispatch have not yet been retired.

## Required workflow and repair boundary

1. Required workflow: recover historical saved or unsaved authoring after migrating the current corpus, without reactivating the old editor.
2. Evidence: the prior native recovery action called `recoverLegacy` and deliberately wrote `blocksVersion: 1`; retained autosaves accompanied that downgrade.
3. Dependency: history needed independent source selection, conversion review, exact archive/current-source bindings and a canonical write, plus access to unsupported original bytes.
4. Repair: three bounded site operations (`prepareRevisionImport`, `importRevision`, `getRevisionSource`), native history review and Website preview using the reviewed candidate. Existing save/restore permission, resource, lock and revision checks remain authoritative. Ordinary migration rejects an unexpected archive binding. Native reopen verifies the acknowledged revision and digest.
5. Exit check: an owned native page imports both sources, retains exact originals, downloads its archived source, reopens and undoes through canonical history, without changing any original corpus record or the target.

## Verification

- Backend document suite: 117 passing tests / 1,274 assertions. Covers saved versus unsaved source, read-only preparation, current and archived source changes, candidate/presentation mismatches, revoked permissions, wrong parent, current locks, publication authority, import acknowledgements, unsupported source download, and unchanged state on refusal. Existing compatibility recovery tests remain intact.
- Mounted editor: 21 passing cases / 384 assertions. Source changes and refresh reset acknowledgement; wrong archive kind and wrong receipts cannot confirm an import. Canonical undo and older installation recovery both pass.
- Preview renewal/source suites: 14 passing tests / 65 assertions.
- Explicit backend project and Admin TypeScript checks pass. Generated foundation and portable contracts match. Terminal API contracts regenerated through the existing source-derived generator.
- SOURCE 4860 deployed from its preserved snapshot, with storage-inclusive backup. All 1,626 manifest hashes verified, including 22 CommunityEvents files. Installed spec has 2,413 functions: 2,408 signatures unchanged, two expected return-shape changes, three added history operations. Consumer index rebuilt to ready (243 acknowledged operations / 238 documents) before content writes.
- Owned Electron PID 55826 used an isolated profile against Admin 4105 and source 4860. Saved-original preview retained bold prose and its link; unsaved HTML preview retained heading, bold text and separate link. Actual Website preview widths 533 and 391 had no horizontal overflow. Screenshots visually reviewed. HTML acknowledgement resets on refresh. Saved import advanced to revision 2; unsaved import to 3; canonical undo to 4. Reload verified both imported and undone documents. No page/console/hydration errors observed.
- Native original-source download completed; its saved content, autosave title/body and timestamp match the original fixture exactly. Both historical sources remain recoverable through retained revisions.
- One acceptance command selected a stale history control before the previous import refresh finished. It timed out; authoritative readback showed exactly one successful import at revision 2. The harness resumed from the refreshed history without retrying that write. No product failure or extra write resulted.

## Preservation and cleanup

The owned page and its four revisions were removed after verification. All original SOURCE 116 canonical posts and 434 revisions are byte-equivalent as decoded database values to the baseline. TARGET 29 posts / 88 revisions unchanged. Appearance, email queue and templates exact. No publication, mail, Git push or target deployment.

Owned Electron and Website PID 55998 closed; native profile removed; native signout and API-session revocation verified. Owner processes and the separate RSVP fixtures remain untouched.

Evidence: `output/history-import-20261005/`: `installed-proof.json`, `deployment-source-final.json`, `index-journal.json`, `native-previews.json`, `native-outcome.json`, `download-proof.json`, `copy-proof.json`, `preservation.json`, `cleanup.json`, focused logs and screenshots. Private original/backup/download evidence stays outside the repository.

Next: backport the necessary history/import prerequisites into the target's own preserved snapshot and verify its native recovery; reconcile historical references and remaining formats; then retire the old downgrade mutation/permit and live legacy dispatch. Do not copy the whole source backend onto target. SOURCE preservation base is now `output/history-import-20261005/deployment-source-final.json`; TARGET remains `output/target-autosave-parity-20261005/target-source-installed.json`.

Claude audit 34 confirms scope/progress and explicitly does not claim a completed code review. Its count correction is accepted; pending advisory questions do not block execution. Full delivery goal remains active/incomplete; 117 Verified / 20 In progress unchanged.
