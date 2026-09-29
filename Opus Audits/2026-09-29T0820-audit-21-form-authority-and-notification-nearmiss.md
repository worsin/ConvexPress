# Opus Audit 21 — form draft authority, a token in rendered text, and a self-caught notification leak
**Auditor:** Claude Opus 5 · **Written:** 2026-09-29 08:20 MDT · **Covers:** 07:20 → 08:20
**Live source:** hardening worktree @ `07facfe8` plus 8 files in flight (form route not-found handling)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**114 Verified / 23 In progress** — one row (`core/poll`), zero downgrades, parity at zero stale rows. Forms is down to four rows.

Two things matter this hour, both self-found by Codex:

- **E58 and E59 are the most security-relevant findings since E43.** Three form-draft authority bypasses, and a **bearer token rendered as breadcrumb text**. One of E58's three shares E43's exact shape. §3
- **A notification side effect was caught in final cleanup**: 72 alerts queued by acceptance operations, non-delivery verified on two independent grounds, all cancelled with readback, root cause and a process fix recorded. §4

**F27 is withdrawn in its central claim.** Codex showed E18 already carried the Clerk finding in two of its ten fields; I read the summary field and generalised to the entry. That is the sixth instance of the pattern I named last hour — and it happened in the audit where I named it. §5

---

## 2. Deltas since audit 20 — verified

| | Audit 20 (07:20) | Now (08:20) |
|---|---|---|
| Hardening HEAD | `42b4a8cc` | **`07facfe8`** (+2 commits) |
| Divergence | main +48 / hardening +37 | main +51 / hardening +39 |
| Live tracker | 113 / 24 | **114 / 23** |
| Rows added | — | `core/poll` |
| Downgrades | none | **none** |
| Header / rows / live parity | aligned | **aligned, 0 stale** |
| Blockers | 56 | **59** (E57–E59) |

Commits: `04de2053` verify poll customer policy and reconcile acceptance notification cleanup · `07facfe8` enforce form draft authority and preserve resume confirmation.

**Poll's acceptance evidence is unusually thorough** for a single row: two real Clerk customer accounts, guest refusal, account switching, repeat and token-change refusal, question/choice/reorder/results semantics, original ballot recovery, live withdrawal and republish, plus 16 customer/guest pack cases and 14 registered backend tests on top of prior native and maximum-input evidence. Both accounts were then deactivated locally and deleted from Clerk, with credential files removed and the session revoked.

Task 3's remaining 20: `learning` 5, `forms` 4 (`core/contact-form`, `core/form`, `core/lead-magnet`, `core/event-rsvp`), `events` 3, `membership` 3, `social-data` 2, `customer-commerce` 2, `external-embeds` 1. Plus Task 4's two and Task 7's one.

**F2** holding — 0 `git push` lines in both hooks.

---

## 3. E58 and E59 — draft authority and a leaked token

**E58** closed three distinct authority defects in form drafts:

1. **Expired draft writes bypassed the 30-day TTL** — writes accepted past expiry.
2. **Resume reads skipped current form-route and login access** — the read path did not re-check the access the primary path enforces.
3. **An inactive account's stale identity could write login-required drafts** — deactivation did not invalidate an in-flight identity.

Closed with five red registered-handler cases, 596 backend tests, current deployed route and login revocation, stale-mount refusal, and deterministic test time for the expiry boundary.

**E59** included a credential-handling defect I have not seen in this series before: **"Bearer token also appeared as breadcrumb text."** A resume token rendered into visible UI is a credential leak — into screenshots, into anything copied from the page, into a shoulder-surf. The same blocker also covered a saved-draft URL rendering a blank form because the parent route lacked an `Outlet`, and the repaired route then 404ing after a successful submission consumed its token. Closed with before/after Website proof, eight pack/width restore/submit/confirmation/reload cases, and a component test proving the completion race, failed-operation release and token handling.

### One narrow observation, stated with its boundary

E58's second defect has the same shape as E43: **a read path addressed by token or slug that skipped the access check the primary path enforces.** In E43 it was `gallery/queries:getBySlug` serving restricted albums to anonymous callers while the block resolver was gated. Here it was a draft resume read skipping current form-route and login access.

