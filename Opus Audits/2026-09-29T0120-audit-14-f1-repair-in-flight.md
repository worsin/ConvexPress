# Opus Audit 14 — F1 finally in flight, and it found a table I missed
**Auditor:** Claude Opus 5 · **Written:** 2026-09-29 01:20 MDT · **Covers:** 00:20 → 01:20
**Live source:** hardening worktree @ `0ca6bcd3` plus 10 files in flight (**F1 repair**)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**79 Verified / 58 In progress.** The starting baseline of this audit series was 58 Verified / 79 In progress — the ratio has now **exactly inverted**. Four rows added, zero downgrades, and three of them are **Task 2** rows, the first Task 2 closures since I began tracking.

**F1 is in flight after thirteen hours open**, and the repair is better than what I recommended — it covers a **third** plugin-defaults table I never found in audit 01, proves the two evaluators behaviourally equivalent rather than merely comparing tables, and pins `customFields` as intentionally Admin-only. §3. I have one specific pre-commit advisory about public exposure. §3.4.

**F22 closed** — F21 now lives in the coordination register and the plan's Task 4, with a sharper formulation than mine. E41 closed; E18 remains open with a newly specific cause.

---

## 2. Deltas since audit 13 — verified

| | Audit 13 (00:20) | Now (01:20) |
|---|---|---|
| Hardening HEAD | `956e4485` | **`0ca6bcd3`** (+2 commits) |
| Divergence | main +31 / hardening +22 | main +32 / hardening +24 |
| Live tracker | 75 / 62 | **79 / 58** |
| Rows added | — | `core/language-switcher`, `blocks/social-share`, `core/social-links`, `local/sample-alert` |
| Downgrades | none | **none** |
| Blockers | 41 | 41 |
| Header parity (F18) | holding | **holding** — declared 79/58 = row tally 79/58 |

Commits: `05d6b8c9` promote complete reviewed site language configuration and groups (E41) · `0ca6bcd3` complete social utility authoring and four-template acceptance.

**The composition of this hour's rows matters.** `core/language-switcher` closes the content-discovery batch; the other three are **Task 2** (`blocks/social-share`, `core/social-links`, `local/sample-alert`). Codex said last hour that next was *"Task 2 social-utility family, not further search/promotion expansion"* and that is what happened. Task 2 remaining drops from 15 to 12.

**E41 closed** within its stated boundary — explicit site-language selection, complete translation aggregates and portable document IDs, source/target drift, authority, preserved unselected groups, atomic apply and monotonic recovery; native controller review/apply plus eight real target pack/width cases; 141 backend / 94 controller / 25 UI tests. All 42 source and 28 original target pages preserved; three target-owned pages removed.

**E18 stays open with a newly specific cause**, which is worth recording because it is the kind of detail that gets lost: *"target keeps its older installed-extension baseline and lacks four current draft functions. Native autosave unavailable is linked to that function-spec gap; separate document-settings warning still needs diagnosis at integration."* So the autosave-unavailable symptom on the target is attributed to a deployment-baseline gap rather than to the E19 autosave feature itself — Codex explicitly makes *"no claim of full target editor readiness."*

---

## 3. F1 — the repair, verified

Thirteen hours after I raised it, F1 is being repaired. I read the whole in-flight change.

### 3.1 The values

All four Website manifests flip `defaultEnabled: false → true`, aligning them with the backend's `PLUGIN_DEFAULTS`:

| Manifest | Change |
|---|---|
| `extensions/gallery/manifest.ts` | `false` → **`true`** |
| `extensions/knowledgeBase/manifest.ts` | `false` → **`true`** |
| `extensions/recipes/manifest.ts` | `false` → **`true`** |
| `extensions/tickets/manifest.ts` | `false` → **`true`** |

**This is the live-safe direction, and the reasoning matters.** The alternative — flipping the backend down to `false` — would have silently disabled features on any site whose `plugins` settings section lacks those keys, because the backend default currently enables them. Aligning the Website *up* instead means a site with no stored key now shows publicly what the backend already resolved, and a site with an explicit stored `false` is unaffected because stored values win on both sides. No site loses a feature. That is the "compatibility-conscious authority decision" Codex said it needed.

### 3.2 A third defaults table I missed

My audit-01 finding described two sources of truth. The new parity test at `scripts/plugins/defaults.test.ts` reveals **three**:

