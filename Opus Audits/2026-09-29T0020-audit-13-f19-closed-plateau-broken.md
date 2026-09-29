# Opus Audit 13 — plateau broken, F19 closed, and F21 widens beyond search
**Auditor:** Claude Opus 5 · **Written:** 2026-09-29 00:20 MDT · **Covers:** 23:20 → 00:20
**Live source:** hardening worktree @ `956e4485` plus 20 files in flight (E41 localization promotion)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**The plateau broke: 75 Verified / 62 In progress.** `core/search-results` accepted on accumulated E32–E40 evidence, **E39 closed** within an explicitly stated boundary, and **Task 3 moved to `in_progress`** to reflect actual work. Zero downgrades.

**F19 is closed, and the implementation is better than what I proposed** — it preserves two legitimate historical menu behaviours I had mischaracterised as drift, and it hardens a path-injection case I did not spot. It also **settled the reachability question I left open**: the encoding divergence was real, reproducible through historical data rather than new authoring. §3.

**F21 has widened.** E41 is a fifth instance of the same shape — a read-only export that drops locale config and groups *while reporting no issues* — and it is the first blocker Codex has classified a **demonstrated delivery blocker**. The pattern now spans three subsystems, so my audit-11 framing of it as a search-subsystem habit was too narrow. §4.

---

## 2. Deltas since audit 12 — verified

| | Audit 12 (23:20) | Now (00:20) |
|---|---|---|
| Hardening HEAD | `c3c15fce` | **`956e4485`** (+2 commits) |
| Divergence | main +29 / hardening +20 | main +31 / hardening +22 |
| Live tracker | 74 / 63 (4 hours flat) | **75 / 62** |
| Rows added | — | **`core/search-results`** |
| Downgrades | none | **none** |
| Task 3 | `pending` | **`in_progress`** |
| Blockers | 40 | **41** (E41) |
| Header parity (F18) | holding | **holding** — declared 75/62 = row tally 75/62 |

Commits: `1b327d5c` match authored host and published poll presentation · `956e4485` unify public document destinations and verify locale links.

**On my scope question from audit 12:** Codex's answer was well-judged and did not need the owner. It bounded E39 to the four already-reproduced metadata slices, declined to add *"speculative future promotion/SDK cases to this search slice"*, kept full SDK/AI checks in E17/Task 7 and integrated/performance checks in Task 8, then closed E39 *"within authored-copy/current-presentation boundary"* and moved on. Closing a blocker against a **stated boundary** rather than against an open-ended notion of "done" is exactly the mechanism that resolves a proportionality concern without relaxing anything. The assistant, poll, embed and map row statuses correctly remain In progress.

---

## 3. F19 closed — verified, and it corrects me twice

The new `convex/helpers/publicDocumentHref.ts` consolidates **all eight sites I enumerated** — `data.ts`, `navigation.ts`, `relatedContent.ts`, `contentMembershipPaths.ts`, `localization/model.ts`, `menus/internals.ts`, `menus/queries.ts`, `search/publicSource.ts` — with a contract test at `helpers/__tests__/publicDocumentHref.test.ts`. Net 110 insertions against 41 deletions, and the menu call sites shrank by ~11 lines each. That is the shape I recommended.

Two things it got right that I did not:

**It preserved a divergence I called drift.** I flagged `menus/queries.ts:350`'s bespoke slash handling as *"bespoke leading-slash normalisation that no sibling has."* It was not noise — it carried two real compatibility cases, now named and pinned in a separate `publicMenuDocumentHref` variant: an explicit `/` homepage stays `/`, and an already-served `/page/...` path is not double-prefixed. The test asserts both. **My framing was wrong**; flattening those would have broken legacy menus.

**It hardened a path-injection case I missed.** The helper accepts a stored path only when it starts with a single slash and contains no backslash or control character; otherwise it falls back to the encoded slug. The test pins `{path: '//outside.invalid'}` → `/page/safe` and a backslash path → `/page/safe`. I audited eight duplicated expressions for *consistency* and never asked whether a stored path was trustworthy input at all. Under the old code a protocol-relative stored path produced `/page//outside.invalid` — not off-site, so the practical exposure was limited — but control characters or traversal segments could misroute, and this now fails closed.

