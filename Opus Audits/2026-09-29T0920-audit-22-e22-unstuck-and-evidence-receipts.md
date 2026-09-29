# Opus Audit 22 — E22 unstuck after fifteen hours; a gate that exposed a real convention gap
**Auditor:** Claude Opus 5 · **Written:** 2026-09-29 09:20 MDT · **Covers:** 08:20 → 09:20
**Live source:** hardening worktree @ `9cf1352f` plus 8 files in flight (verification-evidence gate)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**117 Verified / 20 In progress** — three rows (`core/contact-form`, `core/form`, `core/lead-magnet`), zero downgrades, parity at zero stale rows. Four commits.

**E22 moved for the first time in fifteen hours**, and the way it moved is the interesting part: the reconciliation ran, and rather than being special-cased green it was **deliberately kept open because the gate exposed a real convention inconsistency**. I verified the arithmetic behind that and it is exactly right. §3

**E60** is new and distinct from E59: anonymous SSR denials persisted after real customer authentication. §4

I also owe a note on sampling lag: Codex correctly observed that my audit-21 figures were already stale when I published them. §5

---

## 2. Deltas since audit 21 — verified

| | Audit 21 (08:20) | Now (09:20) |
|---|---|---|
| Hardening HEAD | `07facfe8` | **`9cf1352f`** (+4 commits) |
| Divergence | main +51 / hardening +39 | main +55 / hardening +43 |
| Live tracker | 114 / 23 | **117 / 20** |
| Rows added | — | `core/contact-form`, `core/form`, `core/lead-magnet` |
| Downgrades | none | **none** |
| Header / rows / live parity | aligned | **aligned, 0 stale** |
| Blockers | 59 | **61** (E60, E61) |

Commits: `64feddce` recover protected form routes after customer authentication · `e9b3a060` reconcile block screenshot evidence and expose remaining test mapping gate · `d6afe65a` renew expired lead downloads and verify customer delivery lifecycle · `9cf1352f` record current RSVP provider verification checkpoint.

Task 3's remaining 17: `learning` 5, `events` 3, `membership` 3, `social-data` 2, `customer-commerce` 2, `external-embeds` 1, `forms` 1 (`core/event-rsvp`). Plus Task 4's two and Task 7's one.

**F2** holding — 0 `git push` lines in both hooks.

Lead Magnet's acceptance used *"two real development Clerk customers, notification templates muted before creation"* — the targeted template suppression from last hour's process fix, applied before creating anything rather than cleaned up after. That is the correction working as intended.

---

## 3. E22 — the gate found a real inconsistency, and it was surfaced rather than suppressed

E22 has been open since audit 06 and idle since: the tracker gate expected fixed per-pack PNG paths while accepted captures lived in dated output directories. The reconciliation has now run: **468 fresh full BlockDemo specimens** across 117 Verified blocks × 4 packs, with exact name, version, pack, and both source and image hashes.

But E22 stays **open**, and the reason is worth reading:

> *"Full gate still fails core/heading block-local test convention; 115 of 117 Verified rows use centralized coverage. Keep open for explicit per-block applicable [convention]."*

**I verified that arithmetic against live data and it is exactly right.** Only five blocks in the entire repository carry block-local test files — `blocks/studio-services`, `commerce/sale-countdown`, `events/upcoming`, `commerce/recently-viewed`, `core/paragraph`. Of those, exactly two are Verified (`commerce/sale-countdown`, `core/paragraph`). So of 117 Verified rows, **2 have block-local tests and 115 rely on centralized coverage** — Codex's figure precisely. `core/heading` is Verified and has only `block.json` and `render.tsx`.

So the gate enforces a convention that **2 of 117 accepted rows actually follow.** The honest reading is that the convention, not the blocks, is the thing out of step. Satisfying it per-block would mean creating roughly 115 test files whose only purpose is to make a gate pass — pure gate-satisfaction theater, and exactly the kind of thing that makes a green check meaningless.

The in-flight fix takes the other road. The new `scripts/blocks/VERIFICATION.md` documents a `--renderer-evidence` receipt path: *"Blocks may keep their meaningful tests beside their source. The existing centralized renderer suite can alternatively produce an execution receipt without adding placeholder block-local tests."* And it carries an anti-bypass property I checked explicitly: *"Without `--renderer-evidence`, the existing block-local test-file requirement remains unchanged. An explicitly supplied invalid receipt always fails; it cannot fall back to a local test file."* So the new path cannot be used to launder a missing receipt into a pass.

**One question I cannot answer and am not going to assert.** The status names `core/heading` specifically, but 115 Verified rows share the identical condition — no block-local test. I cannot run the gate, so I do not know whether it fails on `core/heading` *alone* for some other reason, or reports it as the *first* of many identical failures. If it is the latter, the remaining work is entirely the receipt mechanism already in flight rather than anything per-block. `VERIFICATION.md`'s framing suggests Codex is treating it that way, so this may simply be confirmation of the design — but it is worth one sentence in the E22 entry either way, so a handoff reader does not conclude a single block is the obstacle.

---

## 4. E60 — a third mechanism in the forms authorization family

**E60**: *"anonymous SSR denials persisted after real customer authentication"* — an SSR denial state survived the user signing in, so a protected form stayed denied to an authenticated customer. Both the normal protected form route and saved-resume URLs now recover, and Codex notes *"initial anonymous HTTP404 remains disclosed"* — the pre-auth 404 is intended behaviour and was not papered over.

Codex is also explicit that this is **distinct from E59's post-completion 404**, whose confirmation race was closed separately. That distinction matters: two similar-looking 404s with different causes could easily have been merged into one claim.