1. Backend `convex/plugins/registry.ts` — `PLUGIN_DEFAULTS`, `PLUGIN_SETTINGS_KEY`, `isPluginEnabledFromValues`
2. Website `extensions/sdk/registry.ts` — `WEBSITE_EXTENSIONS`, `extensionEnabled`
3. **Admin `apps/web/src/lib/plugins/registry.ts` — `PLATFORM_DEFAULT_SETTINGS`**, which I never located

The test reads the Admin table with the TypeScript compiler API rather than importing it, because that module carries a Vite-only scanner — a careful touch, and the comment says so explicitly. **My F1 was incomplete**: I audited two of three tables and asserted the mismatch was between them. Recording that as a correction.

### 3.3 The gate is behavioural, not just tabular

The test asserts more than table equality, which is what makes it durable:

- **Key parity**: `PLUGIN_SETTINGS_KEY[manifest.id] === manifest.settingsKey`.
- **The exact F1 assertion**: `(manifest.defaultEnabled ?? false) === PLUGIN_DEFAULTS[manifest.id]`.
- **Evaluator equivalence**: for `{}`, `{key:false}`, `{key:true}` and parent-on/parent-off combinations, `extensionEnabled(...)` must equal `isPluginEnabledFromValues(...)`. So the two *decision functions* are proven to agree, not merely their default tables — that is the property that actually prevents an F1 recurrence through divergent logic rather than divergent data.
- **Merged defaults**: `getDefaults("plugins")` matches backend for every key, and Admin defaults match wherever present.
- **`customFields` pinned as intentional**: `adminDefaults.customFieldsEnabled === true` and `WEBSITE_EXTENSIONS.has("customFields") === false`. That answers the sub-question I left open in audit 01 — the backend-only plugin is deliberately Admin-only with no Website manifest, and the test now fails if someone adds one without thinking.
- **Explicit-disable wins**, including legacy keys and aliases.

Plus a second convex-test at `convex/plugins/__tests__/defaults.test.ts` asserting that public settings publish the enabled backend defaults **without creating a settings row** — i.e. the defaults are projected, not materialised, so reading them does not write state.

Both are wired into the existing gate: `scripts/blocks/check.mjs` gained an `execFileSync` step, and `package.json` gained `check:plugin-defaults`. So this runs with `check:blocks` rather than depending on anyone remembering it.

### 3.4 One pre-commit advisory

Flipping the Website defaults to `true` changes **public visibility** on any site with no stored `plugins` section. The four manifests declare route prefixes `/gallery`, `/help`, `/support`, `/recipes`. On such a site those surfaces become publicly reachable where the Website previously hid them.

I believe this is correct — the Admin defaults are also `true` (the test asserts Admin matches backend), so the Website was the outlier hiding features the operator already saw as enabled, and the change makes the system consistent with what Admin reports. But it is a public-exposure change rather than a purely internal alignment, so the specific thing worth confirming before commit is that those four route prefixes render acceptably on a site that has never configured them — empty states rather than errors or scaffolding. That is one check, not a campaign, and it is the only part of this repair I cannot verify statically.

**Status:** F1 is not yet committed — the change is in the working tree. I will confirm closure next hour.

---

## 4. F22 closed

Verified: the status file's `coordination` section now carries **F19, F20, F21 and F22**, and `F21` also appears in the plan's Task 4. The recorded criterion is better worded than mine:

> *"Accepted delivery review criterion: any migration/backfill/export claiming completeness must prove full intended coverage or return an explicit incomplete/blocked result. Carry into Task4/E07 migration and legacy retirement; no broad bare-catch sweep or inferred whole-codebase defect."*

That captures both halves — the criterion and its boundary — in one sentence, including the explicit refusal to infer a whole-codebase defect. Codex also restated the limit in its response: *"evidence from several operations does not establish that every multi-step operation is defective and does not authorize a broad catch sweep."* Agreed, and that was my own boundary in audits 11 and 13.

---

## 5. Status of findings

