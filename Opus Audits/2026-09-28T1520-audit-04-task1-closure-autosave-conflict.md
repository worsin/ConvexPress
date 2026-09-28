# Opus Audit 04 — Task 1 closure, and a conflict-routing defect in private autosave
**Auditor:** Claude Opus 5 · **Written:** 2026-09-28 15:20 MDT · **Covers:** 14:20 → 15:20
**Live source:** hardening worktree @ `7a93bf3f` plus uncommitted working tree
**Focus:** the review Codex requested — *"concrete autosave/recovery defects, especially competing generations and Save racing private autosave"*
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

The most productive hour so far. Four commits, **Task 1 closed on evidence I could verify**, E01 and E19 accepted, and Task 2 underway. Three new blockers (E20–E22) were self-discovered, and one of them (E20) I independently confirmed was real.

One new **medium** finding, in exactly the area Codex pointed me at: **every draft conflict — both competing generations and Save-vs-autosave — is routed into a manual-retry error state that discards the error code**, so the Restore/Discard reconciliation UI Codex already built is unreachable without the user clicking Retry, and a benign interleaving shows an alarming "autosave is unavailable" alert. No data loss. Details in F13.

---

## 2. Deltas since audit 03 — verified

| | Audit 03 (14:20) | Now (15:20) |
|---|---|---|
| Hardening HEAD | `8e0a7ee0` | **`7a93bf3f`** (+4 commits) |
| Divergence | main +5 / hardening +2 | main +8 / hardening +6 |
| Live tracker | 60 / 77 | **60 / 77, no downgrades** |
| Task 1 | in_progress | **complete** |
| Task 2 | pending | **in_progress** |
| Blockers | 18 (+E19) = 19 | **22** (E20, E21, E22 added) |

New commits: `f1ac9624` private canonical draft autosave · `d8a0ea2c` native pointer and mixed-tree baseline · `012a9073` reconcile all pending blocks and delivery requirements · `7a93bf3f` derive page headings from canonical block roles.

**Downgrade check:** I diffed the live Verified set against the 60 names captured last hour — **0 added, 0 removed.** Codex's "tracker unchanged" claim holds, and no row was churned while four commits landed. That is the property the plan's §3 protects and it is being respected.

**E02/E03 remain closed**; nothing this hour touched the `authoringConstraints` mechanism or the write-vs-read split verified in audit 02.

---

## 3. Task 1 closure — claim tested, and it holds

Codex declared Task 1 complete in `012a9073`. I treated that as a claim to falsify rather than accept, because "reconciled 77 rows" is the easiest thing in this project to assert cheaply. It stands up:

- **Row-specific checks are genuinely row-specific.** Across the 77 pending rows, `remainingReview` has **77/77 distinct values**, `requirements` 77/77, `source` 77/77. Last hour these were one uniform sentence. Samples are concrete and block-aware, not boilerplate: `core/rich-text` → *"Native inline marks, breaks and links; exact saved/recovered document; reconcile supported legacy structures with Task 4"*; `core/carousel` → *"Native nested children/reorder and exact recovery; keyboard boundaries, empty/single/multiple slides and narrow/reduced-motion behavior."*
- **New drift detection.** Rows gained `notesSha256`, `specSha256`, `rendererSha256` and `reviewedAtCommit`. This is the right mechanism for the plan's §3 rule about invalidating *only affected* assertions: if a spec or renderer changes after review, the hash mismatch localises what must be re-checked instead of forcing a blanket reset. Unprompted and well-judged.
- **A real schedule now exists.** `deliveryTask`: **Task 2 = 20 rows, Task 3 = 54, Task 4 = 2, Task 7 = 1**, grouped into 20 named `acceptanceBatch` values — `content-discovery` 11, `catalog` 8, `external-embeds` 6, `customer-commerce` 6, `forms` 6, `navigation` 5, `media-interaction` 5, `learning` 5, `business` 4, and eleven smaller ones.
- **The clause map exists:** `docs/superpowers/plans/2026-09-28-delivery-reconciliation.md`, 163 lines / 33 KB, covering both source handoffs.

**F10 is effectively closed**, though not where I predicted. The `classification` enum is still 73 `missing evidence` / 4 `reproduced defect` / 58 `accepted-reusable` / 2 `reusable`. The discrimination I asked for was delivered in `remainingReview` + `deliveryTask` + `acceptanceBatch` instead — which is the substance of the request, and arguably a better shape, since a five-value enum could never have carried a per-block next check. I withdraw the framing that the enum itself needed diversifying.

---

## 4. The requested review: autosave and recovery conflict paths

### What is correctly guarded

**The obvious Save-vs-autosave race is closed by construction.** `CanonicalEditor.tsx:224` passes `paused: externallyLocked || needsRecoveryChoice || !!state.pending || !!state.conflict`. `session.ts:212-226 beginSave()` sets `pending` at the start of a document save and `acceptSave`/`failSave` clear it, so for the whole duration of a Save the draft hook is paused: the effect early-returns and its `clearTimeout` cleanup disarms any pending debounce. An armed-but-unfired timer cannot fire into a Save.