**And it answers my open question.** I reported the missing `encodeURIComponent` at `navigation.ts:20` as *unconfirmed-reachable*, because I could not establish a page-slug character constraint in a bounded read. Codex settled it: *"Ordinary authoring slugifies safely; spaced/accented historical fixture reproduced F19."* So new authoring is safe, and **historical pages with spaced or accented slugs do reproduce it** — the test encodes exactly that case, mapping a spaced accented slug to its percent-encoded destination. Flagging it was right; withholding the reachability claim was right; Codex proved it with a fixture rather than an argument.

Evidence: 497 backend tests / 3,792 assertions, types/deploy/freshness, eight public pack/width cases, read-only native Website iframe, all 42 pages / config / groups / appearance preserved. Report at `ConvexPress-Admin/audits/2026-09-04/locale-destinations-20260928.md`.

---

## 4. F21 widens — E41 is the fifth instance, and the first demonstrated blocker

**E41**, classified `demonstrated delivery blocker` — the first of that classification in the register: *"live read-only export reproduces missing locale host context without a reported issue."* The export drops locale configuration and groups while carrying the Language Switcher block, and **reports no issues**.

That is the F21 shape again: work completed partially while success is reported. The tally is now:

| # | Instance | Subsystem |
|---|---|---|
| 1 | **E33** refresh reported complete without refreshing candidates | search indexing |
| 2 | **E37a** `reindexAll` reported a full reindex at 500 records | search indexing |
| 3 | **E37b** orphan cleanup capped at 500, deleted the sentinel lock | search indexing |
| 4 | **E37c** source/taxonomy read errors swallowed | search indexing |
| 5 | **E41** export drops locale config/groups, reports no issues | **content promotion** |
| — | **F20** (deferred) backfill returns completion-shaped summary, no cursor | **commerce** |

**I need to widen my own framing.** Audit 11 called this *"the search/indexing subsystem has a habit."* With content promotion and commerce now represented, that is too narrow: it is a **codebase-wide disposition** in multi-step operations — bound or fail internally, then report success. Three subsystems, six instances, all found within about six hours.

This strengthens the narrow recommendation rather than changing it. The review lens Codex accepted for E39 and Task 4/E07 should now explicitly cover **Task 4 migration and legacy retirement**, where the stakes are highest: a truncated content conversion that reports success is the one version of this bug that loses authored work irreversibly. Codex's own formulation remains the right test — *"Candidate truncation and public fail-closed behavior must not be confused with a successful full-corpus migration/backfill."*

E41 is also correctly scoped by Codex: *"Synthetic matching target descriptor only; no target write"*, and the next boundary is *"explicit reviewed localization promotion, remapping and conflicts/recovery, not a general promotion rewrite."* Declining to turn a reproduced export gap into a promotion rewrite is the §2 discipline working.

### F22 — F21 is not recorded anywhere durable · **LOW · Tracking hygiene**

I checked the status file's `coordination` section: **F19 present, F20 present, F21 absent.** F21 was accepted as a review criterion rather than a tracked blocker, and Codex said it would *"carry this criterion into migration acceptance"* — but it currently lives only in response prose and my audit files.

That is the same argument I made in F16, which Codex accepted: a criterion that exists only in conversational artifacts does not survive a handoff. With Task 4 still `pending` and the migration acceptance it governs still hours away, one line in `coordination` alongside F19/F20 would make it durable. Small, and the cheapest possible insurance on the finding with the highest stakes.

---

## 5. Status of findings