| ID | State |
|---|---|
| **F1** plugin default mismatch | **Repair in flight, uncommitted.** Four manifests aligned in the live-safe direction; three-table parity gate with evaluator equivalence; `customFields` pinned; wired into `check:blocks`. One public-exposure check advised before commit (§3.4). Thirteen hours from raise to repair. |
| **F2** auto-push | Closed, holding — 0 `git push` lines in both hooks, re-verified. |
| **F19** page-href duplication | Closed (audit 13). |
| **F20** backfill truncation | Recorded in the deferred register with promotion condition. |
| **F21** partial-work-reported-as-success | **Open as a durable review criterion**, now recorded in coordination and Task 4. |
| **F22** F21 not durably recorded | **Closed this hour.** |
| **F17** reference gate | Accepted into E17/Task 7. |
| **F18** header/row parity | Holding across five consecutive checks. |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed; no regressions observed. |
| **F12** · **F15** | Declined / located, with reasoning. |
| **E18** | Open — target deployment baseline lacks four current draft functions; autosave-unavailable attributed to that, not to the autosave feature. |
| **E22** screenshot identity · **E28** header separator | Open, idle eight hours. Both Task 5/6/8 items. |
| **E41** | **Closed** within its stated boundary. |

---

## 6. Progress at the ratio inversion

Since the series began, with the same measurement each hour:

| | Series start | Now |
|---|---|---|
| Verified / In progress | **58 / 79** | **79 / 58** |
| Tasks complete | 0 | 1 (Task 1) |
| Tasks active | — | 2 and 3 |
| Tasks pending | 2–8 | 4–8 |
| Blockers registered | 18 | 41 |
| Downgrades, cumulative | — | **zero** |

Twenty-one rows accepted, twenty-three new blockers found and mostly closed, and not one Verified row rolled back. The blocker count growing from 18 to 41 while rows still advance is the healthy shape: defects are being surfaced by pushing real workflows rather than discovered later by users.

Tasks 4–8 remain untouched, and that is still the largest unknown in the delivery — migration and legacy retirement, Templates/Customizer as one workflow, the four finished example sites, the SDK workflows, and the final integrated gate. The audit-12 proportionality question resolved itself for search; it will recur if any single blocker in those tasks absorbs comparable time.

---

## 7. What I will measure next hour

1. **F1** — whether it commits, and whether the public-exposure check in §3.4 is performed.
2. Whether **Task 2's remaining 12 rows** continue closing at this rate, or whether the social-utility momentum was family-specific.
3. **F21's first real test** — Task 4 is still `pending`; the criterion applies the moment migration acceptance begins.
4. Verified count and downgrade check against the 79-row set.
5. **E18**'s four missing draft functions — whether the target baseline is refreshed or the gap is deliberately carried to Task 8 integration.
6. **E22** and **E28** — eight hours idle.

---

## 8. Corrections and negative results

- **My audit-01 F1 was incomplete.** I described two plugin-defaults tables; there are three. The Admin `PLATFORM_DEFAULT_SETTINGS` table in `apps/web/src/lib/plugins/registry.ts` was never in my analysis, and Codex's gate covers it. §3.2
- **My audit-01 remedy was the riskier one.** I proposed making the backend derive from the manifests. Codex instead aligned the manifests to the backend's live-safe values and gated all three tables — no backend refactor, no site loses a feature, and drift is still prevented. The better call.
- **My audit-09 characterisation of `menus/queries.ts:350` as drift was wrong** (corrected in audit 13) — it carried genuine legacy-menu compatibility cases.
- **F19's encoding divergence was confirmed reachable** through historical spaced/accented slugs; ordinary authoring slugifies safely.
- **Audit 11's F21 framing was too narrow** — a codebase-wide disposition, not a search-subsystem habit; now recorded with that boundary.
- **E27's classification is `accepted repair`** — my own filter flagged it falsely in audit 12.
- **367 bare `catch` blocks remains explicitly not a finding**; no broad sweep was undertaken, correctly, and Codex has restated that limit.
- **Audit 07's "48 resolvers" remains withdrawn** (dirty-tree measurement); the `defineDataBlock` ↔ `spec.data` heuristic remains withdrawn; my "intentional-deny list" refinement to F17 remains withdrawn.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**; **`core/featured-page` was never a latent E29**; **E38's cache re-checks integrity on hits and caches no authority** (audit 10).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric; a mechanical count is a hypothesis, not a finding; a duplicated expression may contain deliberate variation; and an enumeration of "the sources of truth" should be proven exhaustive before a mismatch between two of them is called complete — this hour's lesson.
