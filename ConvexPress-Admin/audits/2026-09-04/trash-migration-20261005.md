# Retained Trash migration — 2026-10-05

Task4/E07 advanced23actual trashed records without restoring or publishing any of them. Source is104canonical/12legacy (all12remain trash); target29canonical unchanged. Migration and full delivery remain incomplete.

## Implemented behavior

The existing prepareMigration/migrate API now accepts explicit `preserveTrash: true`. Review returns `preservesTrash: true`; its draft candidate is a preview only. Complete source plus status/previousStatus/trashedAt bind the review. Commit preserves the actual trash lifecycle and retains the original authoring revision. Existing content/template/permission guards and import/inactive-settings acknowledgements still apply. Other editing/public reads continue refusing trashed records.

A registered restoration regression also demonstrated that canonical page restore-to-published hit the authoring fence. Ordinary post/page restore (including bulk posts) now obtains a narrowly scoped canonical permit after current edit/publish authority, body, resource and template checks. The permit only covers restore metadata; authored-field patches are rejected. Unsupported old pending states and expired/missing future deadlines become drafts. The fence remains enabled. Current missing publish authority and invalid bodies refuse without writes.

## Verification and installation

- Red tests reproduced missing trash-mode validation and the existing canonical restore refusal.142focused registered/converter tests passed with1325assertions; the final five trash tests passed50assertions after the last guard refinement. Backend TypeScript, deployment TypeScript, generated contracts and block-kit checks passed.
- SOURCE4860 immutable checkpoint deploy retained1626file hashes and22CommunityEvents files;2410functions,2408unchanged signatures and exactly the2reviewed migration signature changes. No target deployment. Latest preservation manifest: `output/trash-migration-20261005/deployment-source-final.json`.
- Storage-inclusive backup completed before deployment. New reviewed writer boundary required consumer-index version regeneration;244acknowledged index operations/239documents reached ready without authoring changes.
- Native owned-copy acceptance: clone of an actual legacy heading with unused layout/locks; trash→review/convert while still trash→normal restore as canonical draft; actual Website preview532px/390px displays the heading without overflow/errors. Exact original blocks/content/mode, including inactive layout/locks, recovered through retained revision. Copy subsequently deleted.
- One copy migration collided with the active index rebuild. Authoritative readback proved unchanged legacy version/revision/digest and zero snapshots before a fresh reviewed retry after index completion. No uncertain operation blindly replayed. Originals were untouched during this issue.

## Installed corpus receipt

35legacy trash records reviewed.23eligible records committed with exact per-record receipts and readback. One literal-text import (`Hidden fallback article`) and one inactive-settings preservation were explicitly acknowledged; block-mode empty pages keep their visible-source precedence and hidden article fields in the original snapshot.

12records refused `UNSAVED_AUTHORING`: each has a distinct saved body, autosaved body, autosaved title and timestamp. They remain byte-exact, not discarded or implicitly merged. The journal reports `partial-complete-12-unsaved-authoring`, with all12IDs and next work recorded; pure converter coverage is not installed autosave preservation.

Final source116records/422revisions:104canonical,12legacy trash,zero active legacy. All399prior revisions and93unrelated/deferred records exact.23complete original snapshots added. All35trash statuses, previous statuses, timestamps, URLs, ownership/access and non-authoring metadata exact. Every migrated trash record still returns null from public canonical reads. Target29records/88revisions, appearance, mail queue and templates exact. No publication or additional mail.

Owned native/API sessions signed out/revoked; Electron50330 and Website50326/50327 exited; owned profile removed. Copy deleted; actual source records and original snapshots retained. Owner processes and separate RSVP fixtures preserved. No push.

Receipts: `output/trash-migration-20261005/{prepared.json,migration-journal.json,preservation.json,installed-proof.json,index-journal.json,native-copy.json,copy-recovery.json,cleanup.json}`. Private snapshots stay outside source. Native phone capture visually inspected. Preflight initially compared the entire table while the owned copy existed; corrected by proving every original row exact and excluding only that known copy. No original mutation occurred during preparation.

## Remaining and checkpoint

Next implement deliberate preservation/recovery of both saved and distinct legacy autosave content for the exact12records, then complete installed migration/history/reference reconciliation. Live legacy renderer/editor/schema and legacy-recovery downgrade paths are not retired yet. Full Tasks3–8 and20block rows remain open;117Verified/20In progress unchanged.

Goal ACTIVE. Current accounting14,227,270tokens/90,746seconds; since the previous recorded counter13,977,303/89,451: +249,967tokens/+1,295seconds (includes context/runtime overhead). Next bounded unit is the12autosave preservation workflow. Full delivery duration remains low-confidence until provider acceptance, four example sites and SDK workflows are measured. No external wait blocks that next implementation.
