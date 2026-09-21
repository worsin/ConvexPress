# Taxonomy count maintenance and recovery

The normal post editor changed category/tag relationships without maintaining `terms.count`. The old repair performed an unbounded relationship collection and counted duplicate rows and published pages. Counts now mean distinct posts with `type=post` and `status=publish`; these are editorial totals, including restricted visibility. Public archives retain separate visitor access checks and do not expose these totals.

Normal relationship insert/delete and shared post insert/patch/replace/delete paths maintain a verified baseline in the same transaction. Duplicate assignment insertion is idempotent; deleting legacy duplicates decrements only the last relationship. Post publication changes deduplicate term IDs before applying a delta. Generic imports and promotion/rollback invalidate both sides of moved assignments; WordPress totals are never accepted as a verified local baseline. The Admin table and tag suggestions distinguish counts being rebuilt from verified counts.

Existing/imported terms recover through indexed eight-relationship pages, with at most eight source-post reads per page. Sorting by term/post deduplicates across page boundaries. Revision changes restart scans; generation/cursor checks ignore stale or repeated continuations. Eight-term batches and an indexed recovery cron handle legacy, pending and stalled jobs. Derived recovery state is stored with its term and disappears when the term is deleted. Public count-repair endpoints were not added.

A related regression test verifies that promotion review/apply/rollback survives a count rebuild between steps. Term revision fingerprints omit derived count fields while retaining authored fields, so a background count rebuild cannot masquerade as an editorial conflict.

## Verified runtime

The immutable 1110-file checkpoint `term-counts-final-20260906` deployed to staging `careful-cormorant-268`, with three additive indexes, healthy site identity, and media epoch preserved. All seven category/tag totals independently matched actual source relationships and post statuses. The native Electron editor removed The journal from Objects with a place and restored it: the native category list and direct staging read both proved 2 -> 1 -> 2. All original assignment pairs were restored. Hashes of the explicitly recorded content fields remained unchanged across all 11 post/page rows. The actual native screenshot was inspected. The public journal archive still rendered both expected stories without page errors. Production was not changed and the Website bundle did not require republishing.

Full backend: 2252 tests /9792 assertions across164 files. Four count tests /49 assertions cover lifecycle writes, rollback, duplicates crossing page boundaries, concurrent invalidation, dynamic moves, restore generations, deletion, multi-batch registered jobs and lost continuations. Backend/Admin/Website/control-plane type checks passed; the actual streaming-restore regression passed. Generated API contracts were refreshed. Evidence is under `output/term-counts-20260906` and the native screenshot under `output/playwright/term-counts-20260906`.

## Remaining acceptance

The shared control-plane streaming/buffered restore transformer strips `terms.countReady/countState`. Its deployment and populated-taxonomy live restore subsequently passed; see `taxonomy-restore-outcome.md` for current evidence and epoch. Admin collection/tree/total pagination caps, the inherited100-relationship post-label cap, clock-triggered permission expiry, and broader A01–A03/fleet/client/packaged acceptance remain open. Other original audit/handoff items remain unchanged. Renderer acceptance stays95/136. No commits or pushes.

MagicTables App Audits row `px7csry9fwgb7zfjgn249mmf4s8dx001` was updated after fresh schema/read and one-update/zero-create dry run. Exact readback and preservation of unrelated fields passed.
