# ConvexPress Standalone Multisite MVP — Master Implementation Plan

> **Execution requirement:** Use `superpowers:test-driven-development` for every feature or fix, `superpowers:systematic-debugging` for every unexpected failure, `convex:convex-expert` for every edit below a `convex/` directory, and `superpowers:verification-before-completion` before any completion claim.

**Goal:** Turn the current single-site ConvexPress repository into a standalone Electron/web control plane that seamlessly manages multiple fully isolated ConvexPress website deployments, while preserving site portability and proving that VirtualOverseer and standalone can manage the same unchanged site.

**Design authority:** `specs/superpowers/2026-09-02-standalone-multisite-control-plane-design.md`

**Planning authority:** MagicTables base `p5771rm40m4pjw4q4t4x9kdbb18dnm0b`. The user's 2026-09-02 session directives override older planning text.

**Current baseline:** 1,952 Admin tests and 364 Website tests pass; 197 Admin and 60 Website Playwright tests are discoverable. The present runtime remains single-site, the compiled Electron output is stale, and no current package/install acceptance exists.

**Tech stack:** Bun/Turborepo, React 19, TanStack Router/Start, Convex, Better Auth component, Clerk or the retained site-local customer auth adapter, Electron, electron-builder, TypeScript, Vitest/Bun test, and Playwright CLI.

---

## 1. Completion policy

- [ ] Work in an isolated Git worktree unless the user explicitly chooses the current checkout.
- [ ] Preserve unrelated user changes and the VO copy.
- [ ] Never deploy, restore, promote, rotate, revoke, or import into a non-disposable deployment until target identity and authorization are proven.
- [ ] Write a failing test before each behavior change.
- [ ] Run focused tests after each change, wave-level tests after each wave, and the full gate before completion.
- [ ] Keep implementation evidence separate from planning claims in MagicTables.
- [ ] No `--typecheck disable`, fake backend, UI-only permission, hidden hardcoded fixture, or unverified completion percentage is acceptable.
- [ ] Do not call the goal complete while any P0/P1 roadmap row, required role, lifecycle operation, proof account, or human-visible gate lacks passing evidence.

## 2. Target package structure

### New packages

- `ConvexPress-Admin/packages/control-plane/`
  - separate Convex project for Better Auth, outer RBAC, hierarchy, connections, operations, backups, and receipts
- `ConvexPress-Admin/packages/site-contract/`
  - portable contract types, validators, signatures, codes, fingerprints, and test vectors
- `ConvexPress-Admin/packages/runtime-clients/`
  - stable control-plane client plus replaceable site client/session lifecycle

### Existing packages retained

- `ConvexPress-Admin/packages/backend/`
  - sole site schema/function owner, renamed to canonical `convexpress_*` runtime tables
- `ConvexPress-Admin/apps/web/`
  - standalone control shell plus existing site-admin surfaces
- `ConvexPress-Admin/packages/desktop/`
  - Electron host, protected session/credential bridge, packaging
- `ConvexPress-Website/apps/web/`
  - site-data consumer only; no schema ownership

### Verification assets

- `ConvexPress-Admin/tests/standalone/`
- `ConvexPress-Admin/scripts/standalone/`
- `output/playwright/`
- `docs/standalone/`
- `docs/evidence/standalone-mvp-evidence-matrix.md`

---

## Wave 0 — Freeze baseline and create executable traceability

### Task 0.1: Record the audit baseline

**Files:**

- Create: `docs/evidence/standalone-mvp-baseline.md`
- Create: `docs/evidence/standalone-mvp-evidence-matrix.md`

- [ ] Add current Git SHA, branch, remote parity, and clean/dirty status.
- [ ] Record the passing unit counts and discovered browser-test counts.
- [ ] Record the three architectural blockers: no hierarchy schema, no active-context flow, and singleton site routing.
- [ ] Record known production risks: unsigned Resend fallback, packaged-origin defaults, stale Electron output, stubbed carrier paths, and no package acceptance.
- [ ] Give every P0/P1 MagicTables requirement one evidence-matrix row with columns: requirement/code/test/Playwright/Electron/public-site/MagicTables/verdict.
- [ ] Mark every unimplemented row `FAIL` or `NOT RUN`; do not use optimistic percentages.

### Task 0.2: Add repository-level baseline commands

**Files:**

- Create: `scripts/standalone/check-baseline.mjs`
- Modify: root or package `package.json` scripts only after confirming the repository convention

