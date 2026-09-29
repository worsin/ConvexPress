# Opus Audit 09 — search controls accepted; one root cause fixed three times
**Auditor:** Claude Opus 5 · **Written:** 2026-09-28 20:20 MDT · **Covers:** 19:20 → 20:20
**Live source:** hardening worktree @ `7511d70a` plus 23 files in flight (E36 composed search)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**74 Verified / 63 In progress**, two rows added (`core/search-box`, `commerce/search-band`), zero downgrades. Four more reproduced defects closed (E32–E35), one opened (E36, composed search). F18 stays fixed with header/row parity holding.

The finding this hour is systemic rather than local: **the same public page-href defect has now been found and fixed three times in two hours** — E30 (Featured Page CTA), E32 (public search destinations), E34 (native View destinations). I traced the cause and it is not coincidence: the `/page` prefix is constructed by hand at **eight independent sites**, with no shared helper and at least two textual divergences between them. A fourth occurrence is predictable. §3.

---

## 2. Deltas since audit 08 — verified

| | Audit 08 (19:20) | Now (20:20) |
|---|---|---|
| Hardening HEAD | `ec0f89dd` | **`7511d70a`** (+1 commit) |
| Divergence | main +19 / hardening +14 | main +21 / hardening +15 |
| Live tracker | 72 / 65 | **74 / 63** |
| Rows added | — | `core/search-box`, `commerce/search-band` |
| Downgrades | none | **none** |
| Blockers | 31 | **36** (E32–E36) |
| Header parity (F18) | fixed | **holding** — declared 74/63 = row tally 74/63 |

Closed this hour: **E32** public search page destinations missing `/page`; **E33** source-only publication reporting completion without refreshing consumer search candidates; **E34** native View page destinations missing `/page`; **E35** long unbroken suggestions overflowing. Opened: **E36** — composed-search regressions failing for approved prose and pack alternatives, in progress.

`core/search-results` was deliberately held In progress pending approved custom-composition projection, canonical prose/backfill and access-budget coverage. Two rows accepted out of a three-block family, with the third named and held, is the right granularity.

---

## 3. F19 — Public page href is hand-built at eight sites; three defects have come from it · **MEDIUM · Systemic duplication**

E30, E32 and E34 were each fixed locally, in the consumer that exhibited them. That is defensible per-defect, but the third occurrence in two hours made me look for the shared cause, and there is one.

**No shared helper exists for the public page href.** There is a `pagePath()` helper (`contentPromotion/shared.ts:361,382`) but it computes the *stored* path from the parent chain and slug — not the `/page`-prefixed public URL the Website route `/page/$` expects. Every consumer builds that itself:

| Site | Expression |
|---|---|
| `canonicalDocuments/data.ts:89` | `` `/page${document.path ?? `/${encodeURIComponent(document.slug)}`}` `` |
| `canonicalDocuments/relatedContent.ts:82` | `` `/page${post.path ?? `/${encodeURIComponent(post.slug)}`}` `` |
| `canonicalDocuments/navigation.ts:20` | `` `/page${document.path ?? `/${document.slug}`}` `` |
| `search/publicSource.ts:29` | `` `/page${path}` `` ← E32's repair |
| `menus/internals.ts:224` | `` `/page${normalizedPath}` `` |
| `menus/queries.ts:350` | `` `/page${path.startsWith("/") ? "" : "/"}${path}` `` |
| `helpers/contentMembershipPaths.ts:32` | `` `/page${post.path ?? `/${encodeURIComponent(post.slug)}`}` `` |
| `localization/model.ts:40` | `` `/page${post.path ?? `/${encodeURIComponent(post.slug)}`}` `` |

Two of these are not textually equivalent to the others:

- **`navigation.ts:20` omits `encodeURIComponent`** on the slug fallback, where four siblings include it.
- **`menus/queries.ts:350` adds bespoke leading-slash normalisation** that no sibling has.

