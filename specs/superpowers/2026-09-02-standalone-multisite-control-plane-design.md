# ConvexPress Standalone Multisite Control Plane — Design

**Date:** 2026-09-02  
**Status:** Approved by the user's session directives; implementation pending  
**Planning base:** `p5771rm40m4pjw4q4t4x9kdbb18dnm0b` — ORM-APP-ConvexPress Standalone Roadmap  
**Primary runtime:** Standalone Electron admin plus separately deployed ConvexPress websites  
**Interoperability target:** VirtualOverseer and standalone manage the same unchanged website deployments

---

## 1. Product decision

ConvexPress is a standalone website-management product again. It is not merely a VirtualOverseer add-on.

The product has two deliberately separate layers:

1. A standalone **control plane** that authenticates operators, stores organizations and businesses, registers websites and their environments, evaluates operator access, protects deployment credentials, and coordinates operations.
2. A **site data plane** for each individual website environment. Every live, staging, beta, preview, development, or local environment is a separate Convex deployment with its own database, storage, configuration, site-local authentication, backups, and runtime state.

The control plane provides a seamless management surface across many isolated ConvexPress installations. It does not turn those installations into partitions of one database.

The user's statements in the 2026-09-02 session supersede older code, READMEs, VO planning, or MagicTables text that says:

- ConvexPress is only a VO add-on;
- two apps share one authoring database;
- `site_id` partitions multiple websites in one Convex deployment;
- authoring remains centralized in the VO deployment;
- `convexpress_sites` is the site registry;
- environment selection is only a UI hint;
- a publication table pushes selected content from a central authoring database.

## 2. Non-negotiable invariants

### 2.1 Isolation

- One website environment equals one Convex deployment/database/storage boundary.
- Site-local `convexpress_*` rows carry no outer `organization_id`, `business_id`, `website_id`, `environment_id`, `site_id`, VO project, team, tag, or app partition stamps.
- A site deployment contains only its own website's data.
- Switching environment changes the active site client; it never changes a filter in a shared site database.
- A website customer exists only inside the website environment where they registered.
- A website signup can never create an `overseer_users` row.

### 2.2 Identity separation

- Outer operators use the current VO Better Auth pattern.
- Better Auth credential/session/2FA/verification records remain in the Better Auth component.
- `overseer_users.authUserId` is the only link from the component identity to the outer application user.
- Site customers and members use the site-local ConvexPress authentication system.
- An outer operator login is not a site customer login.
- Remote management sessions are short-lived, site-issued operator sessions created through an explicit authority exchange; they do not reuse customer sessions.

### 2.3 Authorization

- Owner has global control-plane reach.
- Admin has global operational reach except owner-only identity/authority controls.
- Business manager, site operator/member, and viewer see only explicitly reachable organizations, businesses, websites, environments, routes, and capabilities.
- A business grant may imply child websites only when its policy explicitly says so.
- A direct website grant can expose one website without exposing sibling websites in the same business.
- Environment and production-operation access are independently constrainable.
- Deny wins over allow at every specificity level.
- Hiding navigation is never the security boundary; every backend read and write re-evaluates authorization.

### 2.4 Secret custody

- Deployment keys, admin keys, provider tokens, management private keys, and backup credentials never enter the renderer.
- Website and instance rows contain metadata and a `connection_id`, never raw credentials.
- Recoverable credentials are encrypted with authenticated encryption in a backend-only connection record.
- Renderer queries return masked metadata only.
- Secrets never appear in URLs, logs, error messages, operation receipts, Playwright traces, screenshots, localStorage, sessionStorage, or build artifacts.

### 2.5 Portability and dual management

- Every site has a stable portable `websiteKey` independent of either manager's Convex document IDs.
- Every environment has a stable portable `instanceKey`.
- The site runtime exposes one versioned management contract.
- Standalone and VO use that same contract and the same site schema/frontend.
- A site may trust both a standalone controller and a VO controller at once.
- Each manager has an independent authority key and grant.
- Revoking one manager's authority does not affect the other manager.
- Customer handoff transfers a complete, normally installable ConvexPress site without modifying the public frontend.

## 3. Runtime topology