- [ ] Write a failing script test that detects a skipped Admin or Website unit suite.
- [ ] Implement one bounded command that runs Admin tests, Website tests, type checks, guardrails, lint/SEO/bundle checks, and Playwright discovery.
- [ ] Make CI call the same command in a later wave.
- [ ] Verify the script reports the existing 2,316 passing tests and 257 discovered browser cases.

---

## Wave 1 — Portable site-management contract

### Task 1.1: Scaffold the contract package

**Files:**

- Create: `ConvexPress-Admin/packages/site-contract/package.json`
- Create: `ConvexPress-Admin/packages/site-contract/tsconfig.json`
- Create: `ConvexPress-Admin/packages/site-contract/src/index.ts`
- Create: `ConvexPress-Admin/packages/site-contract/src/versions.ts`
- Create: `ConvexPress-Admin/packages/site-contract/src/codes.ts`
- Create: `ConvexPress-Admin/packages/site-contract/src/schemas.ts`
- Create: `ConvexPress-Admin/packages/site-contract/src/fingerprints.ts`
- Create: `ConvexPress-Admin/packages/site-contract/src/__tests__/schemas.test.ts`

- [ ] Write failing tests for supported/unsupported protocol, engine, and schema versions.
- [ ] Write failing tests for normalization of `websiteKey`, `instanceKey`, deployment origin, and site origin.
- [ ] Implement version constants and strict validators.
- [ ] Implement redacted, stable error and operation codes.
- [ ] Prove no contract response schema contains deploy/admin credential fields.

### Task 1.2: Implement signed management envelopes

**Files:**

- Create: `ConvexPress-Admin/packages/site-contract/src/envelope.ts`
- Create: `ConvexPress-Admin/packages/site-contract/src/crypto.ts`
- Create: `ConvexPress-Admin/packages/site-contract/src/__tests__/envelope.test.ts`
- Create: `ConvexPress-Admin/packages/site-contract/src/__tests__/test-vectors.ts`

- [ ] Write failing tests for body tampering, wrong audience, expired issue time, nonce replay input, wrong key, revoked key marker, and capability mismatch.
- [ ] Canonically serialize and hash request bodies.
- [ ] Sign and verify Ed25519 envelopes.
- [ ] Keep private-key operations in Node-only exports; browser-safe exports expose validation/types only.
- [ ] Publish fixed cross-package test vectors for standalone and VO.

### Task 1.3: Define lifecycle request/receipt schemas

**Files:**

- Create: `ConvexPress-Admin/packages/site-contract/src/operations.ts`
- Create: `ConvexPress-Admin/packages/site-contract/src/backups.ts`
- Create: `ConvexPress-Admin/packages/site-contract/src/receipts.ts`
- Create: `ConvexPress-Admin/packages/site-contract/src/__tests__/operations.test.ts`

- [ ] Write failing tests for attach, health, compatibility, session exchange, backup, clone, promote, restore, rotate, revoke, resume, and handoff payloads.
- [ ] Require idempotency keys on all mutating lifecycle requests.
- [ ] Require explicit target `websiteKey` and `instanceKey`.
- [ ] Require pre-backup receipt references for restore and promotion completion.
- [ ] Reject secret-bearing receipt values.

**Wave 1 gate:**

- [ ] `bun test packages/site-contract`
- [ ] `bunx tsc -p packages/site-contract/tsconfig.json --noEmit`
- [ ] Test vectors verify in a temporary VO-side harness without changing VO runtime code.

---

## Wave 2 — Standalone outer Better Auth and donor-exact authorization

### Task 2.1: Scaffold a separate control-plane Convex project

**Files:**

- Create: `ConvexPress-Admin/packages/control-plane/package.json`
- Create: `ConvexPress-Admin/packages/control-plane/convex/convex.config.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/schema.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/auth.config.ts`
- Modify: `ConvexPress-Admin/package.json`
- Modify: `ConvexPress-Admin/turbo.json`

- [ ] Write a schema-presence test that initially fails for every required outer table.
- [ ] Install/use the Better Auth component in the new Convex app.
- [ ] Add control-plane scripts for local dev, typecheck, codegen, one-shot push, and tests.
- [ ] Ensure the site backend and control backend have distinct Convex configuration directories and deployment variables.

### Task 2.2: Copy the current VO Better Auth pattern

**Donor files:**

