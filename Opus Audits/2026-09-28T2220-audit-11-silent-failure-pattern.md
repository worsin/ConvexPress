# Opus Audit 11 — E37 closed; a verified silent-failure pattern; three hours at 74/63
**Auditor:** Claude Opus 5 · **Written:** 2026-09-28 22:20 MDT · **Covers:** 21:20 → 22:20
**Live source:** hardening worktree @ `71a1b4c8` plus 46 files in flight (E39 search prose)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**E37 closed** in `b692046e` after full live acceptance (1,391 durable steps, 691 indexed, all 551 fixture IDs independently verified, search returning records 1/500/501/551). First Library prose pass accepted in `71a1b4c8` with 36 explicit `searchText` declarations. **E39** opened for conditional states, promoted canonical composition and sanitized HTML.

Tracker held at **74 Verified / 63 In progress** for the third consecutive hour, zero downgrades. I examined whether that is a stall and concluded it is not — §5.

**F20 was recorded in the deferred register exactly as recommended**, with my suggested promotion condition. New finding **F21**: the search/indexing subsystem has now produced four verified instances of one defect shape — partial or failed work reported as success — and I have the evidence to name it as a pattern rather than four coincidences. §4.

---

## 2. Deltas since audit 10 — verified

| | Audit 10 (21:20) | Now (22:20) |
|---|---|---|
| Hardening HEAD | `320d33fe` | **`71a1b4c8`** (+2 commits) |
| Divergence | main +23 / hardening +16 | main +26 / hardening +18 |
| Live tracker | 74 / 63 | **74 / 63 — unchanged** |
| Downgrades | none | **none** |
| Blockers | 38 | **39** (E39) |
| Header parity (F18) | holding | **holding** — declared 74/63 = row tally 74/63 |

**F20 verified recorded** at `2026-09-28-editor-template-status.json:3725`: *"Source-verified enterprise commerce backfill truncation recorded in current-acceptance.md deferred register. No live reproduction or repair; promote only if catalog/customer-commerce delivery demonstrates a dependency."* That is the classification and promotion condition I proposed, with the honest caveat that there was no live reproduction. Correctly handled.

---

## 3. E37's closure included a data-loss defect caught before it could land

The headline repair is the resumable reindex, but the more serious thing E37 surfaced was this: **hardcoded event-table orphan checks would have deleted valid Community Events rows.** An orphan sweep that cannot resolve a record ID in its assumed table treats the index row as orphaned and deletes it — so an extension's rows were collateral.

I verified the repair, and it addresses the cause rather than the symptom:

- `search/extensionSources.ts:11-13` introduces a `maintenance` contract with the boundary stated in-code: *"Installed code owns maintenance as well as public projection."*
- Line 23 **fails loudly** on any source lacking distinct IDs or a `maintenance.version` — so a future extension cannot be silently swept by a hardcoded assumption.
- `extensions/events/search.ts` gives the owning extension the authority to answer identity: `matchesId: (ctx, rawId) => ctx.db.normalizeId("extension_events", rawId) !== null`. Only the installed extension interprets its own IDs.
- The declaration also carries the correct authority boundary: *"Cached search rows contribute identities, never publication or membership authority."*
- `search/internals.ts:533` now documents the invariant that was violated: *"must abort rather than delete a potentially valid index row."*

**Scoping credit:** Codex reproduced the deletion in a registered isolated installed-clone fixture and stated plainly that *"Full live sweep has not run, so that deletion was reproduced only in the registered isolated fixture"* — claiming the reproduction it had rather than the one it didn't. It also preserved all 22 Community Events files across snapshots and upgraded only `search.ts` in the SDK follow-up, with a generated integration test covering sibling backfill and cleanup.

---

## 4. F21 — Four verified instances of one shape: partial work reported as success · **MEDIUM · Pattern**

Individually these were four defects. Together they are a habit, and the subsystem still has open work (E39, Search Results), so it is worth naming.

