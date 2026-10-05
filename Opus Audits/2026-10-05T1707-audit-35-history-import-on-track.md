# Opus Audit 35 — historical import delivered on both sites; renderer work in progress
**Auditor:** Claude Opus · **Written:** 2026-10-05 17:07 MDT · **Covers:** 16:09 → 17:07
**Live source:** hardening worktree @ `1be49ae3` (17:00), plus uncommitted work in progress.
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched. Tracker read with `mt`.

---

## 1. State

| Check | Result |
|---|---|
| Commits since audit 34 | **3:** `6ca97a78` historical saved/unsaved import 16:18 · `001a4313` target rollout docs 16:35 · `1be49ae3` history retirement 17:00 |
| Uncommitted work in progress | 15 modified files and 4 new test files: the Admin page/post edit routes and `NativeCanonicalEditor`; the Website `client.tsx`, `PageContent`, and blog/page routes; and the `blog.post`/`page` surfaces in all four packs (core, journal, depot, aster-house). This matches Astra's stated next step on editor/renderer dispatch |
| Session log last written | 17:06:41. **No stall** |
| Goal metadata | ACTIVE |
| Tracker (fresh `mt` pull) | **137 rows: 117 Verified / 20 In progress.** No row changes; matches `checkpointCounts` |

## 2. Progress vs plan

- **Tasks:** 1 and 2 complete; 3, 4 and 5 in progress; 6, 7 and 8 pending. Unchanged.
- **Register:** 71 entries, none new. The E07 status text was updated.
- **E07:** historical saved and unsaved content now imports into canonical blocks on both sites, with exact-source download. Per Astra's notes, all 196 captured historical sources convert.
- **E07 is not closed:** the live editor/renderer dispatch work is the uncommitted batch in §1.
- **Evidence spot-check (`1be49ae3`, `output/history-retirement-20261005/`):**
  - `preservation.json`, source: 116 posts, 434 revisions, original rows exact, appearance exact, email queue/templates exact.
  - `preservation.json`, target: 29 posts, 88 revisions, the same exact checks.
  - `installed-preservation.json`, source: 1626 hashes, catalog and packs exact.
  - `installed-preservation.json`, target: 1620 hashes, catalog and packs exact.
  - These match the notes.

## 3. Drift check

All 3 commits and the uncommitted batch are Task 4/E07 (block editor and template surfaces). **No out-of-scope work this hour.**

## 4. Findings

- **Count parity (observation).**
  - Astra's 17:00 note cites "108 extension files exact" (source) and "86" (target).
  - `installed-preservation.json` reports `pluginFilesUnchanged: 71` (source) and `55` (target).

  These may be different scopes, but the report should name which figure it means.
- **Template-surface change in progress (next audit).** The uncommitted batch edits the `blog.post` and `page` surfaces in all four packs, and adds `templates/sdk/canonical-surfaces.test.ts` and `.cases.jsx`. When it lands, I will check the four packs for parity and for public rendering of existing canonical documents.
- **Code review this hour:** limited to scope and evidence. Astra's advisory questions from this period remain unanswered in this audit.

## 5. Deferred (out of scope)

Unchanged per CODEX-RESPONSE-33 and 34:
- D3 adapted/deferred pending reproduction.
- D4 rejected.
- D5, O3 and O5 deferred.
- O4 informational.

Nothing was worked out of scope this hour.

## 6. Corrections

None.
