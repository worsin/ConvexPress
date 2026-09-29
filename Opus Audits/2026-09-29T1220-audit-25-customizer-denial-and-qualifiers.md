# Opus Audit 25 — a zero-commit hour with real evidence; and carrying qualifiers forward
**Auditor:** Claude Opus 5 · **Written:** 2026-09-29 12:20 MDT · **Covers:** 11:20 → 12:20
**Live source:** hardening worktree @ `a0ec2af1` — unchanged (working tree clean apart from the owner's untracked handoff)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**No hardening commits this hour** — the first such hour of the series. HEAD, tracker (117 of 137 Verified / 20 In progress), blocker count (68) and parity all unchanged, zero downgrades.

This is not a stall, and the reason is legible: Codex is working the **Customizer authority and denial boundary**, which produces evidence rather than code. That work closed a real gate. §3

Codex issued three corrections to me — one omission, two dropped qualifiers — and they share a single fixable cause. §4

No new finding this hour.

---

## 2. Deltas since audit 24 — verified

| | Audit 24 (11:20) | Now (12:20) |
|---|---|---|
| Hardening HEAD | `a0ec2af1` | **`a0ec2af1` — unchanged** |
| Divergence | main +63 / hardening +50 | main +64 / hardening +50 |
| Tracker rows Verified | 117 of 137 | **117 of 137 — unchanged** |
| Downgrades | none | **none** |
| Header / rows / live parity | aligned | **aligned, 0 stale** |
| Blockers | 68 | **68 — unchanged** |
| Task statuses | 1,2 complete; 3,4,5 active | unchanged |

Only `main` moved, by one auto-commit. The hardening branch is where product work lands, so a flat hour there with an active response at 12:15 means work in progress rather than work stopped — and per audit 24's lesson I am reading the activity, not the labels.

---

## 3. The Customizer denial boundary — closed, and scoped

Codex's current work is E09's `customer denial` clause, and it produced a clean result:

- An **actual Clerk development customer** signed in on the existing source 4322, resolving to the intended active Clerk-backed customer.
- **No Customizer appears at `?customize=1`** for that customer.
- Direct **customer-token calls** to `snapshot`, `getDraft`, `saveDraft` and `operator-handoff` **all returned structured `FORBIDDEN` / Insufficient permissions.**

Testing the denial at the *token* level rather than only the UI level is the right depth — a hidden Customizer button proves nothing about whether the underlying mutations refuse. Four separate endpoints were exercised.

The scoping is equally careful: *"This closes the signed-in-customer denial test boundary, **not parent revocation or public HTTPS**."* Both of those are separate clauses in E09 and E05, and neither is claimed.

**Another refusal worth recording.** For the next step — parent-authority invalidation — Codex states: *"using only owned sessions; **do not revoke another operator's sessions to manufacture proof**."* That is the fifth instance in this series of declining to contaminate the environment to obtain evidence, alongside the disabled-plugin fixture, live settings toggling, the Vimeo sandbox, and the Turnstile challenge. Revoking someone else's session would have produced a revocation event to observe, and would have been indefensible.

Also honest: no publication, content or draft writes occurred, and owned customer cleanup is in progress with the temporary notification-template restoration **journaled** — the same targeted-suppression discipline from audit 21's near-miss, applied preventively again.

---

## 4. Three corrections to me, one cause

**1. I omitted two closures.** Audit 24 reported "four blockers closed: E28, E63, E64, E65." Six blockers were added (E63–E68) and **E66 and E67 were also closed** — E66 a draft-validation repair verified on disposable target 4870 with 2,371 unchanged signatures and original appearance values restored; E67 a responsive editor repair (native builder 316px with scrollWidth 316, no controls escaping). I verified both in the register. Same class as the E56 omission in audit 19: I read the blocker count delta and named the ones I happened to inspect.

**2. I dropped E09's reusable-evidence qualifier.** My gate table reproduced E09's *"remain unaccepted"* list verbatim while omitting the clause that opens the same sentence: *"Open with **reusable partial evidence**: September 21 Customizer initialization, real natural renewal/unsaved DOM and Undo/Redo passed."* Codex is right that presenting only the remainder risks erasing valid accepted evidence — and it named the specific records at risk: Journal/Depot conflict and promotion, natural renewal/reconnect, Core native chrome.

**3. I presented a historical inventory as current.** My gate table listed E18's "four missing draft functions" without noting it describes *older* target parity from the locale-promotion batch, not a freshly queried endpoint state. Codex: *"avoid presenting that particular inventory as freshly queried without a current endpoint check."*

**The shared cause and the fix.** All three come from copying a register field's *content* while discarding its *framing* — the qualifier that says what kind of statement it is. E09's field says "Open with reusable partial evidence"; I took the list and left the qualifier. E18's says "historical"; same. The closure count was the same move applied to a delta.

New rule, narrow enough to actually apply: **when reproducing a register field, carry its qualifiers with it.** A remainder list without its reusable-evidence clause, or a recorded observation without its "historical" marker, changes meaning even when every item is accurate.

Restating the E09 gate correctly: **reusable and accepted** — September 21 Customizer initialization, natural renewal and unsaved DOM, Undo/Redo, plus Journal/Depot conflict/promotion and Core native chrome records. **Remaining** — contextual controls, header/footer/menu integration, presets/reset/conflicts, appearance promotion, live revocation and parent-authority invalidation, required dashboard surface coverage. Signed-in customer denial is **now closed** (§3).

---

## 5. E68's source-versus-runtime distinction

Worth crediting because it is the kind of gap usually papered over. **E68** (repeated pick focus) is recorded as *"implemented repeat-pick repair; runtime acceptance pending"*:

> *"Source fixed: clear prior selection when entering pick mode; failing-before actual-panel regression now passes. Six internal panel cases / 63 assertions and Website types pass. **Current source 4322 still serves preceding production bundle.**"*

So the fix exists and is component-tested, but the running Website has not been rebuilt, therefore runtime behaviour is unverified and the blocker stays open on exactly that. Distinguishing "source fixed" from "verified in the thing users touch" is the same discipline as E22 declining to let render receipts certify native or motion behaviour.

---

## 6. On the viewport/container class — and a deferral I agree with

Codex deferred *"broad viewport-breakpoint survey and any completion inference from row ratio; neither is a demonstrated new dependency."* Both correct, and I want to be clear I was not requesting the survey: audit 24 said explicitly that I had not surveyed for viewport-based breakpoints and would not infer a class from one case.

One data point worth adding without a survey: Codex notes **E67 is a second demonstrated instance** of the same shape — the narrow footer editor — *"already fixed and verified in `1124f919`."* So the class I declined to generalise has produced a second case organically, through Codex's own visual review rather than through a hunt. Two instances, both found by looking at real narrow-pack rendering. That is evidence the existing review practice finds them, which is an argument against a survey rather than for one.

---

## 7. Status of findings

| ID | State |
|---|---|
| **F1** plugin defaults | Closed (audit 15). |
| **F2** auto-push | Closed, holding — 0 `git push` lines in both hooks, re-verified. |
| **F17** reference gate | Open in E17. |
| **F18 / F24** status parity | Holding, enforced; 0 stale rows. |
| **F19** page-href duplication | Closed (audit 13). |
| **F20** backfill truncation | Deferred register with promotion condition. |
| **F21** complete-or-explicitly-incomplete | In force; E07/F21 *"remain intentionally incomplete"* per Codex this hour. |
| **F22** | Closed (audit 14). |
| **F23** public-read lens | Retained, correctly bounded. |
| **F25** un-triaged blockers | Closed (audit 18). |
| **F26** prerequisite visibility | Three members: AI model, Vimeo access, RSVP human challenge. |
| **F27** E18 summary | Central claim withdrawn (audit 21). |
| **F28** E22 scope | Closed by answer (audit 23). |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed; no regressions observed. |
| **F12** · **F15** | Declined / located, with reasoning. |
| **E63–E67** | Closed locally. |
| **E68** | Source-fixed; runtime acceptance open. §5 |
| **E05, E06, E07, E09, E10, E17, E18, E22** | Open — §4 restates E09 correctly; the others per audit 24 §3 with E18's inventory marked historical. |

No new finding this hour.

---

## 8. What I will measure next hour

1. **E09's parent-authority invalidation** — whether it completes using only owned sessions.
2. **E68's runtime acceptance** — whether source 4322 is rebuilt and the repeat-pick behaviour verified in the served bundle.
3. **E07's four retained refusals** and whether any of the 44 pending render acceptances close.
4. Tracker row count, downgrade check, `check:delivery-status` parity.
5. Whether a second consecutive zero-commit hour occurs, and if so whether the evidence output still advances — that is the signal that distinguishes long-running acceptance from a stall.

---

## 9. Corrections and negative results

- **Audit 24 under-reported closures** — E66 and E67 were also closed; I named four of six. §4
- **I dropped E09's "reusable partial evidence" qualifier** when reproducing its remainder, and **presented E18's four-missing-functions inventory as current** when it is historical. New rule: carry the qualifier with the field. §4
- **I was not requesting a viewport-breakpoint survey** — audit 24 explicitly declined to infer a class from one case. E67 is a second organic instance, which argues the existing review finds them. §6
- **"Tasks 5–8 remain untouched" remains withdrawn** (audit 24) — labels track completion, not activity.
- **"Floors" and "85%" remain withdrawn** (audit 23) — counts are snapshots, stated as counts.
- **The E64-in-a-Verified-row question was checked and dropped** (audit 24) — not a masked downgrade.
- **I cannot independently verify test counts, tooling results or queue figures** — no Convex access, no command execution.
- **The max-content overflow class remains not a finding** — distinct from E64/E67's wrong-measurement-box shape.
- **My audit-20 corrections stand**: `core/reviews` not `commerce/reviews`; E56 omitted; F26's "owner-only" withdrawn; the refusal table mischaracterised temporary-enabling-with-restoration.
- **My audit-16 "no SSRF" wording applies to `servePublicStorageDownload` only**; **my E43 severity ranking remains withdrawn**; **my audit-01 F1 impact claim remains withdrawn**; **the Website manifest count is 16, not 17**; **tickets is not an E43 sibling**.
- **My audit-09 `menus/queries.ts:350` "drift" characterisation was wrong**; **audit 11's F21 framing was too narrow**; **audit 07's "48 resolvers" remains withdrawn**; the **`defineDataBlock` ↔ `spec.data` heuristic remains withdrawn**; the **"intentional-deny list" refinement to F17 remains withdrawn**; **367 bare `catch` blocks remains explicitly not a finding**.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**; **`core/featured-page` was never a latent E29**; **E38's cache re-checks integrity on hits and caches no authority** (audit 10); **E27's classification is `accepted repair`** (audit 12).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric; a mechanical count is a hypothesis; a duplicated expression may contain deliberate variation; an enumeration of sources of truth should be proven exhaustive; a two-table mismatch does not establish which paths consult them; derived status should be read from the live source; an absence in one artifact may be another finding's accepted resolution; a repeated defect shape is only a finding if no existing gate catches it; a held row is a result, not an omission; the sentence after the evidence stops is where my errors live; one field is not the record; a gate most of the codebase fails may be testing the wrong convention; state counts as counts; a status label describes completion, not activity; **and carry the qualifier with the field — a list without its framing changes meaning even when every item is accurate.**
