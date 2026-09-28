# Opus Audit 06 — four reproduced defects repaired; a blocker-tracking drift
**Auditor:** Claude Opus 5 · **Written:** 2026-09-28 17:20 MDT · **Covers:** 16:20 → 17:20
**Live source:** hardening worktree @ `b9a105dc` plus 6 modified backend files in flight (E27)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

A strong defect-hunting hour: **four reproduced defects** (E24–E27), three repaired and committed, one active. Both of last hour's findings were adopted — F14 verbatim into the plan, F15 located and root-caused. Tracker held at **63 Verified / 74 In progress** with **zero downgrades**, which is the honest outcome given Codex declined to close the Menu/Child family before its variants finish.

I verified the two repairs that could have been wrong in the opposite direction (E25's off-by-one, E24's compatibility alias) and both are correct.

One new finding: **F16**, a blocker-tracking drift. The plan document's blocker table stops at **E19** while the status file carries **E26**, and active blocker **E27** plus a self-reported header-separator defect live only in checkpoint prose. In a project that just restarted from a handoff, that is the failure mode most likely to lose work.

---

## 2. Deltas since audit 05 — verified

| | Audit 05 (16:20) | Now (17:20) |
|---|---|---|
| Hardening HEAD | `419a8a51` | **`b9a105dc`** (+2 commits) |
| Divergence | main +11 / hardening +9 | main +14 / hardening +11 |
| Live tracker | 63 / 74 | **63 / 74 — unchanged** |
| Downgrades | none | **none** |
| Blockers (status file) | 23 | **26** (E24, E25, E26 added) |
| Working tree | clean | 6 backend files in flight (E27) |

Commits: `92ccc65b` repair menu defaults and page hierarchy depth · `b9a105dc` preserve public keyboard focus through hydration.

**No tracker movement is the correct result here.** Codex explicitly held the Menu/Child Pages rows open pending full family variants rather than closing them on partial evidence. Three defects were repaired without a single row being claimed — the opposite of the failure mode these audits exist to catch.

---

## 3. Last hour's findings — both adopted

**F14 adopted verbatim.** Plan line 140 now reads: *"For every Task 2/3 accepted row, capture page errors and console errors, including hydration warnings, in native preview and public interaction checks. Visually correct output with an unresolved product error is not passing evidence; classify unrelated harness/environment diagnostics explicitly."* That is exactly the criterion I recommended, including the classify-don't-filter clause. It earned its place within the hour — see E26 in §4.

**F15 located and root-caused, confirming the unit ambiguity was real.** `scripts/website/check-bundle.mjs:6` sets `BUNDLE_MAX_MAIN_BYTES ?? "300000"` — 300 **decimal** KB. Line 8-10:

```js
function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}
```

It divides by 1024 but labels the result `kB`, so the 300,000-byte budget prints as "292.97 kB" when it is 292.97 **KiB**. That fully explains the two different limits quoted in earlier checkpoints (300 KB vs 292.97 KiB) — same threshold, mislabelled unit. The file dates from Sep 4, so this is pre-existing and cosmetic, not introduced by any of this work. Codex correctly declined to raise or exempt the threshold; it remains an open Task 8 gate at **309.30 KiB / 292.97 KiB**.

Worth one line of cleanup whenever Task 8 is touched: either label it `KiB` or divide by 1000. A gate that misreports its own units invites exactly the confusion it caused here.

---

## 4. The four defects — verified where verification mattered

### E25 — depth double-count across five mutations · **Repair verified correct**

Five call sites in `pages/mutations.ts` (`create`, `update`, `permanentDelete`, `reorder`, `setParent`) changed from `computePageDepth(ctx, parentId) + 1` to `computePageDepth(ctx, parentId)`.

This is the repair that could easily have been wrong in the other direction, so I traced the helper. `pages/internals.ts:143-162`: returns `0` when there is no parent; otherwise starts `depth = 0` and increments **before** walking to the grandparent. For a root parent it returns **1** — already the depth of the child being created. So the `+ 1` genuinely double-counted, and removing it is correct.

The user-visible consequence is worth recording: `MAX_PAGE_DEPTH` was rejecting hierarchies one level shallower than intended, which is why Codex found it by attempting a fourth-descendant creation. A quiet off-by-one in a limit check is the kind of defect that only surfaces when someone pushes to the boundary, and pushing to the boundary is what found it.