- `/Users/worsin/Development/VirtualOverseer/overseer-app/packages/backend/convex/auth.ts`
- `/Users/worsin/Development/VirtualOverseer/overseer-app/packages/backend/convex/schema/auth.ts`
- `/Users/worsin/Development/VirtualOverseer/overseer-app/packages/backend/convex/helpers/auth.ts`
- `/Users/worsin/Development/VirtualOverseer/overseer-app/packages/backend/convex/authOrigins.ts`
- the minimal first-owner reservation logic required by the copied trigger contract

**Target files:** matching paths under `ConvexPress-Admin/packages/control-plane/convex/`

- [ ] Write failing tests for first-owner bootstrap, later pre-provisioned row claim, duplicate claim, inactive user, and self-signup without a provisioned row.
- [ ] Copy `overseer_users` with exact current field names, validators, and indexes.
- [ ] Keep Better Auth login/session/account/verification/2FA data inside the component.
- [ ] Remove only VO ecosystem dependencies after tests prove identical standalone auth behavior.
- [ ] Add explicit packaged, dev, and hosted-origin policies.
- [ ] Prove hosted production rejects `null` and localhost origins.

### Task 2.3: Copy donor-exact outer RBAC tables

**Donor files:**

- VO `schema/overseerPending.ts` authorization table blocks
- VO access-policy evaluators and current role/permission seeds

**Target files:**

- Create: `ConvexPress-Admin/packages/control-plane/convex/schema/rbac.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/rbac/decision.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/rbac/queries.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/rbac/mutations.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/rbac/__tests__/decision.test.ts`

- [ ] Write failing tests for owner, admin, business manager, site operator/member, viewer, inactive assignment, expired assignment, and explicit deny.
- [ ] Copy `overseer_roles`, `overseer_roleAssignments`, `overseer_permissions`, and `overseer_accessPresets` fields/indexes exactly.
- [ ] Implement one deny-wins decision engine that returns an explanation and winning rule ID.
- [ ] Require the decision engine from every new control-plane public function through typed custom Convex functions.
- [ ] Seed required MVP role/preset definitions without conflating them with site-local customer roles.

**Wave 2 gate:**

- [ ] Control-plane TypeScript passes.
- [ ] Anonymous/local one-shot Convex push succeeds.
- [ ] Better Auth first-owner and claim flows pass through real HTTP endpoints.
- [ ] Role and permission decision tests pass, including forged subject/target IDs.

---

## Wave 3 — Organization, business, website, and environment registry

### Task 3.1: Copy organization/business schema and reachability

**Files:**

- Create: `ConvexPress-Admin/packages/control-plane/convex/schema/platformAccess.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/organizations.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/businesses.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/access/reachability.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/access/__tests__/reachability.test.ts`

- [ ] Write failing tests for organization/business CRUD, unique normalized names/slugs, default-business repair, and inactive parents.
- [ ] Copy `overseer_organizations`, `overseer_businesses`, `overseer_organizationAccess`, and `overseer_businessAccess` exactly from VO.
- [ ] Replace VO-only media/wallpaper dependencies with optional compatible fields or a narrow standalone adapter without renaming donor fields.
- [ ] Use indexes for all reachability reads; no unbounded `.collect()`.

### Task 3.2: Add portable websites and direct website access

**Files:**

- Create: `ConvexPress-Admin/packages/control-plane/convex/schema/websites.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/websites.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/websiteAccess.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/__tests__/websiteAccess.test.ts`

- [ ] Write failing tests proving a direct site grant does not expose sibling sites.
- [ ] Implement `overseer_websites` with roadmap-defined `websiteKey` and validated business/organization ownership.
- [ ] Implement `overseer_websiteAccess` exactly as planned.
- [ ] Reject duplicate portable keys and cross-business reassignment without explicit transfer workflow.
- [ ] Ensure owner/admin full reach is explicit and every other role is grant-bound.

### Task 3.3: Treat website instances as environments

**Files:**

- Create: `ConvexPress-Admin/packages/control-plane/convex/websiteInstances.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/instanceAccess.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/__tests__/websiteInstances.test.ts`

- [ ] Write failing tests for kinds, unique `instanceKey`, one default per website, archived/unhealthy instances, and production capability.
- [ ] Implement roadmap fields and indexes on `overseer_websiteInstances`.
- [ ] Validate deployment/site origins and refuse a control-plane deployment as a site target.
- [ ] Return only masked connection metadata.
- [ ] Add explicit environment-level denial through the permission engine; add a separate access table only if the MagicTables schema requires it.

