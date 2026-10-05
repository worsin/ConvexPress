# Accepted Save and private-draft cleanup — 2026-10-05

## Demonstrated failure and repair

The canonical-create native acceptance found an older private Website autosave reoffered immediately after successful Save. Accepted content was intact, but cleanup waited for the same 1,500 ms debounce used for new autosaves. The UI reported “All changes saved” before clearing that known private draft.

A mounted-editor regression reproduced this without the debounce wait. The editor now captures its known private generation and any in-flight request when Save begins, stops new automatic writes for that Save, verifies the accepted receipt, settles its existing private request, and performs generation-checked cleanup before completing Save in the UI. Cleanup reuses the existing backend discard mutation and tombstone protocol; no backend/API/schema change or deployment was needed.

A later generation is preserved for explicit review, including a newer remote generation with identical text. Reconciliation of an uncertain own private acknowledgement requires an exact generation/body/base match. Input typed while Save is pending remains dirty and can autosave against the new accepted revision. Rejected or retired saves release the local barrier without clearing another document's draft. Cleanup failures leave the accepted save intact and expose the existing private-autosave error/retry path rather than replaying Save or claiming that unknown private state was erased.

## Verification

- Immediate mounted-editor cleanup assertion failed before the repair and passes afterward.
- Eight controlled sequences cover delayed private acknowledgement; an old-base private rejection after accepted Save; newer remote text; newer identical remote text; a lost private acknowledgement; discard transport failure and explicit retry; rejected Save; and editor retirement. The identical-text sequence caught an intermediate flaw, corrected before native acceptance. Pending local typing is preserved.
- Nine session tests plus the mounted-workspace and private-draft wrappers pass (**11 top-level tests / 58 top-level assertions**). The child suites run behind those wrappers; this count is not their combined case count. An initial combined run hit Bun's default five-second outer wrapper deadline during concurrent build/type work; the existing child timeout is 30 seconds. The bounded rerun with a 30-second outer timeout passed in 4.39 seconds.
- Admin types and production build pass; the existing chunk-size warning remains.
- Actual Electron on **target and source**: create an owned canonical draft, type an intermediate body, wait for its private autosave, verify generation 1, type final text, Save, verify a **generation-2 null tombstone at accepted revision 2 before reload**, immediately reload, and verify no stale restore prompt. Exact final text renders in the actual Website at **335 px**, without preview overflow or console/page errors. Save-to-complete observations were 1,364 ms target / 1,372 ms source; these are observations, not timing guarantees.
- The concurrent-device and dropped-ack sequences above are controlled mounted tests, not claims of native transport fault injection. Navigating away before an operation finishes can still leave recovery state for deliberate review; the repair does not blindly erase unknown generations.

## Preservation and remaining scope

Both owned documents, canonical history snapshots and private tombstones were removed. All original source **116 posts / 434 revisions** and target **29 posts / 88 revisions** remain exact. Appearance, mail queues/templates and other private drafts are unchanged. Native/API sessions revoked; owned Electron70211, Website70276/70277 and isolated profile cleaned. Owner processes39198/62672/65092 and existing RSVP fixtures preserved. Both consumer/media indexes remain ready. No publication or push.

The backend preservation bases remain `output/quick-draft-layout-20261005/{source,target}-source-installed.json`; this frontend-only repair does not supersede them. Evidence is in `output/accepted-save-cleanup-20261005/`.

This closes the demonstrated immediate-reload follow-up under E19. The full delivery goal remains active and incomplete (117 Verified / 20 In progress); generic legacy writers and the remaining template/SDK/integration work are separate open requirements. Audit35 remains latest observed and advisory; implementation does not wait for Claude's next audit.