That is **two instances**, both in token- or slug-addressed read paths, and **both were found by the existing batch-acceptance process** rather than by inspection. I am not claiming other paths are affected — I have not examined them, and Codex has already bounded F23 correctly as a narrow lens for relevant public-content batches. What I can say is that the lens has now paid out once in the batch it was scoped for, which is the evidence for keeping it rather than for widening it.

---

## 4. The notification near-miss — self-caught, and the process fix is the valuable part

From Codex's own final cleanup check, reported against itself:

- Restoring email settings in the preceding Forms turn queued **12** "Settings Updated" alerts *after* that turn's 27-row snapshot.
- The Poll pack matrix queued **60 more**.
- All **72** were still queued with **zero attempts**, and the disposable site has **no provider key**.
- Exact event provenance binds all 72 to the acceptance operations.
- All were cancelled through the registered cancellation API and **read back**; the original 27 records are exact. The queue is now 99 rows including 72 cancelled audit records.
- **No delivery occurred.**

Two independent grounds establish non-delivery — zero attempts and no provider key — which is the right standard for a claim like this.

**The precaution was right but incomplete, and Codex says so.** In audit 20 I noted its stated precaution: *"Forms-created notification defaults need disabling before any owned synthetic submission; no outward email."* That was done. The leak came through a different path entirely — **settings restoration and pack activation**, not form submission. Codex's recorded fix names both the template and the method error: *"Future harnesses must suppress the specific settings-alert template during appearance changes/email restoration and verify after asynchronous event completion, not rely on a pre-restoration snapshot."*

The second half is the transferable lesson. A pre-restoration snapshot cannot see events queued *by* the restoration, so the verification has to happen after async completion. That is a general trap in any harness that snapshots state before cleaning up.

**What I cannot verify:** the queue state itself. I have no Convex access and will not run commands, so the 12/60/72/99 figures and the cancellation readback rest on Codex's report. Worth noting that this report is self-incriminating rather than self-serving — it discloses a side effect its own earlier turn caused, corrects a tracked report, and names its own method error. That is the disclosure pattern I would want, and it is the fifth time in this series a problem arrived from Codex rather than from me.

---

## 5. F27 withdrawn — and it repeats a pattern I named last hour

Codex: *"Before this turn's edits, E18 already named the target Clerk provider failure and `clerk_secret_key_missing` in `currentEvidence`, and its `nextCheck` required matching customer auth/provisioning before the signed-in history recheck."*

I verified this against the preserved `output/poll-policy-20260929/e18-before-summary-refresh.json`. Its `currentEvidence` reads, in full: *"…September 29 actual signed-in Website switch also proves target has no matching Clerk auth provider; customer provisioning reports `clerk_secret_key_missing`. Guest switch and exact source restoration pass, signed-in target document remains loading."* Its `nextCheck` already required *"Verify matching customer auth provider/provisioning, then repeat the pending signed-in Recently Viewed site switch."*

So my claim — *"a real observation recorded in one artifact but not in the register entry that owns it"* — was wrong. The finding was in the entry, in two of its ten fields. **I read `status`, found it described only the older divergence, and generalised to the whole entry.** Blocker entries carry `id`, `status`, `classification`, `initialFinding`, `closureBoundary`, `currentEvidence`, `nextCheck`, `deliveryTask`, `triagedAt`, `triageEvidence` — I checked one.

What survives is the narrow version, which Codex adopted: the `status` summary was stale relative to the entry's own evidence fields, and it has been expanded. A handoff reader who skims summaries would have missed it. That is a real but small improvement, not a tracking gap.

**This is the sixth instance of the shape I described last hour, and it occurred in that same audit.** Naming a pattern did not prevent it, so the fix has to be procedural rather than intentional. The concrete rule I am adopting: **when an artifact has multiple fields, read the artifact before making a claim about the artifact.** Applied here that was one command, and it would have replaced a withdrawn finding with a correctly-scoped one.

---

## 6. Status of findings

