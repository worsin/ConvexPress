# Opus Audit 31 — hour six blocked; F21's exit-1 mechanism verified in source
**Auditor:** Claude Opus 5 · **Written:** 2026-09-29 18:20 MDT · **Covers:** 17:20 → 18:20
**Live source:** hardening worktree @ `34ba73c0` — unchanged (working tree clean apart from the owner's untracked handoff)
**Method:** read-only. No builds, tests, deploys or Convex commands; no processes touched; tracker read via `mt` read-only, never written.

---

## 1. State — unchanged, sixth hour

| Check | Result |
|---|---|
| Hardening HEAD | `34ba73c0`, 12:30 — **unchanged** |
| Worktree writes since 12:31 | **none** |
| Time since implementation stopped | **~5 h 50 min** |
| Codex's last write anywhere | 15:16 — **third consecutive hour with no response** |
| Only git activity this hour | `2f05f759` on `main` — the auto-commit of **my** audit 30 |
| Fresh `mt` pull | **117 Verified / 20 In progress / 137 rows** |
| Status header / rows parity | 117 / 20, **0 stale** |
| Blockers | 69 |
| Downgrades | none |
| **F2** auto-push | holding — 0 `git push` lines in both hooks |
| Website 4322 (PID 80269) | alive, 9 h 50 min |
| RSVP harness (PID 82875) | alive, 9 h 16 min |

Resuming the goal remains the only action that changes any of this. Queued work is unchanged from audit 28 §3.

---

## 2. F21's exit-1 mechanism — verified in source

In audit 23 I credited F21's criterion being realised in tooling on Codex's description: *"Actual migration check now emits complete 54-schema/44-pending-render-acceptance report and intentionally exits 1."* That is the finding I have credited most heavily in this series, so with nothing moving I read the script.

`package.json:15` → `"check:blocks-migration": "bun scripts/blocks/migrate-existing.ts --check"`.

**`scripts/blocks/migrate-existing.ts:240`** — the report is complete and itemised, not a summary count:

```js
console.log(JSON.stringify({
  existing: plans.length,
  representable: plans.filter(p => !p.issues.length).length,
  websiteSchemaDifferences: plans.filter(p => p.websiteSchemaDiffers).length,
  websiteDefaultDifferences: plans.filter(p => p.websiteDefaultDifference).length,
  pendingRenderAcceptance: plans.filter(p => p.candidate.migration).map(p => p.name),
  migrationRequired: plans.filter(p => p.issues.length)
    .map(p => ({ name: p.name, issues: [...new Set(p.issues.map(i => i.code))] })),
}, null, 2));
```

**Line 241** — the non-zero exit, conditional on genuine incompleteness:

```js
if (!write && !staged && plans.some(p => p.issues.length || p.websiteSchemaDiffers || p.candidate.migration))
  process.exitCode = 1;
```

Four properties worth recording:

- **The incomplete result is enumerated, not merely signalled.** `pendingRenderAcceptance` is a list of block *names*; `migrationRequired` pairs each name with its deduplicated issue codes. A reader learns which blocks are pending, not just how many.
- **The exit is conditional on real incompleteness** — any plan with issues, a Website schema difference, or a pending candidate migration. It cannot report failure for an empty reason.
- **`process.exitCode = 1` rather than `process.exit(1)`.** The script runs to completion and flushes its output before the status is applied. An immediate `process.exit` could truncate the very report that makes the failure actionable.
- **The exit is suppressed under `write` or `staged`**, so an actual migration run is not blocked by the check's reporting mode.

**What this establishes and does not.** The mechanism is verified: a complete enumerated report plus a conditional non-zero exit, flushed before exiting. The specific 54 and 44 figures come from `plans.length` and `pendingRenderAcceptance.length` at runtime; I do not execute commands, so those numbers remain Codex's report rather than my observation.

---

## 3. Findings

No new finding. No status promotion, no downgrade, no scope change. Prior findings stand as recorded in audit 28 §5.

---

## 4. What I will measure next hour

1. The resumption signal: a worktree write after 12:31 or a commit past `34ba73c0`.
2. Whether PIDs 80269 and 82875 remain alive.
3. Whether a Codex response resumes.
4. Tracker row count, downgrade check, parity.
