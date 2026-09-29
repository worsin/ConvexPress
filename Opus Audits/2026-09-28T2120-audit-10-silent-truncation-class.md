# Opus Audit 10 — composed search and restore timeout closed; a silent-truncation class
**Auditor:** Claude Opus 5 · **Written:** 2026-09-28 21:20 MDT · **Covers:** 20:20 → 21:20
**Live source:** hardening worktree @ `320d33fe` plus 17 files in flight (E37 reindex continuation)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. Verdict

**E36** (approved custom composition search) and **E38** (native restore timeout) closed in `320d33fe`. **E37** — `reindexAll` silently indexing only the first 500 records per type — is in live acceptance with 551 seeded pages. Tracker held at **74 Verified / 63 In progress**, zero downgrades, and Codex claimed no row movement, which matches.

Two substantive results this hour:

- **E37's root cause confirmed, and it is instructive**: the 500-record caps were introduced *as a hardening fix* (`// H-16 FIX: bounded query`) without continuation, converting an unbounded-read risk into a silent-correctness one. The orphan cleanup was capped too. §3
- **F20, new**: the same class exists in `commerce/migrations.ts` — `backfillEnterpriseCommerceRecords` takes `limit` (default 200) from four tables and returns a completion-shaped summary with no cursor, so records beyond the limit are unreachable by *any* number of invocations. It belongs to the deferred commerce register, not this delivery. §4

I also verified E38's security-relevant claims rather than taking them on trust; they hold. §5

---

## 2. Deltas since audit 09 — verified

| | Audit 09 (20:20) | Now (21:20) |
|---|---|---|
| Hardening HEAD | `7511d70a` | **`320d33fe`** (+1 commit) |
| Divergence | main +21 / hardening +15 | main +23 / hardening +16 |
| Live tracker | 74 / 63 | **74 / 63 — unchanged** |
| Downgrades | none | **none** |
| Blockers | 36 | 38 (E37, E38) |

No tracker movement is the correct outcome: E36's two-block family closed into already-accepted rows, and `core/search-results` stays held pending E37's full-corpus backfill. Codex is explicit that E38's repair *"does not prove complete >500 corpus backfill"* — keeping the row open on the dependency rather than on the block's own behaviour.

---

## 3. E37 — a hardening fix that traded a crash risk for a silent-correctness risk

I confirmed the pre-repair state at `7511d70a` in `search/internals.ts`:

| Line | Code |
|---|---|
| 529, 558, 572 | `.take(500); // H-16 FIX: bounded query` (per content type) |
| 543 | `await ctx.db.query("media").take(500); // H-16 FIX: bounded query` |
| 583 | `await ctx.db.query("commerce_products").take(500)` |
| **601** | `const allIndexEntries = await ctx.db.query("searchIndex").take(500); // H-16 FIX: bounded query` |

The comment is the tell. These caps were added deliberately, as a fix labelled **H-16** — evidently an earlier hardening finding about unbounded table scans. Bounding the query removed the scan risk and introduced a different one: `reindexAll` claimed to reindex all content while indexing the first 500 of each type, and — line 601 — the **orphan cleanup capped at 500 index entries too**, so stale entries beyond that were never removed.

Codex's reproduction matches exactly: 551 pages → 500 indexed, 551 orphans → 500 removed, and cleanup deleting the sentinel lock. The repair adds persistent site-local reindex state, unique operation/action leases, one source item per atomic cursor/index transaction, bounded steps (max 100 / 30 s per action response), seven content types including Events, correct orphan identity, bounded cron continuation, and — importantly — native controls that *"only announce completion after actual completion."*

**The generalisable lesson is narrow, and I want to state it narrowly.** The risk is not `.take(N)` — that is usually correct. The risk is **a bound on an operation that reports completion**. `reindexAll` and its orphan sweep both did. I checked the other `.take()` sites in the backend and most are legitimate bounded batches: `_devPurge.ts` loops in batches, `commerceReviews/ratingMaintenance.ts:40` takes 8 stalled scans under cron continuation, `commerce/stockLedger.ts:20` takes 201 to detect an over-200 condition, `tickets/queries.ts:479` carries an explicit comment explaining the bound on a query. The single remaining `H-16` marker at HEAD (`search/internals.ts:169`, `termRelationships` per post) is a per-document bound, not a corpus operation — not a finding.

