# Opus Audit 37 — creation paths moving to canonical; on track
**Auditor:** Claude Opus · **Written:** 2026-10-05 19:06 MDT · **Covers:** 18:07 → 19:06
**Live source:** hardening worktree @ `599374ce` (18:49), plus uncommitted work in progress.
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched. Tracker read with `mt`.

---

## 1. State

| Check | Result |
|---|---|
| Commits since audit 36 | **2:** `f1946677` route HTTP post/page authoring through canonical documents, 18:39 · `599374ce` retire unused legacy post/page creation endpoints, 18:49 |
| Uncommitted work in progress | WordPress sync (`wordpressSync/phases/{posts,pages}.ts`, `internals.ts`, `helpers/wpClient.ts`, `schema/wordpressSync.ts` and tests) plus `canonicalDocuments/service.ts`. Matches `output/wp-canonical-20261005/` |
| Session log last written | 19:06:39. **No stall** |
| Goal metadata | ACTIVE |
| Tracker (fresh `mt` pull) | **137 rows: 117 Verified / 20 In progress.** No row changes; matches `checkpointCounts` |

## 2. Progress vs plan

- **Tasks:** 1 and 2 complete; 3, 4 and 5 in progress; 6, 7 and 8 pending. Unchanged.
- **Register:** 71 entries, none new. The E07 status text was updated.
- **Evidence spot-check.**
  - `output/http-canonical-20261005/source-tests.txt`: 160 pass / 0 fail, 1628 assertions.
  - `output/legacy-create-retirement-20261005/source-tests.txt`: 168 pass / 0 fail, 1666 assertions.
  - **Target, before and after:**
    - `target-tests.txt` (first run): 133 pass / **5 fail**, in page depth/reparenting, page topic-relationship deletion and category deletion.
    - `target-tests-final.txt`: **138 pass / 0 fail**, 1168 assertions.
    - CODEX-NOTES line 727 records the 5 initial failures and the bounded target backports that fixed them.
  - Both `preservation.json` files: source 116 posts / 434 revisions and target 29 / 88, original rows, appearance and email queue/templates exact.
  - These match the notes.

## 3. Drift check

Both commits and the uncommitted WordPress-sync batch are Task 4/E07 work: moving content-creation paths onto the canonical model. **No out-of-scope work this hour.**

## 4. Findings

- **Test failures resolved.** The 5 initial target test failures are resolved in the final run (`target-tests-final.txt`, 138/0). They were caused by target-snapshot gaps, which were backported, not regressions in source.
- **Code review this hour:** limited to scope and evidence. Astra's advisory questions remain unanswered in this audit.

## 5. Deferred (out of scope)

Unchanged per CODEX-RESPONSE-33 to 35. Nothing was worked out of scope this hour.

## 6. Corrections

None.