### Task 3.4: Implement stable active context

**Files:**

- Create/extend: control-plane user profile selection fields per MagicTables
- Create: `ConvexPress-Admin/packages/control-plane/convex/context.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/__tests__/context.test.ts`

- [ ] Write failing tests for parent switch invalidation, unreachable persisted selections, inactive defaults, and concurrent changes.
- [ ] Implement Organization -> Business -> Website -> Environment selection atomically.
- [ ] Revalidate every requested node server-side.
- [ ] Persist only reachable selections and return a complete effective-context snapshot.

**Wave 3 gate:**

- [ ] Fixtures contain two organizations/businesses, multiple sites, sibling-site denial, and multiple environment kinds.
- [ ] Backend tests prove no role sees an unauthorized selector option.
- [ ] Direct function calls with forged IDs are denied.

---

## Wave 4 — Connections, authority enrollment, and site management sessions

### Task 4.1: Encrypted control-plane connections

**Files:**

- Create: `ConvexPress-Admin/packages/control-plane/convex/schema/connections.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/connections/crypto.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/connections/actions.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/connections/queries.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/connections/__tests__/secrets.test.ts`

- [ ] Write failing tests showing secrets never appear in public query results, errors, logs, or receipts.
- [ ] Copy the VO connection envelope shape required by MagicTables.
- [ ] Encrypt with versioned AES-256-GCM envelope keys stored only in deployment environment/secure desktop custody.
- [ ] Implement create/test/rotate/revoke as Node actions plus internal mutations.
- [ ] Add safe target identity validation before saving a connection to an instance.

### Task 4.2: Site-side authority tables and verification

**Files:**

- Create: `ConvexPress-Admin/packages/backend/convex/schema/management.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/management/authority.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/management/replay.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/management/__tests__/authority.test.ts`

- [ ] Write failing tests for valid independent standalone/VO authorities, wrong audience, replay, expiry, tampering, capability denial, rotation, and revocation.
- [ ] Store controller public keys and grants only.
- [ ] Bound nonce records by expiry and indexed cleanup.
- [ ] Ensure revoking standalone leaves VO authority working and vice versa.

### Task 4.3: Management-session exchange

**Files:**

- Create: `ConvexPress-Admin/packages/backend/convex/management/session.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/management/http.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/http.ts`
- Modify: site auth/permission helpers only through tested adapter points
- Create: `ConvexPress-Admin/packages/backend/convex/management/__tests__/session.test.ts`

- [ ] Write failing tests for short expiry, capability revision, switch invalidation, and customer/operator identity confusion.
- [ ] Exchange a signed controller assertion for a site-issued in-memory operator token.
- [ ] Create/reconcile a site-local synthetic operator binding without creating a website customer.
- [ ] Teach permission resolution to accept the management operator and retain the customer path unchanged.
- [ ] Prove site customer roles cannot gain outer or management capabilities.

### Task 4.4: Health and compatibility endpoints

**Files:**

- Create: `ConvexPress-Admin/packages/backend/convex/management/health.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/siteBroker/health.ts`
- Create: integration tests under both packages

- [ ] Write failing tests for unreachable, wrong site key, incompatible contract/schema/engine, degraded storage/auth, and healthy cases.
- [ ] Return versioned non-secret health data.
- [ ] Persist observations and changes in control-plane history.

**Wave 4 gate:**

- [ ] Two real disposable site deployments enroll distinct controller authorities.
- [ ] Control plane obtains site sessions without exposing deploy credentials.
- [ ] Customer signup touches no control-plane user table.
- [ ] Secret-leak static and runtime scans pass.

---

## Wave 5 — Dual-client standalone shell and scoped UI

### Task 5.1: Stable control-plane client

**Files:**

- Create: `ConvexPress-Admin/packages/runtime-clients/src/control-client.ts`
- Create: `ConvexPress-Admin/apps/web/src/control/auth-client.ts`
- Modify: `ConvexPress-Admin/apps/web/src/main.tsx`
- Replace outer use of `useLocalAuth.ts` with Better Auth provider wiring

- [ ] Write failing component tests for cold restore, sign-in, sign-out, token refresh failure, and protected-session retry.
- [ ] Configure Better Auth against the control-plane site origin.
- [ ] Keep control auth stable across site switches.
- [ ] Store Electron auth sessions through protected bridge storage, never browser localStorage.

### Task 5.2: Replaceable site client/session provider

**Files:**

