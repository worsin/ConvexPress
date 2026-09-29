# Opus Audit 08 — content-discovery family accepted; I was wrong about the resolvers
**Auditor:** Claude Opus 5 · **Written:** 2026-09-28 19:20 MDT · **Covers:** 18:20 → 19:20
**Live source:** hardening worktree @ `ec0f89dd` (working tree effectively clean — one modified test, plus the owner's untracked handoff)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**The largest acceptance hour so far: 65 → 72 Verified, 7 rows, zero downgrades.** Author Bio plus the six content-discovery blocks. Two more reproduced defects (E30, E31) were found and closed on the way. F18 is fixed and F17 is accepted into E17.

The substantive content of this audit is a **correction where Codex was right and I was wrong**. My audit-07 claim that "all 48 block data resolvers are accounted for" was measured against a **dirty working tree mid-E29**, so it partly described Codex's in-flight repair rather than the state that existed before it. I have now settled this from git history. §3.

I also built the consistency check that error suggested, tested it, found it produces false positives, and am withdrawing it rather than recommending it. §4.

---

## 2. Deltas since audit 07 — verified

| | Audit 07 (18:20) | Now (19:20) |
|---|---|---|
| Hardening HEAD | `4f6580d7` | **`ec0f89dd`** (+2 commits) |
| Divergence | main +16 / hardening +12 | main +19 / hardening +14 |
| Live tracker | 65 / 72 | **72 / 65** |
| Rows added | — | `core/author-bio`, `core/latest-posts`, `core/post-grid`, `core/tag-cloud`, `core/related-content`, `core/archive-list`, `core/featured-page` |
| Downgrades | none | **none** |
| Blockers | 29 | **31** (E30, E31) |

Commits: `1e0986fa` complete manual, selected and current author bio workflows · `ec0f89dd` complete content discovery navigation and lifecycle acceptance.

**Task 2 is now roughly 12 of 20 rows closed.** The two new defects were both found by pushing real workflows rather than by inspection:

- **E30** — `content.page` returned the bare stored path, so the Featured Page CTA reached a 404 while the Website serves pages under `/page/$`. Related Content already prefixed correctly, which is why only one block exhibited it. One-line reader repair plus a flat/nested/missing-path regression.
- **E31** — deleting topic-bearing pages left relationships behind and category deletion then failed on a missing source. The existing bounded cascade now runs for page deletion, orphan category rows are skipped, and a default category is created only for an actual surviving-document reassignment. Notably, Codex proved via live storage read that the newly deleted page had zero relationships before touching anything, and removed one stray default through the built-in authenticated dashboard mutation for that exact owned ID after confirming zero relationships — with a private backup first.

Both are registered as `accepted/reusable evidence` in the blocker register.

---

## 3. Correction: my audit-07 resolver claim measured a dirty tree

Codex's response to audit 07 said, correctly:

> *"Source block.json is authoritative; content.author was newly added during E29, so its presence in your dirty-tree snapshot cannot prove the original missing resolver was present earlier."*

I checked this against git rather than conceding it on assertion, and Codex is right. At `4f6580d7`, the commit immediately before the E29 work:

- `foundation/contracts.ts` contained **zero** occurrences of `"content.author"`.
- `blocks/core/author-bio/block.json` had **no `data` block at all** — `data` was `None`.
- `blocks/core/author-bio/render.tsx` used **`defineBlock`**, not `defineDataBlock`.

At HEAD, `contracts.ts` has two occurrences and the spec declares `data: {resolver: "content.author", args: {userId: "attrs.userId"}}`.

So the accurate history is: **pre-E29 there were 47 block data resolvers, and `core/author-bio` was a presentational block carrying a `userId` reference field with no resolution path.** Audit 01's enumeration did not "miss" `content.author` — it did not exist. Audit 07's "48, all accounted for" counted Codex's repair as pre-existing state.

Two things follow that I want on the record:

1. **Auditing a dirty working tree as if it were a baseline is a method error**, and it is one I can avoid cheaply: for any coverage claim, read the last commit rather than the working tree, or state explicitly which I read. Audit 07 said "plus 25 modified files in flight" in its header and then drew a baseline conclusion anyway.
2. **The corrected picture strengthens F17 rather than weakening it.** E29's actual gap was a `type: "reference"` field with no resolution path — the reference layer, not the block-data layer. That is exactly what F17's completeness gate targets.

---

## 4. A check I built, tested, and am withdrawing

The obvious lesson from §3 seemed to be: add a gate asserting that every renderer using `defineDataBlock` has a matching `block.json` `data.resolver`, and vice versa. I implemented it against `4f6580d7` before recommending it. Two results killed it:

- **It would not have caught E29.** Pre-E29 `core/author-bio` was *internally consistent* — `defineBlock` renderer, no spec `data`. The defect lived entirely in the unresolvable reference field, which this check does not look at.
- **It produces false positives.** It flagged four blocks as mismatched: `commerce/category-tiles`, `commerce/product-showcase`, `core/featured-page`, `core/synced`. All four are legitimate:
  - `commerce/category-tiles` and `commerce/product-showcase` are bare re-exports (`export { default } from "…/block-renderer/category-tiles"`), so their definition happens inside the SDK module and the helper never appears in `render.tsx`.
  - `core/featured-page` uses **`defineContentPageBlock`** — a dedicated third helper at `model.tsx:144` typed to `data: PageResult`.
  - `core/synced` is the structural `content.syncedBlock` case already special-cased in `resolverBindings.ts:112`.

So I am not recommending it. Recording the negative result so nobody builds it later on my say-so.

**Standing methodological note, because this is now the third occurrence.** Mechanical heuristics over this codebase have produced false signals three times in eight audits: LOC-as-depth (audit 01, dissolved on reading the code), `render.tsx` dataKey parsing (audits 01 and 07), and now renderer-kind versus spec-data. The cause is consistent — the repo uses several definition helpers (`defineBlock`, `defineDataBlock`, `defineContentPageBlock`, `definePromotedBlock`), re-export indirection, and dense single-line components. **`block.json` is the authoritative contract, and renderer wiring must be read rather than pattern-matched.** I will apply that to the remaining families rather than re-learning it.

---

## 5. Status of findings

| ID | State |
|---|---|
| **F1** plugin default mismatch | **Open — eighth consecutive hour.** Backend `PLUGIN_DEFAULTS` still `true` for knowledgeBase/tickets/customFields/recipes/gallery; manifests still `false`. Codex reaffirms it is required before Task 3, and separately **corrected its own earlier misstatement** that F1 concerned an Events default — it is the five I identified. Catching that itself is the behaviour I would want. |
| **F2** auto-push | Closed, holding — 0 `git push` lines in both hooks, re-verified. |
| **F17** reference completeness gate | **Accepted into E17/Task 7**, with a refinement better than my proposal: the gate must distinguish an *unsupported reference* from a *plugin-disabled state*, so it should run with required plugins and capabilities enabled rather than maintaining an intentional-deny list. My "intentional-deny list" suggestion was the weaker design — `core/contact-form` and `core/poll` appear disabled in fixtures only because Forms is off, which is not the same thing at all. Withdrawn in favour of Codex's version. Codex also declined to interrupt E29 for a generalised registry refactor, noting no second unsupported reference was demonstrated; that is proportionate. |
| **F18** stale `checkpointCounts` | **Closed.** Now declares `{Verified: 72, In progress: 65}`, matching its own row tally exactly, with `checkpointSource` pointed at `output/content-discovery-20260928/mt-accept-after.json`. Codex states subsequent updates will recompute the header and assert tracker/row/header parity — which is the derived-not-stored treatment I hoped for. |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed in earlier hours; no regressions observed. |
| **F12** draft TTL · **F15** entry-size gate | Declined / located; both carried with reasoning. |
| **E22** screenshot identity · **E28** header separator | Open. |
| **E29, E30, E31** | Closed this hour. |

---

## 6. Source review vs tests vs native acceptance

- **Native acceptance:** Author Bio across all three modes (current-host, explicit-selected, manual) with exact saved-tree preservation and restoration, real author destinations, live profile updates, missing avatars, inactive/deleted target withdrawal, stale search withdrawal; discovery family with a 6-block exact save/reopen/restore at revision 4, all fields/variants/private/deleted states, real pagination and destinations.
- **Public/demo:** 16 final public pack × width cases with 0 errors; 48 BlockDemo cases / 112 examples; 8 case matrices for Author Bio with no browser/console/hydration errors.
- **Tests:** 164 backend / 1,619 assertions; 310 renderer / 5,442 assertions; explicit Convex project and strict deployed types; writer gate 1,487/30 with no bypass.
- **Source review only (mine):** §3 and §4. I executed nothing.
- **Diagnostics classified, not filtered:** three development HMR errors before the matching deployment, and earlier Clerk startup fetch errors plus harness/invocation failures, all retained separately. That is the F14 criterion being applied as written rather than used to wave things through.

Cleanup this hour: 7 owned pages, 7 posts, 7 terms plus one derived default removed; original 42 pages / 2 posts / 1 term, menus, locations and appearance preserved exactly; owned Electron 863 closed, user PID 39198 retained; API session revoked; fixture routes 404.

---

## 7. What I will measure next hour

1. **F1** — ninth hour. Task 2 has ~8 rows left (Language Switcher, Search Box/Band/Results named next); when it empties, Task 3's 54 rows open behind this gate.
2. Whether the remaining discovery rows surface the "localization promotion and composed-search gates" Codex says it must reproduce first — it explicitly declined to estimate the remainder, which I read as appropriate rather than evasive.
3. Verified count and downgrade check against this hour's 72-row set.
4. Whether the `*Sha256` drift fields get exercised — still untested since audit 04, and now that 72 rows carry accepted evidence, the mechanism that invalidates them selectively matters more.
5. E22 and E28, neither touched for several hours.

---

## 8. Corrections and negative results

- **Audit 07's "48 resolvers, all accounted for" is withdrawn.** Pre-E29 the count was 47 and `core/author-bio` had no data resolver at all; I measured a dirty tree mid-repair. Verified at `4f6580d7`. §3
- **The `defineDataBlock` ↔ `spec.data` consistency check is withdrawn before being recommended** — it would not have caught E29 and yields four false positives from `defineContentPageBlock` and SDK re-exports. §4
- **My "intentional-deny list" refinement to F17 is withdrawn** in favour of Codex's plugins-enabled framing.
- **`content.syncedBlock` is not a missing resolver** — structurally special-cased (`resolverBindings.ts:112`, `displayContext.ts:71`).
- **`core/featured-page` was never a latent E29** — covered by the generic `of: page` clause (`displayContext.ts:111-115`), and it is now Verified.
- **Audit 01's F4 count (33) was wrong**, and audit 07's replacement (48) was also wrong for the pre-E29 baseline. The durable lesson is in §4, not the numbers.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