| # | Instance | Shape |
|---|---|---|
| 1 | **E33** — durable reusable-source refresh | Reported completion without refreshing consumer search candidates |
| 2 | **E37a** — `reindexAll` | `.take(500)` per content type; reported a full reindex |
| 3 | **E37b** — orphan cleanup | `.take(500)` on `searchIndex`; swept only the first 500, and deleted the sentinel lock |
| 4 | **E37c** — source/taxonomy reads | Read errors **swallowed**; coverage silently reduced while the operation succeeded |
| — | **F20** (adjacent, deferred) | `backfillEnterpriseCommerceRecords` returns a completion-shaped summary with no cursor |

The mechanism is verified, not inferred. At `320d33fe`, pre-repair `search/internals.ts` contained **eight bare `catch { }` blocks** — argument-less catches that discard the error entirely — alongside the `.take(500)` caps marked `// H-16 FIX: bounded query`. At HEAD the search subsystem is down to **two** bare catches (`eventHandlers.ts`, `reindex.ts`), with explicit `throw Error(...)` on the uncertainty paths and the abort-don't-delete invariant documented. So the repair was substantive, and the pattern's home has largely been cleaned.

**What I am explicitly not claiming.** There are **367** bare `catch { }` blocks across the backend (top concentrations: `wordpressSync/phases/reconciliation.ts` 13, `helpers/customFieldValidation.ts` 8, `commerceSubscriptions/mutations.ts` 8). That number is **not a finding**. Most bare catches are legitimate — a `JSON.parse` with a fallback, an optional lookup, a best-effort format probe. Reporting 367 as a defect count would be exactly the mechanical over-reach that produced three false signals earlier in this series.

**The narrow recommendation.** The risk is specifically a bound or a swallowed error *inside an operation that reports completion*. Apply that as a review lens — not a sweep — at the three or four remaining places where completeness is claimed:

- **Task 4 migration** (2 rows) and **E07** one-content-model migration and legacy retirement, where a truncated conversion reporting success would be the most expensive version of this bug.
- **E39** search prose and the held `core/search-results` row, since the subsystem's remaining work is where this pattern has lived.
- Any future backfill, including F20's if it is ever promoted.

The question to ask each is short: does this operation bound its work, and if so does it report the bound truthfully and advance a cursor? That is three or four inspections, not a campaign, and the plan's §2 gate already governs whether any of them justifies expanding scope.

---

## 5. Three hours at 74/63 — held, not stalled

The tracker has not moved since 19:56. Since a plateau is the kind of thing worth flagging rather than glossing, I checked what the three hours actually produced:

- **E36** approved custom composition search (9 registered regressions / 29 assertions)
- **E38** native restore timeout at the 1 s source CPU cap (1028 ms → 125 ms), which was blocking restore of a three-definition page
- **E37** resumable reindex across installed sources, including the Community Events data-loss repair and the swallowed-read-error repair
- **E39** first Library prose pass, 36 `searchText` declarations with compatibility proof that stored fields, defaults, examples, versions and requirements are unchanged

All four are **infrastructure that unblocks rows rather than closing them**, and the one row they bear on — `core/search-results` — is explicitly held on remaining canonical prose and current presentation, with Codex noting an observed empty-category `0` artifact on the public search route that it has not yet accepted. Codex is also explicit: *"Do not conflate 36 decls with complete search."*

So the plateau reflects a dependency chain being cleared, not stalled throughput. Worth saying plainly though: **this is the longest flat stretch of the series**, and if it extends much further without a row closing, the useful question becomes whether the search subsystem is absorbing more than its two remaining rows justify. I am not asserting that yet — E37's data-loss defect alone justified the detour — but it is what I will be watching.

---

## 6. Status of findings

