# Opus Audit 39 — audit-38 items handled; legacy renderers retired
**Auditor:** Claude Opus · **Written:** 2026-10-05 21:07 MDT · **Covers:** 20:07 → 21:07
**Live source:** hardening worktree @ `ca0c88eb` (21:05).
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched. Tracker read with `mt`.

---

## 1. State

| Check | Result |
|---|---|
| Commits since audit 38 | **5:**<br>`1dc5016a` bulk post edits revision-checked, 20:14<br>`18f52e5e` restore canonical document metadata controls, 20:35<br>`1655cd5d` retire generic legacy document update endpoints, 20:50<br>`cbc33bb4` Aster homepage layout from canonical content, 21:00<br>`ca0c88eb` retire unused legacy document renderers, 21:05 |
| Session log last written | 21:06:35. **No stall** |
| Goal metadata | ACTIVE |
| Tracker (fresh `mt` pull) | **137 rows: 117 Verified / 20 In progress.** No row changes; matches `checkpointCounts` |

## 2. Progress vs plan

- **Tasks:** 1 and 2 complete; 3, 4 and 5 in progress; 6, 7 and 8 pending. Unchanged.
- **Register:** 71 entries, none new. E07 and E10 status text updated.
- **Audit-38 follow-through (CODEX-RESPONSE-38):**
  - **Metadata parity: accepted and repaired** in `18f52e5e`. The new `canonical-editor/DocumentSettings.tsx` provides:
    - an excerpt field (`:45`);
    - a featured-image picker (`:46`);
    - a comments open/closed toggle (`:47`);
    - category and tag selection (`:49-61`).

    Author editing stays in Quick Edit.
  - **Demo seed: adapted.** The replacement is now tied to E10 in the register. E10's status says the retired seed "has no canonical replacement yet" and links safe example-site provisioning. Restoring the destructive seed was rejected.
- **Evidence spot-check:**
  - `output/document-settings-20261005/root-tests-final.txt`: 174 pass / 0 fail, 1673 assertions.
  - `output/document-settings-events-20261005/source-tests.txt`: 174 / 0.
  - `source-live-proof.json`: a live round-trip on an owned fixture (revision 2, one event), which ends `deleted`, so the fixture was cleaned up.

## 3. Drift check

All 5 commits are in scope: Task 4/E07 (editor metadata, bulk/quick edit, legacy retirement) and the Aster pack homepage (template system). **No out-of-scope work this hour.**

## 4. Findings

- **Audit-38 findings closed or tracked.** Metadata parity is closed in source, with green tests and a live round-trip. The demo-seed replacement is an open E10 item rather than a silent removal.
- **Large legacy deletions (`1655cd5d`, `ca0c88eb`):** about 800 lines of legacy update mutations and validators, and about 1,500 lines of legacy Website renderers (`BlockContentRenderer`, `StructuredContent`, `PostContent`, `BlockListRenderer`).
  - These are the planned single-content-model retirement, not loss of a capability. Both sites' corpora are canonical (audit 34), and the four pack surfaces render canonical bodies only (audit 36).
  - One open check for the next audit: nothing outside the post/page surfaces still imported these renderers. The commit passed the Website type tasks per Astra's report, which would catch a missing import.
- **Code review this hour:** limited to scope, evidence and audit-38 follow-through.

## 5. Deferred (out of scope)

Unchanged per CODEX-RESPONSE-33 to 38. Nothing was worked out of scope this hour.

## 6. Corrections

None.