That makes three separate mechanisms found in the forms area, all concerning authorization state and route reads:

| ID | Mechanism |
|---|---|
| E58 | resume read skipped current form-route and login access |
| E59 | token consumed by successful submission → 404 on reload |
| E60 | anonymous SSR denial persisted after authentication |

Three distinct causes, one subject area, all surfaced by batch acceptance rather than inspection. Per my commitment in audit 20, I am stating that as an observation about the batch and stopping: I have not examined whether comparable denial-state persistence exists elsewhere, and I am not claiming it does.

---

## 5. Sampling lag — a note on how to read these audits

Codex observed: *"Your snapshot predates local commit `64feddce`: current readback is 116 Verified / 21 In progress."* That is correct. My audit-21 tracker read returned 114/23, and two more rows landed between my read and Codex's reply.

This is not an error in either direction — the reading was accurate when taken — but it means something worth recording once, since these files will be read later: **every figure in these audits is a floor at read time, not a current count.** Codex commits several times an hour, so an hourly sample is always behind by construction. Where an audit says "N Verified," the correct interpretation is "at least N, as of the timestamp in the header." The parity check (`header` = `rows` = live at the moment of reading) remains meaningful because all three are sampled together.

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
| **F21** complete-or-explicitly-incomplete | Bound to E07; open. Task 4 is its first test. |
| **F22** | Closed (audit 14). |
| **F23** public-read lens | Retained, correctly bounded; paid out on E58. |
| **F25** un-triaged blockers | Closed (audit 18). |
| **F26** prerequisite visibility | Visibility retained; conclusion withdrawn (audit 20). |
| **F27** E18 summary | Central claim withdrawn (audit 21); narrow improvement adopted. |
| **F28** E22 scope sentence | **New**, low — one sentence clarifying whether `core/heading` is the sole failure or the first of 115. §3 |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed; no regressions observed. |
| **F12** · **F15** | Declined / located, with reasoning. |
| **E22** screenshot identity | **Moved** — 468 specimens reconciled; deliberately open on the convention gap. §3 |
| **E28** header separator | Open, sixteen hours idle, assigned to Customizer integration. |

---

## 7. Where the delivery stands

| | Series start | Now |
|---|---|---|
| Verified / In progress | 58 / 79 | **117 / 20** |
| Tasks complete | 0 | 2 |
| Tasks pending | 2–8 | 4–8 |
| Blockers registered / un-triaged | 18 / 18 | 61 / **0** |
| Downgrades, cumulative | — | **zero** |

Fifty-nine rows accepted, forty-three blockers surfaced, no Verified row rolled back. Block library at 85%.

---

## 8. What I will measure next hour

1. Whether the `--renderer-evidence` receipt gate commits, and whether E22 closes or stays open with the scope clarified.
2. `core/event-rsvp` — the last `forms` row, currently at a *"provider verification checkpoint"*.
3. **F21's first real test** — Task 4's two rows and E07.
4. Verified count, downgrade check, `check:delivery-status` parity.
5. **E28** — sixteen hours idle, assigned to header/footer/menu Customizer integration, which is Task 5 work not yet opened.

---

## 9. Corrections and negative results

- **My audit-21 figures were stale on publication** — accurate at read time, two rows behind by the time Codex replied. All figures in these audits are floors at their header timestamp. §5
- **F27's central claim remains withdrawn** (audit 21) — E18 carried the Clerk finding in `currentEvidence` and `nextCheck`; I read `status` alone. The procedural rule adopted then — read a multi-field artifact in full — was applied this hour to the E22 arithmetic before reporting it.
- **The block-local test convention is met by 2 of 117 Verified rows** — verified against live status, matching Codex's figure. The receipt path is a design correction, not a shortcut, and its anti-bypass clause is present in `VERIFICATION.md`. §3
- **I cannot determine whether the gate fails on `core/heading` alone or as the first of 115** — stated as a question, not a claim. §3
- **The max-content overflow class remains not a finding** — E57 was the sixth instance, caught by the "eight maximum" acceptance cases.
- **I cannot independently verify the notification queue figures** from audit 21 — no Convex access.
- **My audit-20 corrections stand as accepted**: `core/reviews` not `commerce/reviews`; E56 omitted; F26's "owner-only" withdrawn; the refusal table mischaracterised temporary-enabling-with-restoration.
- **My audit-16 "no SSRF" wording applies to `servePublicStorageDownload` only**; **my E43 severity ranking remains withdrawn**; **my audit-01 F1 impact claim remains withdrawn**; **the Website manifest count is 16, not 17**; **tickets is not an E43 sibling**.
- **My audit-09 `menus/queries.ts:350` "drift" characterisation was wrong**; **audit 11's F21 framing was too narrow**; **audit 07's "48 resolvers" remains withdrawn**; the **`defineDataBlock` ↔ `spec.data` heuristic remains withdrawn**; the **"intentional-deny list" refinement to F17 remains withdrawn**; **367 bare `catch` blocks remains explicitly not a finding**.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**; **`core/featured-page` was never a latent E29**; **E38's cache re-checks integrity on hits and caches no authority** (audit 10); **E27's classification is `accepted repair`** (audit 12).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric; a mechanical count is a hypothesis; a duplicated expression may contain deliberate variation; an enumeration of sources of truth should be proven exhaustive; a two-table mismatch does not establish which paths consult them; derived status should be read from the live source; an absence in one artifact may be another finding's accepted resolution; a repeated defect shape is only a finding if no existing gate catches it; a held row is a result, not an omission; the sentence after the evidence stops is where my errors live; one field is not the record; **and a gate that most of the codebase fails may be testing the wrong convention — check what the majority actually does before treating the minority as correct.**
