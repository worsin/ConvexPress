---
name: block-promote
description: Export a reviewed ConvexPress custom block into canonical SDK source, verify its installed behavior, and preserve existing pinned pages.
---

Use for promoting a saved `composed/*` definition into a reusable Library block.
Read `block-kit/references/promotion.md`, `CONTRACT.md` and `WORKFLOW.md` from the
repository's block-kit before acting. This is a standalone ConvexPress workflow.

Inspect the exact worktree, current handoff and source definition. Preserve unrelated
work. Revalidate the website/environment, version, digest, generation and template
treatments. Register the canonical block in the designated Standalone MagicTables
Blocks table before creating canonical source, using actual table fields and choices.

Export through the authorized promotion query. Keep credentials out of the package,
logs and arguments. Inspect the CLI dry run, then use `promote:block --write` within
the user's authorized scope. Existing or interrupted output is inspected rather than
overwritten. Run canonical synchronization, generated tests, renderer regressions,
type checks, BlockDemo desktop/mobile acceptance and real site data/media acceptance.
Store screenshots and truthful acceptance notes for the promoted block.

Deploy the matching Website/backend using the existing authorized deployment flow.
Only confirm promotion after proving that installed canonical block works. Recheck
the source generation after approval; use exact package identity for confirmation
and readback. Never rewrite pinned pages or remove immutable versions/approvals as
part of promotion. Exercise old-page rendering and revocation after confirmation.

Record implemented, tested, deployed and rendered evidence separately. The static Studio Services workflow has native editor and deployed end-to-end
acceptance; resolver/media/child-slot cases still require their own evidence.
Tests or this skill's existence do not close those requirements. Do not mark the
full block library or production goal complete from a single promotion.