```text
Standalone Electron renderer
  |
  | Better Auth session + control-plane Convex subscriptions
  v
Standalone control-plane Convex deployment
  - Better Auth component
  - overseer_users / roles / permissions / grants
  - organizations / businesses / websites / instances
  - encrypted connections
  - operations / backups / receipts / authority metadata
  |
  | signed management assertion; secrets used only in backend actions
  v
Selected site-environment Convex deployment
  - convexpress_* site data only
  - site-local customers and roles
  - management authority public keys and grants
  - management exchange/health/backup/restore contract
  - site-issued short-lived operator session
  ^
  |
VirtualOverseer controller, through the same management contract
```

The Admin renderer holds two client roles:

- a stable control-plane client for outer auth, navigation scope, registry state, operation progress, and audit history;
- a replaceable site client bound to the selected `overseer_websiteInstances` deployment after a successful management-session exchange.

The stable control client must never be torn down during a site switch. The old site client is disposed, its cache is discarded, in-flight mutations are allowed to settle or are explicitly cancelled, a new management session is exchanged, and only then is the new site client exposed to site-admin routes.

## 4. Repository boundaries

### 4.1 Control-plane backend

Create `ConvexPress-Admin/packages/control-plane` as a separate Convex project/package. It owns only outer-control data and functions.

Donor-exact foundations come from the current VO checkout:

- Better Auth component configuration and trigger pattern;
- `overseer_users` field names, validators, and indexes;
- `overseer_organizations` and `overseer_businesses`;
- `overseer_organizationAccess` and `overseer_businessAccess`;
- `overseer_roles`, `overseer_roleAssignments`, `overseer_permissions`, and `overseer_accessPresets`;
- connections schema and encrypted backend-only credential handling;
- organization/business switcher behavior and pending-scope stabilization.

The standalone package may remove dependencies that are exclusively VO ecosystem concerns, but it may not rename or reinterpret the copied authorization tables and fields. Standalone-specific website/environment additions use the rows and fields specified in the standalone MagicTables base.

### 4.2 Site backend

`ConvexPress-Admin/packages/backend` remains the single owner of the site schema and site functions. `ConvexPress-Website` remains consumer-only.

The site backend is updated to the canonical `convexpress_*` table vocabulary from the latest VO refactor while removing VO-only stamps and central-authoring `site_id` assumptions. A generated registry/rename map must drive this conversion so future VO and standalone changes can be reconciled mechanically.

The site package also owns the versioned management-contract endpoint and site-side authority/session records.

### 4.3 Shared contract package

Create `ConvexPress-Admin/packages/site-contract` with no secret-bearing runtime state. It owns:

- protocol/version constants;
- schemas for requests, responses, health, compatibility, backup manifests, receipts, and signed envelopes;
- canonical operation and error codes;
- normalization and fingerprint helpers;
- test vectors used by both controller and site runtime.

The equivalent contract code is consumable by VO without importing the standalone Electron shell.

## 5. Control-plane data model

The implementation must match the standalone MagicTables base. The following are the conceptual groups; the base's exact table/field/index rows are authoritative during implementation.

### 5.1 Donor-exact outer identity and RBAC

- `overseer_users`
- `overseer_roles`
- `overseer_roleAssignments`
- `overseer_permissions`
- `overseer_accessPresets`
- Better Auth component-owned user/session/account/verification/2FA tables

Outer role assignment may target the platform, organization, business, website, or environment. Permissions contain an allow/deny effect and route/capability/action selectors. Evaluators produce one explainable decision containing the winning grant or deny row.

### 5.2 Hierarchy and direct access

- `overseer_organizations`
- `overseer_businesses`
- `overseer_organizationAccess`
- `overseer_businessAccess`
- `overseer_websites`
- `overseer_websiteAccess`
- `overseer_websiteInstances`

`overseer_websites` is a control-plane identity, not a content partition. It adds a portable `websiteKey`.

`overseer_websiteInstances` is the environment entity. It adds a portable `instanceKey`, expanded kinds (`live`, `staging`, `beta`, `preview`, `development`, `local`, `custom`), deployment/site origins, compatibility versions, default designation, health, status, and `connection_id`.

There is no second environment table unless the MagicTables schema explicitly defines one: the instance is the environment.

### 5.3 Connections and secret material

- `overseer_connections`
- connection health/history rows required by the roadmap

Connection rows are organization/business/website/instance attributable but secrets are read only inside Node actions. An instance references a connection; it never duplicates the envelope.

### 5.4 Site authority and lifecycle operations

Roadmap-defined tables cover:

- controller identity and site authority grants;
- health and compatibility observations;
- operations and durable step state;
- backup snapshot metadata and manifests;
- append-only operation receipts;
- handoff/transfer packages and revocation state.