- Create: `ConvexPress-Admin/packages/runtime-clients/src/site-client-manager.ts`
- Create: `ConvexPress-Admin/apps/web/src/control/SiteRuntimeProvider.tsx`
- Create: tests for switching and cache disposal

- [ ] Write failing tests showing the old client's data cannot render after switch.
- [ ] Exchange site session through the control broker.
- [ ] Bind a new `ConvexReactClient` to the selected instance.
- [ ] Dispose old subscriptions/cache/session on switch and sign-out.
- [ ] Block site-admin routes until target identity and session are confirmed.
- [ ] Surface stale, offline, unauthorized, and incompatible states without falling back to another site.

### Task 5.3: Hierarchical switcher and environment identity bar

**Files:**

- Create: `ConvexPress-Admin/apps/web/src/control/components/ScopeSwitcher.tsx`
- Create: `ConvexPress-Admin/apps/web/src/control/components/EnvironmentBar.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/components/layout/AdminBar.tsx`
- Modify: mobile shell components

- [ ] Write failing UI tests for permission-filtered options, keyboard use, parent invalidation, loading, and direct denied deep link.
- [ ] Port the proven VO pending-scope stabilization pattern.
- [ ] Display organization, business, website, environment, health, and live risk state on every site-admin route.
- [ ] Make live unmistakable through text, icon, and color; do not rely on color alone.
- [ ] Verify responsive layout and screen-reader labels.

### Task 5.4: Control-plane management routes

**Files:**

- Create routes under `ConvexPress-Admin/apps/web/src/routes/_authenticated/_control/` for:
  - organizations
  - businesses
  - websites
  - environments
  - operators/access
  - connections
  - operations
  - backups
  - handoff
- Modify navigation/breadcrumb/route-access definitions

- [ ] Write route-access tests before each route group.
- [ ] Implement complete list/detail/create/edit/archive flows.
- [ ] Implement masked connection forms and server-driven health.
- [ ] Implement access explanation UI showing why the current user may or may not act.
- [ ] Add complete empty/loading/error/offline/incompatible states.

**Wave 5 gate:**

- [ ] Role fixtures see exactly the permitted scope and routes.
- [ ] Direct URLs and forged mutations fail for denied roles.
- [ ] Switching between two distinctive deployments shows no stale data.
- [ ] Desktop and mobile UI checks pass.

---

## Wave 6 — Canonical `convexpress_*` site runtime parity

### Task 6.1: Generate a deterministic rename registry

**Donors:**

- latest VO `convexpress-rename-map.json`
- VO generated `addons/convexpress/schema.ts`
- current local modular site schema
- MagicTables AppTables rows

**Files:**

- Create: `scripts/standalone/generate-site-table-registry.mjs`
- Create: `ConvexPress-Admin/packages/backend/convex/siteTableRegistry.generated.ts`
- Create: `scripts/standalone/__tests__/site-table-registry.test.mjs`

- [ ] Write failing parity tests for missing, duplicate, retired, and foreign-owned table mappings.
- [ ] Generate current -> canonical mappings.
- [ ] Assert every deployed site table has exactly one disposition.
- [ ] Assert `convexpress_sites` and `overseer_publications` are retired.
- [ ] Assert no site-local canonical table receives outer stamps or `site_id`.

### Task 6.2: Migrate schema and function references

**Files:**

- Modify: modular schema files under `ConvexPress-Admin/packages/backend/convex/schema/`
- Modify: site functions under `ConvexPress-Admin/packages/backend/convex/`
- Regenerate: `_generated/`
- Modify: Website generated backend package/imports as required

- [ ] For each bounded module, write a failing registry/static test first.
- [ ] Rename tables and `v.id(...)` references mechanically from the generated registry.
- [ ] Preserve all existing exports.
- [ ] Add required return validators as touched, prioritizing auth, management, settings, users/customers, content, commerce, and secrets.
- [ ] Replace unbounded/scanned reads encountered on security-critical paths with indexes and pagination.
- [ ] Run focused tests after each module group.

### Task 6.3: Data migration and rollback

**Files:**

- Create: `ConvexPress-Admin/packages/backend/convex/migrations/siteTableRename.ts`
- Create: `scripts/standalone/export-site-snapshot.mjs`
- Create: `scripts/standalone/import-site-snapshot.mjs`
- Create: `scripts/standalone/verify-site-snapshot.mjs`
- Create: `docs/standalone/site-schema-migration.md`

