# ConvexPress Admin Audit Remediation Plan

Date: 2026-04-30
Scope: `ConvexPress-Admin/` browser admin, Convex backend, and Electron desktop shell

## Objective

Close every item from the current admin audit and leave the admin app in a state where:

- browser login and boot are stable
- Electron boots from a single canonical dev entrypoint
- `check-types` is green
- dev-only backend escape hatches are removed or hard-gated
- the admin route surface has automated smoke coverage
- the route/menu/pop-up audit can run without duplicate app instances

## Ground Rules

- Do not launch parallel copies of the same app.
- Reuse the canonical web port and clear stale listeners before relaunch.
- Treat the admin app as the Convex owner. Do not push schema or function work into `ConvexPress-Website/`.
- Keep the work partitioned by system boundary: web admin, backend, desktop, test infrastructure.
- Do not rely on manual route checking alone. Every audit pass must leave behind automation.

## Workstreams

### 1. Baseline and Tooling Stabilization

Goal:
- make local development deterministic before touching more feature code

Tasks:
- repair broken workspace scripts, especially the native desktop entrypoint
- define one canonical launch path for browser and one for Electron
- ensure stale processes and port conflicts are cleared before relaunch
- confirm one backend, one web server, and one Electron app at a time
- remove generated artifacts from tracked runtime paths where they create ambiguity

Acceptance:
- `bun run dev:web` works from the admin repo
- `bun run dev:native` resolves a real workspace or is replaced with a correct desktop target
- relaunching does not create duplicate instances or port drift

### 2. Type and Compile Baseline

Goal:
- restore a trustworthy compile signal

Tasks:
- fix web route null-safety issues in the currently failing admin edit/detail screens
- resolve `never` inference failures in subscription pricing-card admin UI
- remove stale `@ts-expect-error` directives that no longer suppress a real issue
- reduce or isolate Convex deep-instantiation hotspots so `check-types` passes
- prioritize shared validator/query layers before leaf routes so type debt stops cascading

Priority files:
- `apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/coupons/$couponId/edit.tsx`
- `apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/offers/$offerId/edit.tsx`
- `apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/pricing-cards.tsx`
- `apps/web/src/routes/_authenticated/_admin/commerce/subscriptions/templates/$templateId/edit.tsx`
- `apps/web/src/routes/_authenticated/_admin/membership/grants/$grantId.tsx`
- `packages/backend/convex/auditLogs/*`
- `packages/backend/convex/emails/*`
- `packages/backend/convex/notifications/*`
- `packages/backend/convex/shipping/*`
- `packages/backend/convex/registration/*`

Acceptance:
- `cd ConvexPress-Admin && bun run check-types` exits cleanly

### 3. Backend Hardening

Goal:
- remove obvious production-risk escape hatches and reduce unsafe internals

Tasks:
- remove, relocate, or hard-gate `_devEnable.ts`, `_devPurge.ts`, and `_devCounts.ts`
- audit internal actions/queries that bypass normal auth assumptions
- reduce `any` in email, media, notification, and shipping internals where it affects control flow or persistence
- keep temporary compatibility shims isolated and documented if full removal is too risky

Acceptance:
- no production-shaped backend path depends on no-auth debug helpers
- destructive dev helpers are no longer loose in the backend runtime path

### 4. Desktop Runtime Cleanup

Goal:
- make Electron boot and packaging paths internally consistent

Tasks:
- align preload build output naming with the path expected by the main process
- remove stale dependencies from the desktop package after the store migration
- verify the desktop bootstrap path uses the same web URL and single-instance rules as browser dev
- add a desktop boot smoke command to catch regressions early

Acceptance:
- Electron boots from the canonical dev script without special shell state
- desktop package scripts and runtime file references agree on actual artifacts

### 5. Automated Coverage for the Admin Surface

Goal:
- stop relying on ad hoc manual clicking for route stability

Tasks:
- build a route inventory from the TanStack route tree and nav config
- add browser smoke coverage for auth, top-level navigation, and representative list/detail/edit flows
- add Electron smoke coverage for boot, shell chrome, and route loading
- capture console errors and failed network requests as test failures
- keep tests single-instance aware so they do not spawn competing dev servers

Acceptance:
- at least one automated smoke path exists for every major admin section
- browser and Electron smoke suites fail on route crashes or console errors

### 6. Full Manual Audit Pass

Goal:
- verify the actual app behavior beyond compile and smoke checks

Tasks:
- walk every top-level menu, nested nav group, route, and modal/pop-up
- inspect Chrome DevTools console/runtime errors during each pass
- fix broken links, loaders, panels, and edit flows found during the audit
- rerun the relevant automated checks after each repair cluster

Acceptance:
- all reachable admin routes load without runtime errors in the browser
- all intended desktop routes load through the Electron shell

### 7. CI and Release Hygiene

Goal:
- keep the repo from drifting back into the same state

Tasks:
- add or tighten CI gates for `check-types`, backend tests, browser smoke, and desktop boot smoke
- stop generated runtime output from being treated like source
- document the canonical dev commands and single-instance rules
- review the dirty worktree for accidental debug files before finalizing

Acceptance:
- the core validation commands are automated
- the release path does not depend on manually noticing debug artifacts

## Execution Order

1. Baseline and tooling stabilization
2. Type and compile baseline
3. Backend hardening
4. Desktop runtime cleanup
5. Automated coverage
6. Full manual audit pass
7. CI and release hygiene

## Reporting Format

The final report will include:

- what was fixed
- what commands verified the result
- remaining risks, if any
- any items that required scope tradeoffs and why
