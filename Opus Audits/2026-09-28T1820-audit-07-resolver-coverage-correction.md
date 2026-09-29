# Opus Audit 07 — E27 closed; a correction to my own resolver claim; the reference allow-list
**Auditor:** Claude Opus 5 · **Written:** 2026-09-28 18:20 MDT · **Covers:** 17:20 → 18:20
**Live source:** hardening worktree @ `4f6580d7` plus 25 modified files in flight (E29)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

E27 closed properly and two rows landed: **65 Verified / 72 In progress**, zero downgrades. F16 was implemented well — the status JSON is now genuinely the single blocker register, and I verified the original E01–E19 text survived the consolidation.

The substantive content of this audit is a **correction to my own audit 01**. My headline finding there — "all 33 resolver keys required by pending blocks are declared and wired" — was built on an incomplete enumeration. The real count is **48 block data resolvers**, and there is a **second resolver layer I missed entirely**: 34 reference fields across 27 blocks. E29, which Codex opened this hour, lives in that second layer. My conclusion survives; my method did not. §4.

One new finding follows from it: **F17**, reference support is a deny-by-default, hand-maintained per-field allow-list with no completeness gate — which is structurally how E29 happened, and can happen again. §5.

---

## 2. Deltas since audit 06 — verified

| | Audit 06 (17:20) | Now (18:20) |
|---|---|---|
| Hardening HEAD | `b9a105dc` | **`4f6580d7`** (+1 commit) |
| Divergence | main +14 / hardening +11 | main +16 / hardening +12 |
| Live tracker | 63 / 74 | **65 / 72** |
| Rows added | — | `core/child-pages`, `core/menu` |
| Downgrades | none | **none** |
| Blockers | 26 | **29** (E27 registered+closed, E28, E29) |
| Working tree | 6 files (E27) | 25 files (E29) |

**E27 was deeper than my snapshot showed**, and Codex's own follow-through is worth recording: the live site has membership enabled while the initial combined fixture did not, so the fixture passed while live still exhausted the budget. A second regression now covers both membership states. Publication then exposed a *duplicate full projection* across `setDocumentPublication` and commit. Both were repaired without raising any limit or shrinking the fixture — the limit-preserving discipline I have been watching for held.

Cleanup verified by Codex's account: 81 owned pages, 3 menus and 2 exact location IDs removed; 42 original pages, menus, location projections and appearance unchanged; snapshot `menu-final-deploy5` retained 2,405 signatures and 22 Events files.

---

## 3. F16 implemented — consolidation verified lossless

I asked for this, so I checked that it did not lose content rather than assuming it.

- **Plan line 66** now reads: *"The single current blocker register is [`2026-09-28-editor-template-status.json`], under `blockers`. Read it with this guide at every handoff… This guide deliberately does not maintain a second status table."* The stale parallel table is gone by design, not by omission.
- **Blocker entries gained structure**: `id`, `status`, `classification`, `initialFinding`, `closureBoundary`. So the original findings and required closure boundaries have a dedicated home rather than being flattened into a status string. Spot-checked E27: `initialFinding` preserves the exact original symptom ("80 public children at depth 4 and two nested Menu blocks exhausted the 256-query budget, making the editor unreadable"), `status` carries the closure evidence.
- **E28 registered** — the header-separator defect I flagged as living only in prose is now a tracked `reproduced defect` under Task 5, with the correct scoping note that inline Menu acceptance does not close it.
- Register now spans **E01–E29**.

### F18 — `checkpointCounts` contradicts its own rows in the newly-authoritative file · **LOW · Internal inconsistency**

The one gap in an otherwise clean consolidation. In `2026-09-28-editor-template-status.json`:

- declared `checkpointCounts`: **`{Verified: 63, In progress: 74}`**
- actual tally of its own `blocks[].checkpointStatus`: **`{Verified: 65, In progress: 72}`**

The per-row data is correct — `core/child-pages` and `core/menu` both read `Verified`, matching the live tracker and Codex's own claim of 65/72. Only the summary header is stale. Low severity, but it matters slightly more now than it would have yesterday: this file was just designated the artifact a reader consults *at every handoff*, and its top-line summary is the first thing read. A one-line fix, and worth a derived-not-stored treatment (compute the counts, or assert them in the same check that already validates the register).

---

## 4. Correction: my audit-01 resolver claim was built on an incomplete enumeration

Audit 01 §3 F4 stated: *"I resolved all 33 distinct resolver keys the 45 data-bound pending blocks request. All 33 are declared and wired."* I derived those 33 by regex-parsing `defineDataBlock(name, dataKey, …)` out of each `render.tsx`. That was the wrong source.

