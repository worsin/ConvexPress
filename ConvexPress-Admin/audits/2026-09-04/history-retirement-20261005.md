# Canonical history downgrade retirement — 2026-10-05

The old `canonicalDocuments:recoverLegacy` mutation and its privileged v2-to-v1 write permit are removed from both disposable installations. Native authoring no longer exposes the original-editor restore control. Historical saved content and retained unsaved drafts remain available through exact-source download, deliberate canonical import and canonical undo. Task 4 / E07 and the full delivery goal remain open: live legacy editor/renderer dispatch retirement is next.

## Complete retained-source reconciliation

Fresh read-only inventories captured SOURCE 116 posts / 434 revisions and TARGET 29 posts / 88 revisions, with no orphan or parent-type-mismatched revisions. Every current post is canonical. Source contains 161 legacy revisions and 12 retained autosaves; target contains 23 legacy revisions and no retained autosaves.

Each installation's own converters successfully processed all 196 historical saved/unsaved sources: 173 source and 23 target. Installed authorized import preparation succeeded for 45 source and 23 target sources. The remaining 128 source requests were explicitly refused because the parent remains in Trash. Their pure conversion candidates succeeded; an authorized ordinary restore is required before editing. Nothing was restored to work around that restriction. This is complete format/preparation reconciliation, not fresh rendered acceptance of every historical snapshot.

The installed media-reference scanner was bundled separately from each preserved backend and executed read-only. Expected and stored reference IDs, paths and opaque-source classifications match across all 145 posts and 522 revisions: source 7 current / 81 historical references; target 5 current / 15 historical references. The retained autosaves in this corpus contain no actual media references. Their scanner/deletion protection remains covered by the prior focused tests. Generation bindings remained ready and stable throughout the read-only reconciliation.

## Implementation and validation

Removed the public downgrade mutation, service helper, special permit, recovery receipt contract, obsolete action variant, native callback plumbing and old restore component. The canonical write fence now requires canonical output for every permitted authoring write. Metadata clearing, forged/borrowed permits and locked-block downgrades refuse. Exact original archives remain untouched. Updated the canonical migration kit to document historical import/download instead of the retired API; historical acceptance reports remain historical evidence.

The new regression first demonstrated the old mutation successfully downgrading a canonical document. It now refuses without altering the post or revision history. Existing recovery tests now exercise canonical import, source fidelity, current access/publication policy, stale revisions, locks, unsupported sources and canonical undo. The mounted workspace suite covers late import acknowledgement after a session replacement.

- Working backend: 139 tests / 1,459 assertions pass; mounted native workspace: 20 tests / 373 assertions pass.
- Preserved source deployment snapshot: 139 tests / 1,459 assertions pass.
- Preserved target snapshot: 109 tests / 961 assertions pass. Its existing tests were retained and only affected recovery cases adapted.
- Explicit backend/Admin types and both deployment typechecks pass. Block/foundation generation, API contract generation, media-writer checks, kit synchronization and whitespace checks pass.

A full source-test copy initially exposed target-specific behavior differences and a missing target fixture filename. Those were test portability failures; production behavior was not expanded to satisfy unrelated source tests. The target's own suite was restored and affected cases adapted. A source Forms refresh test also failed in the unchanged prior snapshot: its fixture omitted the two already-required search modules. Adding those fixture registrations resolved it without a production change. Logs preserve these failures and final passing runs.

## Scoped deployment

Each site received a storage-inclusive backup and a separately preserved snapshot. Ten production/generation files changed per site, plus reviewed tests. The target's recovery helper lacked the source's content-event hook; its bounded removal was verified against that exact difference instead of overwriting the service.

SOURCE: 1,626 manifest hashes; 108 files under `convex/extensions/` unchanged, including tests (71 non-test files). Function inventory 2,413 → 2,412: only `recoverLegacy` removed, only `pageRevisions` signature narrowed, 2,411 signatures unchanged.

TARGET: 1,620 manifest hashes; 86 files under `convex/extensions/` unchanged, including tests (55 non-test files). Function inventory 2,378 → 2,377: only `recoverLegacy` removed, only `pageRevisions` signature narrowed, 2,376 signatures unchanged.

Both catalogs and pack definitions remain byte-identical to their respective prior installations. Consumer indexes returned to ready after 243 source / 68 target acknowledged operations; media indexes stayed ready without rebuilding. Final checks after fixture deletion show both indexes ready. A call to the removed endpoint on each owned canonical fixture failed, with exact post/history readback proving no writes. The public error is generic; absence is independently established by each installed function inventory.

## Native acceptance and cleanup

An isolated native Electron process used Admin 4105 and the existing synthetic operator. Owned Website processes served source 4322 and target 4321. On each site:

1. Saved-original import advanced the owned draft to revision 2.
2. Separate retained HTML draft review preserved heading, bold prose and link in the actual Website. Review refresh cleared acknowledgement.
3. Unsaved import advanced to revision 3; reload retained its separate title/body.
4. Native JSON download completed with exact saved title/body and autosave title/body/timestamp.
5. Canonical undo advanced to revision 4 and rendered the saved body again.

Actual preview widths 486 and 349 had matching scroll widths, with visually inspected screenshots and no page/console/hydration errors. An ambiguous download locator initially matched all three history rows; it was scoped to the retained original before any download action. The old-endpoint check initially expected detailed error wording; installed function inventory and exact readback provide the authoritative proof instead. No content mutation was blindly replayed.

Both owned pages and their four revisions each were deleted. All original SOURCE 116 / 434 and TARGET 29 / 88 rows match the baseline exactly, as do both appearance snapshots, email queues and templates. No publication or Git push. Native signout and API-session revocation succeeded; owned Electron 60313, Website 60458/60610 and its isolated profile were removed. Owner Electron 39198, Admin 62672, BlockDemo 65092 and separate RSVP fixtures remain preserved.

Evidence: `output/history-retirement-20261005/`, including capture/history/reference reconciliation, red/green tests, deployment/spec/backup/index journals, per-site native/download/undo proofs, preservation and cleanup. Private source data, downloads and backups remain outside Git.

New preservation bases:
- SOURCE: `output/history-retirement-20261005/source-source-installed.json` → `ConvexPress-Admin/output/production-checkpoints/source-history-retirement-20261005`.
- TARGET: `output/history-retirement-20261005/target-source-installed.json` → `ConvexPress-Admin/output/production-checkpoints/target-history-retirement-20261005`.

Claude audit 34 remains the latest observed audit. Accept its corpus-completeness concern, adapt retirement to preserve both source kinds and each installation's own backend, reject counts/tests as proof of full E07 closure, and defer unrelated broad audit work. Next: remove active legacy editor/renderer dispatch while keeping deliberate converters and retained archival fields. Codex proceeds without waiting for the next audit.
