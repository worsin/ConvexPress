# Opus Audit 12 — E39's third pass; a scope question for the owner
**Auditor:** Claude Opus 5 · **Written:** 2026-09-28 23:20 MDT · **Covers:** 22:20 → 23:20
**Live source:** hardening worktree @ `c3c15fce` (working tree effectively clean)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

Two more commits, both inside E39: `40034240` conditional prose and timed-result refresh, `c3c15fce` promoted and sanitized HTML prose. **E40** (clock expiry) was reproduced and closed within E39. Tracker held at **74 Verified / 63 In progress** — **fourth consecutive hour**, zero downgrades.

Last hour I said that if the plateau extended without a row closing, the useful question becomes whether the search subsystem is absorbing more than its remaining rows justify. It extended, so I gathered the numbers. They support a **scope question that only the owner can answer** — not a defect, and not a criticism of the work, which continues to be high quality. §4.

Codex's own framing deserves credit up front: *"No broad audit campaign or status inflation to break the plateau."* Refusing to raise a row status to make a number move is exactly right, and nothing below argues against it.

---

## 2. Deltas since audit 11 — verified

| | Audit 11 (22:20) | Now (23:20) |
|---|---|---|
| Hardening HEAD | `71a1b4c8` | **`c3c15fce`** (+2 commits) |
| Divergence | main +26 / hardening +18 | main +29 / hardening +20 |
| Live tracker | 74 / 63 | **74 / 63 — unchanged (4th hour)** |
| Downgrades | none | **none** |
| Blockers | 39 | **40** (E40) |
| Header parity (F18) | holding | **holding** |

E39's current pass: 13 conditional declaration changes plus shared time/manual-card/media-kind rules; 548 backend and 310 renderer tests, types and build passing; snapshot `search-conditional-20260928` deployed in 57.53 s preserving 1,615 files, 22 Events files and 2,410 unchanged signatures. Codegen added exactly four API declaration lines for two pure helper modules, *"reviewed and recorded, not ignored."*

---

## 3. The numbers behind the plateau

| Measure | Value |
|---|---|
| `content-discovery` batch | **9 of 11 Verified** — remaining: `core/language-switcher`, `core/search-results` |
| Search blockers E32–E40 | **8 closed, 1 open** (E39, classification `missing implementation`) |
| E39 passes accepted so far | **three**, and it remains open |
| Task 2 | `in_progress`, **15 rows pending** |
| Task 3 | 45 rows pending |
| Tasks 4–8 | **untouched** (`pending`) |
| Blocks overall | 74 / 137 = **54%** |

Two facts reframe the plateau usefully:

**First, the batch is 82% done.** The content-discovery batch went from 0 to 9 of 11 accepted across these hours — that is real throughput, not a rabbit hole. The plateau is specifically the **last two rows of an eleven-row batch**, which is the ordinary long-tail shape of acceptance work.

**Second, the search rows are Task 3, not Task 2.** I checked: `core/search-results`, `core/language-switcher`, `core/search-box` and `commerce/search-band` all carry `deliveryTask: 3`, batch `content-discovery`. So the last five hours have been spent on the tail of a **Task 3** batch while **Task 2 remains `in_progress` with 15 rows** (`core/rich-text`, `core/carousel`, `core/file-download`, `core/steps-with-media`, `core/marquee`, `blocks/customer-showcase`, `blocks/social-share`, `core/social-links`, `core/custom-html`, `blocks/grade-gallery`, `business/opening-hours`, `business/locations`, `business/service-list`, `business/menu`, `local/sample-alert`).

I noted in audit 09 that the task boundary is porous and that families close by behavioural coherence rather than task label. That remains a defensible way to work — content-discovery *is* a coherent family. This is not a rule violation; it is context for §4.

---

## 4. A scope question for the owner — not a finding

**What is unambiguously justified.** Each detour was earned by a reproduced defect, with failing-before evidence, and several were serious well beyond search:

- **E37** was corpus-wide silent truncation *plus* a data-loss defect that would have deleted valid Community Events rows.
- **E38** was a native restore timeout at the 1 s CPU cap, blocking restore of composed pages — an editor-wide problem, not a search one.
- **E33** and **E37c** were silent-failure defects in shared infrastructure.
- Search indexing is shared: the nine already-accepted content-discovery rows depend on it.

None of that was avoidable, and none of it was padding.

**What now warrants a decision.** E39 has absorbed **three accepted passes and remains open**, with Codex naming its remaining scope as *"promoted composition, HTML, assistant/embed and related conditional details."* That is a large surface for what gates **one row**. Meanwhile the plan's completion criteria weight heavily toward work that has not started: Task 4 migration and legacy retirement (E07), Task 5 Templates and Customizer as one workflow (E08/E09), Task 6 the four finished example sites and BlockDemo review (E10), Task 7 the SDK workflows (E17, now also carrying F17), and Task 8 the final integrated gate (E18, E22, plus the bundle budget).

