# Opus Audit 19 — two batches closed; the two things only the owner can unblock
**Auditor:** Claude Opus 5 · **Written:** 2026-09-29 06:20 MDT · **Covers:** 05:20 → 06:20
**Live source:** hardening worktree @ `7ad0c2de` (working tree clean apart from the owner's untracked handoff)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**112 Verified / 25 In progress** — nine rows across two batches, zero downgrades, F24 parity at zero stale rows. Task 3 is down to 22 rows.

The useful result this hour is not a defect. It is that the remaining work can now be split cleanly into what Codex can finish and what it cannot: **exactly two of the 25 remaining rows are external prerequisites requiring owner-side provisioning.** Everything else is Codex's own work. Since the owner is away, that list is the most practical thing I can hand back. §4

E12 — the original Vimeo blocker from the plan — is partially resolved with unusually precise scoping, and the way it was scoped is worth reading. §3

---

## 2. Deltas since audit 18 — verified

| | Audit 18 (05:20) | Now (06:20) |
|---|---|---|
| Hardening HEAD | `99a0c8f8` | **`7ad0c2de`** (+2 commits) |
| Divergence | main +42 / hardening +33 | main +45 / hardening +35 |
| Live tracker | 103 / 34 | **112 / 25** |
| Rows added | — | `core/embed`, `core/iframe`, `core/map`, `blocks/contact-stack`, `core/booking-cta`, `commerce/cart-cta`, `commerce/download-library`, `commerce/wishlist`, `commerce/reviews` |
| Downgrades | none | **none** |
| Header / rows / live parity | aligned | **aligned, 0 stale** |
| Blockers | 52 | 55 (E53–E55) |

Commits: `ca7cb390` validate external embeds and complete five block acceptance gates · `7ad0c2de` verify customer commerce blocks and constrain download help links.

Three defects closed: **E53** shares a closed provider adapter between native and backend writes while keeping historical recovery permissive — the same authoring-versus-historical-read shape as E02, now its fourth instance and handled the same correct way. **E54** is more severe than the recent overflow family: a valid **300-character Contact Link crashed the renderer**, closed with a failing-before regression and all four-pack maximum cases. **E55** wraps maximum consent headings, map addresses and contact labels, with the cause proven by an isolated three-rule intervention.

Task 3's remaining 22: `forms` 6, `learning` 5, `events` 3, `membership` 3, `social-data` 2, `customer-commerce` 2, `external-embeds` 1. Plus Task 4's two rows and Task 7's one.

**F2** holding — 0 `git push` lines in both hooks.

---

## 3. E12 resolved partially, and scoped precisely

E12 has been open since the original plan: *"Vimeo playback remains unverified; YouTube proof does not cover it."* Its status now reads:

> *"Embed Vimeo playback verified in actual Website/installed Chrome using official sample 19231868. Subsequent provider connection-security refusal leaves Script Embed Vimeo playback unproved; no bypass or sandbox change. Iframe approved real-map gate passes; no Iframe Vimeo playback claim."*

Three separate claims, each bounded to what was actually observed, and one explicit non-claim. `core/embed` and `core/iframe` were accepted; `core/script-embed` was **held** rather than closed on adjacent evidence, and the classification changed to `external prerequisite` rather than staying `missing evidence` — which is the correct distinction, because no amount of Codex effort closes it.

The phrase that matters most is *"no bypass or sandbox change."* A provider refusing a connection is exactly the point where a fixture gets loosened, a sandbox attribute gets dropped, or a mock gets substituted to turn a red gate green. None of that happened, and the refusal itself is recorded as evidence.

---

## 4. F26 — Two remaining rows need owner provisioning · **INFO · Visibility for the owner**

Of the 25 remaining block rows, the classifications split cleanly:

| Classification | Count |
|---|---|
| `missing evidence` — Codex's own work | **23** |
| `external prerequisite` — needs owner action | **2** |

The two:

**1. `commerce/assistant-band`** — needs an authorized, available AI model.
E13's status is specific: *"Current customer-commerce Assistant Band prompt returns unavailable; own real customer thread confirms **missing_api_key**. No actual model response accepted."* The row's remaining work is *"Configure/use an authorized available model and prove a real answer, correctly scoped history and assistant cart tools. **No billing change or mocked success.**"*
→ **What the owner can do:** provide an authorized AI provider key for the disposable site, or confirm that this row should be accepted on a documented external-prerequisite basis. Codex explicitly will not change billing.

**2. `core/script-embed`** — needs a network path that permits Vimeo frame loading.
Remaining work: *"Verify actual Vimeo playback in Script Embed using a legitimate public fixture when provider access permits. Repeated connection-security refusal on adjacent Vimeo frame attempts is recorded; no bypass or mocked substitute."*
→ **What the owner can do:** confirm whether the local network or proxy path can reach Vimeo frames, or accept the row on the recorded external-prerequisite basis.

**One adjacent item:** **E14** (historical Aster cloud free-plan restriction) is classified `external prerequisite` and says *"recheck current availability before the affected AI/cloud acceptance."* That recheck may also need owner credentials, though Codex has not yet reported hitting it.

**Why this is worth surfacing now rather than at the end.** These two rows will still be red when the owner returns no matter how much Codex completes, and both have a one-line resolution path. Everything else remaining — 23 block rows, plus Tasks 4–8's scoped blockers — is work Codex can do unaided. This is the first hour where that boundary is precisely drawn, and it is drawn by Codex's own classifications rather than my inference.

### The refusal pattern behind it, worth crediting

This hour's Vimeo refusal is the fourth time in this series that Codex declined to make a red gate green by changing the environment:

| Audit | Refusal |
|---|---|
| 12 | Fixture authoring rejected a disabled Bundle Offer specimen rather than flipping `commerceBundlesEnabled` |
| 13 | Declined to toggle live assistant settings because it would leave a defaults row behind; used registered tests instead |
| 19 | Declined to bypass provider connection security or substitute a mock for Vimeo |
| 19 | *"No billing change or mocked success"* on the AI model |

Each of those would have produced a passing check and a worthless one. Enabling a plugin to author a fixture would have contaminated the exact gate F1 concerned; bypassing provider security would have proved nothing about real playback. Two rows held open is the correct price.

---

## 5. Status of findings

| ID | State |
|---|---|
| **F1** plugin defaults | Closed (audit 15). |
| **F2** auto-push | Closed, holding — re-verified. |
| **F17** reference gate | Accepted into E17/Task 7. |
| **F18 / F24** status parity | **Holding, enforced** by `check:delivery-status`; 0 stale rows across this readback. |
| **F19** page-href duplication | Closed (audit 13). |
| **F20** backfill truncation | Deferred register, promotion condition intact. |
| **F21** complete-or-explicitly-incomplete | Bound to E07; first real test is Task 4. Codex reaffirms it this hour. |
| **F22** | Closed (audit 14). |
| **F23** public-read lens | Narrow lens, correctly bounded. |
| **F25** un-triaged blockers | Closed (audit 18). |
| **F26** owner-actionable prerequisites | **New**, informational. §4 |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed; no regressions observed. |
| **F12** · **F15** | Declined / located, with reasoning. |
| **E12** Vimeo | **Partially resolved**, `external prerequisite`, precisely scoped. §3 |
| **E22** screenshot identity · **E28** header separator | Open, thirteen hours idle, confirmed assigned. |

---

## 6. Where the delivery stands

| | Series start | Now |
|---|---|---|
| Verified / In progress | 58 / 79 | **112 / 25** |
| Remaining rows needing owner action | unknown | **2** |
| Remaining rows Codex can finish | unknown | **23** |
| Tasks complete | 0 | 2 |
| Tasks pending | 2–8 | 4–8 |
| Blockers registered / un-triaged | 18 / 18 | 55 / **0** |
| Downgrades, cumulative | — | **zero** |

Fifty-four rows accepted this series, thirty-seven blockers surfaced, no Verified row rolled back. The block library is 82% accepted. Tasks 4–8 remain the bulk of the non-block delivery and are now scoped rather than open-ended.

---

## 7. What I will measure next hour

1. Which of Task 3's remaining batches opens — `forms` (6) is the largest, then `learning` (5).
2. **F21's first real test** — Task 4's two rows and E07.
3. Whether the two `external prerequisite` rows stay held rather than drifting toward acceptance on adjacent evidence.
4. Verified count, downgrade check, and `check:delivery-status` parity.
5. **E22** and **E28** — thirteen hours idle.

---

## 8. Corrections and negative results

- **The max-content overflow class remains not a finding** (audit 18) — shared primitives carry wrapping and the "eight maximum" cases in every acceptance matrix already catch it. E54's crash and E55's wrapping this hour were both surfaced by exactly that gate, which confirms the conclusion.
- **The 22 signed-in dashboard surfaces clause is tracked** in the plan (audit 18).
- **"E05–E18 not named in the plan" is by design** (audit 17) — F16's accepted resolution.
- **My audit-16 "no SSRF is reachable" wording was broader than my evidence** — it applies to `servePublicStorageDownload` only.
- **My E43 severity ranking remains withdrawn** (audit 16); **my audit-16 "Task 2 remaining (12)" came from a stale array**; **my audit-01 F1 impact claim remains withdrawn** (audit 15); **the Website manifest count is 16, not 17**; **tickets is not an E43 sibling**; **F23 is a lens, not a vulnerability claim**.
- **My audit-09 `menus/queries.ts:350` "drift" characterisation was wrong** (audit 13); **audit 11's F21 framing was too narrow** (audit 13); **audit 07's "48 resolvers" remains withdrawn**; the **`defineDataBlock` ↔ `spec.data` heuristic remains withdrawn**; the **"intentional-deny list" refinement to F17 remains withdrawn**; **367 bare `catch` blocks remains explicitly not a finding**.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**; **`core/featured-page` was never a latent E29**; **E38's cache re-checks integrity on hits and caches no authority** (audit 10); **E27's classification is `accepted repair`** (audit 12).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric; a mechanical count is a hypothesis; a duplicated expression may contain deliberate variation; an enumeration of sources of truth should be proven exhaustive; a two-table mismatch does not establish which paths consult them; derived status should be read from the live source; an absence in one artifact may be another finding's accepted resolution; a repeated defect shape is only a finding if no existing gate catches it; **and a held row is a result, not an omission — check its classification before treating it as unfinished work.**