**A timer that fires during a state change re-checks liveness.** The callback reads `current.current` (refreshed every render) and bails on `live.paused`, a changed `epoch` lease, `busy`, an existing `offered`, or a changed `record`. Stale writers cannot land.

**Competing generations are refused correctly at the server.** `drafts.save` refuses `DRAFT_CONFLICT` unless the generation matches, with one deliberately narrow exception for a lost acknowledgement of a byte-identical write (`generation === expected + 1` **and** same `baseRevision` **and** `canonicalJson` equality). The discard tombstone prevents a delayed `expectedGeneration: 0` from resurrecting discarded input. I verified all of this last hour and it is unchanged.

### F13 — Conflict outcomes are routed into a manual-retry error state that discards the error code · **MEDIUM · Reproduced by source trace**

`site-draft.ts:95` ends the autosave mutation chain with:

```js
}).catch(() => {
  if (active.current && lease === epoch.current) { busy.current = false; publish({ status: "error" }); }
});
```

The catch **takes no argument**, so the `ConvexError` code is discarded entirely. Every failure collapses to one state, including the two that are not failures at all but expected reconciliation signals:

- `DRAFT_CONFLICT` — another window advanced the private generation.
- `CONFLICT` — the accepted document's revision moved (`authoringRevision(post) !== args.baseRevision`).

Three consequences follow, and the third is what makes it worth fixing:

1. **A benign interleaving shows an alarming alert.** `CanonicalEditor.tsx:613-617` renders `role="alert"` — *"Site autosave is unavailable. Your edits remain in this window. Retry autosave or save changes."* In the Save-overlap case the user's work **did** save; the message contradicts what just happened.
2. **Nothing recovers automatically.** The effect's guard at `site-draft.ts:73` early-returns while `view.status === "error"`, so neither a further autosave nor the `needsClear` discard can run. Recovery is only the user's Retry button or a remount (`client` identity change). The stale draft row therefore lingers and will be `offered` on the next reopen of that document.
3. **The reconciliation UI is unreachable without manual action.** Codex built the correct affordance — the `offered` Restore/Discard panel with conflict detection — but a conflict cannot reach it directly. `offered` is only ever set inside `load()`. So on conflict the user sees "unavailable" and must press Retry before the choice they actually need appears.

**Reachability.** `paused` prevents a Save from *starting* while a timer is armed, but it does not cancel an autosave mutation already **in flight**, and `beginSave` gates only on the editor's own `pending` — it has no knowledge of the draft hook's `busy`. So: the debounce fires at 1500 ms, the mutation is in flight, the user clicks Save at ~1600 ms, and the two overlap. Whichever lands second sees a moved revision or generation. This is ordinary behaviour for an author who edits and immediately saves — not an exotic interleaving.

**Recommendation** — small, and it reuses what already exists. Branch on the error code in the catch: for `DRAFT_CONFLICT` and `CONFLICT`, call `load()` so the existing `offered` path presents Restore/Discard with fresh authority and conflict detection; reserve `status: "error"` for transport and unknown failures. Optionally treat the post-Save case as neutral, since a successful Save legitimately invalidates the draft's base and the `needsClear` discard is the correct next step. That converts a dead-end alert into the flow Codex already designed.

**Severity rationale:** no data loss — the device journal still holds the input and the document Save succeeded — so this is medium, not high. But it degrades the signal quality of a data-safety UI, and an autosave indicator that cries wolf is the kind of thing authors learn to ignore, which is precisely how the safety net stops working.

---

## 5. E20 independently confirmed, and mid-fix

Codex self-reported E20 (eager renderer imports vs the per-block lazy-chunk handoff clause). I verified both halves, because the current working tree makes it easy to misread:

- **Real at HEAD.** `git show HEAD:…/block-renderer/discovery.ts` uses `{ eager: true }` on the Library glob (`blocks/*/*/render.tsx`) **and** the owned-pack glob (`packs/*/blocks/*/*.tsx`). Every renderer in the catalogue is pulled into the initial graph. The clause is `HANDOFF-ASTRA-BLOCKS-2026-09-05.md`'s per-block lazy loading requirement — one of the items I flagged in audit 01 as needing reconciliation, so this is a handoff clause correctly surfaced.
- **Being fixed now.** The uncommitted `discovery.ts` drops `eager` from both renderer globs and delegates to a new `lazy-registry.tsx` (129 lines) implementing a cached Suspense resource per renderer, with a deliberate policy in its own comment: *"Preloads consume failures; the next read reports the same error to the document boundary instead of retrying a missing chunk."* Manifests stay eager, which is correct — they are metadata, not components.

I note the split state so a later reader does not conclude from the working tree that E20 was never real, nor from HEAD that no fix exists.

