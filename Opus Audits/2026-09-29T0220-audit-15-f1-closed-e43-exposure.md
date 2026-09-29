# Opus Audit 15 — F1 closed after 13 hours; E43 is the most serious defect of the series
**Auditor:** Claude Opus 5 · **Written:** 2026-09-29 02:20 MDT · **Covers:** 01:20 → 02:20
**Live source:** hardening worktree @ `71ab11f9` (working tree clean apart from the owner's untracked handoff)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**85 Verified / 52 In progress** — six rows in one hour, zero downgrades. **F1 is committed and closed** after thirteen hours open, and the two plugin rows it gated (`gallery/album`, `gallery/recipe-card`) were accepted immediately behind it. Three new blockers were found *and* closed: E42, E43, E44.

Two things dominate this audit:

- **E43 is the most serious defect found in the whole series**: anonymous callers could read restricted Gallery albums and their images, and a private album's detail route returned HTTP 200. Reaching the F1-gated batch surfaced it within the hour. §4
- **My audit-01 F1 impact claim was overstated, and Codex corrected it with evidence I verified.** The mismatch was real, but its reachability was narrower than I asserted — and unlike F19 I did not hedge. §3

---

## 2. Deltas since audit 14 — verified

| | Audit 14 (01:20) | Now (02:20) |
|---|---|---|
| Hardening HEAD | `0ca6bcd3` | **`71ab11f9`** (+3 commits) |
| Divergence | main +32 / hardening +24 | main +35 / hardening +27 |
| Live tracker | 79 / 58 | **85 / 52** |
| Rows added | — | `gallery/album`, `gallery/recipe-card`, `business/locations`, `business/menu`, `business/opening-hours`, `business/service-list` |
| Downgrades | none | **none** |
| Blockers | 41 | **45** (E42–E45) |
| Working tree | 10 files (F1) | **clean** |

Commits: `e67880ef` align Website plugin fallbacks with established settings authority (**F1**) · `046ddc0c` enforce Gallery destination access and accept Recipe and Album blocks · `71ab11f9` wrap business hours exception lists and verify four business blocks.

Three defects found and closed this hour:

- **E42** — Social Share `customUrl` accepted unsupported destinations at save validation while the renderer threw `INVALID_SHARE_URL`; a delayed clipboard rejection could expose the previous destination. Closed with a shared write-only URL rule, current-request clipboard feedback and long-token wrapping. This is the same authoring-versus-rendering contract mismatch as E02 and the earlier tabbed-content CTA defect — third instance of that family.
- **E43** — see §4.
- **E44** — a valid 240-character opening-hours exception note made a 1440px page **3189px** wide, because the shared List used an unconstrained grid track. Closed; badges were checked and explicitly exonerated (*"no badge defect inferred"*). Found by testing maximum authored content, which is the only way this surfaces.

---

## 3. Correction: my F1 impact claim was overstated

Codex challenged my audit-14 exposure advisory, and it is right. I verified the mechanism rather than taking the correction on assertion.

`settings/defaults.ts:1498` merges the backend's plugin defaults into the section:

```js
return { ...defaults, ...(section === "plugins"
  ? Object.fromEntries(Object.entries(PLUGIN_SETTINGS_KEY).map(([id, key]) => [key, PLUGIN_DEFAULTS[id]]))
  : {}) };
```

And `settings/queries.ts:274` builds the public projection from `getMergedSettingsSection(ctx, "plugins")`. So a site with **no stored plugins row** still receives `galleryEnabled: true` through `getPublic`. Because `extensionEnabled` uses a stored boolean when one is present, `manifest.defaultEnabled` is **never consulted on the ordinary public route path**.

That invalidates the failure signature I asserted in audit 01:

> *"on any site whose `plugins` settings section lacks those keys … the backend resolver treats the extension as enabled while the public Website gate treats it as disabled."*

On the ordinary route path the Website gate was already receiving `true`. The mismatch was real — two tables genuinely disagreed, and Codex confirmed and repaired it — but it bit only on paths consuming **raw or partial settings** rather than the merged projection. Codex is careful about the residual: *"Legacy-only Website aliases retain their existing compatibility semantics; I am not claiming universal equivalence over malformed/unprojected legacy settings."*

**Two lessons I am recording against myself.** First, in F19 I hedged an unproven reachability claim and that hedge turned out to be the right posture; in F1 I did not hedge, and the unhedged half was wrong. Second, my audit-14 advisory about newly exposed routes was built on the same wrong model. Codex nonetheless ran the check — built source `/help/`, `/support/`, `/recipes/`, `/gallery/` each at 390px with expected headings, HTTP 200, no overflow and no page/console/hydration errors, with signed-out Support visually inspected — and was precise about its limits: *"Source has no recipes, so that route exercised its real empty result. Source has one existing album, so Gallery was not a pristine-site empty-album test."*

**Also corrected: the Website manifest count is 16, not 17.** My audit-01 figure counted the `sdk` directory alongside the real manifests. Codex's count is right and is independently verified by index generation.

**F1 as finally repaired:** four manifests aligned in the live-safe direction, a three-table parity gate (backend, Website, Admin `PLATFORM_DEFAULT_SETTINGS`) proving evaluator equivalence rather than only table equality, `customFields` pinned as intentionally Admin-only, and the contract gate wired into `check:blocks`. Codex notes precisely which tests are wired where: the root three-test parity contract is in `check:blocks`; the two registered backend tests sit in the focused suite, not both in that gate. 17 focused tests / 246 assertions, Website types/build and explicit Convex-project typecheck pass.

---

## 4. E43 — anonymous access to restricted albums · the series' most serious defect

Classified `demonstrated delivery blocker`. The finding as recorded:

> *"Live Gallery Album canonical block withdraws on a route policy, but anonymous `gallery/queries:getBySlug` still returns that album and its images. Private album detail produces HTTP 200 rather than [404]."*

So the **block** correctly withdrew a restricted album while the **plugin's own public query** still served it — album metadata and images — to unauthenticated callers, and the detail route answered 200 instead of 404. That is real unauthorised content exposure, not a silent failure or a cosmetic gap.

**The structural point matters more than the instance.** I checked which modules carry the membership access evaluator: the canonical block resolvers all do — `canonicalDocuments/album.ts`, `courses.ts`, `curriculum.ts`, `instructor.ts`, `learnerProgress.ts`, `support.ts`, `taggedMedia.ts`, `publicBlocks.ts`, `publishedBlockPath.ts`, plus `commerce/publicProductAccess.ts`, `commerceBundles/publicBundle.ts`, `kb/publicAccess.ts`, `recipes/publicRead.ts`, `search/publicSource.ts`, `helpers/publicContent.ts`. **The block path was gated; the plugin's standalone route query was the hole.** Defence-in-depth failed at the layer that actually owns the data.

The repair is broader than the symptom. A shared `isPublicAlbum()` helper now guards detail, embed and archive alike — its comment says so — and checks four things where the old code checked two:

- `status === "publish"` and `visibility === "public"` (as before)
- **future-publication filtering**: `publishedAt > now` → not public (new)
- membership route access for **both** `/gallery` and `/gallery/<slug>` (new)

with a request-scoped evaluator shared across archive rows — the same per-request memoisation discipline as E27's fix. Evidence: 21 focused tests, installed restricted album returns null, actual routes 404.

### F23 — the structural tell for this class · **LOW · Narrow review lens**

Gallery was an outlier in *where* it served public reads. Every other namespace with a public surface has a dedicated, gated public-read module — `recipes/publicRead.ts`, `kb/publicAccess.ts`, `extensions/events/publicAccess.ts`, `commerce/publicProductAccess.ts`, `commerceBundles/publicBundle.ts`. Gallery served public reads straight out of its general `queries.ts`, which is why the route policy was never applied there.

So the cheap tell for E43's class is: **a namespace that serves public reads from its general `queries.ts` instead of a dedicated gated public-read module**, *and* whose content is public-by-default with a restricted subset. Both conditions matter — which is why I checked the obvious candidate and found nothing:

**Negative result — tickets is not this shape.** `tickets/queries.ts` exposes public `query` functions taking identifiers (`getByTicketNumber`, `getById`, `getTicketWithReplies`) and is gated only by `isPluginEnabled` at the top, which looked like the same pattern. It is not: `getByTicketNumber` calls `getCurrentUser`, throws `UNAUTHORIZED` when absent, and then enforces `ticket.userId !== user._id` → requires the `ticket.viewAll` capability, else returns null. Tickets is private-by-default and was built auth-first. Recorded so this is not re-raised.

That distinction sharpens the lens: the risk lives in content that is **public by default with a restricted subset** — where a visibility field exists but a route/membership policy is the real boundary — not in private-by-default content. Among remaining Task 3 rows, `lms`, `membership` and `events` fit that profile; their canonical resolvers are all gated, so the residual question is only whether any of them serves a standalone public route query. One grep per namespace when those batches open, not a campaign.

---

## 5. Status of findings

| ID | State |
|---|---|
| **F1** plugin default mismatch | **Closed** — committed as `e67880ef`, three-table parity gate wired into `check:blocks`, route check performed. Thirteen hours from raise to closure; impact claim corrected (§3). |
| **F2** auto-push | Closed, holding — 0 `git push` lines in both hooks, re-verified. |
| **F17** reference gate | Accepted into E17/Task 7. |
| **F18** header/row parity | Holding across six consecutive checks. |
| **F19** page-href duplication | Closed (audit 13). |
| **F20** backfill truncation | Recorded in the deferred register with promotion condition. |
| **F21** partial-work-reported-as-success | Open as a durable criterion in coordination and Task 4. Its first real test is still Task 4 migration. |
| **F22** F21 not durably recorded | Closed (audit 14). |
| **F23** public-read module tell | **New**, narrow lens. |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed; no regressions observed. |
| **F12** · **F15** | Declined / located, with reasoning. |
| **E18, E22, E28** | Open, and Codex states explicitly they are *"assigned integration/template work, not forgotten or closed."* |
| **E41–E44** | Closed. |

---

## 6. Progress

| | Series start | Now |
|---|---|---|
| Verified / In progress | 58 / 79 | **85 / 52** |
| Task 2 remaining | 20 | **8** |
| Task 3 remaining | 54 | ~42 |
| Tasks | 2–8 pending | 1 complete, 2 and 3 active, 4–8 pending |
| Blockers registered | 18 | 45 |
| Downgrades, cumulative | — | **zero** |

Twenty-seven rows accepted and twenty-seven blockers surfaced, with no Verified row rolled back. The last two hours produced ten rows — the fastest stretch of the series — which is what clearing the search and plugin-gate dependencies bought. Tasks 4–8 remain the largest unknown.

---

## 7. What I will measure next hour

1. Whether the `support` batch opens — it holds the last two F1-dependent rows (`support/kb-search`, `support/ticket-cta`), and F23's lens applies there first.
2. Whether Task 2's remaining 8 rows continue at this rate.
3. **F21's first real test** — still pending until Task 4 migration begins.
4. Verified count and downgrade check against the 85-row set.
5. **E18/E22/E28** — nine hours idle, now explicitly confirmed as assigned rather than dropped.

---

## 8. Corrections and negative results

- **My audit-01 F1 impact claim was overstated.** The ordinary public route path already received the backend's `true` via `getPublic`'s merged section (`settings/defaults.ts:1498`, `settings/queries.ts:274`), so `manifest.defaultEnabled` was never consulted there. The table mismatch was real; the failure signature I asserted was not reachable on that path. §3
- **My audit-14 exposure advisory rested on the same wrong model** and is withdrawn. Codex ran the route check anyway and reported its limits precisely.
- **The Website manifest count is 16, not 17** — my audit-01 count included the `sdk` directory.
- **Tickets is not an E43 sibling** — `getByTicketNumber` requires authentication and enforces ownership or the `ticket.viewAll` capability. Verified before reporting; recorded so it is not re-raised.
- **My audit-09 characterisation of `menus/queries.ts:350` as drift was wrong** (corrected audit 13).
- **Audit 11's F21 framing was too narrow** (corrected audit 13) — codebase-wide disposition, not a search habit.
- **Audit 07's "48 resolvers" remains withdrawn** (dirty-tree measurement); the `defineDataBlock` ↔ `spec.data` heuristic remains withdrawn; my "intentional-deny list" refinement to F17 remains withdrawn; **367 bare `catch` blocks remains explicitly not a finding**.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**; **`core/featured-page` was never a latent E29**; **E38's cache re-checks integrity on hits and caches no authority** (audit 10); **E27's classification is `accepted repair`** (audit 12).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric; a mechanical count is a hypothesis; a duplicated expression may contain deliberate variation; an enumeration of sources of truth should be proven exhaustive before a two-way mismatch is called complete; and **a mismatch between two tables does not establish which code paths actually consult them** — this hour's lesson, and the one that cost me the most.