| ID | State |
|---|---|
| **F1** plugin defaults | Closed (audit 15); impact claim corrected. |
| **F2** auto-push | Closed, holding. |
| **F17** reference gate | Accepted into E17/Task 7. |
| **F18 / F24** status parity | Holding, enforced; 0 stale rows. |
| **F19** page-href duplication | Closed (audit 13). |
| **F20** backfill truncation | Deferred register with promotion condition. |
| **F21** complete-or-explicitly-incomplete | Bound to E07; open. Task 4 is its first test. |
| **F22** | Closed (audit 14). |
| **F23** public-read lens | Retained, correctly bounded — and paid out once this hour in the batch it was scoped for. §3 |
| **F25** un-triaged blockers | Closed (audit 18). |
| **F26** prerequisite visibility | Visibility retained; "owner-only" conclusion withdrawn (audit 20). |
| **F27** E18 summary | **Central claim withdrawn**; narrow summary improvement adopted by Codex. §5 |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed; no regressions observed. |
| **F12** · **F15** | Declined / located, with reasoning. |
| **E22** screenshot identity · **E28** header separator | Open, fifteen hours idle, confirmed assigned. |

---

## 7. Where the delivery stands

| | Series start | Now |
|---|---|---|
| Verified / In progress | 58 / 79 | **114 / 23** |
| Tasks complete | 0 | 2 |
| Tasks pending | 2–8 | 4–8 |
| Blockers registered / un-triaged | 18 / 18 | 59 / **0** |
| Downgrades, cumulative | — | **zero** |

Fifty-six rows accepted, forty-one blockers surfaced, no Verified row rolled back. Block library at 83%. Tasks 4–8 remain the bulk of the non-block delivery.

---

## 8. What I will measure next hour

1. The remaining four `forms` rows, and whether the notification suppression fix holds through them.
2. **F21's first real test** — Task 4's two rows and E07.
3. Verified count, downgrade check, `check:delivery-status` parity.
4. Whether the in-flight `FormRouteNotFound` work closes E59's 404-after-submission path cleanly.
5. **E22** and **E28** — fifteen hours idle.

---

## 9. Corrections and negative results

- **F27's central claim is withdrawn** — E18 carried the Clerk finding in `currentEvidence` and `nextCheck` before this turn; I read `status` alone. Verified against the preserved before-file. §5
- **Procedural rule adopted:** read a multi-field artifact in full before making a claim about the artifact.
- **My audit-20 corrections stand as accepted**: `core/reviews` not `commerce/reviews`; E56 omitted; F26's "owner-only" withdrawn; the refusal table mischaracterised temporary-enabling-with-restoration as refused.
- **The max-content overflow class remains not a finding** — E57 is now the sixth instance, again caught by the "eight maximum" acceptance cases.
- **I cannot independently verify the notification queue figures** — no Convex access; they rest on Codex's self-incriminating report. §4
- **The 22 signed-in dashboard surfaces clause is tracked** (audit 18); **"E05–E18 not named in the plan" is by design** (audit 17).
- **My audit-16 "no SSRF" wording applies to `servePublicStorageDownload` only**; **my E43 severity ranking remains withdrawn**; **my audit-16 "Task 2 remaining (12)" came from a stale array**; **my audit-01 F1 impact claim remains withdrawn**; **the Website manifest count is 16, not 17**; **tickets is not an E43 sibling**.
- **My audit-09 `menus/queries.ts:350` "drift" characterisation was wrong**; **audit 11's F21 framing was too narrow**; **audit 07's "48 resolvers" remains withdrawn**; the **`defineDataBlock` ↔ `spec.data` heuristic remains withdrawn**; the **"intentional-deny list" refinement to F17 remains withdrawn**; **367 bare `catch` blocks remains explicitly not a finding**.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**; **`core/featured-page` was never a latent E29**; **E38's cache re-checks integrity on hits and caches no authority** (audit 10); **E27's classification is `accepted repair`** (audit 12).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric; a mechanical count is a hypothesis; a duplicated expression may contain deliberate variation; an enumeration of sources of truth should be proven exhaustive; a two-table mismatch does not establish which paths consult them; derived status should be read from the live source; an absence in one artifact may be another finding's accepted resolution; a repeated defect shape is only a finding if no existing gate catches it; a held row is a result, not an omission; the sentence after the evidence stops is where my errors live; **and one field is not the record — read all of them.**
