# Opus Audit 03 — draft recovery review (E19)
**Auditor:** Claude Opus 5 · **Written:** 2026-09-28 14:20 MDT · **Covers:** 13:20 → 14:20
**Live source:** hardening worktree @ `8e0a7ee0` plus uncommitted working tree
**Focus:** the review Codex requested — recovery-offer semantics, scope and stale-writer fences, and *"any concrete path where a recovered draft can mutate accepted/published content without explicit Save."*
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Answer to Codex's question

**I found no path by which a recovered draft can mutate accepted or published content without an explicit Save.** I checked four independently:

1. **Table isolation.** `drafts.save` and `drafts.discard` write only `canonicalDocumentDrafts` (`drafts.ts` — `insertWithMediaReferences`/`patchWithMediaReferences` are called with that table literal and nothing else). Neither handler calls `canonicalDocuments.save`, `setPublication`, or touches `posts`/`revisions`.
2. **No automatic path to document save.** The only autosave timer in the whole editor is `site-draft.ts:78`; it calls exclusively `client.save`/`client.discard`, which resolve to `canonicalDocuments/drafts:save|discard` (`NativeCanonicalEditor.tsx:51-53`). I grepped every `setInterval`/`setTimeout` under `canonical-editor/`: the only other timers are in `NativeSavedPreview.tsx` (attachment/preview debounces). The module's own contract comment states it: *"Private drafts never call accepted Save."*
3. **Restore applies to editor input only.** `choose("restore")` → the `restore` callback at `CanonicalEditor.tsx:225-231` calls `editDocument(openDocument(base), draft)` and sets `conflict` plus a `recoveryNotice`. It performs no mutation. Both offer panels say so to the user: *"This choice does not change the published Website"* and *"It has not changed the saved Website."*
4. **Revision fence.** `drafts.save` refuses with `CONFLICT` when `authoringRevision(state.post) !== args.baseRevision`, so a draft cannot even be *stored* against a document that moved underneath it.

The scope and stale-writer fences hold up too:

- **Authorization is a write capability, not read.** `authorized()` (`service.ts`) calls `requireAuth` then `canEditContent`, refusing `FORBIDDEN` otherwise, and refuses `status === "trash"`. A read-only role cannot create drafts.
- **Per-author isolation** via the `by_postId_userId` index with `userId: user._id`. One operator cannot read or overwrite another's draft.
- **Site scope is fenced twice**: the request's `expectedScope` is compared against `installation(ctx)` → `WRONG_SITE_SCOPE`, and again on `draft.composedDefinitions.scope`. The right check for a desktop app that can point at several deployments.
- **Generation CAS with a deliberately narrow replay window.** A mismatched generation refuses `DRAFT_CONFLICT`, except the one safe case: `generation === expected + 1` **and** same `baseRevision` **and** `canonicalJson` equality — i.e. a lost acknowledgement of the *identical* write. It cannot resurrect a discarded draft or overwrite a newer payload.
- **The discard tombstone is the subtle part and it is right.** `discard` keeps the row with `draft: null` and a bumped generation rather than deleting it, with the reason in-code: deleting it would let a delayed first autosave with `expectedGeneration = 0` recreate explicitly discarded input. That is a race most implementations get wrong.
- **Client-side stale-writer fences**: an `epoch` lease invalidates in-flight loads/saves across remounts, `busy` serialises to one request at a time, and `uncertain` holds an unacknowledged attempt so the next `load()` can reconcile it by content rather than replaying it. `load()` also never grants overwrite permission by itself — *"merely loading it never grants overwrite permission"* — an unmatched generation becomes an `offered` choice instead.
- **Media edges are tracked.** I checked the one thing I expected to be wrong: `canonicalDocumentDrafts` is registered in both `media/referenceInventory.generated.ts:227` and `media/referenceOwners.ts:6` (`opaqueAuthoringOwners`), so `patchWithMediaReferences` sees `mediaRelevant === true`, reads the previous row itself (`attachmentGuard.ts:83`) and reconciles references on replacement. No reference leak. *(I initially misread the `undefined` in those calls as a missing "previous value"; it is the optional `permit` parameter. Negative result, recorded so it is not re-opened.)*
- **Deletion lifecycle is bounded.** `draftMaintenance.removeDraftsForPost` paginates 32 rows / 2MB per batch, uses `deleteWithMediaReferences`, and reschedules itself via an internal-only `makeFunctionReference` when not done.

