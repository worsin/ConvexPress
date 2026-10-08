# History cleanup — 2026-10-07

GitHub (`worsin/ConvexPress`) was 651 commits behind local `main`. The last push was 2026-09-02. Those commits could not be pushed: auto-commits on 2026-09-02/03 had captured Playwright failure archives under `output/playwright/*.zip`, and one of them was 122.7 MB, over GitHub's 100 MB file limit.

## What changed

- **Rewrite:** the 651 unpushed commits (`5a4d604e..main`) were rewritten with `git filter-repo`, removing only `output/playwright/*.zip` changes. Two consequences:
  - No source, docs or config file differs. The rewritten HEAD tree matches the previous HEAD except for those archives.
  - Every commit after `5a4d604e` has a new hash. Commits up to `5a4d604e`, which were already on GitHub, are unchanged.
- **Push:** the rewritten `main` was pushed to GitHub as a normal fast-forward.
- **Untracked:** the two archives inherited from the already-pushed base are no longer tracked. `/output/` was already in `.gitignore`. The files remain on disk.

## Finding old commit hashes

Audit reports, `CODEX-NOTES.md`, `Opus Audits/` and the delivery status file cite commit hashes from before this cleanup (for example `f6c89177`, `012255f2`). Look them up in [`2026-10-07-commit-map.tsv`](2026-10-07-commit-map.tsv), which maps old full hash → new full hash:

```sh
grep '^f6c89177' docs/history/2026-10-07-commit-map.tsv
```

## Backups of the original history

The pre-cleanup history, including the archives, is preserved locally and was not pushed:

- tag `backup/pre-history-cleanup-20261007` (old `main` = `6422a281`) in this checkout;
- `~/Development/ConvexPress-backups/convexpress-all-refs-2026-10-07.bundle` (all 196 refs; restore with `git clone <bundle>`).

The Codex worktree branch `codex/convexpress-hardening` (`/Users/worsin/.codex/worktrees/convexpress-hardening`) still points at old-history commit `f6c89177`. Its content equals new commit `1e96af54` on `main`. The worktree holds Codex's local, untracked acceptance receipts under `output/`, so it was left in place.
