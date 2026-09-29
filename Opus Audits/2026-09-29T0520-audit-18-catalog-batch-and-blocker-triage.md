# Opus Audit 18 — catalog batch closed; F25 resolved and Tasks 4–8 finally sized
**Auditor:** Claude Opus 5 · **Written:** 2026-09-29 05:20 MDT · **Covers:** 04:20 → 05:20
**Live source:** hardening worktree @ `99a0c8f8` plus 38 files in flight (authoring contracts / schema editor)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**103 Verified / 34 In progress** — eight rows in one commit, the entire `catalog` batch, zero downgrades. F24's parity gate holds at zero stale rows across a fresh readback.

**F25 is fully resolved**, and it delivered what it was for: all nine placeholder blocker statuses are gone, replaced with substantive triage that separates reusable evidence from genuinely open work. **Tasks 4–8 are sized for the first time in this series.** §3

I went looking for a new finding in the max-content overflow pattern — four instances now — and concluded it is **already gated** by an existing check. Recorded as a negative result rather than dressed up as a finding. §4

---

## 2. Deltas since audit 17 — verified

| | Audit 17 (04:20) | Now (05:20) |
|---|---|---|
| Hardening HEAD | `2e16c275` | **`99a0c8f8`** (+1 commit) |
| Divergence | main +40 / hardening +32 | main +42 / hardening +33 |
| Live tracker | 95 / 42 | **103 / 34** |
| Rows added | — | `commerce/brand-list`, `commerce/bundle-offer`, `commerce/product-compare`, `commerce/product-hero`, `commerce/sale-countdown`, `commerce/shipping-promise`, `commerce/variant-picker-teaser`, `core/featured-products` |
| Downgrades | none | **none** |
| Blockers un-triaged | 9 | **0** |
| Stale status rows (F24) | 0 | **0** |

`99a0c8f8` completes the catalog batch — exactly the 8 rows I listed last hour as its contents. Header, rows and live tracker all read 103/34.

**E52** closed, and its magnitude is worth recording: a **valid 3,000-character Bundle Offer description widened a 1440px page to 31,622px**, with 31,406px of scroll content inside a 444px box. Repaired by one CSS property, with the cause proven by isolated intervention rather than inferred, plus eight maximum and eight normal cases, native exact 5→7 recovery and a real four-line cart check.

**F2** holding — 0 `git push` lines in both hooks.

Task 3's remaining 31: `external-embeds` 6, `customer-commerce` 6, `forms` 6, `learning` 5, `events` 3, `membership` 3, `social-data` 2. Plus Task 4's two rows and Task 7's one.

---

## 3. F25 resolved — and the triage is substantive

Codex accepted the framing precisely — *"95/137 is strictly block-library acceptance, never overall delivery percentage"* — triaged all nine after the catalog batch and before entering Tasks 4–8, and documented it in `delivery-blocker-triage-20260929.md`. It was explicit that this *"resolves the placeholder visibility issue, not the unaccepted Tasks 4–8 work."*

I verified: **zero blockers still carry the placeholder string.** More importantly the replacements are real triage, not rewording. Each separates what is reusable from what is open:

| ID | Reusable evidence identified | Still open |
|---|---|---|
| **E05** preview | E19 draft recovery, E26 hydration, Sept 21 natural editing-session renewal/reconnect | full public HTTPS/local-network, customer denial and live revocation, cross-pack integrated continuity |
| **E06** fields/nesting | `structural-native-20260921` plus current family batches — nested controls, movement, keyboard, media/reference fields, exact reopen/history, invalid writes | the all-field reference block, and the mixed reusable/composed/extension workflow |
| **E07** migration | converter/source proofs exist | complete retained-content inventory and lossless migration/legacy retirement — *"Existing converter/source proofs do not establish a completed installed migration"* |
| **E08** palette/layout retirement | — | legacy values, precedence, idempotent receipts, duplicate-screen retirement |
| **E09** Customizer | Sept 21 initialization, natural renewal, unsaved DOM, Undo/Redo | contextual controls, header/footer/menu, presets/reset/conflicts, appearance promotion, customer denial/live revocation, dashboard surface coverage |
| **E10** sites/BlockDemo | individual block and pack matrices, Steps motion — *"within their boundaries"* | four complete authored example sites, finished all-block BlockDemo review, flagship/pattern/site inventory reconciliation |
| **E18** integrated gate | current source/Website family evidence, identity-bound | final candidate/main/target parity — with a concrete divergence already recorded |

Four things in this triage are worth calling out because they are the parts most easily fudged and were not:

1. **E07 formally binds F21.** Its status now reads *"F21 complete-or-explicitly-incomplete criterion applies."* The criterion I raised in audit 11 and had recorded durably in audit 14 is now attached to the specific blocker it was meant for, before that work starts. That closes the loop properly.
2. **E10 refuses the most tempting conflation in the whole delivery.** With 103 block rows accepted, it would be easy to let that read as "the example sites are done." E10 states the opposite explicitly: block and pack matrices *"do not constitute four complete authored example sites or a finished all-block BlockDemo review."*
3. **E08 declines to invent a defect.** *"No new defect inferred from placeholder status."* A stale status is absence of evidence, not evidence of breakage — and it would have been easy to convert nine placeholders into nine assumed problems.
4. **E18 carries a concrete observation**, not a category: the four draft functions missing on the older target plus the document-settings warning seen during locale promotion. That is a real reproduction attached to the final gate.

**What this changes for the owner.** Until this hour the delivery had one well-measured half and one unmeasured half. Now both are visible: 34 block rows with per-row requirements and named batches, plus seven scoped blockers covering Tasks 4–8 with their reusable evidence already identified. The remaining work is finally *sizeable* rather than open-ended. That was the entire point of F25, and I consider it closed.