That leaves exactly one site that shares E37's shape.

---

## 4. F20 — `backfillEnterpriseCommerceRecords` truncates and reports completion · **MEDIUM (deferred register) · Reproduced by source trace**

`ConvexPress-Admin/packages/backend/convex/commerce/migrations.ts:631` — `backfillEnterpriseCommerceRecords`:

- `const limit = Math.min(Math.max(args.limit ?? 200, 1), 1000);` (line 642) — **defaults to 200**.
- Lines 685-688 take `limit` rows from `commerce_carts`, `commerce_checkout_sessions`, `commerce_orders` and `commerce_payment_transactions`.
- Line 781 returns `{ dryRun, limit, ...summary }`, where `summary` carries `cartsPatched`, `checkoutsPatched`, `ordersPatched`, `paymentCollectionsCreated`, `transactionsLinked`.

There is **no cursor, no `isDone`, no remaining count**. Two consequences:

1. **The return is completion-shaped but not completion-proving.** A caller on a site with 500 carts sees `cartsPatched: 200, limit: 200` and has no way to distinguish "200 needed patching" from "200 was the cap". The echoed `limit` is the only hint.
2. **Records beyond the limit are unreachable by repeated invocation.** `.take(limit)` without a cursor returns the same leading rows every call. Even if the loop's internal conditions skip already-patched records, the function still only *examines* the first `limit` rows — so row 201 is never reached no matter how many times it runs. That is the part that makes this a defect rather than a reporting gap, and it is the same property E37 had.

**Scope, explicitly.** This is commerce enterprise backfill. Payment/refund and commerce-provider work is in the plan's **deferred independent deliverables**, and I am not proposing it be pulled into this delivery — doing so would be precisely the scope drift the plan's §2 procedure exists to prevent. The right home is the deferred register, documented with its root cause so it is not rediscovered from scratch.

**The one condition that would change that:** if a Task 3 `catalog` or `customer-commerce` row's acceptance depends on enterprise commerce records (regions, sales channels, payment collections) existing for a corpus above 200 rows, then this becomes a demonstrated blocker under §2 and warrants the five-line entry. Worth a look when those batches open — `catalog` (8 rows) and `customer-commerce` (6 rows) are the two largest Task 3 batches.

---

## 5. E38's cache — security claims verified, not assumed

Codex stated the decode cache retains *"only immutable JSON/digest strings"* with *"no authority/approval caching"* and integrity rechecked on every call. A cache in a restore/publication path that skipped integrity checks would be a genuine vulnerability, so I read it (`canonicalDocuments/foundation/composedDefinitions.ts:56-80`). The claims hold:

- **Keyed by the exact input JSON string**, so any different input is a miss by construction.
- **Stores `{json, digest, bytes}` only** — immutable strings, no approvals, authority, or caller-owned objects. The in-code comment states the invariant.
- **Integrity is re-checked on the cache-hit path** (line 64) as well as the miss path (line 67). This is the property that matters most and it is present.
- **`JSON.parse(cached.json)` returns a fresh object per call**, so no shared mutable structure escapes.
- **Bounded on both axes** — 32 entries *and* 1 MiB, with oldest-first eviction, plus the 480 KiB per-definition cap enforced before the lookup.

1028 ms → 125 ms for 400 registries, with the 1 s source CPU cap being the actual failure Codex hit twice. Verified as described.

---

## 6. Status of findings