- [ ] Write dry-run fixture tests with cross-table IDs and storage references.
- [ ] Use widen -> migrate/import -> verify -> tighten evolution.
- [ ] Use full snapshots when preserving Convex IDs/foreign keys is required.
- [ ] Compare per-table counts, representative content, user/customer identity, settings, media references, and commerce relations.
- [ ] Document rollback to the verified pre-migration snapshot.

### Task 6.4: Remove obsolete assumptions

**Files:**

- Modify: root/Admin/Website READMEs
- Modify: auth and setup docs/code
- Remove only after migration proof: central authoring/site partition logic

- [ ] Add a static failing test for `site_id`/VO stamps in canonical site schemas.
- [ ] Remove obsolete local-admin-as-outer-login behavior while retaining site-local customer/member auth.
- [ ] Remove `convexpress_sites`, central publication, and single global deployment assumptions.
- [ ] Update all docs to the control-plane/site-data-plane model.

**Wave 6 gate:**

- [ ] Full Admin and Website unit suites pass.
- [ ] Convex typecheck and one-shot push pass.
- [ ] Migrated fixture snapshots preserve counts/relationships.
- [ ] Website renders unchanged from the renamed site schema.
- [ ] Table-parity report matches MagicTables.

---

## Wave 7 — Durable lifecycle operations and provider boundary

### Task 7.1: Durable operation engine

**Files:**

- Create: control-plane operation schema/functions per MagicTables
- Use: `@convex-dev/workflow` for resumable multi-step workflows
- Create: `ConvexPress-Admin/packages/control-plane/convex/operations/__tests__/stateMachine.test.ts`

- [ ] Write failing transition tests for queued/running/waiting/succeeded/failed/cancelled/interrupted/resuming.
- [ ] Enforce idempotency and one active destructive operation per target.
- [ ] Persist step checkpoints and sanitized errors.
- [ ] Emit append-only receipts.

### Task 7.2: Manual and MagicDB provisioning providers

**Files:**

- Create: `ConvexPress-Admin/packages/control-plane/convex/providers/types.ts`
- Create: `ConvexPress-Admin/packages/control-plane/convex/providers/manual.ts`
- Create: `ConvexPress-Admin/packages/site-contract/src/providers.ts`
- Add a VO adapter/harness without changing the site contract

- [ ] Write provider contract tests first.
- [ ] Manual provider accepts supplied endpoints/credentials and validates them.
- [ ] MagicDB adapter normalizes provisioned infrastructure into the identical instance/connection result.
- [ ] Downstream workflows contain no provider-specific branching.

### Task 7.3: Backup and verification

- [ ] Write failing tests for immutable snapshot metadata, checksum mismatch, missing manifest, wrong source, and secret redaction.
- [ ] Export a full site snapshot.
- [ ] Verify manifest, checksum, table counts, storage inventory, and site identity.
- [ ] Persist backup metadata without embedding the backup secret or plaintext credential.

### Task 7.4: Clone

- [ ] Write failing tests for live default target, source=target, wrong website, incompatible destination, partial import, and resume.
- [ ] Create/attach destination through provider.
- [ ] Import source snapshot and rotate environment-bound secrets.
- [ ] Verify distinctive data, health, and public website behavior.

### Task 7.5: Restore

- [ ] Write failing tests for missing confirmation, missing production capability, stale target identity, absent pre-backup, replay, and interruption.
- [ ] Revalidate target immediately before execution.
- [ ] Create and verify pre-restore backup.
- [ ] Restore, verify, and receipt the operation.
- [ ] Resume safely from every checkpoint tested.

### Task 7.6: Promote

- [ ] Write failing tests for unsafe live target, missing pre-backup, domain/config policy violation, and cancellation.
- [ ] Implement snapshot-based promotion with explicit source and target.
- [ ] Preserve target-specific secrets/domains only by declared policy.
- [ ] Verify admin and public website after completion.

### Task 7.7: Rotate/revoke/handoff

- [ ] Write failing tests for key overlap windows, revoked-key use, one-controller revocation, and incomplete handoff package.
- [ ] Rotate connection and management authority keys without downtime.
- [ ] Revoke one controller and prove the other remains valid.
- [ ] Export a verified, secret-safe handoff package and recovery runbook.

**Wave 7 gate:**

- [ ] All lifecycle paths run on safe disposable deployments.
- [ ] Cancel, confirm, retry, resume, and error UI states are visible.
- [ ] Every destructive operation has a verified pre-backup and receipt.

