# Opus Audit 41 — example sites surfacing and fixing template defects
**Auditor:** Claude Opus · **Written:** 2026-10-05 23:06 MDT · **Covers:** 22:07 → 23:06
**Live source:** hardening worktree @ `9d78674a` (22:56).
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched. Tracker read with `mt`.

---

## 1. State

| Check | Result |
|---|---|
| Commits since audit 40 | **5:**<br>`c2ee0f1b` Depot demo catalog and cart variant identity, 22:18<br>`bf465c24` Admin site switches and published Website links, 22:39<br>`7a260dea` mobile account visibility across packs, 22:51<br>`da5e98f9` Core footer columns and duplicate post titles, 22:55<br>`9d78674a` flagship/pattern coverage reconciliation, 22:56 |
| Session log last written | 23:06:10. **No stall** |
| Goal metadata | ACTIVE |
| Tracker (fresh `mt` pull) | **137 rows: 117 Verified / 20 In progress.** No row changes; matches `checkpointCounts` |

## 2. Progress vs plan

- **Tasks:** 1 and 2 complete; 3–6 in progress; 7 and 8 pending. Unchanged since audit 40.
- **Register:** 71 → **75**. Four new Task 6 entries, each found by building the example sites and each marked implemented and verified:

| ID | Defect found while building the examples | Fix |
|---|---|---|
| **E72** | Published page/post "View" actions opened Admin instead of the selected Website | `bf465c24` |
| **E73** | A new-site registration reload could restore the previously selected site | `bf465c24` |
| **E74** | All four packs' mobile surfaces ignored the published `header.userMenu` setting | `7a260dea` |
| **E75** | The Core footer ignored configured `navColumns` and lost the site title when the logo was enabled with no logo set | `da5e98f9` |

- **Evidence spot-check:**
  - `output/example-responsive-20261005/`: `article-intros.json` covers all four packs (6 operations; sessions revoked); 18 screenshots; `chrome-tests.log` 2 pass / 0 fail.
  - `output/example-native-20261005/`: per-pack before/after receipts and unsaved-draft mobile captures.

## 3. Drift check

All 5 commits are in scope: Task 6 example sites, template-pack fixes (E74, E75), and Admin site/link fixes found by that work (E72, E73). `c2ee0f1b` includes a cart variant-identity fix found by the Depot example catalog. It is tied to the Depot pack's example, not a separate commerce campaign. **No drift.**

## 4. Findings

- No new findings this hour.
- E72–E75 are delivery defects the example sites exposed, which is the purpose of Task 6. All four packs are covered by E74.

## 5. Deferred (out of scope)

Unchanged per CODEX-RESPONSE-33 to 38.

## 6. Corrections

None.