**Honest limit on the divergence claim:** whether the missing `encodeURIComponent` is *reachable* depends on whether page slugs are constrained to URL-safe characters. I looked — `computePagePath` (`pages/internals.ts:110-115`) takes the slug as given, and while the repo has slug patterns for brands, albums, recipes, template drafts and settings, and `slugify` helpers for commerce products and categories, I could not establish a page-slug character constraint in a bounded read. So I am claiming the **duplication and textual divergence as verified**, and the encoding difference as **unconfirmed-reachable** rather than a live defect. It would take one look at page slug validation to settle.

**Why it is worth acting on regardless.** The duplication alone is the demonstrated cost: three separate defects, three separate repairs, three separate regressions, and each consumer had to independently rediscover that the Website serves pages under `/page/$`. Codex noted during E30 that Related Content *already prefixed correctly* — which is precisely the signature of duplicated logic drifting apart. Task 3 holds 45 rows including `catalog` (8), `external-embeds` (6) and `customer-commerce` (6), several of which will build destinations.

**Recommendation** — modest and in keeping with the project's existing patterns: one shared `publicDocumentHref(document)` helper alongside the existing `pagePath`, adopted by the eight call sites, plus a single contract test asserting all consumers agree across the edge cases that have already bitten (nested stored path, missing path with slug fallback, leading-slash variation, and a slug needing encoding). That converts a recurring per-consumer defect into one place with one test. It is not urgent — but it is cheaper than a fourth repair, and the fourth is a matter of when.

---

## 4. E33 is worth naming as a class

E33 was: *"durable reusable-source refresh reporting completion without refreshing consumer search candidates."* An operation reported success while silently not doing part of its job.

That class deserves a flag of its own because this project's method depends on operations reporting truthfully — the entire acceptance regime is built on readbacks, receipts and snapshot manifests. A mutation that returns success without completing its work degrades every downstream piece of evidence that trusts it, and it is invisible to exactly the kind of green-test-suite check that would otherwise catch a regression.

Codex's repair is the right shape: the refresh now happens **inside the existing authorized consumer transaction**, with pinned/latest/withdrawal cases, atomic rollback on index failure and authorized retry all proven. Doing it in the same transaction is what makes "reported complete" and "actually complete" the same fact rather than two facts that can diverge. No recommendation from me — recording it because if a second reported-success defect appears, the pair becomes a pattern worth a systematic sweep of multi-step mutations.

---

## 5. A factual note on the Task 2 / Task 3 boundary

The pending distribution has moved in a way worth recording plainly, without reading anything into it:

| | Audit 04 (15:20) | Now |
|---|---|---|
| Task 2 pending | 20 | **15** |
| Task 3 pending | 54 | **45** |
| Task 4 / Task 7 | 2 / 1 | 2 / 1 |

Fourteen rows have been accepted since that map was written, and **nine of them came from the Task 3 pool** (`latest-posts`, `post-grid`, `archive-list`, `related-content`, `tag-cloud`, `author-bio`, `child-pages`, `search-box`, `search-band` are data-bound Discovery/Commerce rows) while Codex has nominally been working Task 2. So the task boundary is porous in practice — families are being closed by coherence of behaviour rather than by task label.

I do not think that is wrong; batching by shared implementation is what the plan asks for, and the rows closed are genuinely one family at a time. But it does mean **"when Task 2 empties" is not a reliable predictor of when Task 3's plugin batches open** — which matters for F1 below.

Task 2's remaining 15: `core/rich-text`, `core/carousel`, `core/file-download`, `core/steps-with-media`, `core/marquee`, `blocks/customer-showcase`, `blocks/social-share`, `core/social-links`, `core/custom-html`, `blocks/grade-gallery`, `business/opening-hours`, `business/locations`, `business/service-list`, `business/menu`, `local/sample-alert`.

---

## 6. Status of findings

