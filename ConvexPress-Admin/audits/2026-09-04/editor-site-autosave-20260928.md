# Native private Website autosave — 2026-09-28

E19 now has durable device recovery and private Website autosave. Native acceptance proves exact cross-profile recovery, competing-window review, saved-revision conflict handling, explicit Save and cleanup without an automatic accepted/publication write. The block tracker remains **60 Verified / 77 In progress**; Task 1 remains open for the delivery map and E01 pointer/scroll acceptance. Earlier device force-crash proof is in `editor-device-recovery-20260928.md`.

## Behavior and boundaries

`canonicalDocumentDrafts` stores one private draft per document and authorized author. Every read/write checks current content-edit authority, document state and Website/environment identity. Saves use a private generation CAS and accepted base revision. Exact immediately preceding retries can reconcile a lost acknowledgement; different or delayed payloads cannot replace a newer generation. Discard keeps a generation tombstone, so a delayed first save cannot resurrect deleted input. Permanent document deletion removes drafts in bounded batches using the existing media-reference lifecycle.

The native editor debounces private saves for 1.5 seconds and serializes requests while retaining subsequent edits. It pauses for pending accepted writes, unresolved recovery, document conflicts and external locks. AI proposal review does not autosave. Recovery requires an explicit choice; it only changes editor input. A changed saved revision offers explicit discard or keep-against-current before a later Save. The normal accepted Save remains an explicit action and clears only the reviewed private generation. Failed or uncertain autosave stays visible and retries by reading current state before deciding whether a write is appropriate.

The structural recovery decoder preserves unfinished/invalid nested input. Server drafts are capped at900KiB; the device tier has a2MiB decoded/4MiB envelope limit. Device storage failure is visible. Device journals live in plaintext in the Electron profile, require fresh authorization before being offered, and remain scoped to the operator, role, connection, Website and environment. There is no claim of encryption, power-loss durability or transactional simultaneous localStorage writes. The server draft CAS is the multi-window coordination boundary.

Abandoned drafts deliberately have no automatic expiry. They remain until explicit replacement/discard, accepted Save cleanup or permanent document deletion. A TTL was considered from Claude F12 and declined because the delivery requirements do not authorize silent expiry of recoverable work. Fleet retention policy can be specified separately.

## Verification

- The focused editor suite passes **32 tests across9 files**, including actual React editor recovery review, publication disabling before a device choice, explicit revision-conflict retention, serialized later edits, uncertain-reply reconciliation, changed/discarded private generations and unmount fences. The new private-hook fixture runs its own isolated cases. Relevant failing baselines and passing receipts are under `output/editor-recovery-20260928/` (`site-autosave-editor-suite.log`, `recovery-publication-red.log`, `site-recovery-conflict-red.log`).
- The backend/shared affected suite passes **141 tests across6 files**, including6 registered draft-handler tests for current authority, per-author isolation, invalid input, exact retry/idempotence, wrong scope, stale revision/generation, size limits, media references and130-row bounded cleanup. `site-draft-affected-tests.log` records the result. Lost-reply cases are controlled tests; no native network-acknowledgement drop is claimed.
- Backend, Admin web and Website web app typechecks pass. Installed contract compiler fixtures pass for both consumers. Generated backend API changes are additive; consumer contract comparison removed no prior endpoint. Four broad pre-existing document-return unions acquire the new table's row type; application typechecks pass.
- Disposable staging4860 deployment succeeded after a private storage-inclusive backup. All **2,400 existing installed function signatures** are unchanged, with four new draft handlers. All22 installed Events source files were retained. Consumer index ready after240 steps; media index ready across30 owners. Source/deployment receipts are in `output/editor-recovery-20260928/`; index/contract/native receipts are in `output/editor-autosave-20260928/`.

## Real Electron acceptance

Owned Electron33.4.11 profiles used renderer4105 and the existing disposable staging instance `promotion-source-20260911`, not live4870. Original owned PID75621 and fresh-profile PID76293 were both closed after signing out. The user's existing PID39198 remained running.

1. Created owned page `g1833d978mdds6b3v1x99xzem98f9haj` through native Add a Page, initialized canonical content, explicitly saved a baseline and published it. Accepted revision3 had no blocks.
2. Authored an unsaved title and Section containing Announcement bar, including deliberately inverted schedule dates. Native status confirmed private autosave; admin readback of the actual per-author draft matched the input. Save was disabled for invalid fields. Accepted revision3, history and publication remained byte-for-byte unchanged. The actual built Website page remained200 with identical rendered body and no unsaved title/notice or browser errors.
3. Opened the same page in a **fresh second Electron profile with no device journal**. Website draft review disabled authoring/publication until a choice. Restore reproduced the exact complete private draft, including IDs, nesting, title and invalid values. Screenshots were visually reviewed.
4. Edited the original window to advance private generation3→4. The second window's competing edit was refused while preserving its input. Retry read generation4 and required explicit review; keeping the second input advanced to generation5. Accepted content/history stayed at revision3.
5. An independent authorized explicit save moved the accepted document to revision4. Both native editors retained their input and reported a conflict. Choosing keep-against-current in the second window advanced only private generation5→6/base revision4; accepted revision/history remained unchanged.
6. Corrected the schedule and explicitly clicked Save in the second native editor. Accepted revision advanced to5 with the exact nested content and final title. Its device journal was removed and the private row became generation7 with `draft:null`.
7. The original stale window could not silently recreate its older private draft. Retry exposed the discard marker. Explicit Use saved document loaded revision5 and cleared its device journal. No additional accepted write occurred.
8. Signed out and closed both owned native sessions. Removed only the owned page and verified its private row was removed. All42 original pages and appearance identity/values matched the baseline. A fresh export confirmed all115 original posts/pages and six Events/three media tables unchanged. The owned API session was revoked.

Evidence includes `site-offer-second.json`, `site-restored-second.json`, `private-invalid.json`, `private-first-competing.json`, `private-competing-refused.json`, `private-second-chosen.json`, `private-against-current.json`, `private-after-save.json`, `discard-tombstone.json`, paired server/public receipts and `cleaned-preservation.json`.

## Harness and remaining work

A few first-pass native locators used the wrong exact labels or toggled an already-open block browser. Corrected locators completed the checks; these were harness mistakes. Convex CLI prints non-JSON for an empty table; the post-deletion export independently verified removal. An initial Website typecheck ran from the monorepo root instead of its app project and selected the wrong TypeScript scope; the actual Website web app check passed.

Root-only API generation omits installed-only plugin source. Final generation used the preserved installed snapshot; no plugin source or endpoint was removed. This remains an explicit source-boundary distinction, not a reason to replace installed extensions.

E01 wheel/drag/large mixed-tree acceptance and the remaining delivery-map review are next. No block row was newly marked Verified by these shared editor checks. No push. Claude audit03 was reviewed; dispositions are in the owner-designated `Opus Audits/CODEX-RESPONSE-03.md`.
