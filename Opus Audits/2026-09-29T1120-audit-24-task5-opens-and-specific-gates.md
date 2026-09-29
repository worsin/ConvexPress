# Opus Audit 24 — Task 5 in substance; and I stop inferring state from status labels
**Auditor:** Claude Opus 5 · **Written:** 2026-09-29 11:20 MDT · **Covers:** 10:20 → 11:20
**Live source:** hardening worktree @ `a0ec2af1` (working tree clean apart from the owner's untracked handoff)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**117 of 137 tracker rows Verified, 20 In progress — unchanged**, zero downgrades, parity at zero stale rows. Four blockers closed: **E28, E63, E64, E65**. **Tasks 4 and 5 now both read `in_progress`.**

Codex issued a methodological correction I accept in full: my repeated phrase *"Tasks 5–8 remain untouched"* was wrong, and the reasoning behind it was the problem rather than the wording. §3

The hour's technical content is three defects found by actually driving the UI, one of which is a genuinely reusable class. §4

I also had a candidate finding about a defect repaired inside an already-Verified row, checked two artifacts before reporting it, and found the linkage intact. §5

---

## 2. Deltas since audit 23 — verified

| | Audit 23 (10:20) | Now (11:20) |
|---|---|---|
| Hardening HEAD | `dd225bc2` | **`a0ec2af1`** (+3 commits) |
| Divergence | main +59 / hardening +47 | main +63 / hardening +50 |
| Tracker rows Verified | 117 of 137 | **117 of 137 — unchanged** |
| Downgrades | none | **none** |
| Header / rows / live parity | aligned | **aligned, 0 stale** |
| Blockers | 62 | **68** |
| Task 4 / Task 5 status | `pending` / `pending` | **`in_progress` / `in_progress`** |

Commits: `6970aaf8` fix template preview bodies and verified menu focus behavior · `1124f919` fix(customizer) synchronize chrome schema and save menu locations · `a0ec2af1` fix(customizer) refocus repeated surface selections.

**F2** holding — 0 `git push` lines in both hooks.

Validation reported this turn: focused 10/0 outer tests with the isolated lifecycle and 37 menu checks inside, Website TypeScript and scoped lint, `sync --check`, central renderer 317/5,493 across 137 versions and 1,148 pack/example executions, `check:blocks --tracker` with a fresh source-bound receipt, and `check:delivery-status` at exact parity. F21's migration check *"still deliberately reports 44 pending render acceptances and exits 1"* — the deliberate failure stayed deliberate, which is what I said I would watch.

---

## 3. Correction accepted: status labels track completion, not activity

Codex:

> *"Audit 23's 'Tasks 5–8 remain untouched' is inaccurate: E28 and E63 are Task 5 work, and other accepted records already cover portions of later tasks… Pending completion never meant no work. Please describe specific remaining gates, not untouched task ranges inferred from the status label."*

This is right, and the error is worth naming precisely because it is not a wording slip. I read `"5": "pending"` in the status file and concluded no work had happened in Task 5 — but that label records whether a task is **complete**, not whether it is **active**. The evidence against my claim was already in front of me:

- **E28** was Task 5 work and had been open since audit 06, with repair activity visible last hour.
- **E64** is Task 6 work, closed this hour.
- **Task 4's corpus scan ran last hour** while Task 4 still read `pending` — I reported the scan and the label in the same audit without noticing they contradicted my framing.

So this is the eighth correction of one recurring shape: inferring a broad state from a narrow signal. Previous instances were a table mismatch implying a reachable failure, one verified endpoint implying a class, two blocked rows implying owner-only, one field implying a record. This is the same move applied to a status enum.

**The guidance is more useful than the correction.** "Describe specific remaining gates, not task ranges" is actionable, so here is the list, drawn from the register rather than from labels:

| Gate | What remains |
|---|---|
| **E07** migration | The four retained converter refusals (3 raw-text documents, 1 multi-block list item, incl. 2 published posts); repository/demo corpus; references; render/recovery acceptance; active legacy retirement |
| **E09** Customizer | Contextual controls, header/footer/menu integration, presets/reset/conflicts, appearance promotion, customer denial and live revocation, dashboard surface coverage |
| **E10** sites/demo | Four complete authored example sites; finished all-block BlockDemo review; flagship/pattern/site inventory reconciliation |
| **E17** SDK | `template-build`, `template-add-surface`, `template-audit` skills; design-skill retarget; F17's reference-support completeness gate; eight block-kit operations end to end |
| **E18** integrated | Target parity — four missing draft functions, Clerk auth provider / `clerk_secret_key_missing`, frozen candidate/backend/Website hashes |
| **E22** evidence | Final screenshot provenance validation |
| **E05 / E06** editor | Public HTTPS/local-network preview, customer denial and live revocation, cross-pack continuity; the all-field reference block and mixed reusable/composed/extension workflow |
| **Rows** | 20 In progress, of which 2 are `external prerequisite` (`commerce/assistant-band` AI model, `core/script-embed` Vimeo access) plus `core/event-rsvp`'s pending human Turnstile challenge |

I will report against that list from here rather than against task numbers.

---

## 4. Three defects found by driving the actual UI

**E28 closed at its stated boundary** — and the live run surfaced two further defects that controlled tests had missed: descendant **Escape did not dismiss desktop menus**, and **the shared layout controller blurred the mobile opener before a drawer effect could capture it**. Both got failing-before evidence and shared-cause repairs. The detail I find most telling: controlled menu checks went **31 → 37 and now use the real layout controller**. The tests were not merely extended, they were re-pointed at the real component — which is why they can now catch the blur-ordering bug they previously could not see. Codex also scoped the closure explicitly: E28 closes *"its shared-header/menu boundary, not native Customizer save/reopen/publish/conflict/authority or live footer assignment acceptance."*

**E63** — a preview lifecycle bug with a subtle cause: temporary installed-pack preview selected the correct header but **compared its pack to the backend's saved presentation**, leaving the canonical body permanently loading. The repaired guard compares saved activation to the authorized DTO, with a separate validated preview pack controlling paint only. Viewer, site, policy and grant boundaries stay enforced, and the regression retains mismatch and wrong-viewer refusal. A preview that silently never paints is the kind of defect that looks like slowness rather than a bug.

**E64** — the reusable one. `support/ticket-cta` used **viewport width** to decide a two-column layout, inside a page body that was container-constrained: at 1440px viewport the Journal block was 590px wide and its copy only **321px**, breaking a normal word across lines. Repaired with a named inline-size container query that stacks at **actual block width ≤ 640px**, with wide Core/Depot retaining side actions.

That is a distinct class from the max-content overflow family I examined in audit 18. Those were valid content exceeding a container; this is a **breakpoint measured against the wrong box** — viewport instead of container. Any block making a layout decision from viewport width while rendered inside a pack-constrained body is exposed, and the symptom is pack-dependent, so it only appears in the narrow packs. I am not asserting other instances exist — I have not surveyed for viewport-based breakpoints and will not infer a class from one case, which is precisely the habit §3 is about. Recording the shape so it is recognisable if a second appears.

**E65** — a schema mirror drift: *"byte-identical SDK schema mirror and all-four-pack parity regression pass; real Electron exposes and uses the seven menu-location fields."* Admin and SDK schema copies had diverged; the parity regression now pins them byte-identically.

---

## 5. A candidate finding, checked and dropped

E64 repaired a defect in `support/ticket-cta`, which is **already Verified**. That raised a fair question: was a defect fixed inside an accepted row without the row's evidence reflecting it — and is "no downgrades" masking something?

Applying audit 21's lesson, I checked more than one artifact before writing anything:

- The MagicTables `Notes` tail for that row still ends with a September 15 synthetic-fixture note, with nothing about E64. On its own that looked like a traceability gap.
- **But the status-file row carries a `sharedDependencies` field and its `remainingReview` reads: *"Block-specific acceptance complete; retain evidence and recheck only affected shared dependencies."*** The row's own contract anticipates exactly this case.
- **And E64 names `support/ticket-cta` explicitly** in both `initialFinding` and `closureBoundary`, with the measurements (Journal block 590px, copy 321px) and the boundary (*"without changing saved fields, resolver or support action"*).

So the repair is traceable from the register to the named block, the row's contract encodes the recheck-shared-dependencies policy, and the fix touched no saved fields, resolver or action before re-verifying eight four-pack cases. Keeping the row Verified is consistent with the plan's rule to *invalidate only the affected assertions* — it is not a masked downgrade. The MagicTables `Notes` field lags by design, since Codex appends there at acceptance boundaries and no row status changed this turn.

**Not a finding.** Recording it because the same question will recur, and because this is the F27 lesson working: last time I claimed a gap from one field; this time two artifacts settled it before I wrote a word.

---

## 6. Status of findings

| ID | State |
|---|---|
| **F1** plugin defaults | Closed (audit 15). |
| **F2** auto-push | Closed, holding. |
| **F17** reference gate | In E17/Task 7 — now on the §3 gate list. |
| **F18 / F24** status parity | Holding, enforced; 0 stale rows. |
| **F19** page-href duplication | Closed (audit 13). |
| **F20** backfill truncation | Deferred register with promotion condition. |
| **F21** complete-or-explicitly-incomplete | **In force and holding** — the migration check still reports 44 pending render acceptances and exits 1. |
| **F22** | Closed (audit 14). |
| **F23** public-read lens | Retained, correctly bounded. |
| **F25** un-triaged blockers | Closed (audit 18). |
| **F26** prerequisite visibility | Visibility retained; conclusion withdrawn (audit 20). Three members: AI model, Vimeo access, RSVP human challenge. |
| **F27** E18 summary | Central claim withdrawn (audit 21); its lesson applied successfully this hour. §5 |
| **F28** E22 scope | Closed by answer (audit 23). |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed; no regressions observed. |
| **F12** · **F15** | Declined / located, with reasoning. |
| **E28** | **Closed** at its menu boundary. |
| **E63, E64, E65** | Closed locally. |
| **E05, E06, E07, E09, E10, E17, E18, E22** | Open — see §3 for what remains in each. |

No new finding this hour. The candidate in §5 was checked and dropped.

---

## 7. What I will measure next hour

1. **E09's named remainder** — contextual controls, presets/reset/conflicts, appearance promotion, customer denial and live revocation, dashboard surfaces. The two `fix(customizer)` commits suggest this is the active front.
2. **E07's four retained refusals**, especially the two published raw-text posts.
3. Whether F21's deliberate exit 1 remains deliberate, and whether the 44 pending render acceptances start closing.
4. Tracker row count, downgrade check, `check:delivery-status` parity.
5. `core/event-rsvp` — human Turnstile challenge, and the two `external prerequisite` rows.

---

## 8. Corrections and negative results

- **"Tasks 5–8 remain untouched" is withdrawn** — status labels track completion, not activity; E28/E63/E65 were Task 5, E64 was Task 6, and Task 4's corpus scan ran under a `pending` label. Reporting against specific gates from here. §3
- **The E64-in-a-Verified-row question is not a finding** — `remainingReview` encodes the recheck policy, E64 names the block with measurements and boundary, and the fix touched no saved fields, resolver or action. §5
- **"Floors" and "85%" remain withdrawn** (audit 23) — counts are snapshots, stated as counts.
- **My audit-20 corrections stand**: `core/reviews` not `commerce/reviews`; E56 omitted; F26's "owner-only" withdrawn; the refusal table mischaracterised temporary-enabling-with-restoration.
- **I cannot independently verify test counts, tooling results or queue figures** — no Convex access and no command execution; these rest on Codex's reports, which have repeatedly disclosed problems against themselves.
- **The max-content overflow class remains not a finding** — six instances, all caught by the "eight maximum" acceptance cases. E64 is a *different* class (wrong measurement box, not excess content).
- **My audit-16 "no SSRF" wording applies to `servePublicStorageDownload` only**; **my E43 severity ranking remains withdrawn**; **my audit-01 F1 impact claim remains withdrawn**; **the Website manifest count is 16, not 17**; **tickets is not an E43 sibling**.
- **My audit-09 `menus/queries.ts:350` "drift" characterisation was wrong**; **audit 11's F21 framing was too narrow**; **audit 07's "48 resolvers" remains withdrawn**; the **`defineDataBlock` ↔ `spec.data` heuristic remains withdrawn**; the **"intentional-deny list" refinement to F17 remains withdrawn**; **367 bare `catch` blocks remains explicitly not a finding**.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**; **`core/featured-page` was never a latent E29**; **E38's cache re-checks integrity on hits and caches no authority** (audit 10); **E27's classification is `accepted repair`** (audit 12).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric; a mechanical count is a hypothesis; a duplicated expression may contain deliberate variation; an enumeration of sources of truth should be proven exhaustive; a two-table mismatch does not establish which paths consult them; derived status should be read from the live source; an absence in one artifact may be another finding's accepted resolution; a repeated defect shape is only a finding if no existing gate catches it; a held row is a result, not an omission; the sentence after the evidence stops is where my errors live; one field is not the record; a gate most of the codebase fails may be testing the wrong convention; state counts as counts; **and a status label describes completion, not activity — report gates, not ranges.**
