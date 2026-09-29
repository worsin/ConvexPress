# Opus Audit 17 — Task 2 complete; F24 gated; nine blockers still un-triaged
**Auditor:** Claude Opus 5 · **Written:** 2026-09-29 04:20 MDT · **Covers:** 03:20 → 04:20
**Live source:** hardening worktree @ `2e16c275` (working tree clean apart from the owner's untracked handoff)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**95 Verified / 42 In progress** — five rows, zero downgrades, and **Task 2 is now `complete`**. The five accepted are exactly the remaining Task 2 rows I identified last hour from live data: `blocks/customer-showcase`, `blocks/grade-gallery`, `core/carousel`, `core/marquee`, `core/steps-with-media`.

**F24 is fixed and gated within the hour**, with a check that verifies five invariants rather than the one I flagged, and a demonstrated failing-before state. §3

One new finding: **nine blockers still carry the original un-triaged placeholder**, and they govern Tasks 4–8 in their entirety. The 95/137 block figure therefore overstates delivery progress, because the non-block half of the plan has never been reproduced or scoped. §4

---

## 2. Deltas since audit 16 — verified

| | Audit 16 (03:20) | Now (04:20) |
|---|---|---|
| Hardening HEAD | `3aaa5722` | **`2e16c275`** (+3 commits) |
| Divergence | main +36 / hardening +29 | main +40 / hardening +32 |
| Live tracker | 90 / 47 | **95 / 42** |
| Downgrades | none | **none** |
| **Task 2** | `in_progress` | **`complete`** |
| Blockers | 46 | **51** (E47–E51) |
| Stale status rows (F24) | **11** | **0** |

Commits: `d5c13a9c` complete moving-media blocks and enforce delivery status parity · `1ba9ac46` verify Steps motion and deliver block styles before hydration · `2e16c275` complete Grade Gallery acceptance and wrap image captions.

Three bounded Moving Media fixes landed: **E47** legacy-safe Showcase link validation, **E48** opt-in accessible Carousel playback, **E49** valid combined role/company capacity and long-text Quote wrapping — with native exact history recovery plus 8 normal and 8 maximum cases. E50/E51 were added beyond those. `1ba9ac46` also delivers block styles *before* hydration, which reads as a follow-through on the first-paint CSS timing Codex had previously deferred to Task 8.

**F2** holding — 0 `git push` lines in both hooks.

---

## 3. F24 fixed — and the gate checks more than I asked for

I verified the repair three ways. The three sources now agree exactly:

| Source | Verified / In progress |
|---|---|
| Live MagicTables tracker | **95 / 42** |
| `checkpointCounts` header | **95 / 42** |
| `blocks[].checkpointStatus` tally | **95 / 42** |
| **Stale rows** | **0** |

The new `scripts/blocks/check-delivery-status.mjs`, wired as `check:delivery-status`, asserts five distinct invariants — I asked for one:

1. **Row count is exactly 137** — catches a partial tracker readback.
2. **No duplicate names** on either side.
3. **Identity parity**: the sorted name lists must be `deepEqual` — catches a renamed or missing block, not merely a status mismatch.
4. **Per-row status parity**, reporting a diff of `{name, local, tracker}`.
5. **Header parity** against counts derived from the tracker, plus a status-value allowlist (`Verified` | `In progress`) that catches a typo'd status.

Codex reports it **failed on the real 11-row mismatch before repair and passes after**, and the execution guide now requires it after each complete tracker readback. Failing-before evidence on a tooling fix is not something I asked for and it is the right standard.

The design is correctly scoped: the check compares against `checkpointSource` — the saved exact readback — not live MagicTables, and Codex states plainly that it is *"a cache/checkpoint check, not permission to infer acceptance or rewrite MagicTables."* So validating the cache against the recorded snapshot is the repo's job, and comparing the snapshot against live remains mine. That division is sensible and I will keep doing the live comparison each hour.

---

## 4. F25 — Nine blockers governing Tasks 4–8 have never been triaged · **MEDIUM · Visibility**

Every blocker in the register carries a `status` field. Nine still hold the identical placeholder string from the first status file, unchanged since audit 02:

> *"requires current classification or closure; see guide"*

Those nine are **E04, E05, E06, E07, E08, E09, E10, E16, E18**, all classified `missing evidence`. Mapping them to their work:

| ID | Subject | Governs |
|---|---|---|
| E04 | 79 block rows with incomplete acceptance | largely superseded — per-row tracking replaced it |
| E05 | Preview protocol/origin/session/hydration/readiness boundaries | editor |
| E06 | All native field types, picker states, keyboard, nested/reusable/composed | editor |
| **E07** | One-content-model migration and legacy retirement | **Task 4** |
| **E08** | Palette and commerce-layout migration; old Themes/Shop-layout/builder screens | **Task 5** |
| **E09** | Customizer contextual fields, all packs/surfaces, header/footer/menu, operator authority | **Task 5** |
| **E10** | Four full default websites, flagship treatments, complete BlockDemo review | **Task 6** |
| E16 | Installed extension code lost by deploying a generic backend snapshot | deployment discipline |
| **E18** | Source/main/deployed artifact and screenshot divergence | **Task 8** |

**Why this is a visibility finding rather than a neglect one.** Classifying a blocker when you reach its work is defensible sequencing, and F3's original ask was satisfied where it mattered most: all 137 block rows carry specific per-row checks. Two of the nine are also softer than they look — E04 is effectively superseded by row-level tracking, and **E16 is being honoured continuously in practice** even though its status line is a placeholder: every batch this series has reported "22 installed Events files preserved, 2,410 signatures unchanged," which is exactly E16's discipline. Its placeholder understates what is actually happening.

**What the finding is.** Seven of the nine (E05–E10, E18) cover Tasks 4 through 8 — migration and legacy retirement, the Customizer, the four example sites, the BlockDemo review and the final integrated gate — and none has been reproduced or scoped. So the delivery has two halves with very different visibility:

- **The block half:** 95 of 137 accepted, 42 remaining with per-row requirements, evidence references and named batches. Well understood.
- **The non-block half:** five untouched tasks gated by seven unassessed blockers. Actual state unknown.

That means **95/137 = 69% is a measure of the block library, not of the delivery.** The plan's own completion criteria weight the non-block half heavily — a usable editor, working Templates and Customize flows, four complete example sites, an organised BlockDemo, working SDK workflows. I am not claiming those are in bad shape; I am saying nobody has looked, so nobody can size them.

**Recommendation, cheap and precedented:** before committing to Tasks 4–8, triage those seven against the plan's own five-class scheme (missing implementation / reproduced defect / missing evidence / external prerequisite / accepted-reusable). That is exactly what Task 1 did for the 137 rows, and it worked — it turned 79 vague rows into a schedulable queue with named batches, and the last two hours' throughput is partly a dividend of that. Doing the same for seven blockers is a fraction of the effort and would make the remaining delivery sizeable rather than open-ended. Task 3 still has 39 rows, so there is time to do it in parallel rather than as a stop.

---

## 5. Codex's narrowing of my E45 wording — accepted

Codex: *"I retain the narrower implemented boundary: same-origin delivery of configured-origin public storage, without credential forwarding/arbitrary destination/redirect behavior. I do not generalize the audit's absence-of-SSRF wording to unrelated endpoints or private storage revocation."*

Correct, and I should have scoped it that way myself. I read one endpoint and verified its controls; that establishes nothing about other endpoints, and it does not mean private storage delivery was reviewed. My §3 last hour said "no SSRF is reachable" without qualifying that it applied to `servePublicStorageDownload` alone. The verification stands for that function; the wording was broader than the evidence.

---

## 6. Where the delivery stands

| | Series start | Now |
|---|---|---|
| Verified / In progress | 58 / 79 | **95 / 42** |
| Tasks complete | 0 | **2** (Tasks 1 and 2) |
| Tasks active | — | 3 |
| Tasks pending | 2–8 | 4–8 |
| Blockers registered | 18 | 51 |
| Blockers un-triaged | 18 | **9** (7 governing Tasks 4–8) |
| Downgrades, cumulative | — | **zero** |

Task 3's remaining 39: `catalog` 8, `external-embeds` 6, `customer-commerce` 6, `forms` 6, `learning` 5, `events` 3, `membership` 3, `social-data` 2. Thirty-seven rows accepted this series, thirty-three blockers surfaced, no Verified row rolled back.

Codex's stated next steps: the remaining data-backed families, with Tasks 4–8 and E18/E22/E28 named as *"explicit assigned work."*

---

## 7. What I will measure next hour

1. **F25** — whether any of the seven Tasks 4–8 blockers gets triaged, or whether it is deliberately deferred with reasoning.
2. Task 3's 39 rows — whether `catalog` (8, the largest) opens next.
3. **F21's first real test** — still pending; Task 4's two rows (`core/synced`, `reference/field-guide`) are where it lands.
4. Verified count and downgrade check against the 95-row set.
5. Whether `check:delivery-status` stays green across the next tracker readback.
6. **E22** and **E28** — eleven hours idle, confirmed assigned.

---

## 8. Corrections and negative results

- **"E05–E18 are not named in the plan document" is by design, not a gap.** I checked and each has zero mentions — but that is F16's resolution working as intended: the plan deliberately stopped maintaining a parallel blocker table and points to the status JSON as the single register. Nearly reported as a finding; recorded so it is not.
- **E07 is not uniquely stale** — nine blockers share the placeholder, which makes the finding about coverage of Tasks 4–8 rather than about one item. Checked before framing it.
- **My audit-16 "no SSRF is reachable" wording was broader than my evidence** — it applies to `servePublicStorageDownload` only. §5
- **My E43 severity ranking remains withdrawn** (audit 16) — the defensible claim is its class, not a superlative.
- **My audit-16 "Task 2 remaining (12)" was wrong** — computed from the then-stale array; the true five are now all Verified.
- **My audit-01 F1 impact claim remains withdrawn** (audit 15); **the Website manifest count is 16, not 17**; **tickets is not an E43 sibling**; **F23 is a lens, not a vulnerability claim**.
- **My audit-09 `menus/queries.ts:350` "drift" characterisation was wrong** (audit 13); **audit 11's F21 framing was too narrow** (audit 13); **audit 07's "48 resolvers" remains withdrawn**; the **`defineDataBlock` ↔ `spec.data` heuristic remains withdrawn**; the **"intentional-deny list" refinement to F17 remains withdrawn**; **367 bare `catch` blocks remains explicitly not a finding**.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**; **`core/featured-page` was never a latent E29**; **E38's cache re-checks integrity on hits and caches no authority** (audit 10); **E27's classification is `accepted repair`** (audit 12).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric; a mechanical count is a hypothesis; a duplicated expression may contain deliberate variation; an enumeration of sources of truth should be proven exhaustive; a two-table mismatch does not establish which paths consult them; derived status should be read from the live source, not a cached array; **and an absence in one artifact may be another finding's accepted resolution — check the history before calling it a gap.**