| ID | State |
|---|---|
| **F1** plugin default mismatch | **Open — eleventh consecutive hour.** Backend `PLUGIN_DEFAULTS` still carries `true` for knowledgeBase/tickets/customFields/recipes/gallery against `false` manifests. Codex continues to state it is required before plugin-content/support acceptance. Those batches have not opened, so it is not overdue — but it is the longest-running open finding by a wide margin. |
| **F2** auto-push | Closed, holding — 0 `git push` lines in both hooks, re-verified. |
| **F19** page-href duplication | Deferred to the next destination/localization pass, with encoding reachability still unproven by either of us. Codex names Language Switcher as that next pass. |
| **F20** backfill truncation | **Recorded in the deferred register** with the promotion condition intact. Closed as an audit action. |
| **F21** silent-failure pattern | **New**, open as a review lens. |
| **F17** reference gate | Accepted into E17/Task 7. |
| **F18** header/row parity | Holding. |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed; no regressions observed. |
| **F12** · **F15** | Declined / located, with reasoning. |
| **E22** screenshot identity · **E28** header separator | Open, idle since audit 06. |
| **E39** search prose | Opened this hour. |

---

## 7. Evidence-discipline items worth crediting

Three from this hour, all self-reported rather than discovered:

- **Weak evidence corrected rather than banked.** *"Initial public destination assertions also matched excerpts/result headings; I corrected the evidence rather than keeping those claims."* The final proof is a keyboard URL + H1 + body + painted screenshot for record 1, with earlier screenshots explicitly downgraded to search evidence only and attempts against already-deleted records labelled harness diagnostics.
- **Tooling failures excluded explicitly, not silently.** A wrong-root Website type command and an ambiguous child-test invocation were named and excluded from acceptance; a parent-project type invocation that exhausted the default heap was disclosed along with the `-p convex/tsconfig.json` and 8 GiB workaround.
- **A fixture correction disclosed.** An initial fixture `queryBinding` location was rejected at revision 0 and corrected via the journal to a declared URL; browser trailing-slash and heading assumptions were corrected. Both excluded from final acceptance.

This is the fourth consecutive hour where a green or plausible result was investigated instead of accepted. That habit is why these audits keep finding process items rather than correctness gaps.

---

## 8. What I will measure next hour

1. **F1** — twelfth hour; tied to plugin-content/support batch opening.
2. Whether **`core/search-results`** closes, and whether the empty-category `0` artifact is repaired or deliberately deferred.
3. **F19** — Language Switcher is named as the next destination pass; whether the shared route contract lands with it.
4. **F21** — whether the review lens is adopted for Task 4 / E07 migration work.
5. The plateau: whether any row closes, and if not, whether the search detour is still justified by what it is repairing.
6. Verified count and downgrade check against the 74-row set; the `*Sha256` drift fields remain unexercised since audit 04.

---

## 9. Corrections and negative results

- **367 bare `catch { }` blocks backend-wide is not a finding.** Most are legitimate fallbacks. The defect shape is a bound or swallowed error inside an operation that *reports completion*. Stated so nobody treats the count as a defect list. §4
- **The search subsystem's bare catches went 8 → 2** in the reindex path; the repair was substantive, not cosmetic. Verified at `320d33fe` versus HEAD.
- **The Community Events deletion was reproduced in an isolated installed-clone fixture only** — no live sweep ran. Codex stated this; I am recording it so the finding is not later cited as a live data-loss incident.
- **F19's encoding divergence remains unconfirmed-reachable** — neither Codex nor I claim it as a live defect.
- **Audit 07's "48 resolvers" remains withdrawn** (dirty-tree measurement); the `defineDataBlock ↔ spec.data` heuristic remains withdrawn (four false positives); my "intentional-deny list" refinement to F17 remains withdrawn.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**; **`core/featured-page` was never a latent E29**; **E38's cache re-checks integrity on hits and caches no authority** (audit 10).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric; and a mechanical count is a hypothesis, not a finding — this hour's 367 was the fourth time that mattered.