---

## 4. The max-content overflow pattern — checked, and already gated

Four defects now share one shape: **valid authored content at its declared maximum length breaks layout.**

| ID | Instance |
|---|---|
| E35 | long unbroken search suggestions overflow |
| E44 | 240-character opening-hours exception note → 1440px page becomes 3189px |
| E49 | long-text Quote wrapping |
| E52 | 3,000-character Bundle Offer description → 1440px page becomes **31,622px** |

Four instances in four blocks looked like a candidate systemic finding, so I checked whether a shared wrapping guarantee exists and whether the class is being caught systematically. Both answers say no finding:

- **Shared treatment exists.** `templates/sdk/primitives/primitives.css` carries **13** `overflow-wrap` declarations, and 20 per-block CSS files add their own where their containers need it. So this is not an absent baseline; it is block-specific containers that the baseline does not reach.
- **The class is already gated.** Every recent acceptance matrix includes *"eight maximum and eight normal"* cases — and E44, E49 and E52 were each found by exactly that. The check that catches this class is already running on every batch, which is why three of the four surfaced within the last few hours rather than in production.

So the correct conclusion is that the process is working, and reporting this as a gap would misrepresent it. Recording as a negative result so it is not re-raised. E52's magnitude — a 31,622px page from one valid description — is good evidence that the maximum-content cases are earning their place in the matrix rather than padding it.

I also checked whether the template handoff's **22 signed-in dashboard surfaces** clause is tracked, since E09's triage names dashboard surface coverage. It is: the phrase appears in the plan. Not a gap.

---

## 5. Status of findings

| ID | State |
|---|---|
| **F1** plugin defaults | Closed (audit 15); all four gated rows accepted. |
| **F2** auto-push | Closed, holding — re-verified. |
| **F17** reference gate | Accepted into E17/Task 7. |
| **F18 / F24** status parity | **Holding, now enforced** by `check:delivery-status` — five invariants, zero stale rows this readback. |
| **F19** page-href duplication | Closed (audit 13). |
| **F20** backfill truncation | In the deferred register with promotion condition. |
| **F21** complete-or-explicitly-incomplete | **Now formally bound to E07**; its first real test is Task 4. |
| **F22** | Closed (audit 14). |
| **F23** public-read lens | Retained as a narrow lens, correctly bounded by Codex. |
| **F25** un-triaged blockers | **Closed this hour** — all nine triaged substantively. §3 |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed; no regressions observed. |
| **F12** · **F15** | Declined / located, with reasoning. |
| **E22** screenshot identity · **E28** header separator | Open, twelve hours idle, confirmed assigned. |

---

## 6. Where the delivery stands

| | Series start | Now |
|---|---|---|
| Verified / In progress | 58 / 79 | **103 / 34** |
| Tasks complete | 0 | 2 |
| Tasks active | — | 3 |
| Tasks pending | 2–8 | 4–8 |
| Blockers registered | 18 | 52 |
| Blockers un-triaged | 18 | **0** |
| Downgrades, cumulative | — | **zero** |

Forty-five rows accepted, thirty-four blockers surfaced, no Verified row rolled back, and every blocker now carries a real classification. Tasks 4–8 remain the bulk of the non-block delivery, but for the first time their scope is written down with reusable evidence attributed.

---

## 7. What I will measure next hour

1. Which Task 3 batch opens next — `external-embeds`, `customer-commerce` and `forms` are tied at 6 rows each.
2. **F21's first real test** — Task 4's two rows (`core/synced`, `reference/field-guide`) and E07, now formally bound.
3. Verified count, downgrade check, and whether `check:delivery-status` stays green across the next readback.
4. Whether **E06**'s named remainder — the all-field reference block and the mixed reusable/composed/extension workflow — is scheduled with Task 4, since `reference/field-guide` is exactly that block.
5. **E22** and **E28** — twelve hours idle.

---

## 8. Corrections and negative results

- **The max-content overflow class is not a finding** — shared primitives carry 13 `overflow-wrap` declarations, 20 block stylesheets add their own, and the "eight maximum cases" already in every acceptance matrix is what surfaced E44, E49 and E52. The process is working. §4
- **The 22 signed-in dashboard surfaces clause is tracked** in the plan. Checked before raising it.
- **"E05–E18 not named in the plan" is by design** (audit 17) — F16's accepted resolution, not a gap.
- **My audit-16 "no SSRF is reachable" wording was broader than my evidence** — it applies to `servePublicStorageDownload` only.
- **My E43 severity ranking remains withdrawn** (audit 16); **my audit-16 "Task 2 remaining (12)" was computed from a stale array**; **my audit-01 F1 impact claim remains withdrawn** (audit 15); **the Website manifest count is 16, not 17**; **tickets is not an E43 sibling**; **F23 is a lens, not a vulnerability claim**.
- **My audit-09 `menus/queries.ts:350` "drift" characterisation was wrong** (audit 13); **audit 11's F21 framing was too narrow** (audit 13); **audit 07's "48 resolvers" remains withdrawn**; the **`defineDataBlock` ↔ `spec.data` heuristic remains withdrawn**; the **"intentional-deny list" refinement to F17 remains withdrawn**; **367 bare `catch` blocks remains explicitly not a finding**.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**; **`core/featured-page` was never a latent E29**; **E38's cache re-checks integrity on hits and caches no authority** (audit 10); **E27's classification is `accepted repair`** (audit 12).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric; a mechanical count is a hypothesis; a duplicated expression may contain deliberate variation; an enumeration of sources of truth should be proven exhaustive; a two-table mismatch does not establish which paths consult them; derived status should be read from the live source; an absence in one artifact may be another finding's accepted resolution; **and a repeated defect shape is only a finding if no existing gate already catches it — check the acceptance matrix before generalising.**
