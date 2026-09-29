# Opus Audit 20 — a harder requirement chosen over easier evidence; four corrections to me
**Auditor:** Claude Opus 5 · **Written:** 2026-09-29 07:20 MDT · **Covers:** 06:20 → 07:20
**Live source:** hardening worktree @ `42b4a8cc` (working tree clean apart from the owner's untracked handoff)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**113 Verified / 24 In progress** — one row (`core/newsletter-signup`), zero downgrades, parity at zero stale rows. A light hour for movement, and a heavy one for correction.

The substantive event is that **Codex chose the harder requirement over the easier passing evidence and found a real gap.** Guest Recently Viewed passed across a source→target→source environment switch; rather than accept that, Codex exercised the signed-in path and discovered the target has no matching Clerk auth provider. §3

**Codex issued four corrections to my audit 19. All four are right**, and together they expose a pattern in my own work that is worth naming plainly. §4

---

## 2. Deltas since audit 19 — verified

| | Audit 19 (06:20) | Now (07:20) |
|---|---|---|
| Hardening HEAD | `7ad0c2de` | **`42b4a8cc`** (+2 commits) |
| Divergence | main +45 / hardening +35 | main +48 / hardening +37 |
| Live tracker | 112 / 25 | **113 / 24** |
| Rows added | — | `core/newsletter-signup` |
| Downgrades | none | **none** |
| Header / rows / live parity | aligned | **aligned, 0 stale** |
| Rows by classification | 23 evidence / 2 prerequisite | **22 evidence / 2 prerequisite** |

Commits: `f2a8b1a0` verify history environment isolation and record target auth prerequisite · `42b4a8cc` fix long form labels and verify newsletter and nested source workflows.

**F2** holding — 0 `git push` lines in both hooks.

Task 3's remaining 21 plus Task 4's two and Task 7's one. Codex names `forms` as the next batch, retaining all six rows (Contact Form, Newsletter Signup, Form Embed, Lead Magnet, Poll, Event RSVP) and noting a precaution I have not seen stated before: *"Forms-created notification defaults need disabling before any owned synthetic submission; no outward email."* Disabling a notification default before generating test submissions is the right order of operations — the alternative sends real mail from a fixture.

---

## 3. The target auth prerequisite — a harder requirement chosen deliberately

Codex had passing evidence and declined to use it. The sequence, from its own report:

1. **Guest flow passes**: actual Recently Viewed across source 4860 → target 4870 → source, same browser origin, **two separate history buckets** and correct rendered products. That alone would have supported a row closure on environment isolation.
2. **It exercised the stronger signed-in requirement instead** of accepting adjacent guest evidence. Source customer sign-in and history pass.
3. **The target failed for a real reason**: no matching Clerk auth provider, logging *"No auth provider found matching the given token"*; the provisioned customer reports `clerk_secret_key_missing`; the target stays at "Loading document" and **writes no target or anonymous history**.
4. **Source return restores the exact history**, and the target's backend and auth configuration were left unchanged.

So a genuine prerequisite surfaced only because the weaker evidence was refused. `commerce/recently-viewed` stays In progress, and I verified its `remainingReview` now reads: *"Configure and verify the actual target customer identity provider as part of E18 integrated target readiness, then repeat signed-in source→target→source history acceptance; guest environment and prior source account-switch evidence"* is insufficient.

Cleanup verified in the report: four pages and four products removed, original 42/28 pages, appearance and plugin values preserved, target commerce restored to disabled, owned Clerk identity deleted, source runtime six fields restored byte-for-byte.

### One small gap — the finding is not yet in the blocker it points at

The row's remaining work references *"E18 integrated target readiness"*, but **E18's own status does not yet mention it.** I read it: it still records only the locale-promotion divergence — *"four draft functions missing on older target and document-settings warning"* — with nothing about the Clerk provider or `clerk_secret_key_missing`.

This is the F16/F22 shape a third time: a real observation recorded in one artifact but not in the register entry that owns it. The caveat is that the batch committed minutes ago and E18's update may simply be pending the next register pass, so I am flagging it as an observation rather than a defect. One line in E18 would make the target-identity prerequisite survive a handoff, which matters because E18 is the final integrated gate and this is now its second concrete divergence.

---

## 4. Four corrections from Codex — all correct, and a pattern in my own work

**1. Row name.** I wrote `commerce/reviews` in audit 19's delta table. The accepted row is **`core/reviews`** — confirmed against the live tracker, which holds no `commerce/reviews` at all.

**2. An omitted blocker.** I listed E53–E55 as covering both commits. **E56** was also in that batch: *"Valid 160-character Purchased Downloads help label forces flex-shrink:0 anchor to 1447.5px and widens 1440px page to 1737px"*, closed with a one-property `flex-shrink:1` intervention that **reverses when removed** — bidirectional cause proof. That is the fifth max-content overflow instance, and it further supports audit 18's conclusion that the "eight maximum" cases are the gate catching this class.

**3. F26's conclusion was overstated.** Codex: *"Missing site API key and provider refusal prove current unavailable paths; they do not establish that every already-authorized model connection or ordinary legitimate network path has been exhausted."* Correct. The classification `external prerequisite` means "currently blocked on something external," not "exhaustively proven unreachable by any path Codex could still legitimately try." My framing — "exactly two things only the owner can unblock" — asserted the second from the first. The *visibility* was useful; the *conclusion* went past the evidence.

**4. My refusal table mischaracterised what Codex practises.** Codex: *"Temporary plugin enabling can be legitimate for an owned fixture with captured settings and exact restoration … that is distinct from weakening a disabled-plugin gate or altering a provider sandbox."* I had credited a blanket refusal to enable plugins. It does temporarily enable them, legitimately, with captured settings and exact restoration — as in the catalog, customer and site-switch checks. The real distinction is between *restoring* state and *weakening a gate*, and I collapsed the two.

### The pattern, stated plainly

Five of my findings across this series have followed the same shape: **a real observation, correctly evidenced, followed by a conclusion broader than the evidence supports.**

| Finding | The observation (held) | The over-extension (withdrawn) |
|---|---|---|
| F1, audit 01 | Two defaults tables genuinely disagreed | The failure signature I asserted was unreachable on the ordinary route path |
| E43, audit 15 | Real anonymous exposure of restricted albums | "Most serious defect of the series" — an unsubstantiated ranking |
| E45, audit 16 | One endpoint verified line by line | "No SSRF is reachable" — written without scoping to that function |
| F26, audit 19 | Two rows are currently externally blocked | "Exactly two things only the owner can unblock" |
| audit 19 | Codex refuses to weaken gates | It refuses *weakening*, not temporary enabling with restoration |

The underlying observations were all real, and several drove repairs worth having — F1 produced a three-table parity gate, E43 produced a shared public-access policy across detail/embed/archive. So the finding work is sound; the failure is consistently in the sentence *after* the evidence stops. For the remaining audits I will state the observation with its boundary and stop there, rather than completing the inference that feels natural. Where a stronger claim is worth making, it needs its own verification, not the momentum of the first one.

Worth noting what this says about the arrangement: every one of those five was caught by Codex reading the audit against source, which is the collaboration working in both directions rather than my findings being accepted on authority.

---

## 5. Status of findings

| ID | State |
|---|---|
| **F1** plugin defaults | Closed (audit 15); impact claim corrected. |
| **F2** auto-push | Closed, holding. |
| **F17** reference gate | Accepted into E17/Task 7. |
| **F18 / F24** status parity | Holding, enforced; 0 stale rows. |
| **F19** page-href duplication | Closed (audit 13). |
| **F20** backfill truncation | Deferred register with promotion condition. |
| **F21** complete-or-explicitly-incomplete | Bound to E07; Codex reaffirms *"full intended corpus or explicit incomplete"*. First test is Task 4. |
| **F22** | Closed (audit 14). |
| **F23** public-read lens | Narrow lens, correctly bounded. |
| **F25** un-triaged blockers | Closed (audit 18). |
| **F26** prerequisite visibility | **Retained as visibility, conclusion withdrawn** (§4.3). The two rows remain `external prerequisite`; whether only the owner can unblock them is Codex's to determine. |
| **F27** E18 missing its own target-auth finding | **New**, low, possibly just pending the next register pass. §3 |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed; no regressions observed. |
| **F12** · **F15** | Declined / located, with reasoning. |
| **E22** screenshot identity · **E28** header separator | Open, fourteen hours idle, confirmed assigned. |

---

## 6. Where the delivery stands

| | Series start | Now |
|---|---|---|
| Verified / In progress | 58 / 79 | **113 / 24** |
| Tasks complete | 0 | 2 |
| Tasks pending | 2–8 | 4–8 |
| Blockers registered / un-triaged | 18 / 18 | 56 / **0** |
| Downgrades, cumulative | — | **zero** |

Fifty-five rows accepted, thirty-eight blockers surfaced, no Verified row rolled back. Block library at 82%. Tasks 4–8 remain the bulk of the non-block delivery, scoped since audit 18.

---

## 7. What I will measure next hour

1. The `forms` batch (6 rows) — and specifically whether the notification-default precaution holds, since a synthetic submission that sends real mail would be the costliest possible fixture error.
2. **F21's first real test** — Task 4's two rows and E07.
3. **F27** — whether E18 records the target customer-identity prerequisite.
4. Verified count, downgrade check, `check:delivery-status` parity.
5. **E22** and **E28** — fourteen hours idle.

---

## 8. Corrections and negative results

- **`core/reviews`, not `commerce/reviews`** — my audit-19 delta table was wrong. §4.1
- **E56 was omitted from my audit-19 blocker list** — fifth max-content overflow instance, closed with bidirectional cause proof. §4.2
- **F26's "exactly two owner-only" conclusion is withdrawn**; the prerequisite visibility stands. §4.3
- **My audit-19 refusal table mischaracterised Codex's practice** — it refuses weakening a gate, not temporary enabling with captured settings and exact restoration. §4.4
- **The max-content overflow class remains not a finding** (audit 18) — now five instances, all caught by the "eight maximum" acceptance cases.
- **The 22 signed-in dashboard surfaces clause is tracked** (audit 18); **"E05–E18 not named in the plan" is by design** (audit 17).
- **My audit-16 "no SSRF" wording applies to `servePublicStorageDownload` only**; **my E43 severity ranking remains withdrawn**; **my audit-16 "Task 2 remaining (12)" came from a stale array**; **my audit-01 F1 impact claim remains withdrawn**; **the Website manifest count is 16, not 17**; **tickets is not an E43 sibling**; **F23 is a lens, not a vulnerability claim**.
- **My audit-09 `menus/queries.ts:350` "drift" characterisation was wrong**; **audit 11's F21 framing was too narrow**; **audit 07's "48 resolvers" remains withdrawn**; the **`defineDataBlock` ↔ `spec.data` heuristic remains withdrawn**; the **"intentional-deny list" refinement to F17 remains withdrawn**; **367 bare `catch` blocks remains explicitly not a finding**.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**; **`core/featured-page` was never a latent E29**; **E38's cache re-checks integrity on hits and caches no authority** (audit 10); **E27's classification is `accepted repair`** (audit 12).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric; a mechanical count is a hypothesis; a duplicated expression may contain deliberate variation; an enumeration of sources of truth should be proven exhaustive; a two-table mismatch does not establish which paths consult them; derived status should be read from the live source; an absence in one artifact may be another finding's accepted resolution; a repeated defect shape is only a finding if no existing gate catches it; a held row is a result, not an omission; **and the sentence after the evidence stops is where my errors live — state the boundary and stop.**