**The authoritative source is `block.json`'s `data.resolver`.** Reading it across all 137 specs gives **48 distinct block data resolvers**, not 33 — my parse missed 15, including `content.author`, which is precisely the block E29 concerns. I checked all 48 against the declared contracts:

- **47** are declared in `foundation/contracts.ts` or `foundation/navigationContracts.ts`.
- **1** — `content.syncedBlock` — is not, and is *correctly* not: it is structurally special-cased at `foundation/resolverBindings.ts:112` (`if (name === "core/synced" && data.resolver === "content.syncedBlock") return;`) and at `displayContext.ts:71` as `structuralSynced`. A negative result, verified rather than assumed.

So **the conclusion of F4 holds — every block data resolver is accounted for** — but it held by luck of sampling, not by the method I used, and I reported a specific number that was wrong by 15. Recording it plainly because F4 was the finding most likely to shape scheduling: if it had been used to argue "no resolver construction remains," the 15 unexamined resolvers would have been an unmeasured risk.

**More importantly, I missed a whole layer.** Beyond block data resolvers, 34 fields across 27 blocks are `type: "reference"`, each declaring `of: <entityType>` and `storage: id|slug`. Eighteen distinct entity types:

`product` (8 fields) · `productCategory` (3) · `tag` (3) · `user` (2) · `category` (2) · `course` (2) · `eventCategory` (2) · `membershipPlan` (2) · `productTag` · `bundle` · `event` · `syncedBlock` · `page` · `mailingList` · `instructor` · `album` · `recipe` · `kbCategory`

Audit 01 never examined this layer. E29 is exactly a gap in it: `core/author-bio`'s `userId` reference (`of: user`, `storage: id`) had no resolution path, the renderer threw, and `displayContext` disabled the block's reference. Codex found it; I had asserted coverage over a layer I had not looked at.

---

## 5. F17 — Reference support is deny-by-default with a hand-maintained allow-list and no completeness gate · **MEDIUM · Structural risk**

Having found the layer, the interesting question is how support is expressed. It is not a registry keyed by entity type. It is **26 negated clauses inside one compound boolean** in `displayContext.ts` (roughly lines 77–116), each pinning an exact combination of block name, resolver, `of`, `storage` and field path. For example, the E29 repair appears as:

```js
!(name === "core/author-bio" && descriptor.data?.resolver === "content.author" &&
  field.type === "reference" && "of" in field && field.of === "user" &&
  "storage" in field && field.storage === "id" &&
  field.path.join(".") === "userId" && field.valuePath.length === 0) &&
```

The default is **deny**: any reference field not matched by a clause causes `disabledBlocks.add(name)` — the whole block is disabled, not just the field. That is precisely the E29 failure mode.

Three consequences worth stating:

1. **A new or edited reference field silently disables its block.** Changing a field's `path`, flipping `storage` from `id` to `slug`, or adding a reference to a new block produces no compile error and no test failure — just a block that vanishes from authoring. This is the mechanism that produced E29, so it is demonstrated, not hypothetical.
2. **There is no completeness check.** I looked for one: `disabledBlocks` is asserted only in hand-written per-block tests (`canonicalDocuments/__tests__/documents.test.ts:451-452` names four blocks), `blocks/.generated/coverage.json` tracks examples rather than reference coverage, and `scripts/blocks/check.mjs` has no reference clause. Nothing derives "every `type: reference` field in the 137 specs is matched."
3. **The exposure grows with the remaining plan.** Task 3 holds 54 rows and many of the 27 reference-bearing blocks sit in its `catalog`, `customer-commerce`, `learning`, `membership` and `support` batches. Task 7/E17 ships `block-kit` scaffolds that let people *create* blocks — a scaffolded block with a reference field would be silently disabled with no signal.

**Recommendation.** Add a generated completeness gate in the style the repo already uses (`--check` scripts, freshness gates): enumerate every `type: "reference"` field across the 137 specs and fail the build when one is neither matched by the allow-list nor on an explicit intentionally-disabled list. That last part matters — `documents.test.ts:452` shows some blocks are *deliberately* disabled (`core/contact-form`, `core/poll`), so the gate needs an explicit allow/deny declaration rather than assuming every block must be enabled. The refactor to a declarative table keyed by `(block, path, of, storage)` would be nicer, but the gate is the part that prevents the next E29 and is far cheaper.

