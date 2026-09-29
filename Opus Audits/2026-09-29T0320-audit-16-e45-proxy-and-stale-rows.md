# Opus Audit 16 — F1's arc completes; a hardened proxy verified; 11 stale status rows
**Auditor:** Claude Opus 5 · **Written:** 2026-09-29 03:20 MDT · **Covers:** 02:20 → 03:20
**Live source:** hardening worktree @ `3aaa5722` plus 44 files in flight (primitive contracts / carousel / customer-showcase)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**90 Verified / 47 In progress** — five more rows, zero downgrades. **F1's arc is complete**: `support/kb-search` and `support/ticket-cta` closed this hour, so all four F1-dependent rows are accepted and both the `plugin-content` and `support` batches have disappeared from the remaining work. Raised in audit 01, repaired in 14–15, fully drained by 16.

Two substantive results:

- **E45 added a same-origin storage proxy, and I verified it hard.** A new proxy route taking a user-supplied identifier is the classic place a UX fix introduces an SSRF or credential-leak vulnerability. All four controls Codex claimed hold, plus several it did not mention. §3
- **F24, new: 11 rows in the status file are stale.** Its header reads 90/47 and matches the live tracker, but its own `blocks[]` array still tallies 79/58. The stale rows are exactly the last two hours' acceptances — and they **misled me during this very audit** before I caught it. §4

I also accept two corrections from Codex, one of which is a ranking claim I should not have made. §5

---

## 2. Deltas since audit 15 — verified

| | Audit 15 (02:20) | Now (03:20) |
|---|---|---|
| Hardening HEAD | `71ab11f9` | **`3aaa5722`** (+2 commits) |
| Divergence | main +35 / hardening +27 | main +36 / hardening +29 |
| Live tracker | 85 / 52 | **90 / 47** |
| Rows added | — | `support/kb-search`, `support/ticket-cta`, `core/rich-text`, `core/file-download`, `core/custom-html` |
| Downgrades | none | **none** |
| Blockers | 45 | **46** (E45, E46) |

Commits: `4b708508` fix public file attachments and HTML typography, accept three text blocks · `3aaa5722` accept Support search and ticket blocks with real customer ownership proof.

**E46** also closed: after the CSS reset, HTML headings, lists and spacing had lost semantic typography — repaired with scoped rules, verified against real list markers (disc, 24px indentation) and heading scale (h3 24px versus body 16px) across four packs, desktop and mobile.

**F2** holding — 0 `git push` lines in both hooks.

---

## 3. E45's storage proxy — verified hardened

E45's finding was mundane: a 308-byte public storage guide **opened in a new document instead of downloading**, because the cross-origin response carried no attachment disposition. The fix is a new same-origin route (`routes/api/public-files/$storageId.tsx`) over `lib/downloads/public-storage.ts`. That is exactly the shape where a small UX repair commonly introduces a server-side request forgery or a credential leak, so I read all 42 lines rather than accepting the summary.

Codex's four claims all hold:

| Claim | Verified |
|---|---|
| "accepts only an opaque storage key" | `/^[a-zA-Z0-9_-]{1,128}$/` or 404. No slashes, traversal or URL characters possible. |
| "forwards no user/operator credentials" | `credentials: 'omit'`, and outbound headers are **constructed fresh** rather than forwarded — only `Range` and a length-capped `If-Range` are copied. No cookies or Authorization reach upstream. |
| "follows no redirects" | `redirect: 'error'`. |
| "streams without whole-file buffering" | `upstream.body` returned directly; `HEAD` cancels it. |

**No SSRF is reachable**: the upstream is built as `` `${origin.origin}/api/storage/${storageId}` `` — using the parsed `origin.origin`, so any path or query in the configured value is discarded, and the only user-controlled component is the charset-restricted segment.

Several further controls are present that the summary did not claim:

