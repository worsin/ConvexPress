# Membership expiry and enrollment recovery — September 6

The periodic membership sweep now uses indexed bounded batches instead of collecting every active or grace grant. Explicit recorded grace deadlines are honored at the access boundary even before the sweep changes status. The unused plan gracePeriodDays behavior was removed: it is not a field in the real plan schema and must not grant extra access beginning at sweep time.

Expiry atomically queues durable user/plan enrollment repair. Each transaction reconciles one enrollment against current grants, active plans and current course rules. Valid replacement grants can preserve access with their actual expiry; manual or purchase enrollments are unaffected. Revoked enrollments are not resurrected. A fixed index horizon, generation checks and coalesced second passes handle concurrent changes without repeatedly restarting progress. A separate action records failures after the failed mutation rolls back; bounded backoff and periodic recovery resume interrupted jobs. Disabled plugins preserve pending work.

Log retention uses an indexed bounded deletion pass. The actual settings section now accepts validated management-only membership maintenance settings, including zero days for keep forever. There is no new native settings panel in this increment.

Restore preserves repair subjects while resetting source cursors, horizons, retries and worker generations. Both the helper and the actual streaming ZIP restoration path verify this transformation. A discovered terminal-boundary bug in form-count rebuilding is also fixed, with exact 32- and 64-entry final-page regressions.

## Verification

- Full backend and canonical foundation: 2,343 tests, 14,537 assertions, zero failures.
- Final focused maintenance, settings and form counts: 26 tests, 157 assertions. Maintenance tests call actual registered handlers with real Convex transactions and indexes; transport replay covers lost/stale workers, current replacement grants, disabled plugins and transaction rollback. A separate test drives registered expiry through actual scheduled actions to completion.
- The initial scheduler test passed an async timer callback to a helper that does not await it. Replaced it with real timer dispatch and inspection of scheduled function completion/failure records; it now proves completed work rather than an idle scheduler instant.
- Restore helper and actual archive stream: 10 tests, 61 assertions.
- Backend, control-plane, Admin and Website types pass. Both API consumers pass 19 compiler fixtures. Generated contracts describe 2,071 functions and 2,430 terminal DTOs, with 427 existing unknown boundaries still tracked.
- First captured backend deployment failed the CLI's fresh-binding typecheck because local generated API bindings did not include the new module. Explicit RegisteredMutation/RegisteredAction and handler boundary types fix the recursive inference; fresh CLI-generated bindings now pass local scoped types. Failed checkpoint retained as evidence; corrected checkpoint is membership-maintenance-20260906-r2.

## Deployment and remaining acceptance

Corrected backend checkpoint membership-maintenance-20260906-r2 (1,121 captured files) deployed successfully after fresh CLI generation and typecheck. Test control-plane checkpoint membership-maintenance-20260906 (226 files) also deployed. Staging health, website/instance binding and media epoch remain correct. Actual deployed expiry and recovery functions execute successfully; zero due grants were present, so this is not populated live-repair acceptance. Refreshed native Electron displays the published course with three lessons and its staging badge; zero page errors. The unchanged public field guide reloads with its Form embed enabled and zero page errors. Evidence: root output/membership-maintenance-20260906/runtime-receipt.json and output/playwright/membership-maintenance-20260906/native-courses.png.

This does not complete signed-in customer browser expiry, full native restore/fleet acceptance, the other synchronous membership grant/subscription bridge paths, all temporal authorization surfaces, or the original audit/handoff. Renderer acceptance remains 96/136; 40 blocks remain. Website artifact remains d12173751d7ea6a54a540ca4a94a1088c49657a2a43d7a4df6c14d74a3a195cf. No commits or pushes; original checkout and production site database are preserved.

MagicTables App Audits A01–A03 and core/form Notes updated with exact read-back verification; every other cell and full-lifecycle flag preserved.
