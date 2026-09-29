# Opus Audit 23 — F21's first real test, and a check that intentionally exits 1
**Auditor:** Claude Opus 5 · **Written:** 2026-09-29 10:20 MDT · **Covers:** 09:20 → 10:20
**Live source:** hardening worktree @ `dd225bc2` plus 13 files in flight (menu/nav semantics, E28)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**117 Verified / 20 In progress — unchanged**, zero downgrades, parity at zero stale rows. No row moved, and this was still one of the more consequential hours of the series.

**F21's first real test ran, and it passed.** I raised the criterion in audit 11 and it has been waiting for Task 4 ever since. E07's migration corpus scan is exactly F21-shaped — complete paginated inventory, counted converter coverage, and **four refusals explicitly retained and enumerated by cause**. Better still, E62's repair made the migration check **intentionally exit 1** with a complete report rather than pass on partial work. §3

**E28 is repaired** after sixteen hours idle, through a single shared cause. **E22's receipt path executed** with a six-mode negative suite. **F28 was answered exactly as I framed it.** §4

Codex issued two wording corrections to me, both fair — including one that catches me making the very error I had spent the previous audit warning about. §5

---

## 2. Deltas since audit 22 — verified

| | Audit 22 (09:20) | Now (10:20) |
|---|---|---|
| Hardening HEAD | `9cf1352f` | **`dd225bc2`** (+4 commits) |
| Divergence | main +55 / hardening +43 | main +59 / hardening +47 |
| Live tracker | 117 / 20 | **117 / 20 — unchanged** |
| Downgrades | none | **none** |
| Header / rows / live parity | aligned | **aligned, 0 stale** |
| Blockers | 61 | **62** (E62) |
| Full tooling suite | 183 pass / 1 fail | **185 pass / 0 fail** |

Commits: `6c8badac` record source-bound centralized block renderer evidence · `cec6e18b` preserve canonical specs during legacy migration planning · `45a8cd95` record legacy corpus provenance and revision conversion limits · `dd225bc2` preserve heading and separator semantics across template menus.

Zero row movement is the honest outcome: three of the four commits advance blockers rather than rows, and the fourth (`dd225bc2`) repairs E28, which was never a row.

**F2** holding — 0 `git push` lines in both hooks.

---

## 3. F21's first real test — passed, and then exceeded

F21 is the criterion I raised in audit 11 after four instances of partial work reported as success, recorded durably in audit 14, and bound to E07 in audit 18: *"any migration/backfill/export claiming completeness must prove full intended coverage or return an explicit incomplete/blocked result."* Task 4 was always its first genuine test. It ran this hour.

### The corpus scan (E07)

E07's status now records real inventory rather than a category:

- **Complete paginated scans** of source 4860 and target 4870 across posts, revisions, legacy reusable and synced tables, recorded privately.
- **116 / 29 documents** including trash; **42 / 2 legacy**; **7 / 2 active legacy**.
- **Pure converters accept 38 of 42 source** and 2 of 2 target.
- **4 source refusals explicitly retained and itemised by cause**: three raw-text documents and one multi-block list item — *including two published raw-text posts.*
- Two target registered draft preflights pass.
- **"No content migrated."**

That is the criterion satisfied on every clause. The inventory is complete rather than sampled; converter coverage is counted rather than asserted; the four refusals are retained, enumerated by cause, and the fact that two are *published* posts is disclosed rather than buried. And nothing was written on the strength of partial coverage. Evidence sits in `output/migration-corpus-20260929/{inventory,conversion-review,reusable-inventory}.json` with the report at `migration-planner-corpus-20260929.md`.

### The part that exceeded it (E62)

The full tooling suite surfaced two pre-existing failures while this ran. One was a promotion expectation that omitted an intentionally retained `definitionJson`. The other became **E62**: `stagedMigrationPlan` blended current nested `authoringActions` with historical fields lacking `Feature Grid items.*.link` and `Team Grid members.*.links.*`, reproduced in both the tooling suite and the actual `check:blocks-migration` CLI.

Codex pre-committed to the repair boundary before doing it: *"do not strip modern constraints or rewrite installed specs to force green."* The closed status shows it held to that:

> *"historical proposals separated from unchanged installed canonical specs; installed write targets skipped and new files exclusively created. Failing-before preservation regression and unchanged 54-definition migration check pass; full tooling 185/0. Actual migration check now emits complete 54-schema/44-pending-render-acceptance report and **intentionally exits 1**."*

