# Native editor device recovery — 2026-09-28

The canonical editor now saves a scoped device recovery draft on each edit and offers Restore/Discard after a renderer or app restart. This closes the reproduced memory-only crash-loss path. E19 remains open for site-side draft autosave; ordinary Save cannot be used as an autosave timer because it can update published content. No block tracker status changed (60 Verified / 77 In progress).

## Change and authority

The existing recovery provider now journals each document in browser-profile storage under its operator, role, connection, backend origin, Website and environment scope. A fresh authorized document read is required before opening a journal. The adapter structurally decodes title, complete nested tree and composed definitions while retaining unfinished values that ordinary authoring validation rejects. A recovered draft never grants authority or replays a pending save.

Same-session reconnect retains local input. A durable reopening initially displays the fresh saved document and disables content/publication actions until Restore or Discard is chosen. Restore changes editor input only; stale server content remains an explicit conflict. Matching current content reconciles an uncertain acknowledgement without another write. Confirmed Save or explicit Discard clears only the journal this editor owns. Sequential stale callbacks cannot overwrite or remove another window's newer copy; this is not a claim of transactional simultaneous multi-window writes.

Storage failure is visible and leaves the current draft in memory. Corrupt storage is not silently erased by mounting a clean editor. No credentials are journaled. Drafts remain available to the same operator after a fresh authorized login instead of being deleted indiscriminately on sign-out.

## Verification

- Meaningful failing baselines followed by passing recovery, decoder and actual React/provider tests. The final affected suite passed **22 tests across seven files**, covering recovery, document defaults, editor, workspace, AI proposal isolation, locks and visibility. Admin typechecking passed. Evidence: `output/editor-recovery-20260928/editor-suite.log` and `admin-types.log`.
- Real Electron 33.4.11, owned profile `electron-editor-recovery-20260928/-dev`, renderer 4105, disposable staging backend 4860 (`promotion-source-20260911`). The user's pre-existing Electron PID39198 was preserved.
- Created owned page `g1864w8w6x7p21mw5spvps2mkn8f8dvn` through native Add a Page, initialized canonical content, and explicitly saved an empty baseline at revision2. Authored an unsaved title and Announcement nested inside Section, including deliberately inverted schedule dates.
- Force-crashed the owned renderer (PID71072), closed that app and restarted the same profile (PID71439). The app offered recovery while showing the saved title. Restore returned the **exact whole draft**, compared as structured data with `draft-before-crash.json`; the invalid schedule remained editable and Save remained disabled. Server document, revision2, revision history and draft publication status were unchanged before/after crash and Restore.
- A later restart (PID71975) offered the draft again. Explicit Discard restored the saved title/empty tree and removed the journal; server revision/history/status remained unchanged. A subsequent native title edit plus explicit Save created revision3 and cleared the journal. The page remained a draft.
- Reviewed recovery-offer, restored tree/fields and discarded-state screenshots. Evidence directory also contains `draft-after-restore.json`, `server-after-restore.json`, `server-after-discard.json`, `native-discard.json`, `native-save.json` and `server-explicit-save.json`.
- Deleted only the owned page after verifying ownership/baseline. Exact comparison preserved all **42 original pages** and appearance identity/values. The owned API session was revoked. Evidence: `cleanup.json`.

## Limits and harness corrections

This is device recovery, not cross-device/site-side autosave or power-loss durability. Undo history is not persisted; authored input is. The journal envelope is bounded at4MiB and decoded draft at2MiB, with structural limits. A storage quota error is reported rather than claiming persistence. Large-document typing/scroll performance and full E01 acceptance remain pending.

Initial broad Bun file-filter invocation caused an ENFILE discovery failure; rerunning explicit file paths produced valid results. Those failed harness logs are not product regression evidence. A reload was canceled by the unsaved-work dialog as expected; adding a second dialog listener then failed inside the owned test runner. A fresh owned restart was used for discard proof. No user process or system file limit was changed.

Claude Opus audit02 was reviewed and dispositions recorded in the owner-designated `Opus Audits/CODEX-RESPONSE-02.md`. E01 retains its original pointer/menu/scroll scope, E19 owns durability/autosave, and Task7 now names the missing template-kit skills. No push or backend deployment was performed for this frontend change.
