# ConvexPress Standalone MVP Remediation Plan

> Status: approved for implementation by the user on 2026-09-03. Do not commit or push without a separate request.

## Outcome

Make the standalone Electron controller safely manage three isolated ConvexPress site deployments on the Linux Worker, with the same hierarchy, outer authorization, site contract, and site-local frontend/data behavior that Virtual Overseer uses. Acceptance must leave no ConvexPress databases or orphaned runtime processes on the Mac.

## Non-negotiable boundaries

- Keep every site's Convex database, auth, production key, staging state, and backups isolated.
- Keep outer operator authentication/RBAC separate from website-customer authentication.
- Keep the existing Virtual Overseer copy intact.
- Run database containers only on `worsin-worker`; never recreate local Convex databases.
- Exercise UI only through Electron Playwright. Do not use Chrome or standalone-browser Playwright.
- Own and deterministically tear down every process started by acceptance.
- Do not write production or `prod:affable-herring-441`.

## Work order

### 1. Secure outer invitation claims

- Add a one-time, expiring operator-invitation secret stored only as a hash in the control plane.
- Return the plaintext secret only from the provisioning mutation that creates/rotates it.
- Require the secret in the claim UI and Better Auth sign-up request.
- Validate and consume the secret before Better Auth creates an operator login.
- Require the resulting outer identity to be email-verified before sign-in; do not permit email-only claiming.
- Cover valid, wrong, expired, reused, inactive, duplicate, and first-owner paths with tests.

### 2. Make site switching fail closed

- Treat a target/snapshot instance-key mismatch as switching during render, before effects run.
- Never render children or reuse a prior Convex client during that mismatch.
- Remount the site provider/cache/auth boundary by instance key.
- Cover A-to-B, B-to-A, null target, errors, and retries with regression tests.

### 3. Parameterize the remote fleet

- Centralize control-plane and site endpoint parsing in one validated test-fleet manifest.
- Reject accidental localhost database endpoints unless an explicit local override is set.
- Update bootstrap, fixture registration, and Electron acceptance scripts to consume the manifest.
- Map Worker site deployments to at least one live/staging pair plus a second website.

### 4. Enforce process ownership and teardown

- Add one shared lifecycle helper that terminates Electron/dev process groups, waits, escalates only when needed, and verifies exit.
- Add preflight/postflight checks for repo-owned processes, local Convex ports/databases, and temporary Electron profiles.
- Make every acceptance entry point use `try/finally` and the shared helper.
- Add a regression test with a child/grandchild process and listening port.

### 5. Bootstrap and deploy sequentially on Linux Worker

- Mirror only required source; exclude secrets, local Convex state, artifacts, and dependencies.
- Push the control-plane schema first, then site schemas one at a time.
- Bootstrap the owner, organization/business/site/environment hierarchy, encrypted connections, and authority records.
- Keep admin keys and setup secrets on the Worker; never serialize them into UI state or evidence.

### 6. Electron-only acceptance

- Capture Mac/Worker memory and process baselines.
- Run one tracked local Vite renderer and one tracked Electron instance at a time.
- Prove sign-in/invitation claim, role filtering/denials, live/staging switching, second-site switching, distinctive data/no bleed, connection health, backup/restore/promotion, handoff, and revocation behavior.
- Exercise packaged Electron and public-site behavior through Electron surfaces.
- Capture screenshots and machine-readable results without secrets.
- After every run, prove zero repo-owned processes, zero local Convex databases/listeners, and stable Worker container memory.

### 7. Final gates and evidence

- Run targeted regressions, full unit tests, type checks, builds, package checks, and `git diff --check`.
- Re-run security/RBAC checks and inspect artifacts/logs/storage for credentials.
- Replace stale localhost claims in the evidence matrix with current Worker/Electron proof.
- Report MVP only when all P0/P1 findings are closed and teardown assertions pass.
