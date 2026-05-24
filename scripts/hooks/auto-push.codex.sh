#!/usr/bin/env bash
# Stop hook: auto-commit and push every Claude turn that touched files.
# Silent when there are no changes. Never blocks Claude from finishing.

set -u

# Resolve repo root from the cwd Claude was invoked in.
repo="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$repo" || exit 0

# Skip when working tree is clean.
if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
  exit 0
fi

# Stage everything (gitignored files are excluded by .gitignore).
git add -A 2>/dev/null

# If staging produced nothing (e.g. all changes were ignored), bail.
if git diff --cached --quiet 2>/dev/null; then
  exit 0
fi

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
git commit -m "auto: ${ts}" >/dev/null 2>&1 || exit 0

# Push current branch to origin. Swallow failures (offline, non-FF, etc.)
# so a bad push never blocks Claude from finishing the turn.
git push origin HEAD >/dev/null 2>&1 || true

exit 0