The last clause is F21 realised in tooling rather than in prose. The migration check does not pass, and it does not hide: it emits a complete 54-schema / 44-pending-render-acceptance report and returns a non-zero exit to say so. An explicit incomplete result is precisely what the criterion asked for, and turning it into an exit code makes it enforceable by anything that runs the suite.

Two things I want on the record about this. First, the easy path was available and was not taken — relaxing the modern constraint or rewriting the installed spec would have produced 185/0 without the exit-1 report, and nobody would have noticed. Second, the tooling count moved **183/1 → 185/0** with the remaining incompleteness relocated into a deliberate non-zero exit, which is a genuinely better end state than a suite that is green because it stopped asking.

E07 itself remains open, correctly: *"repository/demo corpus, references, render/recovery acceptance and active legacy retirement pending."*

---

## 4. E28 repaired; E22's receipt path executed; F28 answered

**E28** — the header-consumer separator defect, open since audit 06 and idle sixteen hours — was repaired through **one shared cause**: `MenuItemTarget`, applied across four-pack headers, mobile menus and resolved-menu footer consumers. Failing-before link-count and nested expanded-state regressions now pass **31 controlled SSR/DOM checks**, with Website TypeScript and scoped lint passing. Thirteen files are in flight completing the four-pack live responsive and popup/focus verification. A single shared repair across three consumer surfaces is the right shape for a defect that presented in one of them.

**E22's receipt path executed**: 317 renderer tests / 5,493 assertions, 137 current block versions, 1,148 pack/example executions, plus 7 receipt/tracker tests with 38 assertions. The negative coverage is what makes it trustworthy — *"Failed/missing/partial/duplicate/foreign/stale receipts fail, and source freshness includes shared implementations/adapters/test inputs/dependency manifests."* Six distinct failure modes plus freshness across shared implementations, adapters, test inputs and dependency manifests. E22 stays open for final screenshot provenance, with the scope limit stated plainly: *"controlled render examples do not certify native/live/mobile/motion behavior."* A receipt mechanism that declines to certify what it cannot observe is the version worth having.

**F28 answered exactly as framed.** I asked whether `core/heading` was the sole gate failure or the first of 115 identical ones, and said I could not determine it. Codex: *"`core/heading` was the first thrown error in the row loop. The identical block-local convention affects 115 of 117 Verified rows; this was not an isolated Heading defect."* Confirmed and clarified in the E22 status and report. Asking rather than asserting produced the right answer at no cost.

**`core/event-rsvp`** is held on something neither of us should force: a real disposable managed Turnstile widget with six refusal checks passing, but *"A human challenge is still pending in headed Chromium; no bypass or fabricated provider success."* Solving a CAPTCHA programmatically is prohibited for me as well, so we agree on the boundary — the row waits for a human or an explicit external-prerequisite acceptance.

---

## 5. Two corrections from Codex — one catches me making the error I had just warned about

**1. "Floors" was wrong.** Codex: *"historical audit counts are snapshots, not guaranteed lower bounds (a justified future downgrade remains possible)."* Correct. In audit 22 §5 I wrote that every figure is "a floor at read time," which smuggles in an assumption that counts only rise. A justified downgrade is legitimate and would falsify it. The accurate statement is simply: each figure is a **snapshot at its header timestamp**, with no directional guarantee.

**2. "Block library at 85%" invites the misreading I was warning about.** Codex: *"117/137 is a tracker-row ratio, not an overall delivery-completion percentage."* I have flagged that conflation myself — F25 exists because of it, and audit 18 §3 credited E10 for refusing it. Then I wrote a bare percentage into audit 22's progress table anyway. A row ratio expressed as a percentage reads as completion whatever the surrounding caveats say, so the figure should be written as **117 of 137 tracker rows** and nothing else.

That is the seventh correction of the same underlying shape, and the sharpest one yet: the error appeared in the audit where I was cautioning against it. The procedural fix is narrow — **state counts as counts, not as ratios or percentages** — and I will apply it from here.

---

## 6. Status of findings

