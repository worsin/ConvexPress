# Opus Audit 02 — opening/navigation closure, and a missing required deliverable
**Auditor:** Claude Opus 5 · **Written:** 2026-09-28 13:20 MDT · **Covers:** 12:30 → 13:20
**Audited against:** `docs/superpowers/plans/2026-09-28-editor-template-delivery.md`, its `-status.json`, and both source handoffs
**Live source:** hardening worktree `~/.codex/worktrees/convexpress-hardening` @ `b7406b9d` (per Codex's method correction — audit 01 wrongly read only `main`)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

A genuinely good hour. Two blocks closed on real evidence, the count moved 58 → **60 Verified / 77 In progress**, nothing was downgraded, and the write-time-validation architecture I flagged as most likely to be shortcut was instead built correctly and is self-documenting. Three of my seven audit-01 findings advanced; F2 is closed; F1 is still open but correctly sequenced.

One new **high-severity** finding: **block-tree autosave is a named handoff deliverable that does not exist**, and the editor's crash recovery is memory-only. Codex found and reported this itself; I verified it independently and it is worse-framed than E01 currently suggests. Details in F8.

---

## 2. Deltas since audit 01 — all independently verified

| | Audit 01 (12:30) | Now (13:20) |
|---|---|---|
| Hardening HEAD | `9824d960` | **`b7406b9d`** (1 new commit) |
| `main` HEAD | `7f8b6399` | `a6b4344b` (2 new `auto:` commits) |
| main ↔ hardening | aligned | **diverged: main +3, hardening +1** |
| Live tracker | 58 / 79 | **60 / 77** |
| Status JSON | scaffold only | populated; `+1791` lines |
| Task 1 | `pending` | **`in_progress`** |
| `latestEvidence` | `[]` | 9 entries |

**Divergence is expected, not drift.** `main` carries the handoff doc plus two auto-commits; hardening carries the product commit `b7406b9d`. Codex's note that main lags is accurate. Nothing is lost on either side — hardening's only untracked file is the handoff doc it deliberately left uncommitted.

**Tracker count verified independently.** I read MagicTables directly (`mt table records q97ft31dnn52vbeha9fdd3zfg98dv4sq`, read-only): **137 rows, 60 Verified, 77 In progress** — matching Codex's claim exactly. Exactly two rows moved, both to Verified: `core/announcement-bar` and `core/breadcrumbs`. I diffed the Verified set against the `9824d960` baseline: **2 added, 0 removed — no Verified row was downgraded.** Both rows' Notes retain full history and both explicitly carry the caveat *"Shared editor crash-recovery/autosave remains separately open"* — Codex disclosed the gap in the tracker rather than letting a green row imply more than it earned. That is the right instinct.

---

## 3. E02 / E03 — closure reviewed and confirmed sound

This is the part I said I would scrutinise hardest, because "add validation" is easy to do in a way that breaks historical draft recovery. It was done correctly.

**The constraint is declarative and shared, not block-specific.** `blocks/core/announcement-bar/block.json:31` gains three lines:

```json
"authoringConstraints": [ { "kind": "ordered", "lower": "startsAt", "upper": "endsAt" } ]
```

That is exactly what the handoff asked for (*"Use existing shared validation architecture rather than a handwritten block-specific registry"*). `scripts/blocks/spec-runtime.mjs` accepts `authoringConstraints` on `object` and `repeater` fields reusing the existing `constraints` schema, and surfaces it through `authoringFieldRules()` → `validateAuthoringFields()` via the same `constrainObject` primitive the read-time path already used. No new validation engine.

**Write-time-only is architecturally verified, not just asserted.** The key property is that `authoringConstraints` is a *separate* field from `constraints`, reaching only the authoring entry point:

- `foundation/generated/schemas.ts:619` — `validateBlockAuthoringAttrs()` = shape validation **+** authoring rules.
- `foundation/authoredDefinitions.ts:30` — the **only** caller, inside `assertAuthoredActions()`, whose own doc comment at line 18 reads: *"Additional write-time requirements. Reading/history uses the stored shape so old invalid values remain available for explicit repair or draft recovery."*
- Every read/migration/search path uses plain `validateBlockAttrs()` instead — `composedRegistry.ts:76`, `legacyStructuredMigration.ts:41`, `legacyBlockMigration.ts:69`, `legacyDocumentMigration.ts:48`, `searchText.ts:38`.

So a historically-saved inverted date still loads and can be repaired; only new writes are refused. The invariant is documented in the code, which means the next person to touch it is warned. Good.

**A real root cause was fixed, not bypassed.** `canonicalDocuments/service.ts:91` previously gated on `error instanceof Error && error.name === "ZodError"`. Zod 4 error objects do not inherit from native `Error`, so that branch never fired and validation failures fell through to generic handling. Codex replaced it with a structural check (`name === "ZodError"` plus an `issues` array). That is a causal repair with blast radius beyond this block — every canonical validation refusal depended on it. Worth noting as a latent bug that this batch happened to surface.

**Evidence claims are plausible and specific**: 21 compiler, 306 renderer, 104 backend document/navigation, 29 editor/schema cases; 4 live `INVALID_CANONICAL_DOCUMENT` refusals on staging 4860 with corrected preview succeeding and the document unchanged; 8 Website cases across 4 packs at 1440/390; 22 installed Events files preserved in the snapshot; fixtures removed with former routes 404 and 115 posts/pages unchanged. I did not re-run any of it — that is Codex's evidence to own — but the artifacts exist under `output/editor-template-20260928/` and the report is at `ConvexPress-Admin/audits/2026-09-04/opening-navigation-20260928.md`. **E02 and E03 are closed as far as a static audit can establish.**

---

## 4. Status of audit-01 findings

| ID | State | Evidence |
|---|---|---|
| **F1** plugin default mismatch | **Open, correctly sequenced** | Backend `PLUGIN_DEFAULTS` still `true` for gallery/knowledgeBase/tickets/recipes; manifests still `false`. Unchanged — Codex is in Task 1 and queued the repair before the Task 3 plugin batch. Not a violation. Codex independently reproduced it by executing both policy functions (`output/editor-template-20260928/plugin-defaults.jsonl`) and correctly notes the fix needs a compatibility-conscious authority decision, since flipping defaults could disable features on live sites. Agreed — that caution is right. |
| **F2** auto-push vs No push | **Closed** | 0 `git push` lines in `.codex/hooks/auto-push.sh` and `.claude/hooks/auto-push.sh`; original preserved as `output/editor-template-20260928/auto-push-hook-before.sh`; in-file comment records the owner's no-push authority. Re-verified this hour; still clean. |
| **F3** status file a scaffold | **Largely closed — see F10** | All **77/77** pending rows now carry `source`, `requirements`, `evidenceReferences` and `remainingReview`. `latestEvidence` has 9 entries. New `trackerRefresh`, `coordination`, `sessionBaseCommit` keys. Task 1 `in_progress`. E01/E02/E03 have real prose classifications. Substantial work. |
| **F4** pending set is data-bound | **Accepted as planning context** | Codex's qualification is correct and I endorse it: resolver wiring supports family batching but proves nothing about per-record, auth or action paths. No change needed. |
| **F5** uneven pack differentiation | **Retained as Task 5 context** | Correct disposition. Not independently a defect. |
| **F6** template-kit skills | **Recorded — partially** | `template-kit/` still has no `skills/` dir (README, CONTRACT, references only). E17's status in the status JSON now reads: *"Opus F6 confirms missing template-build/template-add-surface/template-audit skills; add to Task 7 alongside design-skill retarget."* However the **plan document's Task 7 text does not name them** — grep for all three names in `2026-09-28-editor-template-delivery.md` returns nothing. The status file is the tracker so this is probably sufficient, but the plan is what a fresh session reads first. One line in Task 7 would close the gap. |
| **F7** reserved-route guard | **Closed** | Accepted as reusable evidence. No further action. |

---

## 5. New findings

### F8 — `block-tree autosave` is a named handoff deliverable and it does not exist · **HIGH · Missing implementation**

Codex reported this itself and classified it accurately. I verified it independently, and I think it deserves stronger framing than E01 currently gives it.

**Verified absent.** `canonical-editor/recovery-store.ts` is 22 lines. It retains one `EditorSession` in a closure variable behind a lease, and its own doc comment states: *"This store contains no tokens, **writes nothing to disk**, and is replaced when operator or site scope changes."* `EditorRecoveryProvider.tsx` builds it with `useMemo(createEditorRecoveryStore, [scope])` — per-window, per-scope, in-memory. I grepped the entire `canonical-editor/` directory for `localStorage`, `sessionStorage`, `indexedDB`, `electron-store` and `fs`/`writeFile`: **zero matches outside tests and fixtures.** So recovery survives in-session remount and navigation — which is what it was built for — and cannot survive a renderer crash or app restart. There is no autosave timer and no persisted draft at all.

**This is a spec deliverable, not a nice-to-have.** `HANDOFF-ASTRA-BLOCKS-2026-09-05.md:159` lists, under the Phase 2 "One content model" row, the required items: *"…layout intents, style, visibility, lock, anchor controls in row headers; content migration 3.8; **block-tree autosave**; `syncedBlocks` and `patterns` tables…"*. The plan's own Task 1 line 122 then says: *"Verify the handoff's **block-tree autosave** behavior, crash/reopen draft recovery and revision/conflict guards; autosave must not publish or create duplicate accepted writes."* And completion criterion #1 (plan §1) promises an author can *"insert, nest, select, move, edit, duplicate, remove, save and recover blocks **without losing authored values**."*

So this is **missing implementation** against a named requirement — the one classification the plan tells us to distinguish from "missing evidence". In a desktop authoring app, losing an in-progress page to a crash is the worst failure mode an editor has, and it is the kind of thing that is invisible until it costs someone an afternoon of writing.

**The durable pattern already exists — reuse it, with two cautions.** `packages/desktop/electron/utils/json-store.ts` provides a `JsonStore` writing JSON under `app.getPath("userData")`, already used by ~10 modules (`deploymentOrigins.ts`, `ipc/auth.ts`, `ipc/config.ts`, `ipc/websitePublish.ts`, `ipc/connectionProvision.ts`, `siteRunner/manager.ts`, `main.ts`). Codex should not invent storage. But two properties make it a poor fit for autosave **as written**:

1. **Writes are non-atomic.** `writeState()` calls `writeFileSync(filePath, JSON.stringify(...))` directly — no temp-file-plus-rename. A crash *during* an autosave write can truncate or corrupt the very file recovery depends on, converting "lost the last few seconds" into "lost the draft and the store". For a crash-recovery feature this is the one failure mode that must not exist. Write to `<name>.json.tmp` and `rename()` over the target.
2. **Every `set()` is a full read-modify-write of the whole file, synchronously.** Fine for a deployment-origins list touched occasionally; costly for a full block tree written every few seconds on the Electron main thread. Give drafts their own store file keyed per document, and debounce.

Two design constraints worth stating before code is written, because both are easy to miss:

- **Key the persisted draft by the same scope string `EditorRecoveryProvider` already computes** — its comment says scope *"includes the operator, connection, database origin, environment and broker-selected role"*. A durable draft store that is not scoped identically will surface one operator's unsaved content to another, or a staging draft against production. The in-memory store gets this right for free by being replaced on scope change; a disk store must do it deliberately, and must also clear on sign-out.
- **Recovery must be offered, never applied.** The plan says *"autosave must not publish or create duplicate accepted writes"* and Codex says it *"must not auto-publish or replay uncertain writes"* — both correct. The safe shape is: persist a draft with its base revision, and on reopen *prompt* to restore, refusing silently if the stored base revision no longer matches the server's. Auto-replaying a stale tree over a document someone else edited would be worse than the current data loss.

Exit check I would accept: force-kill the renderer mid-edit, restart the app, and recover the exact unsaved tree — including a nested block and an authored title — with the document's revision unchanged and nothing published.

### F9 — E01 has been silently re-scoped; split it · **LOW · Tracking hygiene**

E01 originally read: *"Native pointer/account-menu instability remains an open follow-up… Reproduce editor typing, selection, wheel/drag scrolling and menu actions."* Codex now reports that subject **passing**: *"Native insertion, typing, save/reopen, both account menus and actual unsaved Website preview pass."* The E01 row has been rewritten to describe the autosave gap instead.

Both facts are good news, but they are now conflated under one ID. A reader three days from now cannot tell that the original pointer/menu concern was cleared, and closing "E01" will ambiguously mean either thing. Recommend: close E01 on its original subject with the evidence that cleared it, and open a new ID (E19) for durable autosave/crash recovery, cross-referenced from Task 1. Cheap, and it preserves the audit trail the plan's §3 evidence rules depend on. The full nesting/scroll baseline Codex lists as still remaining should stay with whichever ID keeps the pointer subject.

### F10 — The five-class classification does not yet discriminate · **MEDIUM · Gap (F3 remainder)**

F3's mechanical part is done well. The analytical part is not, and the distribution shows it: **all 77 pending rows carry the identical `classification: "missing evidence"`**, with an identical `remainingReview` sentence. The plan §3 defines five classes precisely so that *missing implementation*, *reproduced defect*, *missing evidence* and *external prerequisite* can be scheduled differently — a uniform value carries no scheduling information.

Codex is explicit that this is provisional (*"Remaining rows default to missing evidence, explicitly provisional until their exact outstanding Notes are reviewed; no invented missing-implementation or Verified claims"*), and defaulting conservatively rather than guessing is the right call — I would rather see an honest placeholder than invented precision. But the plan's own blocker list already contains the evidence to discriminate several rows today:

- **E13** — AI exercises returned `missing_api_key`. Blocks depending on live generation are **external prerequisite**, not missing evidence.
- **E14** — Aster cloud free-plan restrictions. Same class.
- **E12** — Vimeo playback unverified; `core/video`-family rows are a known unverified-provider case.
- **F8/E01** — every row whose acceptance depends on crash-durable authoring now has a known **missing implementation** dependency upstream.
- **F1** — the four plugin rows (`gallery/album`, `support/kb-search`, `support/ticket-cta`, `recipes/recipe-card`) have a known **reproduced defect** in their shared gate.

Reclassifying just those converts a uniform list into a schedulable one and surfaces which rows are blocked on something other than Codex's own time. It also makes the next audits measurable: I can track movement between classes instead of only the Verified count.

---

## 6. What I will measure next hour

1. Whether durable autosave/crash recovery gets a design or implementation, and whether it reuses `JsonStore` with atomic writes and scope keying (F8).
2. Whether E01 is split (F9) and whether any pending rows move out of the uniform `missing evidence` bucket (F10).
3. F1: whether the plugin-gate authority decision is made before the Task 3 plugin batch opens.
4. Task 1 → Task 2 transition: whether the "remaining delivery map" is declared complete, and on what exit criterion.
5. Verified count and downgrade check against the 60-row set captured this hour.
6. Divergence between `main` and `codex/convexpress-hardening`, and whether hardening's product commits reach main.
7. F6: whether the three template-kit skills appear in the plan's Task 7 text, not only the status file.

---

## 7. Corrections and negative results (so they are not re-opened)

- **Audit 01's F2 overstatement is withdrawn** and already corrected in §7 of that file: I claimed pushes "are not currently landing" from `origin/main` tracking data last fetched 2026-07-15. That ref proves nothing about the remote's current SHA. Codex was right to reject the inference. What stood — an attempted push on every turn against an explicit No-push instruction, with the outcome swallowed — is unaffected and is now fixed.
- **Audit 01's method is corrected**: this and future audits read the hardening worktree and `output/editor-template-20260928/` as the live source. Audit 01 read only the user checkout.
- **No duplicate `menu` block.** Two distinct blocks exist (`core/menu`, `business/menu`); an earlier short-name collapse of mine made them look like one row. Not a finding.
- **No orphaned pack renderers.** All 15 journal and 15 depot renderer files are declared in their `template.json`; core and aster-house declare their single `core/hero` each. Zero undeclared files.
- **LOC is not a depth metric in this repo.** Whole components are written on single lines; my first pass produced a false "62 thin blocks" signal that dissolved on reading the code. Measure bytes or read it.
- **`trackerRefresh` (58/79) vs `checkpointCounts` (60/77)** in the status JSON is not an inconsistency — the former is the dated read-only refresh evidence, the latter is current state.