**Verdict on the design: sound.** The two-tier split is coherent — the device journal is the permissive tier (`recoverCanonicalDraft` allows 2MB, depth 32, 1000 nodes, explicitly beyond authoring's 80-node/8-level budget so an over-budget draft stays repairable), and site autosave is the strict tier (900KB refusal that tells the user the device copy is retained). Invalid field values survive both, consistent with the E02 principle that reads and recovery preserve what writes refuse.

---

## 2. Deltas since audit 02 — verified

| | Audit 02 (13:20) | Now (14:20) |
|---|---|---|
| Hardening HEAD | `b7406b9d` | **`8e0a7ee0`** "Preserve canonical editor drafts across renderer crashes" |
| Uncommitted | none | 16 modified + 4 new `site-draft.*` files |
| `main` HEAD | `a6b4344b` | `348004f4` (2 more `auto:` commits) |
| Divergence | main +3 / hardening +1 | **main +5 / hardening +2** |
| Live tracker | 60 / 77 | **60 / 77 — unchanged, as Codex stated** |
| Tasks | 1 in_progress | 1 in_progress, 2–8 pending |

**No Verified row was downgraded** — the live tracker is byte-identical in status distribution to last hour, and Codex explicitly claimed no tracker movement, which matches. Task 1 remains open; no completion claim was made.

**E02/E03 remain closed.** No regression: the `authoringConstraints` mechanism and the write-vs-read split I verified in audit 02 are untouched by this hour's work.

---

## 3. Status of open findings

| ID | State | Evidence |
|---|---|---|
| **F1** plugin default mismatch | **Open, correctly sequenced** | Backend `PLUGIN_DEFAULTS` still `true` for knowledgeBase/tickets/customFields/recipes/gallery; manifests still `false`. Task 3 has not opened, so this is not overdue. |
| **F2** auto-push | **Closed, still holding** | 0 `git push` lines in both hook scripts, re-verified this hour. |
| **F6** template-kit skills | **Closed** | Plan line 202 now reads: *"Add and exercise `template-build`, `template-add-surface`, and `template-audit` skills, and retarget the required design skill to the delivered template SDK."* Exactly what was missing. |
| **F8** autosave missing | **Half delivered** | Device journal committed at `8e0a7ee0` with Codex reporting real force-crash/restart recovery of a nested invalid draft and unchanged server revision/history/publication. Site-side implemented but undeployed — see F11. |
| **F9** E01 re-scoped | **Closed** | E01 retains its pointer/menu/scroll subject (wheel/drag/nesting still open); new **E19** at plan line 88 owns autosave/crash recovery. Correctly split. |
| **F10** classification | **Partly closed** | Now `missing evidence` 73, `accepted/reusable` 58, **`reproduced defect` 4**, `reusable evidence` 2. The four plugin rows carry the F1 dependency explicitly. E13/E14 recorded as historical external prerequisites needing a current availability recheck. Codex declined to label every static block externally blocked — correct, and I agree; the remaining per-row Notes review is openly incomplete. |

**On my rejected recommendation.** Codex declined my clear-on-sign-out suggestion, arguing it is unspecified in the handoff and would destroy work a returning operator intentionally kept, since scope isolation plus a fresh authorized read already prevents cross-operator visibility. **I accept that; the argument is better than mine.** One informational residual, not a defect: the device journal therefore sits in the Electron browser profile at rest in plaintext. That is the same exposure class as the existing auth/config stores in `userData`, so it introduces no new class — worth one line in the E19 report rather than a design change.

---

## 4. New findings

### F11 — The site-draft path is wired end-to-end; the accurate blocker is deployment, not wiring · **INFO · Corrects Codex's own note**

Codex's checkpoint says the site draft is *"Not connected to native scheduling and not deployed yet."* The second half is true; the first understates what exists. The chain is complete in source:

- `NativeCanonicalEditor.tsx:223-236` constructs the `privateDraft` client over `canonicalDocuments/drafts:get|save|discard`.
- `CanonicalDocumentWorkspace.tsx:305` passes `siteDraft={client.privateDraft}`.
- `CanonicalEditor.tsx:222` consumes it; `client: proposal ? undefined : siteDraft` correctly disables drafts during AI-proposal review.
- The debounced writer (`delayMs = 1500`) and the full Restore/Discard UI exist at `CanonicalEditor.tsx:602-617`.

So the remaining gate for E19's site half is **deploying `drafts.ts`/`draftMaintenance.ts` and the `canonicalDocumentDrafts` table**, plus native proof against a real deployment. I flag this only so the next reader does not schedule work that is already done.

**The failure mode is graceful, and I verified it because it matters.** Because the client resolves handlers by name through `makeFunctionReference`, an undeployed backend fails at runtime, not compile time. `load()` catches and publishes `status: "error"`, and `locked` is true only while loading or while an offer is pending — so an undeployed backend does **not** brick authoring. Better, it is visible: `CanonicalEditor.tsx:613-617` renders `role="alert"` with *"Site autosave is unavailable. Your edits remain in this window. Retry autosave or save changes."* plus a Retry button.

That is the correct behaviour for a data-loss safety net, and it is the property I would most expect to be missing. An autosave that fails silently is worse than no autosave, because the author stops saving manually. All five states are surfaced (`loading`, `error`, `waiting`, `saving`, `saved`), offers use `role="alert"` and statuses `role="status"`. Noting it as a strength so a later refactor does not quietly drop it.

### F12 — Abandoned drafts have no expiry, and are re-offered indefinitely · **LOW · Operational gap**

`draftMaintenance` cleans drafts on **permanent post deletion only**. There is no TTL, no eviction, and no sweep for drafts on documents that still exist. Consequences, both mild:

- **Storage.** Rows are bounded at one per (post × operator) and each ≤900KB, and the normal path clears them — when `!session.dirty && row.draft !== null` the hook issues a `discard`, so saving your work removes the draft. Accumulation therefore only comes from *abandoned* edits. Not a leak, but at fleet scale across many operators and pages it is unmanaged storage that nothing ever reclaims.
- **Repeated prompting.** A draft whose `baseRevision` has gone stale is never auto-applied (correctly), so it stays `offered` on **every** reopen of that document until the author explicitly chooses. Arguably the right call — never silently discard someone's work — but it means one abandoned edit produces a prompt that recurs forever.

Recommendation, cheap and appropriate for E19's closeout rather than now: a bounded TTL sweep reusing the existing paginated `removeDraftsForPost` shape, plus an explicit decision recorded on whether indefinite re-offering is intended. If it is intended, say so in the E19 report so it is not later mistaken for a bug.

---

## 5. Distinguishing test proof from delivered feature (as Codex asked)

Stating this plainly, because the two halves of E19 are at different maturities:

- **Device journal (committed `8e0a7ee0`):** Codex reports real Electron renderer force-crash and app restart, exact nested Section/Announcement plus invalid schedule and title restored after an explicit choice, backend revision 2/history/publication unchanged, explicit Discard and manual Save both clearing the journal, 22 affected tests and Admin types passing. That is native runtime proof, and it is the right kind of evidence.
- **Site-side draft (uncommitted):** six new endpoint tests plus a 141-test affected suite, backend typecheck passing. That is **backend unit proof only**. There is no deployed backend and therefore no native end-to-end proof of site autosave, conflict offer against a real revision change, or multi-window behaviour.

I take no position on the unverified test counts — that is Codex's evidence to own. What I can say is that the *code* supports the claims and the classification in E19's status ("Site-side block-tree draft autosave remains required") is honest.

---

## 6. What I will measure next hour

1. Whether `drafts.ts`/`draftMaintenance.ts` and the new table are committed and deployed, and whether native site-autosave proof follows (E19 site half).
2. Whether the uncommitted 16-file working set lands as a coherent commit, or drifts.
3. F1: whether the plugin-gate authority decision is made — Task 3 approaches and four rows now depend on it explicitly.
4. Task 1 → Task 2 transition: the exit criterion actually used, and whether the remaining per-row Notes review completes.
5. Verified count and downgrade check against this hour's 60-row set.
6. Whether E01's remaining wheel/drag/nesting baseline gets acceptance.
7. F12: whether draft expiry is decided either way.

---

## 7. Corrections and negative results

- **My audit 02 named a block wrong.** I wrote `recipes/recipe-card`; the actual row is **`gallery/recipe-card`**. There is no `recipes/` block namespace — the 12 namespaces are `blocks, business, certificates, commerce, core, events, gallery, lms, local, membership, reference, support`. The `recipes` *plugin* exists; the block lives under `gallery`. The F1 mismatch set is unaffected, since both `gallery` and `recipes` defaults disagree.
- **No media-reference leak in the draft path.** The `undefined` argument in `insertWithMediaReferences`/`patchWithMediaReferences` is the optional `permit`, not a previous-value parameter; the guard reads prior state itself. I had this queued as a probable finding and it is not one.
- **No stale-`busy` deadlock.** I traced the case where `load()` returns early on a changed lease and `finally` skips resetting `busy`: the mount effect resets `busy.current = false` before each `load(true)`, so the flag cannot latch.
- **The 900KB site cap vs the 2MB recovery limit is not an inconsistency** — it is the intended two-tier split, with the refusal message pointing the author at the retained device copy.
- **Audit 01's F2 overstatement remains withdrawn** (see that file's §7): ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Reminder for future passes:** LOC is not a depth metric in this repo; whole components are written on single lines.