### E24 — Menu defaulted to `primary` while the registered location is `header` · **Repair verified appropriately narrow**

`menus/queries.ts readPublicMenu` now falls back from `primary` to `header` **only when no `primary` location exists**:

```js
if (!location && locationSlug === 'primary') { locationSlug = 'header'; … }
```

Three properties I checked because compatibility aliases are usually where correctness leaks:

- An actual custom `primary` location is preserved and authoritative — the alias is gated on `!location`.
- An **assigned-but-empty** `primary` also wins, because the guard tests `location`, not `menuId`. Codex's claim that "explicitly empty/custom primary remains authoritative" holds.
- No saved content is rewritten. This is a read-path alias only, consistent with the project's standing principle that historical values stay readable rather than being migrated under the author.

### E26 — public keyboard focus lost through hydration · **Accepted; validates F14 immediately**

Three causal repairs with failing-before evidence: session-provider anonymous readiness key, lead-magnet-provider anonymous readiness key around every canonical body, and initial display-grant revocation landing before React committed replacement state. Codex notes the third *"produced a brief unavailable state inside data blocks; act batching hid it."*

That detail is the F14 criterion earning its keep within an hour of being written down: a test harness's batching concealed a real intermediate state, and only browser-scheduled observation exposed it. Codex also preserved the two insufficient-repair live failures in `output/public-focus-20260928/` rather than only the green result — which is the right evidentiary habit and makes the repair auditable.

### E27 — 256-query budget exhausted at 80 children · **Active; repair shape verified correct**

The most interesting defect of the hour, found by deliberately testing a maximum directory: 80 owned public children plus two nested Menu blocks made `canonicalDocuments:get` exhaust the 256-query budget and left the native editor unreadable. Codex preserved the failure rather than reducing the fixture.

Root cause verified in the in-flight diff to `helpers/contentMembershipPaths.ts`: the old function issued its own `settings`/`reading` query **per page** to resolve the homepage alias. At 80 children that is 80 identical reads. The repair introduces `createContentMembershipPathResolver(ctx, budget)` returning a closure that memoises the promise:

```js
reading ??= (async () => { budget?.beforeRead(); const value = await …; budget?.record(value); return value; })();
```

Correct on three counts: the memo is the **promise**, so concurrent callers dedupe rather than racing; the budget accounting sits inside the closure, so it is charged once instead of N times; and the scope is one resolver per read snapshot, with the comment stating it is *"never cached across requests or reused after writes"* — which is the correctness constraint a cache like this must respect.

Codex is explicit that E27 is **not closed**: the first strict deployment repaired only the directory path, the full combined live document still failed, and a second snapshot adding menu-target reuse is deploying. It also flags that 81 owned pages, 3 menus and 2 location records are still active and need cleanup. I take no position on the live outcome — it is mid-flight.

This also lands squarely on a known platform characteristic: per-request query budgets are the binding constraint in this backend, and repeated identical reads inside a traversal are the classic way to hit them. Worth watching whether the same pattern exists in other traversals — child-pages, breadcrumbs, archive and menu readers all walk hierarchies.

---

## 5. New finding

### F16 — Blocker tracking has drifted across three artifacts · **MEDIUM · Tracking hygiene**

Three sources now disagree about what the open blockers are:

| Artifact | Blockers present |
|---|---|
| `2026-09-28-editor-template-delivery.md` (the plan) | **E01–E19** |
| `2026-09-28-editor-template-status.json` | **E01–E26** |
| `Opus Audits/CODEX-NOTES.md` checkpoint prose only | **E27**, plus the header-separator defect |

I verified each: `grep -c "E27"` returns **0** in both the plan and the status file, and the plan's blocker table tops out at `| E19 |`. So **E20–E26 are absent from the plan document**, and **E27 is absent from both** — while being an active, explicitly unclosed blocker with live owned fixtures attached.

The self-reported header-separator defect is in the same position: *"Header consumers also render separator label as an item; inline Menu correctly uses hr, follow under Task 5."* That is a concrete rendering inconsistency with a named owner task, and it exists nowhere but a prose checkpoint.

**Why this matters more than usual here.** The handoff instructs a fresh session to read the plan *first*, describing it as the *"complete eight-stage execution guide, 18 known blocker/gap categories."* A session that starts there sees 19 blockers and would miss eight items. This project restarted precisely because a long session became unusable; continuity artifacts are the mechanism that made that recoverable, and one of the three is now a month behind the others within a single day's work.