| ID | State |
|---|---|
| **F1** plugin default mismatch | **Open — tenth consecutive hour.** Backend `PLUGIN_DEFAULTS` still `true` for knowledgeBase/tickets/customFields/recipes/gallery; manifests still `false`. Codex now states it is required *"before plugin-content/support acceptance, irrespective of nominal task numbering"* — which directly answers my audit-09 §5 point that the task boundary is porous. The gate is now tied to the batches rather than to a task number, which is the correct framing. |
| **F2** auto-push | Closed, holding — 0 `git push` lines in both hooks, re-verified. |
| **F19** page-href duplication | **Deferred with reasoning I accept.** Codex agrees it *"merits a shared public-route contract"*, will inspect actual slug/write validation before treating the encoding difference as reachable (exactly the open question I left), and declines to mix an eight-consumer URL refactor into E36's in-flight acceptance. Carried to the next destination/localization pass with membership route identity explicitly covered. Deferring a cross-cutting refactor out of an active batch is the right call. |
| **F20** backfill truncation | **New**, assigned to the deferred commerce register. |
| **F17** reference gate | Accepted into E17/Task 7. |
| **F18** header/row parity | Holding. |
| **F6, F8/E19, F9, F10, F11, F13, F14, F16** | Closed; no regressions observed. |
| **F12** · **F15** | Declined / located, both with reasoning. |
| **E22** screenshot identity · **E28** header separator | Open, idle several hours. |
| **E37** | In live acceptance. |

---

## 7. Two disclosure items worth crediting

**A stale test assumption was corrected rather than reported green.** The broader backend run surfaced an AI test asserting that Core has no styles — untrue since Core Hero gained `default`/`editorial`/`poster` treatments. Codex replaced it with a specific CTA-treatment-absence assertion instead of leaving a passing-but-wrong test or reporting all-green. A test that passes for the wrong reason is worse than a failing one, and this is the second time this series that a green result was investigated rather than banked (the first being the act-batching concealment in E26).

**A temporary capability grant was disclosed with restoration proof.** Fixture creation needed `blocks.compose`, which the source's Administrator role lacks *by design*. Codex used the normal `role.grant_capability` mutation to grant only that one capability, privately backed up the exact prior capabilities, and reported them restored at batch end (*"Source temporary blocks.compose grant removed; exact old capabilities/authority restored"*), with the original native management ceiling intact. It also asked explicitly that the pre-existing role ceiling not be classified as a code defect — correct: roles not being silently reseeded is the intended behaviour, and I am recording it as such so it is not re-raised. A permissions change is exactly the kind of action that should be disclosed rather than discovered, and it was.

---

## 8. What I will measure next hour

1. **F1** — eleventh hour. Now tied to `plugin-content` / `support` batch opening rather than a task number.
2. **E37** live acceptance: whether all 551 pages index and results beyond 500 appear publicly, and whether the 551-page disposable corpus is fully cleaned up afterwards (Codex flagged it as fixture, not owner content).
3. Whether `core/search-results` closes once E37 lands — it is the one row explicitly held on this dependency.
4. **F20** — whether it is recorded in the deferred register, and whether any Task 3 commerce row turns out to depend on it.
5. Verified count and downgrade check against this hour's 74-row set.
6. The `*Sha256` drift fields — still unexercised since audit 04, now guarding 74 accepted rows.

---

## 9. Corrections and negative results

- **Most `.take()` sites in the backend are legitimate bounded batches**, not E37 siblings: `_devPurge` batches, `ratingMaintenance.ts:40` under cron, `stockLedger.ts:20` as an over-200 detector, `tickets/queries.ts:479` as a documented query bound. I checked rather than generalising E37 into a mechanical sweep.
- **The one remaining `H-16` marker** (`search/internals.ts:169`) is a per-post `termRelationships` bound, not a corpus operation. Not a finding.
- **E38's cache does not cache authority or approvals**, and re-checks integrity on cache hits. Verified against source, not accepted on assertion.
- **F19's encoding divergence remains unconfirmed-reachable** — Codex has taken the same position and will check slug/write validation. Neither of us is claiming it as a live defect.
- **Audit 07's "48 resolvers" remains withdrawn** (dirty-tree measurement); the `defineDataBlock ↔ spec.data` heuristic remains withdrawn (four false positives); my "intentional-deny list" refinement to F17 remains withdrawn.
- **No functionality removed from `core/site-info`** (audit 05); **`computePageDepth` already includes the child's level** (audit 06); **`paused` closes the armed-timer race** (audit 04); **`content.syncedBlock` is structurally special-cased**, not missing; **`core/featured-page` was never a latent E29**.
- **Audit 01's F2 overstatement remains withdrawn** — ahead-of-origin tracking data, last fetched 2026-07-15, never established a push failure.
- **Standing method note:** `block.json` is the authoritative contract; renderer wiring must be read, not pattern-matched; LOC is not a depth metric here.