These records use portable keys as well as local Convex IDs so VO and standalone can reconcile the same site independently.

## 6. Site data model and naming

- All site-owned runtime tables use canonical `convexpress_*` names.
- `convexpress_sites` is retired and must not be recreated.
- `overseer_publications` is not part of the standalone authoring architecture.
- Every site environment has its own complete set of `convexpress_*` tables.
- Existing local unprefixed tables are migrated using a deterministic rename manifest and full-snapshot export/import where IDs must be preserved.
- Existing site-local roles, capabilities, users/customers, content, commerce, settings, files, and integrations remain site-local.
- Outer authorization tables never appear in a customer's site database except for the narrowly named site-management authority/session tables defined by the portable contract.

## 7. Management authority protocol

### 7.1 Controller enrollment

1. Controller generates an Ed25519 keypair in a trusted backend/desktop boundary.
2. The private key is wrapped/encrypted and stored as control-plane connection material.
3. The site receives the controller ID, public key, allowed management capabilities, audience (`websiteKey` + `instanceKey`), and validity window through an explicit enrollment ceremony.
4. The site stores only the public key, key ID, grants, status, and audit metadata.
5. Enrollment returns a non-secret receipt to both sides.

### 7.2 Request envelope

Every management request includes:

- contract version;
- controller ID and key ID;
- website and instance portable keys;
- operation code;
- request body hash;
- nonce;
- issued-at and short expiry;
- idempotency key where applicable;
- Ed25519 signature.

The site verifies audience, key status, signature, clock window, nonce replay, capability, target environment, and operation policy before doing work.

### 7.3 Interactive site-admin session

After a signed exchange, the site issues a short-lived, audience-bound operator token. The token contains only a site-side synthetic operator binding, capability snapshot/version, controller ID, and expiry. It is held in memory, never persisted by the renderer, and is invalidated on site switch, sign-out, authority revocation, or capability revision.

Existing site functions resolve that operator through a site-local management binding. Website customers continue to resolve through the site-customer auth path. The two identity sources cannot cross-elevate.

## 8. Scope and switching behavior

The visible selector is hierarchical:

```text
Organization -> Business -> Website -> Environment
```

Rules:

- Every list is server-filtered by effective access.
- Selecting a parent clears any child that is no longer reachable.
- Default/last selections are accepted only after the server revalidates them.
- A pending selection is shown immediately but site-admin routes remain blocked until the new site session is ready.
- The shell always displays environment kind, website title, domain, health, and production risk state.
- Live/production has unmistakable visual identity and cannot be confused with staging.
- Deep links include portable keys or control-plane IDs but never secrets.
- Direct navigation to an unreachable scope returns access denied without briefly rendering stale data.
- Site-client caches are keyed by `instanceKey` and destroyed on switch.

## 9. Provisioning provider boundary

Provisioning is a provider interface, not a conditional fork throughout the UI.

Common operations:

- register or attach an existing site/environment;
- validate deployment and site origins;
- test credentials without exposing them;
- enroll controller authority;
- read contract and schema compatibility;
- deploy/update the ConvexPress engine;
- create a backup snapshot;
- clone an environment;
- promote one environment to another;
- restore a snapshot;
- rotate credentials and authority keys;
- revoke a controller;
- export a handoff package.

Providers:

- `manual`: standalone requires the operator to supply existing deployment/site endpoints and credentials.
- `magicdb`: VO may ask MagicDB to provision infrastructure, then returns the same normalized connection/instance contract.

After provisioning/attachment, every downstream workflow is provider-agnostic.

## 10. Lifecycle safety

### 10.1 Backup

A backup is an immutable full snapshot with manifest, schema/contract/engine versions, source instance identity, checksum/fingerprint, size, creation actor/controller, and verification result. A backup is not a content publication receipt.

### 10.2 Clone

Clone targets a distinct safe environment, creates/validates the destination deployment, imports a full snapshot preserving internal relationships, rotates environment-bound credentials, validates health and compatibility, and records a receipt. It never silently targets live.

### 10.3 Restore

Restore requires:

- explicit access to the target instance;
- target identity revalidation immediately before execution;
- typed/semantic confirmation for live targets;
- automatic pre-restore backup;
- an idempotency key;
- durable step state and safe retry/resume;
- checksum and health verification;
- append-only receipt.

### 10.4 Promotion