**Recommendation** — cheap, and consistent with the F9 split Codex already accepted: make the status JSON the single blocker register (it is already the most current), add E27 and the separator defect to it, and either sync the plan's table or replace it with a pointer to the status file so it cannot silently fall behind. Not a code defect, and not urgent today while one session holds all the context — but it is the artifact that has to survive the next handoff.

---

## 6. Status of open findings

| ID | State |
|---|---|
| **F1** plugin default mismatch | **Open — sixth consecutive hour, and now the last gate before Task 3.** Backend `PLUGIN_DEFAULTS` still `true` for knowledgeBase/tickets/customFields/recipes/gallery; manifests still `false`. Task 3 holds 54 of the 74 remaining rows and the four `reproduced defect` rows. Codex continues to schedule it before plugin family acceptance, which is coherent — but it is the one finding that has never moved, and the batch it gates is the largest in the plan. |
| **F2** auto-push | Closed, holding — 0 `git push` lines in both hooks, re-verified. |
| **F6** template-kit skills | Closed. |
| **F8/E19, F9, F10, F11, F13** | Closed in earlier hours; no regressions observed. |
| **F12** draft TTL | Declined with sound reasoning; accepted. |
| **F14** console-clean criterion | **Closed this hour** — plan line 140. |
| **F15** entry-size gate | **Located and root-caused**; the gate itself remains an open Task 8 item, plus an optional unit-label cleanup. |
| **F16** blocker tracking drift | **New**, open. |
| **E22** tracker PNG gate | Open. |
| **E27** query budget | Active, mid-deployment. |

---

## 7. Source review vs tests vs native acceptance

- **Native acceptance:** E24/E25 native `86834` profile — default header, save/reopen of historical primary, depths 1..4, QuickEdit root/back moves, publication revision 5. E26 on the actual built Website — 8 four-pack × 1440/390 cases retaining exact DOM and focus, Enter navigation, no console/page errors or hydration warnings.
- **Tests:** 50 tests / 11,310 assertions (menu+depth); 187 focused backend tests / 1,705 assertions (E27); auth/operator/public-body/reusable/grant suites and types/build.
- **Source review only (mine):** everything in §4 and §5. I executed nothing.
- **Explicitly not accepted by Codex:** E27 live closure, the Menu/Child family rows, the main bundle budget, E22. Codex also notes that making the settled matrix green by waiting for network-idle *"is not a fix or row closure"* — correctly refusing to let a harness workaround stand in for a repair.

Two judgement calls worth crediting: preserving the 80-child failure instead of shrinking the fixture, and keeping the two insufficient-repair live failures in the E26 evidence directory. Both make the work auditable by someone who was not there.

---

## 8. What I will measure next hour

1. **F1** — whether the plugin-gate authority decision lands. Task 2 has ~17 rows left; when they close, Task 3's 54 rows open behind this gate.
2. E27's second strict deployment: whether live closure is claimed, and whether the 81 owned pages / 3 menus / 2 location records are cleaned up as Codex planned.
3. Whether the same repeated-read pattern that caused E27 exists in the other hierarchy traversals (child-pages, breadcrumbs, archive, menu readers).
4. F16: whether E27 and the separator defect reach the status register.
5. Verified count and downgrade check against the 63-row set; whether Menu/Child rows close once variants finish.
6. Whether the `*Sha256` drift fields get exercised — still untested since they appeared.

---

## 9. Corrections and negative results

- **`computePageDepth` already includes the child's level** (`pages/internals.ts:147-161`). I checked this specifically because removing a `+ 1` could have introduced the inverse bug; it did not. E25's repair is correct.
- **E24's alias does not rewrite saved content** and preserves an assigned-but-empty `primary`, because the guard tests `location` rather than `menuId`.
- **F15's unit discrepancy has a single cause** — `formatBytes` divides by 1024 and labels `kB`. Not two different budgets.
- **E27's memoisation is per-request only** and caches the promise, not the value; budget accounting is charged once. No cross-request staleness.
- **No tracker row was added or removed** this hour; the unchanged count is an accurate reflection of held-open families, not a stall.
- **My F13 `CONFLICT` proposal remains withdrawn** (audit 05 §9) — Codex's three-way split is the correct shape.
- **No functionality was removed from `core/site-info`** (audit 05 §4) — spec unchanged since `0cc022b5`.
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Reminder:** LOC is not a depth metric in this repo.
