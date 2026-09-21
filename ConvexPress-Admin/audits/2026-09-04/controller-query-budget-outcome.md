# Controller query budget repair

Implemented locally; parent owns deployment and native acceptance. No server capacity, authentication policy, or provider configuration changes.

## Proven amplification

- `helpers/auth.ts` calls Better Auth `safeGetAuthUser`; installed `@convex-dev/better-auth/src/client/create-client.ts` performs two sequential component `runQuery` calls (session validity, then user) for each authenticated outer query. These checks remain intact.
- `fleet/queries.get` used five independent authorization resolutions for a live environment (read, backup, live operation, connection management, live operation), loading identical grants and role definitions repeatedly. The actual-handler regression failed with ten role-assignment queries against an expected two.
- `createStoredAccessResolver` shared grant reads but re-read each target hierarchy for every requested capability. A 32-check batch now reads each of its four hierarchy documents once, while still rejecting different caller hierarchy stamps in that same batch and a disabled parent on the next request.
- `context.setActive` traversed and authorized reachable sites twice although its only write changes the caller's selection profile. It now reuses the validated reachability result for the response, while rereading the written profile. The actual handler performs one grant pass.
- The shell separately subscribed to `operators.current` although `context.get` had already authenticated that operator. Context now includes the same allowlisted self-operator DTO, removing this redundant subscription and its two component authentication calls.
- Opening LifecyclePanel started operations, backups, maintenance policy, and maintenance history together, followed by operation detail. The actual rendered component test reproduced the cold burst before the readiness repair.

The parent's observed native timeout/concurrent-request logs and normal Docker resource use are consistent with this amplification. Exact nested-query worker scheduling as the immediate cause of the server timeout is an inference, not something the local tests prove.

## Changes

- Request-local hierarchy document cache; caller-provided stamps are validated on every check. Nothing is retained across requests or writes.
- Direct-grant role definitions load only for role slugs actually needed by the stored grants. Assigned roles, explicit deny evaluation, inactive hierarchy checks, and fail-closed rule-count limits remain effective.
- Maintenance query shares one resolver across capability checks and computes denied management capability without swallowing arbitrary infrastructure errors.
- Context supplies the authenticated operator and selection mutations perform one reachability pass.
- Shell connection data resolves before its batched capability subscription starts.
- Lifecycle subscriptions progress from operations to backups to selected operation detail (when present), then maintenance and maintenance history. Established subscriptions remain active during subsequent pagination. Closing the panel releases them. There are no timers or artificial delays.

## Evidence

- Failing actual handler baseline: `/tmp/controller-budget-red.log` (ten role-assignment reads instead of two).
- Failing actual render baseline: `/tmp/controller-ui-red.log` (multiple active queries on the first cold render).
- Focused authorization, context, and fleet regressions: `/tmp/controller-regressions2.log`: 41 passed, 122 assertions.
- Full CP suite: `/tmp/controller-cp-full-tests.log`: 214 passed, 960 assertions.
- Real rendered panel sequencing regression: `/tmp/controller-ui-isolated.log`: passed. The mocked hook fixture runs in its own Bun process, preserving other component tests.
- CP and Admin typechecks: `/tmp/controller-cp-final-types.log`, `/tmp/controller-web-final-types.log`, both exit 0.
- Scoped `git diff --check`: passed.

## Rollout and remaining acceptance

Deploy CP before refreshing the Admin/native UI because context responses now include the operator DTO. Existing clients can ignore that added field.

Parent to verify an actual cold native login/context load, open operations through policy/history, switch environments, paginate, and mutate a maintenance policy to observe reactive updates. Local tests prove bounded repeated authorization and cold-render sequencing; they do not substitute for this provider/runtime proof. No authentication checks were skipped, no query was made nonreactive, and no server limit was increased.

## Native retest: first repair insufficient

Parent deployed CP and reloaded the exact native application. The Aster dashboard rendered after approximately 17 seconds without errors, and Sites rendered environment cards. Opening Staging Operations and backups still crashed the outer context query (`context:get`, request `1546310d2521d5d6`). This repair therefore reduces proven amplification but does **not** establish end-to-end remediation.

Parent's Docker logs at 05:24:14 UTC show operations:get, fleet:get, rbac:checkManyAccess, and context:get spending about 14.95–14.98 seconds paused at `database_syscall(1.0/runUdf)` before SystemTimeout and queue expiry. Parent verified `MAX_ISOLATE_WORKERS=8` and `APPLICATION_MAX_CONCURRENT_QUERIES=8`, with mutation concurrency 8 and V8 action concurrency 4.

Upstream source review (current main; exact running image revision still needs matching) supports worker starvation: [execute_nested_udf](https://github.com/get-convex/convex-backend/blob/main/crates/isolate/src/client.rs#L1044) submits an internal request and awaits its reply. The [scheduler](https://github.com/get-convex/convex-backend/blob/main/crates/isolate/src/client.rs#L1250) prioritizes internal requests because they block workers, but does not poll the request stream when all workers are occupied. The [knob definitions](https://github.com/get-convex/convex-backend/blob/main/crates/common/src/knobs.rs) distinguish worker pool capacity from admitted application query concurrency (upstream defaults 300 and 16 respectively).

A pool equal to outer query admission can therefore leave no worker to execute a nested component call. Parent is testing this configuration hypothesis with a controlled worker-headroom comparison while retaining the application query limit. No broader query API rewrite or authentication bypass has been introduced. Existing caches remain useful independent of that runtime configuration finding.


## Decisive controlled comparison and guard

Root changed only control-plane `MAX_ISOLATE_WORKERS` from 8 to 32 and recreated that exact container; admitted query/mutation limits remained 8 and memory limit remained 3 GiB. Native cold reload → Sites → Staging Operations then loaded receipts, backups, history, and maintenance in 949 ms with zero console errors. A maintenance interval change from 5 to 6 persisted revision 2, then was restored to 5. Root reported CP usage 565 MiB / 3 GiB and 0% CPU, with no SystemTimeout, restart, or queue-expiry logs after restart. Root preserved the original compose in `docker-compose.before-cp-worker-headroom-20260905.yml`. Production panel acceptance was still in progress at this update.

The running image revision was verified as `abdd9b30f89c0e7c18c4213b99cd10e4bad33f8c`, digest `1738f1673f8d63161043a7859710d2301b1e9d6271e06afbb7af31594ea3a58f`. Its exact source confirms nested UDFs await another isolate (client.rs1084–1109), and saturated workers process only queue expirations (1242–1255). Unlike current main, this revision has no separate priority queue for nested requests. Worker starvation from the constrained configuration is now supported by both exact source and the controlled native comparison. Query caching and cold sequencing remain useful efficiency improvements, but were insufficient alone.

A read-only stdin doctor and six tests now live at `scripts/standalone/check-control-capacity.mjs`, `scripts/standalone/lib/control-capacity.mjs`, and `scripts/standalone/lib/control-capacity.test.mjs`. It rejects the observed unsafe pool, validates numeric knobs, handles only verified image defaults, and never echoes unrelated input. Passing establishes necessary headroom only; measured nested workload/memory remains required. No Docker configuration or site was modified by this agent. Exact source links and invocation are in `scripts/standalone/CONTROL-CAPACITY.md`. Test output: `/tmp/capacity-doctor-final.log`.