| ID | State |
|---|---|
| **F1** plugin default mismatch | **Open — ninth consecutive hour.** Backend `PLUGIN_DEFAULTS` still `true` for knowledgeBase/tickets/customFields/recipes/gallery; manifests still `false`. I can now locate the gate precisely: the four `reproduced defect` rows are **all Task 3**, in batches `plugin-content` (`gallery/album`, `gallery/recipe-card`) and `support` (`support/kb-search`, `support/ticket-cta`) — each 2 rows, among the smaller Task 3 batches alongside `catalog` (8), `external-embeds` (6), `customer-commerce` (6), `forms` (6), `learning` (5). Given §5, those batches could come up before Task 2 empties. |
| **F2** auto-push | Closed, holding — 0 `git push` lines in both hooks, re-verified. |
| **F17** reference completeness gate | Accepted into E17/Task 7. Codex confirmed no generalised renderer-regex gate will be added, consistent with my withdrawal in audit 08. |
| **F18** header/row parity | **Holding** — declared 74/63 matches row tally exactly. |
| **F19** page-href duplication | **New**, open. |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed; no regressions observed. |
| **F12** draft TTL · **F15** entry-size gate | Declined / located, both with reasoning. |
| **E22** screenshot identity · **E28** header separator | Open, untouched for several hours. |
| **E36** composed search | Opened this hour, in progress. |

---

## 7. Source review vs tests vs native acceptance

- **Native:** all-scope preview, save/reopen, exact restored tree; history snapshot 5 restoring document revision 4 as revision 8 (Codex correctly notes history and document numbering are separate sequences).
- **Public/demo:** 24 four-pack × width navigation plus long/empty cases, 24 BlockDemo cases / 40 examples, 8 final settled screenshots, empty error lists.
- **Tests:** 113 backend / 825 assertions, 4 editor URL tests / 22 assertions, 310 renderer / 5,442 assertions; backend/Admin/Website types and Website build.
- **Source review only (mine):** §3, §4, §5. I executed nothing.
- **Diagnostics classified, not filtered:** images captured before lazy styles or during entry animation are explicitly labelled diagnostics rather than visual acceptance, with `public-settled-*` used for the real check; first-paint CSS timing is deferred to Task 8. Codex also disclosed that its first hash-check read the snapshot root rather than `packages/backend` and that the corrected read verifies all hashes — a self-caught verification error reported rather than quietly redone.
- **Scope honesty:** the native View destination was *read and exercised in the Website*, not clicked through the native external-browser opener — stated as such rather than claimed as a full click-through.

Cleanup: four owned pages and the exact owned reusable source/revisions/jobs removed, all five source tables equal to the original snapshot; original 42 pages / 2 posts / 1 term, menus, locations and appearance preserved; API revoked; owned Electron 5907 closed; user PID 39198 preserved.

---

## 8. What I will measure next hour

1. **F1** — tenth hour. Per §5, watch for `plugin-content` or `support` batches opening rather than waiting for Task 2 to empty.
2. **F19** — whether the shared href helper is adopted, deferred, or declined with reasoning; and whether a fourth `/page` defect appears first.
3. E36 composed search: whether the blanket custom-composition exclusion is replaced with real handling of approval, conditional presentation, child slots, pack treatments and resolver recursion, or whether the exclusion is retained deliberately.
4. Verified count and downgrade check against this hour's 74-row set.
5. Whether the `*Sha256` drift fields are exercised — still untested since audit 04, now with 74 rows of accepted evidence depending on selective invalidation.
6. E22 and E28, both idle for several hours.

---

## 9. Corrections and negative results

- **The `encodeURIComponent` divergence at `navigation.ts:20` is unconfirmed-reachable**, not a claimed defect. I could not establish a page-slug character constraint in a bounded read; the duplication and textual divergence are verified, the exploitability is not. §3
- **A shared page-href helper does not exist** for the public URL; `pagePath()` in `contentPromotion/shared.ts` computes stored paths only. Verified, not inferred.
- **Audit 07's "48 resolvers, all accounted for" remains withdrawn** (audit 08 §3) — measured against a dirty tree mid-E29; the pre-E29 count was 47 and `core/author-bio` had no data resolver at all.
- **The `defineDataBlock` ↔ `spec.data` heuristic remains withdrawn** — four false positives from `defineContentPageBlock` and SDK re-exports; Codex has confirmed it will not add such a gate.
- **My "intentional-deny list" refinement to F17 remains withdrawn** in favour of Codex's plugins-enabled framing.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**, not missing.
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric here.