---

## Wave 8 — Public Website runtime and customer isolation

### Task 8.1: Keep Website consumer-only

**Files:**

- Modify: `ConvexPress-Website/apps/web/src/router.tsx`
- Modify: `ConvexPress-Website/apps/web/src/start.ts`
- Modify: server-side sitemap/robots/feed clients
- Modify: generated backend API package/imports

- [ ] Write failing tests for per-deployment runtime configuration and missing/wrong site identity.
- [ ] Bind each Website build/runtime to exactly one site deployment.
- [ ] Keep schema/code ownership in Admin backend.
- [ ] Ensure crawler/API clients use that same deployment.

### Task 8.2: Customer auth boundary

- [ ] Write integration tests proving customer signup writes only site-local customer/auth tables.
- [ ] Prove customer sessions cannot call management/operator endpoints.
- [ ] Prove management operators do not appear as customer accounts.
- [ ] Verify login/register/reset/member-dashboard flows on two isolated sites.

### Task 8.3: Distinctive-data isolation fixture

- [ ] Seed Business A / Site A live+staging and Business B / Site B live with unmistakably different titles, posts, products, customers, and theme accents.
- [ ] Assert every admin query and public page resolves only its selected deployment.
- [ ] Search network/storage/DOM for sibling-site markers after every switch.

---

## Wave 9 — Security and production hardening

### Task 9.1: Fail closed for webhook signatures

**Files:**

- Modify: `ConvexPress-Admin/packages/backend/convex/http/resendWebhook.ts`
- Add tests for production missing-secret and invalid-signature cases

- [ ] Write failing tests showing unsigned callbacks are accepted today.
- [ ] Reject missing/invalid signatures in production.
- [ ] Preserve an explicit safe local-test mode only when configured.

### Task 9.2: Origin policy by runtime mode

**Files:**

- Modify site/control auth origin policy modules
- Modify: desktop setup defaults/validation

- [ ] Write failing tests for hosted `null`, hosted localhost, packaged `file://`, allowed HTTPS, and unlisted HTTPS.
- [ ] Permit each origin class only in its declared runtime mode.
- [ ] Remove production-default `AUTH_ALLOW_NULL_ORIGIN=true`.

### Task 9.3: Public surface and query hardening

- [ ] Inventory all public site/control functions.
- [ ] Add return validators to every new function and all touched security-sensitive legacy functions.
- [ ] Fix `Date.now()` reactivity input in analytics.
- [ ] Rate-limit/dedupe or move public redirect-hit telemetry to a trusted path.
- [ ] Remove unbounded collections on reachable security-critical paths.
- [ ] Run adversarial secret, RBAC, target, replay, and destructive-operation tests.

### Task 9.4: CI and package gates

**Files:**

- Modify Admin/Website/backend workflows
- Add control-plane/site-contract/Electron acceptance workflows where practical

- [ ] Run all 2,316+ unit tests in CI.
- [ ] Run control/site contract and RBAC integration suites.
- [ ] Run browser suites against seeded disposable deployments.
- [ ] Build Electron and create unsigned test artifacts on supported CI OSes.
- [ ] Fail CI on missing generated registry parity or MagicTables evidence drift.

---

## Wave 10 — Human-equivalent Playwright, Electron, and public-site acceptance

### Task 10.1: Playwright CLI setup and artifact hygiene

**Required tool:** `/Users/worsin/.codex/skills/playwright/scripts/playwright_cli.sh`

- [ ] Confirm `npx` is available.
- [ ] Set `PWCLI` to the skill wrapper.
- [ ] Use CLI-first headed browser control, not only `@playwright/test`.
- [ ] Open page, snapshot, act using fresh refs, and re-snapshot after navigation/modal/tab/state changes.
- [ ] Store screenshots and traces only under `output/playwright/`.
- [ ] Redact or delete any artifact that unexpectedly captures a secret before it can be retained as evidence.

### Task 10.2: Role acceptance matrix

For each owner, admin, business-manager, site-operator/member, viewer, and customer account:

- [ ] Sign in through the real UI.
- [ ] Snapshot the available organizations/businesses/sites/environments.
- [ ] Navigate every permitted control route.
- [ ] Attempt denied direct URLs.
- [ ] Attempt forged backend requests in an approved test harness.
- [ ] Prove hidden UI and backend denial both match the policy explanation.
- [ ] Save headed screenshots/traces and update the evidence matrix.