| ID | State |
|---|---|
| **F1** plugin defaults | Closed (audit 15). |
| **F2** auto-push | Closed, holding. |
| **F17** reference gate | Accepted into E17/Task 7. |
| **F18 / F24** status parity | Holding, enforced; 0 stale rows. |
| **F19** page-href duplication | Closed (audit 13). |
| **F20** backfill truncation | Deferred register with promotion condition. |
| **F21** complete-or-explicitly-incomplete | **First real test passed**, and realised as a non-zero exit in the migration check. Remains bound to E07 for the rest of Task 4. §3 |
| **F22** | Closed (audit 14). |
| **F23** public-read lens | Retained, correctly bounded; paid out on E58. |
| **F25** un-triaged blockers | Closed (audit 18). |
| **F26** prerequisite visibility | Visibility retained; conclusion withdrawn (audit 20). RSVP's human challenge is a new member of this family. |
| **F27** E18 summary | Central claim withdrawn (audit 21). |
| **F28** E22 scope sentence | **Closed** — answered and clarified in the E22 status. §4 |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed; no regressions observed. |
| **F12** · **F15** | Declined / located, with reasoning. |
| **E07** migration | Open, now with a complete corpus inventory. |
| **E22** screenshot identity | Open for final screenshot provenance; receipt path executed. |
| **E28** header separator | **Repaired locally**; four-pack live verification in flight. |
| **E62** planner | Closed without forcing green. |

---

## 7. Where the delivery stands

| | Series start | Now |
|---|---|---|
| Tracker rows Verified | 58 of 137 | **117 of 137** |
| Tasks complete | 0 | 2 |
| Tasks pending | 2–8 | 4–8 |
| Blockers registered / un-triaged | 18 / 18 | 62 / **0** |
| Full tooling suite | — | **185 pass / 0 fail**, with migration incompleteness surfaced as a deliberate exit 1 |
| Downgrades, cumulative | — | **zero** |

Fifty-nine rows accepted, forty-four blockers surfaced, no Verified row rolled back. Task 4 has begun in substance even while its status reads `pending`; Tasks 5–8 remain untouched.

---

## 8. What I will measure next hour

1. Whether E28's four-pack live responsive and popup/focus verification completes and the row-free repair is accepted.
2. Task 4's next step — the repository/demo corpus and the four retained refusals, especially the two published raw-text posts.
3. Whether `core/event-rsvp` resolves via a human challenge or is recorded as an external prerequisite.
4. Verified count, downgrade check, `check:delivery-status` parity.
5. Whether the migration check's deliberate exit 1 stays deliberate — i.e. that a later change does not quietly make it exit 0 without closing the 44 pending render acceptances.

---

## 9. Corrections and negative results

- **"Floors" is withdrawn** — counts are snapshots at their header timestamp with no directional guarantee; a justified downgrade remains possible. §5
- **"Block library at 85%" is withdrawn** — 117 of 137 is a tracker-row count, not a delivery percentage. Counts stated as counts from here. §5
- **F28 is closed by answer, not by assertion** — `core/heading` was the first thrown error in the row loop; 115 of 117 Verified rows share the condition. §4
- **The block-local test convention is met by 2 of 117 Verified rows** (audit 22) — verified against live status; the receipt path is a design correction, not a shortcut.
- **I cannot independently verify the notification queue figures** from audit 21, nor the tooling suite counts this hour — no Convex access and no command execution. Both rest on Codex's reports, which in each case disclosed a problem against itself.
- **The max-content overflow class remains not a finding** — six instances, all caught by the "eight maximum" acceptance cases.
- **My audit-20 corrections stand as accepted**: `core/reviews` not `commerce/reviews`; E56 omitted; F26's "owner-only" withdrawn; the refusal table mischaracterised temporary-enabling-with-restoration.
- **My audit-16 "no SSRF" wording applies to `servePublicStorageDownload` only**; **my E43 severity ranking remains withdrawn**; **my audit-01 F1 impact claim remains withdrawn**; **the Website manifest count is 16, not 17**; **tickets is not an E43 sibling**; **F23 is a lens, not a vulnerability claim**.
- **My audit-09 `menus/queries.ts:350` "drift" characterisation was wrong**; **audit 11's F21 framing was too narrow**; **audit 07's "48 resolvers" remains withdrawn**; the **`defineDataBlock` ↔ `spec.data` heuristic remains withdrawn**; the **"intentional-deny list" refinement to F17 remains withdrawn**; **367 bare `catch` blocks remains explicitly not a finding**.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**; **`core/featured-page` was never a latent E29**; **E38's cache re-checks integrity on hits and caches no authority** (audit 10); **E27's classification is `accepted repair`** (audit 12).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric; a mechanical count is a hypothesis; a duplicated expression may contain deliberate variation; an enumeration of sources of truth should be proven exhaustive; a two-table mismatch does not establish which paths consult them; derived status should be read from the live source; an absence in one artifact may be another finding's accepted resolution; a repeated defect shape is only a finding if no existing gate catches it; a held row is a result, not an omission; the sentence after the evidence stops is where my errors live; one field is not the record; a gate most of the codebase fails may be testing the wrong convention; **and state counts as counts — a ratio reads as completion no matter what caveat surrounds it.**
