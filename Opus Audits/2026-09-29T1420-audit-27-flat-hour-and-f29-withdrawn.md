# Opus Audit 27 — a genuinely flat hour, and F29's conclusion withdrawn
**Auditor:** Claude Opus 5 · **Written:** 2026-09-29 14:20 MDT · **Covers:** 13:20 → 14:20
**Live source:** hardening worktree @ `34ba73c0` — unchanged (working tree clean apart from the owner's untracked handoff)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**117 of 137 tracker rows Verified / 20 In progress — unchanged.** Zero downgrades, parity at zero stale rows, blockers 69. **No hardening commit, and no evidence output advanced.**

In audit 26 I pre-committed to watching for exactly this: a second consecutive zero-commit hour where the evidence output also stops moving. Both conditions are now met. §2

**F29's conclusion is withdrawn.** Codex showed that the alternative route I claimed was blocked had already been recorded before I wrote the finding — and I verified that. §3

No new finding this hour.

---

## 2. Deltas since audit 26 — and the flat-throughput signal

| | Audit 26 (13:20) | Now (14:20) |
|---|---|---|
| Hardening HEAD | `34ba73c0` | **`34ba73c0` — unchanged** |
| Divergence | main +66 / hardening +51 | main +68 / hardening +51 |
| Tracker rows Verified | 117 of 137 | **117 of 137 — unchanged** |
| Downgrades | none | **none** |
| Header / rows / live parity | aligned | **aligned, 0 stale** |
| Blockers | 69 | **69 — unchanged** |
| Evidence output | `customizer-authority-20260929` (12:29) | **unchanged — 0 files modified under `output/` in 95 minutes** |

I checked the evidence directories directly rather than inferring from commits: `find output -newermt '-95 minutes'` returns **nothing**, and the newest evidence directory was last written at **12:29**, nearly two hours ago.

**The cause is legible rather than concerning.** Codex's response states it: *"No tests/builds/deployments or customer state changes **during this audit review**."* This turn was spent reviewing audit 26 and checking Task 5, E68/E69, the revocation receipts and the RSVP report. It also notes that *"Website 80269 and human harness 82875 remain running; **process presence alone does not establish widget completion or current rendered state**"* — declining to read a live process as evidence of progress, which is the same discipline it applied to source-versus-runtime.

So the honest report is: **the last two hours produced one commit and two review turns.** I am recording it because I said I would, not because I am reading it as a stall — a review turn that produces two substantive corrections to my own work has value, and the preceding hours were the fastest of the series. The signal worth watching is whether a third consecutive hour passes with neither commits nor evidence.

**F2** holding — 0 `git push` lines in both hooks.

---

## 3. F29's conclusion withdrawn — verified

Codex: *"Preserving 4322 prevents rebuilding that shared runtime in place. It does not make CAPTCHA completion or user permission to discard the session a prerequisite for E68/E69. **The preceding checkpoint already selects an isolated refreshed Website as the next route.**"*

I verified that claim before accepting it, and it holds. `Opus Audits/CODEX-NOTES.md:515`, written **before** my audit 26:

> *"Next refreshed isolated Website E68/E69 and remaining Task5/Task4, preserving human RSVP session."*

So the alternative route was recorded ahead of my finding. What survives from F29 is the **dependency observation**: all three items do cite the frozen 4322 bundle, and that is stated in their own entries. What is withdrawn is the **conclusion** — that releasing the human challenge "unblocks three items rather than one" and is "the highest-leverage single action outstanding." Neither holds if an isolated refreshed Website lets E68/E69 advance while RSVP stays pending, which is the recorded plan.

The mechanism of my error is the same as F27's: I read the two blocker entries and the row, found the frozen-4322 reason in all three, and did not read the checkpoint notes where the next step lived. Two artifacts are not the record either.

**A caution from Codex worth carrying forward**, because it gives me something concrete to check when that route runs:

> *"Validate separate build output, process identity, preserved runtime configuration and legitimate handoff origin before accepting that route; **a second port alone is insufficient isolation**."*

That is a four-item checklist — build output, process identity, runtime configuration, handoff origin — and I will apply it rather than accepting "it ran on a different port" as isolation.

### The authority phrasing, also corrected

Codex: my *"no unauthorized action was possible"* is broader than the observations; use *"the exercised unauthorized operations were refused."* Correct. What was observed: four named APIs (`snapshot`, `getDraft`, `saveDraft`, `operator-handoff`) refusing a customer token; parent revocation unmounting the editor and denying the old snapshot session; a fresh broker exchange refused while inactive. That is a set of **exercised** operations, not a proof of authorization coverage. And E69 is a notice defect — it does not constitute a general authorization audit, which I did not claim but my phrasing invited.

---

## 4. Twelve corrections, one mechanism — and a structural change

Counting the two above, Codex has corrected twelve of my claims across 27 audits. The distribution is what matters: **not one of them was an error in describing evidence.** Every single one was in a summarizing or concluding sentence built on top of correctly-described evidence — an unreachable failure signature, a severity ranking, an unscoped "no SSRF", "owner-only", "untouched tasks", "floors", "85%", a dropped qualifier, a historical inventory presented as current, "no unauthorized action was possible", and now F29's leverage ranking.

I have responded to these with a rule each time — read all fields, carry the qualifier, state counts as counts, report gates not ranges — and the errors have continued at roughly the same rate. That suggests the problem is not a missing rule but the **act of writing the summarizing sentence at all**. The evidence descriptions have been reliable; the sentence that generalises them has not.

So the change from here is structural rather than another rule: **state the observation and its evidence, and omit the concluding sentence.** Where a conclusion genuinely matters — a scheduling recommendation, a severity judgement — it gets its own verification and its own explicit boundary, or it does not get written. This audit is the first written that way; §2's flat-hour report deliberately stops at what was measured.

Worth noting what makes this correctable at all: every one of the twelve arrived from Codex reading the audit against source. An advisory arrangement where findings were accepted on authority would have banked all twelve.

---

## 5. Status of findings

| ID | State |
|---|---|
| **F1** plugin defaults | Closed (audit 15). |
| **F2** auto-push | Closed, holding — re-verified. |
| **F17** reference gate | Open in E17. |
| **F18 / F24** status parity | Holding, enforced; 0 stale rows. |
| **F19** page-href duplication | Closed (audit 13). |
| **F20** backfill truncation | Deferred register with promotion condition. |
| **F21** complete-or-explicitly-incomplete | In force; E07/F21 remain intentionally incomplete. |
| **F22** | Closed (audit 14). |
| **F23** public-read lens | Retained, correctly bounded. |
| **F25** un-triaged blockers | Closed (audit 18). |
| **F26** prerequisite visibility | Retained as visibility; conclusion withdrawn (audit 20). |
| **F27** E18 summary | Central claim withdrawn (audit 21). |
| **F28** E22 scope | Closed by answer (audit 23). |
| **F29** frozen-bundle dependency | **Observation retained; conclusion withdrawn** (§3). |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed; no regressions observed. |
| **F12** · **F15** | Declined / located, with reasoning. |
| **E68, E69** | Source and component fixed; refreshed-runtime acceptance open. Neither fix is live at 4322. |
| **E05, E06, E07, E09, E10, E17, E18, E22** | Open. E09: accepted evidence per audit 26 §5; remaining — per-field/Aster native, 22 dashboard surfaces, hosted permission, migration/runtime retirement. E18's four-missing-functions inventory is **historical**. |

---

## 6. What I will measure next hour

1. Whether the isolated refreshed Website route runs, and if so whether it satisfies Codex's own four-item isolation check — separate build output, process identity, preserved runtime configuration, legitimate handoff origin — rather than a second port alone.
2. Whether a third consecutive hour passes with neither hardening commits nor evidence output.
3. **E07's four retained converter refusals** and the 44 pending render acceptances.
4. Tracker row count, downgrade check, `check:delivery-status` parity.
5. Whether the eventual rebuild invalidates any prior runtime assertion.

---

## 7. Corrections and negative results

- **F29's conclusion is withdrawn** — the isolated refreshed Website route was recorded at `CODEX-NOTES.md:515` before I wrote the finding; verified. The dependency observation stands. §3
- **"No unauthorized action was possible" is replaced** by "the exercised unauthorized operations were refused" — four named APIs plus editor unmount and old-session denial are exercised operations, not coverage. §3
- **E68/E69 carry no `nextCheck` field** — their schema is `id, classification, deliveryTask, initialFinding, closureBoundary, status, evidence`, slimmer than the triaged E01–E18 entries. Their next step lives in the checkpoint notes. Checked; not raised as a finding.
- **Evidence output did not advance this hour** — verified by mtime, not inferred from commits. §2
- **Audit 26's corrections are settled**; audit 25's are settled.
- **"Tasks 5–8 remain untouched", "floors", "85%"** remain withdrawn.
- **I cannot independently verify test counts, tooling results or queue figures** — no Convex access, no command execution.
- **The max-content overflow class remains not a finding**; **E64/E67's wrong-measurement-box shape has two organic instances and needs no survey**.
- **My audit-20 corrections stand**: `core/reviews` not `commerce/reviews`; E56 omitted; F26's "owner-only" withdrawn; the refusal table mischaracterised temporary-enabling-with-restoration.
- **My audit-16 "no SSRF" wording applies to `servePublicStorageDownload` only**; **my E43 severity ranking remains withdrawn**; **my audit-01 F1 impact claim remains withdrawn**; **the Website manifest count is 16, not 17**; **tickets is not an E43 sibling**.
- **My audit-09 `menus/queries.ts:350` "drift" characterisation was wrong**; **audit 11's F21 framing was too narrow**; **audit 07's "48 resolvers" remains withdrawn**; the **`defineDataBlock` ↔ `spec.data` heuristic remains withdrawn**; the **"intentional-deny list" refinement to F17 remains withdrawn**; **367 bare `catch` blocks remains explicitly not a finding**.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**; **`core/featured-page` was never a latent E29**; **E38's cache re-checks integrity on hits and caches no authority** (audit 10); **E27's classification is `accepted repair`** (audit 12).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric; a mechanical count is a hypothesis; a duplicated expression may contain deliberate variation; an enumeration of sources of truth should be proven exhaustive; a two-table mismatch does not establish which paths consult them; derived status should be read from the live source; an absence in one artifact may be another finding's accepted resolution; a repeated defect shape is only a finding if no existing gate catches it; a held row is a result, not an omission; one field is not the record, and neither are two; a gate most of the codebase fails may be testing the wrong convention; state counts as counts; a status label describes completion, not activity; carry the qualifier with the field; a source fix is not a running fix; **and omit the summarizing sentence — twelve of twelve errors lived there, none in the evidence.**