- **Config validation** rejects non-`http(s)` protocols and any configured URL carrying `username`/`password` → 503, so credentials embedded in configuration cannot leak upstream.
- **Method allowlist** (GET/HEAD → else 405) and a **query allowlist** — only `filename`, single occurrence, ≤2000 chars, else 400.
- **Content-encoding guard**: a non-identity upstream encoding is refused and its body cancelled.
- **Status mapping that avoids disclosure**: upstream 403 and 404 both return 404, so the route does not reveal that a key exists but is forbidden.
- **Response hardening**: `no-store`, `nosniff`, `no-referrer`, `noindex`, forced `application/octet-stream` and `Content-Disposition: attachment`.
- **Careful range validation** — empty-both, reversed, and `-0` ranges all rejected with 416.
- **Body cancelled on every error path**, and `signal: request.signal` propagates cancellation.

This is the kind of addition I would expect to generate a finding, and instead it is the most defensively written new endpoint I have reviewed in this series. Recording it as a positive verification so a later refactor does not quietly drop any of it.

---

## 4. F24 — 11 rows in the status file are stale · **MEDIUM · Tracking accuracy**

The status file disagrees with itself:

| Source | Verified / In progress |
|---|---|
| Live MagicTables tracker | **90 / 47** |
| `checkpointCounts` header | **90 / 47** ✓ matches live |
| Its own `blocks[].checkpointStatus` tally | **79 / 58** ✗ stale by 11 |

The 11 rows Verified live but still `In progress` in the array are exactly the last two hours' acceptances:

`business/locations`, `business/menu`, `business/opening-hours`, `business/service-list`, `core/custom-html`, `core/file-download`, `core/rich-text`, `gallery/album`, `gallery/recipe-card`, `support/kb-search`, `support/ticket-cta`

No rows go the other way — there are no phantom Verified entries, so this is lag, not corruption.

**Why it matters more than the audit-07 version.** F18's original instance had the *header* stale behind correct rows; Codex fixed it and stated that subsequent updates would "recompute that header and assert tracker/row/header parity." The header is indeed being recomputed and is correct. But the `blocks[]` array is where the per-row scheduling data lives — `deliveryTask`, `acceptanceBatch`, `remainingReview` — so it is the array, not the header, that anyone consults to answer "what is left". Eleven done rows sitting in that queue is a scheduling error waiting to happen.

**It already happened, to me.** Earlier in this audit I computed "Task 2 remaining (12)" from the array. Seven of those twelve are already Verified. The true figure, from live data:

| | From stale array | **True (live)** |
|---|---|---|
| Task 2 remaining | 12 | **5** |
| Task 3 remaining | 43 | **39** |
| Total pending | 58 | **47** |

True Task 2 remaining is `blocks/customer-showcase`, `blocks/grade-gallery`, `core/carousel`, `core/marquee`, `core/steps-with-media` — and the 44 in-flight files touch `carousel.tsx` and `customer-showcase/render.tsx`, which corroborates it.

**Recommendation:** extend the existing parity assertion to cover rows, not just the header — the tracker readback that already updates `checkpointCounts` has the per-row statuses in hand. One assertion, and it closes the class rather than this instance.

---

## 5. Corrections I accept from Codex

**My "most serious defect of the series" label on E43 was unsubstantiated.** Codex: *"E43's public query exposure was reproduced and repaired, but its severity relative to every other defect has not been independently ranked."* That is right. I asserted a ranking across ~46 blockers without doing the comparison. What I can defend is the narrower claim: E43 is the only defect in this series that **served restricted content to unauthenticated callers** — a different class from silent failure, truncation or layout, and one where the block layer was correct while the data layer was not. That characterisation stands; the superlative does not, and I withdraw it. Codex also notes the repair *"did not revoke existing public storage capabilities"*, and the report makes no such claim.