---

## 6. Status of open findings

| ID | State |
|---|---|
| **F1** plugin default mismatch | **Open — and now the most schedule-relevant item.** Backend `PLUGIN_DEFAULTS` still `true` for knowledgeBase/tickets/customFields/recipes/gallery; manifests still `false`. Task 3 holds **54 of the 77** pending rows, and the four `reproduced defect` rows (`gallery/album`, `gallery/recipe-card`, `support/kb-search`, `support/ticket-cta`) sit in its plugin batches. The authority decision should land before those batches open, as Codex planned. |
| **F2** auto-push | **Closed, holding.** 0 `git push` lines in both hooks, re-verified. |
| **F6** template-kit skills | **Closed** (plan line 202). |
| **F8 / E19** autosave | **Accepted by Codex**, with native fresh-profile recovery, competing-generation and revision-conflict choices, and Save-clears-draft all reported proven. F13 is a defect *within* the accepted feature, not a reversal of it. |
| **F9** E01 split | **Closed.** E01 accepted this hour on its own subject — 24-node fixture, nested move/undo/redo, wheel 0→950, real scrollbar drag 0→2747, sidebar wheel 0→381, both account menus, real Website preview, **no pointer freeze reproduced and no speculative repair**. Declining to "fix" an unreproduced bug is the right call. |
| **F10** classification | **Closed** — see §3; delivered in a better shape than I proposed. |
| **F11** site-draft wiring | **Closed.** Codex confirmed it as a timing correction and has since deployed to disposable 4860, reporting 2,400 prior function signatures unchanged, 4 draft handlers added, 22 installed Events files preserved, both derived indexes ready. |
| **F12** draft TTL | **Declined, and I accept it.** Codex's reasoning — an unannounced TTL would erase recoverable work, retention is bounded per document/operator/payload, and fleet retention can be specified separately — is sound and better than my suggestion. The plaintext device-journal note will appear in the E19 report. Worth revisiting only if fleet storage policy is ever specified. |

---

## 7. Source review vs tests vs native acceptance

Keeping the distinction Codex asked me to retain, for this hour's claims:

- **Native acceptance (strongest):** E01 pointer/mixed-tree baseline and E19 site autosave — real Electron, fresh profile, owned fixtures cleaned, 115 original posts/pages + 6 Events + 3 media tables + appearance reported unchanged, sessions revoked, user PID 39198 preserved.
- **Tests + types:** focused editor suite 32, affected backend-shared 141, 39 compiler fixtures per consumer, backend/Admin/Website types.
- **Source review only (mine):** everything in §4 and §5. F13 is a source-traced defect; I did not execute it. It should be reproducible as a unit test on `useSiteDraft` by rejecting the save with a `DRAFT_CONFLICT`-shaped error and asserting that `offered` becomes non-null without a manual `retry()`.
- **E21 (page headings)** is explicitly not fully accepted by Codex — four DOM/SSR fixtures and public auth lifecycle pass, but block paint is isolated there and live/native batch acceptance remains pending. Its root cause is worth recording: the v2 public page DTO intentionally omits raw blocks, so four earlier title checks were structurally blind. A blind test that passes is worse than a failing one, and the fix preserving that privacy boundary rather than widening the DTO is the right trade.

---

## 8. What I will measure next hour

1. F13: whether conflict codes get code-aware routing into `offered`.
2. E20: whether `lazy-registry.tsx` commits, preserves SSR and preview continuity, and whether any bundle evidence accompanies it.
3. Task 2 progress against its **20 assigned rows** and the named batches — the first real test of whether batching amortises as the plan predicts.
4. F1: the plugin-gate authority decision, before Task 3's 54 rows open.
5. Verified count and downgrade check against this hour's 60-row set; whether the new `*Sha256` drift fields are actually used to invalidate rows when a spec changes.
6. E22: whether the tracker PNG-path gate is reconciled without weakening the 60 accepted rows.

---

## 9. Corrections and negative results

- **`discovery.ts` globs are lazy in the working tree but eager at HEAD.** Recorded in §5 so neither state is mistaken for the whole truth.
- **`paused` does close the armed-timer race.** I checked this expecting a gap and did not find one; F13 is about in-flight overlap and error routing, not about the pause being absent.
- **No stale-`busy` latch** (re-confirmed): the mount effect resets `busy.current = false` before each `load(true)`.
- **No media-reference leak in the draft path** (audit 03): the `undefined` argument is the optional `permit`, and the guard reads prior state itself.
- **My audit 02 block-name error stands corrected**: `gallery/recipe-card`, not `recipes/recipe-card`; there is no `recipes/` block namespace.
- **Audit 01's F2 overstatement remains withdrawn**: ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **F10's framing was mine to correct** — the `classification` enum did not need diversifying; per-row fields carried it.
- **Reminder:** LOC is not a depth metric here; whole components occupy single lines.
