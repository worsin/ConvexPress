# Synced content promotion acceptance — October 6, 2026

`core/synced` now satisfies its remaining live promotion gate. Reuse the native insertion, nesting, recovery, same-site snapshot, four-pack, visibility/authority and legacy conversion evidence indexed in `synced-nested-20261006.md` and `synced-legacy-20261006.md`. Legacy corpus accounting/retirement and full delivery integration remain open.

## Demonstrated repair E101

- Required workflow: promote imported locked reusable content across separate site environments, review its editing policy, retain target history and refresh consumers outside the selection.
- Evidence: source export omitted `isLocked`; the strict portable codec rejected it. Two focused red regressions reproduced this in `output/synced-promotion-final-20261006/locks-red.log`.
- Dependency: pure codec, site/controller contract, registered export validator, target planner/writer/rollback and native review must transport the same optional flag. A target lock must prevent promotion overwrites until an authorized explicit unlock.
- Repair: preserve lock intent, refuse overwriting locked destinations, restore prior lock on rollback, permit authorized explicit unlock of promoted content without copying legacy database IDs. Show the lock in native review and retain its safe failure code with explicit destination unlock/review guidance. Older transfers without this optional flag remain readable. Original legacy JSON and IDs remain in the source environment.
- Exit: focused registered tests plus actual native broker review/apply and separate live target consumer refresh, pin retention, rollback/history, and cleanup passed.

The prior E100 legacy conversion changes existed in the deployed foundation copy but were missing from the canonical SDK owner. Synchronized the owner and regenerated the foundation manifest; all 107 generated files now pass drift verification. No converter behavior was reverted.

## Verification

- Backend: 241 tests / 1,711 assertions across 19 files. Controller: 96 / 645 across eight files. Native review: nine / 50. Scoped backend and Admin TypeScript pass.
- API contracts regenerated: 2,291 functions, 3,065 terminal DTOs, 373 unchanged existing unknown boundaries. Writer inventory: 1,488 classified writes, 30 owner tables, no bypasses; 25 reviewed consumer boundaries. Foundation and whitespace checks pass.
- Source 4860, target 4870, controller 4720 deployed from separately preserved installed snapshots, each with storage-inclusive private backup. Source 1,634 files / 2,402 functions; target 1,623 / 2,363; controller 229 / 210. No function removals. Target gains `unlockImported`; export/head signatures updated as applicable. Exact installed manifests and receipts are in the evidence directory.
- Ordinary consumer rebuilds: source 258 records, target 63; ready with no authored content writes.

## Actual workflow

An owned legacy source was locked, reviewed and imported canonically. Its canonical parent contains latest and pinned references; one selected authored page references the parent. Native Electron reviewed the lock explicitly and applied the closure to the disposable live target in one dispatch. Receipt `p97fv8sy7g528jhjdhycf6gean8fsf3c` confirmed seven authored records and distinct target identities. Target editing while locked was refused.

The native review initially refused omitted language and access-rule dependencies as designed. For this bounded test, the disposable source language configuration was saved, temporarily set to empty to match the existing target, then restored exactly. Required membership/access-rule records were explicitly reviewed and compared against existing target values before apply; their authored values remained exact.

A separate target page, absent from the promotion selection, was published with latest and pinned placements. The second promotion refused the locked target before explicit unlock, then appended target revisions and refreshed this page. The already-open actual Website changed from two original paragraphs to one updated shared paragraph and one original pinned paragraph without reload. Its authored document, including revision and references, remained exact.

Rollback restored the prior publication and unlocked head while retaining imported immutable revisions. The open Website returned to both original paragraphs without reload. This check used the existing `6fc1e5fa` Website artifact; the change is in backend/contract/native review, not rendering.

Two acceptance-harness corrections were needed: compare the authored `document` separately from intentionally changing live display data and expiring display leases; resume after a known `SYNCED_LOCKED` rejection instead of expecting a returned review. One read encountered `ExpiredInQueue`; bounded read retry succeeded without repeating the applied write. A fresh reviewed apply/rollback cycle completed all stored assertions. These are recorded rather than claimed as product fixes.

## Cleanup and limits

All original 71 pages, appearance values/identity, general/reading/menu settings, and access-policy authored values match baseline. Source languages were restored; target language values stayed empty. Audit timestamps and language revisions advance normally. Three owned pages were trashed, four owned canonical sources withdrawn with completed refresh jobs and zero failures; the owned original legacy row and immutable histories remain for recovery. Two API sessions were revoked and refresh returned 401. Native restored Live, signed out, stopped PID 94087 and removed its private profile. Website PID 94282 and tab 50 closed; seven protected processes remained alive.

Evidence: `output/synced-promotion-final-20261006/` contains red/green test logs, type/generator checks, deployment/source proof, native receipt, lock review screenshot, first-apply readback, locked-review refusal, outside-after and rollback readbacks, retained-history proof, live Website screenshot, and cleanup receipts. Goal remains active; no push. Remaining legacy corpus retirement and integration are Task 4/8 requirements, not grounds to discard this block-specific acceptance.

Final guidance follow-up: controller-only preserved snapshot `output/synced-promotion-guidance-20261006/`, one policy file changed, private storage backup and strict deployment; 210 functions retained with no signature changes. Tracker readback:131 Verified / 6 In progress, all unrelated cells and Notes exact.