**The question:** should E39 be *bounded* rather than completed in place — accept `core/search-results` on what is already proven, and move the remaining conditional/promoted/HTML/assistant-embed details into E39-as-a-tracked-item under Task 6 or 8, so the other 62 rows and five untouched tasks get airtime?

I am not asserting the answer. It is a scope judgment, the owner owns scope, and there is a real argument for finishing search properly now while the context is loaded — splitting it costs re-learning later. But after four flat hours on the tail of one batch, with five tasks untouched, the owner should get to make that call deliberately rather than have it made by momentum. That is the whole reason this note exists.

**What I would not do:** raise any row status, relax E39's criteria, or ask Codex to abandon a reproduced defect mid-repair. Codex's refusal to inflate status is correct and this note does not argue with it.

---

## 5. Status of findings

| ID | State |
|---|---|
| **F1** plugin default mismatch | **Open — twelfth consecutive hour.** Backend `PLUGIN_DEFAULTS` still `true` for knowledgeBase/tickets/customFields/recipes/gallery against `false` manifests. Not overdue: `plugin-content` and `support` batches have not opened. But note the interaction with §4 — those batches sit in Task 3 behind the same tail that is currently absorbing effort. |
| **F2** auto-push | Closed, holding — 0 `git push` lines in both hooks, re-verified. |
| **F19** page-href duplication | Deferred to the Language Switcher destination pass — which is now one of the two remaining content-discovery rows, so it should surface shortly. |
| **F20** backfill truncation | Recorded in the deferred register with promotion condition. Closed as an audit action. |
| **F21** silent-failure lens | **Accepted as scoped** — Codex confirmed it as a focused review lens for E39 and Task 4/E07 completeness claims, *"not a finding against every catch or limit"*, and explicitly stated no broad catch sweep was undertaken. That is precisely the boundary I asked for. It also added a sharper formulation than mine: *"Candidate truncation and public fail-closed behavior must not be confused with a successful full-corpus migration/backfill."* |
| **F17** reference gate | Accepted into E17/Task 7. |
| **F18** header/row parity | Holding. |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed; no regressions observed. |
| **F12** · **F15** | Declined / located, with reasoning. |
| **E22** screenshot identity · **E28** header separator | Open, idle since audit 06 — six hours. |
| **E39** | Open after three accepted passes. |

---

## 6. Evidence-discipline items this hour

- **A disabled plugin was respected rather than worked around.** Fixture authoring correctly rejected an explicitly disabled Bundle Offer specimen (`commerceBundlesEnabled: false`); Codex preserved the setting, omitted the specimen, and kept its unit projection evidence separate rather than flipping a flag to make a fixture pass. That is the right call — enabling a plugin to author a fixture would have contaminated the very gate F1 concerns.
- **Codegen drift reviewed, not ignored.** Four API declaration lines added for two pure helper modules, explicitly *"reviewed and recorded."*
- **The search-card `0` repair was attributed correctly.** Codex clarified it landed in `71a1b4c8` with four-pack 1440/390 proof, and that the 36 affected specification hashes were reconciled as *search-metadata-only* changes with unchanged field/version/requirements proof in `compatibility.json` and `spec-reconciliation.json`. Worth noting because a 36-spec hash change is exactly the kind of event that could mask a contract change, and it was documented as metadata-only rather than asserted as harmless.

Fifth consecutive hour in which a plausible result was investigated rather than banked.

---

## 7. What I will measure next hour

1. **Whether the plateau breaks**, and if not, whether E39's scope gets bounded or deliberately continued — the §4 question.
2. **F19** — Language Switcher is now one of two remaining content-discovery rows, so the destination/localization pass should arrive with it.
3. **F1** — thirteenth hour.
4. Whether **Task 2's 15 rows** or any of Tasks 4–8 get opened.
5. Verified count and downgrade check against the 74-row set.
6. **E22** and **E28** — six hours idle; both are Task 5/6/8 items, so they may simply be correctly queued.

---

## 8. Corrections and negative results

- **E27's classification is `accepted repair`, not an inconsistency.** My filter for "accepted" values did not include that string, so my own check flagged it falsely. E27 is closed and correctly recorded. Recording this so I do not re-raise it.
- **The content-discovery batch is 9/11, not stalled at 0** — the plateau is the batch tail, and stating it as "five hours with nothing to show" would have been wrong. Checked before writing §4.
- **367 bare `catch { }` blocks remains explicitly not a finding** (audit 11) — Codex confirmed no broad sweep was undertaken, which is the correct response.
- **F19's encoding divergence remains unconfirmed-reachable** by both of us.
- **Audit 07's "48 resolvers" remains withdrawn** (dirty-tree measurement); the `defineDataBlock ↔ spec.data` heuristic remains withdrawn; my "intentional-deny list" refinement to F17 remains withdrawn.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**; **`core/featured-page` was never a latent E29**; **E38's cache re-checks integrity on hits and caches no authority** (audit 10).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric; a mechanical count is a hypothesis, not a finding.
