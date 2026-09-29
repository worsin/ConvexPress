# Opus Audit 26 — parent revocation accepted; one frozen bundle now gates three items
**Auditor:** Claude Opus 5 · **Written:** 2026-09-29 13:20 MDT · **Covers:** 12:20 → 13:20
**Live source:** hardening worktree @ `34ba73c0` (working tree clean apart from the owner's untracked handoff)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**117 of 137 tracker rows Verified / 20 In progress — unchanged**, zero downgrades, parity at zero stale rows. One commit, `34ba73c0`. Blockers 69.

Last hour's zero-commit question is answered: the evidence output advanced (`output/customizer-authority-20260929`) and a commit followed. That was long-running acceptance, not a stall.

Two substantive results:

- **Parent and controller revocation is accepted** — a full revoke → refuse → reactivate → recover cycle, run entirely on owned sessions as Codex committed. The strongest authority test in this series. §3
- **E69 was found by that live run**: the editing banner kept claiming active authority after it had been revoked. §3

One new observation: **a single frozen bundle now gates three separate items**, and all three say so themselves. §4

---

## 2. Deltas since audit 25 — verified

| | Audit 25 (12:20) | Now (13:20) |
|---|---|---|
| Hardening HEAD | `a0ec2af1` | **`34ba73c0`** (+1 commit) |
| Divergence | main +64 / hardening +50 | main +66 / hardening +51 |
| Tracker rows Verified | 117 of 137 | **117 of 137 — unchanged** |
| Downgrades | none | **none** |
| Header / rows / live parity | aligned | **aligned, 0 stale** |
| Blockers | 68 | **69** (E69) |
| New evidence | — | `output/customizer-authority-20260929` |

**F2** holding — 0 `git push` lines in both hooks.

---

## 3. Parent revocation accepted, and the defect it exposed

### The cycle

This is the test I said I would watch, and it ran end to end on owned sessions only:

1. **Owned scoped operator disabled** through the ordinary API — no session belonging to anyone else was touched, exactly as Codex committed last hour.
2. **The open source Website editor disappeared**, and the old site session returned `UNAUTHORIZED`.
3. **A fresh broker exchange was refused** while the operator was inactive — so the denial holds at the exchange boundary, not merely in the already-open session.
4. **Reactivating the same operator** and performing a fresh same-document handoff **recovered unsaved content (#761234) with Undo/Redo intact.**
5. Explicit End, browser close, controller sign-out, final operator deactivation and API/credential cleanup completed.

Step 4 is what makes this more than a denial test. Revocation that loses unsaved work would be a data-loss bug dressed as security; proving the draft and its history survive a revoke/reactivate cycle is the harder and more useful result. Combined with last hour's token-level `FORBIDDEN` on `snapshot`/`getDraft`/`saveDraft`/`operator-handoff`, the authority boundary now has both the refusal and the recovery side proven.

Preservation verified alongside it: full appearance revision and values, 43 pages, the 99-row queue, and general/security settings exact; template values exact apart from an audit timestamp. Inactive operator, invitation, grant, management binding and audit history all remain explicit rather than cleaned away.

### E69 — a UI authority indicator diverging from actual authority

The live run found it: *"banner kept claiming active despite revoked editor authority."*

This is a distinct class from the denial defects. The mutations correctly refused — last hour established that at the token level — so **no unauthorized action was possible.** What failed was the user being told the truth: the banner asserted active editing authority after it had been revoked, which invites someone to keep composing content that can no longer be saved. A safety net that lies about being armed is the same failure mode I flagged at F13 and in E22's scope limit, in a different subsystem.

The repair uses actual Convex auth state and the existing `manage_options` tri-state rather than a new mechanism, with a failing-before Notice regression that passes *"without discarding recovery"* — so the fix does not trade the recovery behaviour proven in step 4 for correct signalling.

Validation this turn: seven focused outer tests with isolated inner suites, Website types and lint, central renderer 317/5,493 across 1,148 pack/example executions, and the live 137/117 gate.

---

## 4. F29 — one frozen bundle now gates three items · **INFO · Scheduling**

Both new blockers are **source-fixed with runtime acceptance explicitly open**, and both entries name the same reason in their own text:

| Item | Recorded reason |
|---|---|
| **E68** repeat-pick repair | *"Current source 4322 still serves preceding production bundle **for pending RSVP challenge**; refreshed full Website repeat-pick acceptance remains open."* |
| **E69** authority notice repair | *"running 4322 **predates repair and remains preserved for human RSVP**. Refreshed full Website proof pending."* |
| **`core/event-rsvp`** row | `missing evidence` — *"Legitimate real Turnstile widget requires human challenge."* |

So the Website at 4322 is deliberately frozen on the pre-repair bundle to preserve the pending human Turnstile session, and that freeze is what blocks refreshed-runtime proof for E68 and E69. **One dependency, three items** — and I am reporting it because all three sources state it, not because I inferred a chain.

The practical consequence: whatever releases that challenge — completing it, or authorising Codex to discard the preserved session and rebuild — unblocks three items rather than one. That makes it the highest-leverage single action currently outstanding.

**Boundaries on this claim**, per the F26 correction: `core/event-rsvp` is classified `missing evidence`, **not** `external prerequisite`, so I am not re-asserting that only the owner can resolve it — Codex retains responsibility for checking legitimate paths, and its own provider/refusal work on that row is already extensive. I am also not claiming E68 or E69 cannot advance by other means; only that their recorded next step is a refreshed Website that the freeze currently prevents.

**Codex's instruction, honoured:** *"Do not describe either source fix as present there."* Neither repair is live at 4322, and nothing in this audit should be read as saying otherwise.

---

## 5. My audit-25 correction was acted on

I reported that I had dropped E09's *"reusable partial evidence"* qualifier when reproducing its remainder. The entry has since been reconciled, and it now enumerates the accepted evidence explicitly rather than leaving it implicit:

**Accepted and reusable** — Core native chrome and menu publication; Journal/Depot customization, conflicts and promotion; four-pack primary/history/context; actual natural renewal; signed-in Clerk customer UI and API denial; real parent-operator revocation (this hour).

**Remaining** — full per-field and Aster native coverage; the 22 dashboard surfaces; hosted permission; migration and runtime retirement.

That is a materially better entry than the one I mis-quoted, and it is the shape the rest of the gate list should take: what is banked, then what is left. Restating it here so my own record carries the corrected version.

---

## 6. Status of findings

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
| **F29** one dependency, three items | **New**, informational. §4 |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed; no regressions observed. |
| **F12** · **F15** | Declined / located, with reasoning. |
| **E68, E69** | Source-fixed; refreshed-runtime acceptance open (§4). |
| **E05, E06, E07, E09, E10, E17, E18, E22** | Open — E09 restated in §5; E18's four-missing-functions inventory remains **historical**, not freshly queried. |

---

## 7. What I will measure next hour

1. Whether the RSVP human challenge resolves or its session is released, and whether E68/E69 runtime acceptance follows.
2. **E09's remaining four** — per-field/Aster native, the 22 dashboard surfaces, hosted permission, migration/runtime retirement.
3. **E07's four retained converter refusals** and the 44 pending render acceptances.
4. Tracker row count, downgrade check, `check:delivery-status` parity.
5. Whether any Verified row is touched by the E68/E69 rebuild when it happens — a refreshed bundle is the kind of event that could legitimately invalidate a prior runtime assertion.

---

## 8. Corrections and negative results

- **F29 is a dependency observation, not an inference** — all three items record the frozen-4322 reason themselves. I am not re-asserting owner-only (F26's correction) nor claiming E68/E69 have no other path. §4
- **Neither E68 nor E69's source fix is live at 4322** — stated explicitly at Codex's request.
- **Audit 25's corrections are settled**: I under-reported closures (E66, E67 also closed); I dropped E09's reusable-evidence qualifier — now restated in §5; I presented E18's four-missing-functions inventory as current when it is historical.
- **"Tasks 5–8 remain untouched" remains withdrawn** (audit 24) — labels track completion, not activity.
- **"Floors" and "85%" remain withdrawn** (audit 23) — counts are snapshots, stated as counts.
- **The E64-in-a-Verified-row question was checked and dropped** (audit 24).
- **I cannot independently verify test counts, tooling results or queue figures** — no Convex access, no command execution.
- **The max-content overflow class remains not a finding**; **E64/E67's wrong-measurement-box shape has two organic instances and needs no survey** (audit 25).
- **My audit-20 corrections stand**: `core/reviews` not `commerce/reviews`; E56 omitted; F26's "owner-only" withdrawn; the refusal table mischaracterised temporary-enabling-with-restoration.
- **My audit-16 "no SSRF" wording applies to `servePublicStorageDownload` only**; **my E43 severity ranking remains withdrawn**; **my audit-01 F1 impact claim remains withdrawn**; **the Website manifest count is 16, not 17**; **tickets is not an E43 sibling**.
- **My audit-09 `menus/queries.ts:350` "drift" characterisation was wrong**; **audit 11's F21 framing was too narrow**; **audit 07's "48 resolvers" remains withdrawn**; the **`defineDataBlock` ↔ `spec.data` heuristic remains withdrawn**; the **"intentional-deny list" refinement to F17 remains withdrawn**; **367 bare `catch` blocks remains explicitly not a finding**.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**; **`core/featured-page` was never a latent E29**; **E38's cache re-checks integrity on hits and caches no authority** (audit 10); **E27's classification is `accepted repair`** (audit 12).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric; a mechanical count is a hypothesis; a duplicated expression may contain deliberate variation; an enumeration of sources of truth should be proven exhaustive; a two-table mismatch does not establish which paths consult them; derived status should be read from the live source; an absence in one artifact may be another finding's accepted resolution; a repeated defect shape is only a finding if no existing gate catches it; a held row is a result, not an omission; the sentence after the evidence stops is where my errors live; one field is not the record; a gate most of the codebase fails may be testing the wrong convention; state counts as counts; a status label describes completion, not activity; carry the qualifier with the field; **and a source fix is not a running fix — say which one you mean.**
