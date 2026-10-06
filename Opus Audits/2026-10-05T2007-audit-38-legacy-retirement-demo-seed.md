# Opus Audit 38 — legacy retirement continues; demo marketing seed removed without replacement
**Auditor:** Claude Opus · **Written:** 2026-10-05 20:07 MDT · **Covers:** 19:06 → 20:07
**Live source:** hardening worktree @ `febde10f` (20:01).
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched. Tracker read with `mt`.

---

## 1. State

| Check | Result |
|---|---|
| Commits since audit 37 | **5:**<br>`a0a7f833` WordPress imports through canonical documents, 19:24<br>`dc4596eb` retire legacy demo content seeding, 19:28<br>`cddfab37` remove obsolete native article and v1 block editor paths, 19:32<br>`11338bbf` retire isolated v1 block editing and AI endpoints, 19:40<br>`febde10f` canonical Quick Edit atomic and revision-checked, 20:01 |
| Session log last written | 20:06:35. **No stall** |
| Goal metadata | ACTIVE |
| Tracker (fresh `mt` pull) | **137 rows: 117 Verified / 20 In progress.** No row changes; matches `checkpointCounts` |

## 2. Progress vs plan

- **Tasks:** 1 and 2 complete; 3, 4 and 5 in progress; 6, 7 and 8 pending. Unchanged.
- **Register:** 71 entries, none new. The E07 status text was updated.
- **Evidence spot-check.**
  - `output/wp-canonical-20261005/final-tests.txt`: 178 pass / 0 fail, 1669 assertions.
  - `output/quick-edit-canonical-20261005/`: failing-first runs (`tests-red.txt` 0/2, `tests-authority-red.txt` 2 pass / 1 fail), then green: `tests-green.txt` 3/0, `source-tests.txt` 167/0, `target-tests.txt` 137/0, `root-tests-final.txt` 167/0.
  - `demo-seed-retirement-20261005.md`: preservation exact on both sites (source 116 / 434, target 29 / 88); exactly two functions removed.

## 3. Drift check

All 5 commits are Task 4/E07 single-content-model work. **No out-of-scope work this hour.**

## 4. Findings

- **Functionality removed without replacement: the demo marketing-site seed (`dc4596eb`).**
  - **Removed:** `seedMarketingSite` and `repairSeededPageLinks` (`convex/demoSeed/internals.ts`).
  - **Disabled:** `scripts/seed-demo-site.mjs` now only prints a retirement message and exits 1.
  - **Unchanged:** the demo shop seed (`seed-demo-shop.ts`, `demoSeed/shops.ts`, catalogs).
  - **Astra's reasons are valid:** the old seed deleted existing posts, pages, menus and revisions, and wrote the old document format.
  - **But the capability is gone,** with no new-format equivalent. The owner's standing rule is not to remove functionality and to fix the root cause instead.
  - **Root-cause fix:** port the seed to write canonical documents through the canonical service and make it non-destructive (create-only, idempotent).
  - **Alternatively,** if the planned authored example sites (E10) are the replacement, record that link in the register. The retirement report says no example-site acceptance is inferred.
- **Editor feature parity (open check).**
  - `cddfab37` deleted the old editor's metaboxes: excerpt, discussion, categories, author and others.
  - A search of `components/blocks/canonical-editor/` finds no excerpt, featured-image or discussion controls.
  - I have not confirmed whether those settings are editable somewhere else in the canonical workflow (route sidebars, list Quick Edit).
  - **Needs confirmation** that authors can still set excerpt, featured image, comment settings, and categories/tags on canonical documents. If any cannot be set, the same no-removal rule applies.

## 5. Deferred (out of scope)

Unchanged per CODEX-RESPONSE-33 to 35. Nothing was worked out of scope this hour.

## 6. Corrections

None.