**I did look for the next E29 and did not find one.** All 27 reference-bearing blocks appear covered: 26 named clauses plus one generic clause (lines 111-115) matching any `of: page` field whose resolver is `content.page`, which covers `core/featured-page` — the one block I initially suspected was missing. Recorded in §7 so it is not re-opened. The finding is about the absence of a gate, not a present gap.

---

## 6. Status of open findings

| ID | State |
|---|---|
| **F1** plugin default mismatch | **Open — seventh consecutive hour.** Backend `PLUGIN_DEFAULTS` still `true` for knowledgeBase/tickets/customFields/recipes/gallery; manifests still `false`. Codex reaffirms it is required before Task 3. With Task 2 now at roughly 5 of 20 rows closed, that gate is drawing closer, and it interacts with F17: plugin gating and reference gating both feed `disabledBlocks`. |
| **F2** auto-push | Closed, holding — 0 `git push` lines in both hooks, re-verified. |
| **F6, F8/E19, F9, F10, F11, F13, F14** | Closed in earlier hours; no regressions observed. |
| **F12** draft TTL | Declined with sound reasoning; accepted. |
| **F15** entry-size gate | Located (`scripts/website/check-bundle.mjs:6`); gate remains an open Task 8 item; unit-label cleanup carried by Codex. |
| **F16** blocker register | **Closed this hour** — verified lossless. |
| **F17** reference allow-list gate | **New**, open. |
| **F18** stale `checkpointCounts` | **New**, open, one-line fix. |
| **E22** tracker PNG gate · **E28** header separator · **E29** author-bio reference | Open. |

---

## 7. Source review vs tests vs native acceptance

- **Native acceptance (E27):** brokered get/preview/save/reopen/exact history restore to revision 8, publication, 4 packs × 2 widths with 80 children, nested menus, maximum stored title/label/description, early hydration focus, Enter/Back, external Enter opening with null opener. Cleanup proof for 81 pages / 3 menus / 2 location IDs.
- **Tests:** 209 focused tests / 1,817 assertions, backend types, writer gate.
- **Source review only (mine):** everything in §3, §4, §5. I executed nothing.
- **Explicitly not closed by Codex:** E28, E29 (renderer/demo/native/public acceptance pending), E22, the main bundle budget, and all remaining Task 2 families.

Codex's response to my traversal-pattern suggestion was measured and I agree with it: *"I will inspect related traversal costs when their delivery checks reach those paths. This finding does not reopen a general hierarchy/platform audit."* Chasing every traversal now would be the scope drift the plan exists to prevent.

---

## 8. What I will measure next hour

1. **F1** — whether the plugin-gate decision lands as Task 2 empties. It has been open every hour of this audit series.
2. E29's closure, and whether the `content.author` repair adds a clause to the allow-list or takes a more general approach.
3. F17: whether a completeness gate is adopted, deferred, or declined with reasoning.
4. F18: the one-line `checkpointCounts` fix.
5. Task 2 progress — roughly 15 of 20 rows remain; the content-discovery family (11 rows) is next and is the largest single batch in Task 2.
6. Verified count and downgrade check against this hour's 65-row set.
7. Whether the `*Sha256` drift fields get exercised — still untested since they appeared in audit 04.

---

## 9. Corrections and negative results

- **My audit-01 F4 count was wrong**: 48 block data resolvers, not 33. I parsed `render.tsx` instead of `block.json`'s `data.resolver`. The conclusion (all accounted for) holds; the enumeration did not. §4.
- **Audit 01 missed the reference layer entirely** — 34 fields, 18 entity types, 27 blocks. E29 lives there. §4.
- **`content.syncedBlock` is not a missing resolver** — structurally special-cased at `resolverBindings.ts:112` and `displayContext.ts:71`.
- **`core/featured-page` is not a latent E29** — covered by the generic `of: page` + `content.page` clause at `displayContext.ts:111-115`. I suspected a gap and verified there is none.
- **Some blocks are intentionally disabled** (`documents.test.ts:452`: `core/contact-form`, `core/poll`), so any completeness gate needs an explicit intentional-deny list rather than requiring universal enablement.
- **My F13 `CONFLICT` proposal remains withdrawn** (audit 05) — Codex's three-way split is correct.
- **No functionality was removed from `core/site-info`** (audit 05 §4).
- **`computePageDepth` already includes the child's level** (audit 06) — E25's `+ 1` removal was correct.
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Reminder:** LOC is not a depth metric in this repo, and `render.tsx` is not the authoritative source for a block's contract — `block.json` is. That second lesson is this hour's.
