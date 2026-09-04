# Bug sweep: site setup, Clerk, auth, permissions, control plane (2026-09-04)

Scope: everything involved in standing up a new website in ConvexPress (desktop
setup wizard, Add website / Connect / Install flows, control plane, site RBAC
and API surfaces, local admin auth, Clerk provisioning, website auth), excluding
extension functionality. Verified on the worker fleet (alpha/beta/gamma) plus a
brand-new empty deployment (delta) installed end to end from the desktop.

## Fixed (highlights)

### Setup and install
- Setup wizard accepted only Convex Cloud URLs and `prod:` deploy keys; self-hosted
  backends (admin key, http on private networks, port+1 site URL) are now first class.
- Re-running setup rotated `AUTH_PRIVATE_KEY` (invalidating every session and
  website JWT checks); existing keys are kept. Deploys are typechecked again.
- `auth.config.ts` read `CLERK_JWT_ISSUER_DOMAIN` directly, so a deployment without
  Clerk could not be pushed at all; the read is now try/catch-guarded. (Note for the
  future: the server's `process.env` during auth-config evaluation is not
  enumerable, so `in` / `Object.keys` checks silently drop providers.)
- Site initializer passed env values on the CLI (`-----BEGIN PRIVATE KEY-----` was
  parsed as an option and echoed into the log); values now go through a 0600 temp
  file, PEM fragments are scrubbed, CLI output for env writes is not echoed.
- Site initializer configured 12 of the 16 management capabilities, so the control
  plane's enrollment was rejected ("Authority capability is not supported by this
  site"); the list now mirrors the contract and a test pins it.
- Electron main bundle must not `require` workspace TS packages (it crashed at launch).
- Install progress panel: dialog no longer grows past the viewport (all dialogs cap at
  the viewport and scroll inside), log renders as rows, footer locks while installing.
- Failure messages: control-plane domain errors reach the operator (ConvexError
  wrapper on operator functions/actions); connection enrollment keeps a secret-free
  reason; deploy failures show the CLI's `✖` lines, not spinner noise.

### Auth and sessions
- Desktop against plain-http deployments could not stay signed in (SameSite=Lax
  cookie never sent cross-site); header transport + safeStorage added. Verified:
  site-mode relaunch opens the dashboard without the login form.
- Control-plane browser sessions used `sessionStorage`; now `localStorage`.
- Refresh tokens rotate atomically; presenting a revoked token revokes the family.
- Deactivated accounts record failed-login attempts; `requireAuthPrivateKey` guard;
  `AUTH_ISSUER_URL` required by `auth.config.ts`.
- `_authenticated` grace window before treating a fresh token as invalid.
- First-admin form accepts a pasted setup token when the desktop handoff expired.

### Permissions, profiles, settings, API
- Clerk identities: cannot link to local admin accounts, honor imported customers
  by verified email, invited internal roles fall back to the customer role (the
  permission layer denies internal roles to Clerk identities anyway).
- Self-service: `updateUser` self/last-admin guards, `closeOwnAccount` +
  `deleteOwnAccount` (Clerk user deleted), website change-password dialog.
- Settings: secrets redacted on HTTP/autoload reads, publishable keys are public,
  `importAll` validates and encrypts, section access checks for Clerk identities.
- API keys must expire in the future; webhook test permission uses capabilities;
  `requireMinimumRoleLevel` requires an active account; XFF uses the last hop.

### Control plane
- Website/instance/handoff/RBAC/operator invariants (see CLERK-CONNECTION audit
  addendum): archived websites immutable, force-revoke for unreachable sites,
  stale pending connections superseded, wildcard selectors restricted, owner-only
  operator deactivation, org grants include children.

## Verification
- Typecheck: backend, control plane, desktop (main + preload), admin web, website.
- Tests: admin repo 2274+ (all pass), website 451 (all pass).
- Fleet: backend deployed to alpha/beta/gamma/delta, control plane deployed.
- E2E: delta installed + connected from the desktop from an empty backend; Clerk
  page on alpha all green; control-mode and site-mode relaunch keep the session.