### Task 10.3: Isolation and switch acceptance

- [ ] Switch Business A Site A live -> staging -> Business B Site B live.
- [ ] Verify visible title/content/products/customers/theme are distinctive.
- [ ] Verify old client subscriptions stop and no stale row flashes.
- [ ] Inspect console, network, DOM, localStorage, sessionStorage, IndexedDB, and Electron protected storage boundaries.
- [ ] Prove no sibling marker or credential leaks.

### Task 10.4: Lifecycle acceptance

- [ ] Attach/register a site.
- [ ] Run healthy and failing compatibility checks.
- [ ] Deploy/update engine on a safe environment.
- [ ] Backup and verify.
- [ ] Clone and inspect the cloned public site.
- [ ] Cancel a destructive dialog and prove no operation starts.
- [ ] Confirm promote/restore on safe targets and inspect pre-backup/receipt.
- [ ] Interrupt a workflow, restart, and prove safe resume.
- [ ] Rotate authority/connection credentials.
- [ ] Revoke standalone while VO remains working; restore/re-enroll as needed.
- [ ] Export and validate handoff.

### Task 10.5: Actual Electron acceptance

- [ ] Build current renderer and Electron main/preload code.
- [ ] Launch the actual desktop app.
- [ ] Complete/setup or attach to the disposable control plane.
- [ ] Sign in, restore session, switch scopes, open management and site-admin routes.
- [ ] Resize narrow/wide, use keyboard-only navigation, open/close dialogs, exercise progress and error states.
- [ ] Inspect DevTools console/network/storage and OS-visible app behavior.
- [ ] Build/package a fresh test artifact and launch the packaged result.
- [ ] Capture visible evidence; a running process alone is not a pass.

### Task 10.6: Actual public Website acceptance

- [ ] Open each real disposable Website deployment at desktop and mobile sizes.
- [ ] Inspect anonymous marketing/content/commerce behavior.
- [ ] Register and sign in as site-local customers.
- [ ] Verify failure and access-denied states.
- [ ] Run accessibility/keyboard checks and inspect console/network.
- [ ] Prove the frontend is unchanged whether standalone or VO is the active manager.

---

## Wave 11 — Documentation, MagicTables truth, and final acceptance

### Task 11.1: Operator/customer documentation

**Files:**

- Create: `docs/standalone/architecture.md`
- Create: `docs/standalone/install-control-plane.md`
- Create: `docs/standalone/attach-site.md`
- Create: `docs/standalone/environments.md`
- Create: `docs/standalone/backup-restore-promotion.md`
- Create: `docs/standalone/authority-rotation-revocation.md`
- Create: `docs/standalone/handoff.md`
- Create: `docs/standalone/recovery.md`
- Rewrite root/Admin/Website READMEs

- [ ] Remove heavy-alpha/single-database/old-auth statements only when evidence supports the replacement.
- [ ] Document which credentials are supplied in standalone and automatically provisioned in VO.
- [ ] Document safe recovery and rollback with exact verification commands.

### Task 11.2: Sync MagicTables to reality

- [ ] Update only after code and tests exist.
- [ ] Set exact source files, runtime names, scopes, routes, actions, tests, and completion evidence.
- [ ] Preserve the session-authoritative notes.
- [ ] Mark old centralized/site-id/publication assumptions retired/deprecated.
- [ ] Run base audit, relationship audit, descriptions audit, and runtime-code parity.
- [ ] Export a final snapshot of the standalone base for evidence.

### Task 11.3: Final gate

- [ ] Full type/lint/static/unit/integration/E2E/Convex/build/package/security/RBAC suite passes.
- [ ] Real headed Playwright evidence passes.
- [ ] Real Electron visible acceptance passes.
- [ ] Real public site desktop/mobile acceptance passes.
- [ ] Two businesses/multiple sites/two environments prove zero bleed.
- [ ] All required roles prove allow/deny behavior.
- [ ] Full lifecycle and interruption recovery pass on safe deployments.
- [ ] Standalone + VO same-site authority test passes, including one-side revocation.
- [ ] Artifact/console/network/storage secret scan passes.
- [ ] Evidence matrix has no P0/P1 `FAIL`, `NOT RUN`, placeholder, or missing proof.
- [ ] MagicTables matches implementation.
- [ ] Fresh `git status`, diff review, and verification logs are captured.

Only after all boxes in the final gate have current evidence may the goal be marked complete.

