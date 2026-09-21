# Canonical block protection — September 21

Shared edit/move/remove protection and native sibling movement are implemented and verified on isolated staging. This closes the active-lock portion of the instance contract; conditional visibility, full per-block quality and the production goal remain open. Original audit remains eight accepted/sixteen open.

## Behavior

The closed canonical boolean lock fields now accept active values. The shared transition guard compares the saved tree to proposed content, including nested blocks. An edit lock protects the block's authored content, layout/treatment/anchor and descendants; lock metadata itself remains editable. A remove lock protects the block when either it or an ancestor is removed. A move lock prevents reparenting and crossing retained original siblings, including movement of an ancestor. Inserting a new neighbor or deleting an unlocked neighbor is allowed. Flags are independent: edit-only protection does not also prohibit removal.

Unlocking must be saved separately. Clearing a lock and changing the protected content in the same write is rejected. Native fields, removal, sibling move controls, insertion and history use both saved and draft protection; an unsaved unlock cannot enable protected operations. Undo/redo and ordinary revision-guarded saves remain the authoring path. Older revision restoration uses the same guards; returning to a legacy editor cannot erase active protections. The central canonical authoring-write fence also checks permitted writes, including promotion callers. This is an authoring safeguard, not an authorization role or a restriction on whole-document trash/delete.

Public projection strips lock metadata and renders content normally. Legacy lock settings that previously had no effect still require inactive-settings review during conversion; this change does not silently activate them. Shared conditional visibility remains rejected until implemented.

## Verification

- Root block suite:142 passing tests/17,512 assertions. Renderer suite:292 passing/5,111 assertions. No renderer presentation changed.
- Registered document and exact-write-fence suite:102 passing/977 assertions. Covers saved lock enforcement, independent unlock, invalid metadata, ancestor/descendant behavior, canonical restore and legacy recovery with no document/history change on refusal. Public DTO fixture has all protections active and still omits them.
- Full canonical-editor suite:57 tests/1,103 assertions pass. Editor DOM coverage exercises controls, movement, Undo, saved versus unsaved unlock, authority removal and actionable recovery errors. The new recovery-message regression failed before the UI fix and passed afterward. An older test still expected every active lock to be invalid; it now retains invalid non-boolean rejection while positive active-lock coverage is provided by the new tests.
- Broader Convex backend suite:3,298 tests/18,159 assertions across298 files pass.
- Admin/Website TypeScript and production builds pass. Strict deployed backend TypeScript passes. Generated root/backend/portable contracts and distributed block kit checks pass; focused lint and whitespace pass. Existing bundle-size warnings remain.

## Actual native and Website evidence

Backed up disposable source4860 including file storage, then strictly deployed a1,593-file checkpoint preserving its generated SDK plugin graph. Initial preflight refused the changed authoring boundary until the reviewed consumer-index version was regenerated; the successful retry is recorded separately. Normal resumable rebuilding reached ready after217 mutations/212 checked documents. No target4870 or cloud deployment occurred.

Owned native Electron57756 selected Promotion Lab staging. Created one three-block legacy page, reviewed conversion and converted it. Heading protections immediately disabled fields/move/remove; saved values were read back from the backend. Native unsaved unlock kept operations disabled; its separate save enabled them. Native anchor editing, sibling movement, removal/Undo, re-lock, save and reload retained exact flags, order and anchor. The settled native protection screenshot was inspected.

Direct authenticated bypass attempts for combined unlock/edit, remove, move and original-editor recovery were rejected; anonymous writes were denied. Exact canonical document and revision-history reads were unchanged after each. After the anchor/order change, an older canonical restore was rejected as well.

Native publication rendered the protected content through the actual production-built Website at1440 and390px. Both headings, the saved anchor, no horizontal overflow and no captured page errors were checked; the mobile screenshot was inspected. Anonymous public DTOs omit lock metadata. These are Core fixture checks, not an all-template or whole-library design approval.

Native original-editor recovery correctly refused active locks but initially displayed a generic reload error. The workspace now uses the existing public-error extractor; a failing-before DOM regression and the actual native refusal both verify the precise unlock-and-save instruction. After separate native unlock, withdrawal and original-editor recovery, all original authored fields match. Expected revision/update fields and retained publication timestamp differ.

## Observations and cleanup

The first native lock save completed at revision3 while the consumer-index rebuild was active, but the editor remounted into a conservative recovered-draft conflict. Saved flags were positively read before loading that revision; no uncertain write was replayed. Subsequent stable-index unlock/save/re-lock/reload flows passed. Existing query-observer recovery tests pass. The remount cause is not established; this observation remains a follow-up and is not represented as a clean initial save or a repaired product defect.

All42 pre-existing pages and complete appearance identity/values match baseline; the fixture is trashed. API logout returned200. Native sign-out was visibly confirmed and persisted in a receipt before closing. Playwright's graceful close subsequently timed out and reset its kernel; only the owned native PID was terminated, and its exit verified. Owned Website/tunnel processes stopped; original Electron39198, renderer69634, BlockDemo8172 and SOCKS68390 remain alive. The acceptance browser was no longer running after kernel cleanup. No push, production provider or DNS change.

MagicTables records the scoped evidence on core/heading only, with Status unchanged; planned one-row Notes update and full137-row comparison are recorded in the output receipts. Other blocks do not gain blanket verification from a shared feature.

Artifacts: `output/block-locks-20260921/` contains deployment/backup manifests, tests, native/public screenshots and receipts, denied-write history checks, restoration/cleanup and MagicTables readbacks. Snapshot: `ConvexPress-Admin/output/production-checkpoints/block-locks-20260921`.
