# Full snapshot replacement containment

Implemented September 4, 2026 in the isolated hardening worktree. This closes the unsafe full-database promotion path documented in `promotion-environment-isolation-finding.md`; it does not implement content promotion.

## Enforced behavior

- `operations/replacementSafety.ts` rejects full-snapshot `site.clone` and `site.promote` operations. Restore requires nonempty, equal source and target website ID, instance ID, website key, instance key, and environment kind. Missing identity fails closed.
- `operations/mutations.ts:150` validates this identity before starting a restore. Clone and promotion starts reject before workflow allocation. Public resume also rejects historical clone/promotion operations and revalidates a restore's verified source snapshot.
- `operations/records.ts:138` and `:425` enforce the operation restriction at durable creation and resume, independently of public UI or workflow callers.
- `operations/internal.ts:185` blocks historical queued, running, or resuming clone/promotion jobs before snapshot preparation. Restore preparation checks exact environment identity before target export work; `prepareRestore` repeats that check before providing the import source.
- `operations/actions.ts:321` checks source identity before obtaining storage URLs, archive reads, credential decryption, or import. It checks again at the import call. `importReplacementSnapshot` refuses immediately, without even querying preparation records, so previously queued replacement jobs cannot reach remote import.

Verified same-environment disaster restore retains the existing authorization, live confirmation, snapshot verification, compatibility, target pre-backup receipt, checksum, archive identity, and management-table preservation checks. It remains a full database restore, including saved customer and transaction data; it is not a content update.

## Verification

Real-handler regressions first reproduced the unsafe behavior before the guard. The new tests cover both public starts, historical queued/running/resuming preparation, interrupted resume, immediate import refusal, every missing/foreign identity field, and a positive verified same-environment start/preparation path. Refusal assertions count storage/remote-boundary access and prove none occurs for rejected imports.

- `bun test ConvexPress-Admin/packages/control-plane/convex/operations/__tests__`: **48 passed, 241 assertions**, including existing streaming archive, receipt, checkpoint, and restore tests.
- `bunx tsc --noEmit -p ConvexPress-Admin/packages/control-plane/convex/tsconfig.json`: passed.
- Scoped `git diff --check`: passed.
- No live restore, promotion, snapshot copy, provider operation, deployment, or database mutation was performed by this subtask.

## Remaining policy and limits

Proper content promotion needs an explicit authored-table and dependency allowlist, stable identity remapping, target-owned runtime configuration, and preservation of target users, orders, queues, authentication, secrets, and public origins. Any future cross-environment full clone additionally needs an explicit customer-data, session, queue, encryption-key, and configuration transformation policy. Removing this guard alone is not an implementation of either feature.

Historical operation receipts are retained. Work encounters the guard when it next prepares or imports; it cannot resume a prohibited replacement through the public endpoint. Cancellation remains available. This code cannot undo an import already accepted by the remote database before the guard was deployed, and no such live state was inspected here.

## Root live acceptance

Deployed CP changes with TypeScript enabled (`/tmp/convexpress-control-isolation-deploy.log`, exit0). Authenticated real API attempts for staging→production clone, promotion, and restoring the verified staging snapshot into production all returned the exact isolation guard errors. No production operation was created; the operation page before/after matched. Staging backup remains present. The initial native attempt exposed controller query timeouts; subsequent controlled acceptance resolved the isolate-worker admission mismatch. After changing only the control-plane worker pool from 8 to 32, cold native staging Operations loaded its verified receipt, backup, history, and maintenance controls in 949 ms with zero captured browser errors. Production recovery offered only the empty snapshot placeholder; switching back to staging showed its own 267-table/15-file receipt. Health cadence was saved from 5 to 6 minutes and restored to 5, with persisted revisions 2 and 3. See controller-query-budget-outcome.md and output/aster-house/site-run.json for the workload and configuration limits. No successful replacement or restore ran.