| ID | State |
|---|---|
| **F1** plugin default mismatch | **Open — thirteenth consecutive hour.** Backend `PLUGIN_DEFAULTS` still `true` for knowledgeBase/tickets/customFields/recipes/gallery against `false` manifests. Task 3 is now `in_progress`, so `plugin-content` and `support` are live batches in an active task — the gate is closer than at any prior point. Codex reaffirms it is queued before those, and separately confirmed *"No existing disabled plugins will be enabled for fixtures"* — consistent with the Bundle Offer decision last hour. |
| **F2** auto-push | Closed, holding — 0 `git push` lines in both hooks, re-verified. |
| **F19** page-href duplication | **Closed** — shared helper, menu compatibility variant, path hardening, contract test, and the reachability question settled. §3 |
| **F20** backfill truncation | Recorded in the deferred register with promotion condition. |
| **F21** partial-work-reported-as-success | **Open, and widened** to a codebase-wide disposition. §4 |
| **F22** F21 not durably recorded | **New**, low. |
| **F17** reference gate | Accepted into E17/Task 7. |
| **F18** header/row parity | Holding across four consecutive checks. |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed; no regressions observed. |
| **F12** · **F15** | Declined / located, with reasoning. |
| **E22** screenshot identity · **E28** header separator | Open, idle since audit 06 — seven hours. Both are Task 5/6/8 items, so plausibly just queued. |
| **E39** | **Closed** within its stated boundary. |
| **E41** | Open, `demonstrated delivery blocker`. |

---

## 6. Evidence-discipline items this hour

- **A hydration-timing artefact was not filed as a bug.** *"Initial preview screenshot was hydration timing, not a proven poll bug."* Final screenshots wait for live signed-out poll messaging instead.
- **A stale-asset matrix failure was preserved, not overwritten.** *"First matrix overlapped my final build and failed on stale asset 404s; preserved separately, preview restarted, complete matrix rerun green."*
- **An invalid save was allowed to be refused.** *"Invalid poll save was correctly refused"* — the refusal recorded as correct behaviour rather than worked around.
- **Live settings mutation avoided where it would create state.** Public assistant settings have no stored section, so a live toggle would leave a defaults row behind; those negative cases stayed as registered tests instead. That is the same restraint as the Bundle Offer decision — not mutating the environment to make a check convenient.
- **No votes or provider consent performed** during poll acceptance.

Sixth consecutive hour in which a plausible result was investigated rather than banked.

---

## 7. What I will measure next hour

1. **F1** — fourteenth hour, now inside an active Task 3.
2. **E41** — whether localization promotion stays bounded to reviewed remapping/conflicts/recovery rather than expanding into a promotion rewrite.
3. **F22** — whether F21 reaches the coordination register before Task 4 opens.
4. Whether **Language Switcher** closes (the last content-discovery row) and whether **Task 2's 15 rows** get opened.
5. Verified count and downgrade check against the 75-row set.
6. **E22** and **E28** — seven hours idle.

---

## 8. Corrections and negative results

- **My audit-09 characterisation of `menus/queries.ts:350` as drift was wrong.** It carried two genuine legacy-menu compatibility cases, now preserved in `publicMenuDocumentHref` and pinned by test. §3
- **F19's encoding divergence is now confirmed reachable** — through historical spaced/accented slugs, not ordinary authoring, which slugifies safely. My "unconfirmed-reachable" hedge was the correct posture and is now resolved.
- **I missed the path-trust question entirely** in F19 — I audited eight expressions for mutual consistency without asking whether a stored path is trustworthy input. The helper now fails closed on protocol-relative, backslash and control-character paths.
- **Audit 11's F21 framing was too narrow** — it is not a search-subsystem habit but a codebase-wide disposition, now evidenced in three subsystems. §4
- **E27's classification is `accepted repair`** — my own filter flagged it falsely in audit 12; not an inconsistency.
- **367 bare `catch` blocks remains explicitly not a finding**; no broad sweep was undertaken, correctly.
- **Audit 07's "48 resolvers" remains withdrawn** (dirty-tree measurement); the `defineDataBlock` ↔ `spec.data` heuristic remains withdrawn; my "intentional-deny list" refinement to F17 remains withdrawn.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**; **`core/featured-page` was never a latent E29**; **E38's cache re-checks integrity on hits and caches no authority** (audit 10).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric; a mechanical count is a hypothesis, not a finding; and a duplicated expression may contain deliberate variation — check before calling it drift.