Promotion is snapshot-based replacement of a target environment, not a central-database publication. It follows the restore safety gate, creates a target pre-backup, preserves target-specific secrets/domains where policy says so, and verifies public website behavior after completion.

### 10.5 Handoff

Handoff exports the portable site identity, instance registry, verified snapshots, engine/schema/contract versions, public authority material, and an operator runbook. Secrets are either re-entered by the recipient or transferred through an explicit separately encrypted envelope. The previous manager can then be revoked and proof of continued independent operation is required.

## 11. UI architecture

### 11.1 Shell

The existing WordPress-style admin remains the site-management surface, wrapped by a new outer shell containing:

- global organization/business/website/environment selector;
- environment identity and health bar;
- site registry and environment management;
- operators, grants, roles, and access explanations;
- connections and masked credential health;
- operations, backups, receipts, and handoff;
- clear outer-account and selected-site sign-out/session state.

The UI must remain usable in Electron and web mode, responsive down to mobile widths, keyboard operable, and screen-reader labeled.

### 11.2 States

Every route has explicit loading, empty, partial-health, stale, access-denied, offline, incompatible, operation-in-progress, success, and recoverable failure states. No destructive operation relies on a toast as its only status or receipt.

## 12. Migration strategy

1. Preserve the current repository and VO copy.
2. Introduce the control-plane package without changing site data.
3. Copy and verify donor-exact outer authentication/RBAC schemas and behavior.
4. Add organization/business/website/instance registry and access evaluation.
5. Add the site contract and authority exchange around the current unprefixed site backend.
6. Add dual-client shell and switching with disposable site deployments.
7. Generate and test the unprefixed-to-`convexpress_*` mapping.
8. Widen schemas, deploy migration helpers, export/import snapshots preserving IDs, validate, then tighten schemas.
9. Remove `site_id`, VO stamps, central-authoring, old local-admin-as-outer-login, and obsolete publication assumptions.
10. Update Website consumer imports and public runtime configuration without making Website a schema owner.

Every migration has dry-run counts, deterministic mapping, resumption, verification, and documented rollback/recovery.

## 13. Security requirements

- Fail closed for missing production webhook secrets, including Resend.
- Production hosted origins are explicit HTTPS allowlists; localhost and `null` are permitted only in the exact packaged/development modes that need them.
- No `--typecheck disable` deployment path.
- No public unbounded table scans.
- Every new Convex function has `args` and `returns` validators.
- All authorization read paths are index-backed and bounded/paginated.
- Signed management nonces are single-use and short-lived.
- Connection queries never return encrypted envelopes.
- Production operations require explicit production capability in addition to ordinary environment access.
- Rate limiting, idempotency, and audit receipts apply to management and auth endpoints.
- Forged control-plane IDs, portable keys, URLs, request bodies, roles, and operation targets are rejected server-side.

## 14. Verification and evidence

Completion requires all of the following:

- existing unit suites remain green;
- new control-plane, RBAC, protocol, migration, operation, and security tests are green;
- two businesses, multiple websites, and at least two isolated site environments contain distinctive data with zero bleed;
- owner, admin, business manager, site operator/member, viewer, and customer accounts prove allow and deny behavior through UI, direct URL, and forged requests;
- standalone and VO both manage one unchanged site through independent authorities;
- revoking one authority leaves the other working;
- safe test deployments exercise attach, health, compatibility, engine deploy, select, backup, clone, promote, restore, rotate, revoke, interrupted resume, and handoff;
- headed Playwright CLI runs through the skill wrapper and stores screenshots/traces under `output/playwright/`;
- the actual Electron app is launched and controlled as a human would use it;
- the actual public website is visually inspected at desktop and mobile sizes;
- console, network, storage, logs, receipts, traces, screenshots, and packaged artifacts are inspected for secret or cross-scope leakage;
- accessibility and keyboard checks pass;
- a fresh Electron build/package is inspected;
- MagicTables reflects implemented, tested, and visible reality;
- the evidence matrix maps each roadmap requirement to code, tests, visible proof, and verdict.

## 15. MVP exit criteria

ConvexPress can be called standalone multisite MVP only when:

- all architecture invariants above are enforced in code;
- every P0/P1 roadmap path has passing evidence;
- the standalone product manages multiple isolated ConvexPress sites seamlessly;
- a single-site customer installation remains normal and self-contained;
- VO and standalone interoperability is proven against the same unchanged site;
- no MVP placeholder, known P0/P1 security defect, hidden single-site assumption, or unverified destructive lifecycle path remains.