**F23 is correctly bounded.** Codex: *"Module placement alone does not establish missing authorization; the actual caller, visibility, route policy and publication checks decide."* Agreed, and it is consistent with my own repeated lesson about mechanical heuristics — the public-read-module tell is a hint about *where to look*, never evidence of a gap. That is also precisely why I verified tickets before reporting it and found it correctly auth-gated. Codex further notes the Support batch was a queue input rather than an instruction; correct — I am advisory and the core content batch reasonably came first. It then closed Support this hour anyway.

---

## 6. Where the delivery stands

| | Series start | Now |
|---|---|---|
| Verified / In progress | 58 / 79 | **90 / 47** |
| Task 2 remaining | 20 | **5** |
| Task 3 remaining | 54 | **39** |
| Tasks 4 / 7 rows | 2 / 1 | 2 / 1 |
| Blockers registered | 18 | 46 |
| Downgrades, cumulative | — | **zero** |

Task 3's remaining batches: `catalog` 8, `external-embeds` 6, `customer-commerce` 6, `forms` 6, `learning` 5, `events` 3, `membership` 3, `social-data` 2. **`plugin-content` and `support` are gone** — F1's gate is fully drained.

Thirty-two rows accepted, twenty-eight blockers surfaced, no Verified row rolled back. Tasks 4–8 remain untouched and are still the largest unknown: migration and legacy retirement, Templates/Customizer, the four example sites, the SDK workflows, and the final integrated gate. Codex also flags that `blocks/studio-services` stays In progress pending its complete compose/style/promote workflow *"despite its fresh renderer/native coverage"* — declining to close a row on partial-workflow evidence.

---

## 7. What I will measure next hour

1. **F24** — whether the row-level parity assertion lands.
2. Task 2's true remaining 5 — `carousel` and `customer-showcase` are in flight now.
3. **F21's first real test** — still pending until Task 4 migration opens; two rows sit there.
4. Verified count and downgrade check against the 90-row set.
5. Whether `catalog` (8 rows) opens, the largest remaining Task 3 batch.
6. **E18/E22/E28** — ten hours idle, confirmed assigned rather than dropped.

---

## 8. Corrections and negative results

- **My E43 severity ranking is withdrawn** — unsubstantiated across 46 blockers. The defensible claim is its *class*: the only defect here that served restricted content to unauthenticated callers. §5
- **My "Task 2 remaining (12)" figure this hour was wrong** — computed from the stale array; the true figure is 5. Caught and corrected within the same audit, and it is what makes F24 concrete rather than theoretical. §4
- **The E45 proxy introduces no SSRF or credential leak** — verified line by line, including the `origin.origin` reconstruction that discards any configured path. §3
- **My audit-01 F1 impact claim remains withdrawn** (audit 15) — the ordinary route path already received the backend default via `getPublic`'s merged section, so `manifest.defaultEnabled` was never consulted there.
- **The Website manifest count is 16, not 17** (audit 15).
- **Tickets is not an E43 sibling** — `getByTicketNumber` requires authentication and enforces ownership or `ticket.viewAll`.
- **F23 is a lens, not a vulnerability claim** — module placement alone proves nothing. §5
- **My audit-09 `menus/queries.ts:350` "drift" characterisation was wrong** (audit 13); **audit 11's F21 framing was too narrow** (audit 13); **audit 07's "48 resolvers" remains withdrawn**; the **`defineDataBlock` ↔ `spec.data` heuristic remains withdrawn**; the **"intentional-deny list" refinement to F17 remains withdrawn**; **367 bare `catch` blocks remains explicitly not a finding**.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**; **`core/featured-page` was never a latent E29**; **E38's cache re-checks integrity on hits and caches no authority** (audit 10); **E27's classification is `accepted repair`** (audit 12).
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric; a mechanical count is a hypothesis; a duplicated expression may contain deliberate variation; an enumeration of sources of truth should be proven exhaustive; a two-table mismatch does not establish which paths consult them; **and derived status should be read from the live source, not from a cached array — this hour I read the array and it was eleven rows stale.**
