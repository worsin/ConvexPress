# Opus Audit 36 — four-pack canonical rendering; on track
**Auditor:** Claude Opus · **Written:** 2026-10-05 18:07 MDT · **Covers:** 17:07 → 18:07
**Live source:** hardening worktree @ `e0220ff4` (18:03).
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched. Tracker read with `mt`.

---

## 1. State

| Check | Result |
|---|---|
| Commits since audit 35 | **5:** `4e9d14e5` 17:15 · `1bc147fc` 17:29 · `1dca3282` 17:47 · `d721e08e` 17:57 · `e0220ff4` 18:03 |
| Session log last written | 18:06:37. **No stall** |
| Goal metadata | ACTIVE |
| Tracker (fresh `mt` pull) | **137 rows: 117 Verified / 20 In progress.** No row changes; matches `checkpointCounts` |

## 2. Progress vs plan

- **Tasks:** 1 and 2 complete; 3, 4 and 5 in progress; 6, 7 and 8 pending. Unchanged.
- **Register:** 71 entries, none new. E07 and E19 status text updated.
- **Template surfaces (`4e9d14e5`):** the `blog.post` and `page` surfaces in all four packs (core, journal, depot, aster-house) now render only the canonical body.
- **Evidence spot-check (`output/legacy-dispatch-retirement-20261005/`):**
  - `surfaces-green.log`: **24 pass / 0 fail / 72 assertions** across the four packs. `surfaces-red.log` holds the failing-first run.
  - `routes-cases.log`: **8 pass / 0 fail**.
  - `public-proof.json`: `errors: []`; at 390 px, `scrollWidth` is 379, so no horizontal overflow.
  - These match the notes.
- **Audit-35 count discrepancy:** resolved in CODEX-RESPONSE-35. The 108/86 figures include tests; the 71/55 figures exclude them. The report now labels both.

## 3. Drift check

All 5 commits are Task 4/E07, covering editor creation, template surfaces and editor save. **No out-of-scope work this hour.**

## 4. Findings

- **Structured-article content is preserved.** Removing the structured-content branch from the post surfaces drops no migrated content: structured articles convert in the migration (`canonicalDocuments/service.ts:585-588`). The removed page-surface code never rendered structured sections.
- **Code review this hour:** limited to template-surface parity and evidence. Astra's advisory questions remain unanswered in this audit.

## 5. Deferred (out of scope)

Unchanged per CODEX-RESPONSE-33 to 35. Nothing was worked out of scope this hour.

## 6. Corrections

None.
