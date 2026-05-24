# Install And Auth Flow

Status: production target
Last updated: 2026-04-06

## Product Contract

ConvexPress ships as two distinct products with one owned backend:

- `ConvexPress-Admin/`
  - owns Convex schema, functions, deployment, install/bootstrap flow
  - supports Electron desktop usage
  - authenticates administrators with native ConvexPress credentials
- `ConvexPress-Website/`
  - detached frontend deployed separately
  - consumes the admin-owned Convex backend
  - must not own schema/functions/deployments

## Install Modes

### Server Mode

Server mode is the primary install path for a fresh ConvexPress instance.

Expected behavior:

1. User installs the desktop app.
2. Setup wizard collects:
   - backend/Convex URL
   - site name
   - first administrator name
   - first administrator email
   - first administrator password
3. Wizard persists setup config locally.
4. Admin app boots using the stored Convex URL.
5. If pending first-admin credentials exist and no admin account exists yet:
   - `createFirstAdmin` runs once
   - the app logs in using native ConvexPress auth
   - pending credentials are cleared
6. Subsequent launches use native ConvexPress login/session refresh, not Clerk.

### Client Mode

Client mode connects to an already-provisioned ConvexPress server.

Expected behavior:

1. User installs the desktop app.
2. Setup wizard collects:
   - backend/Convex URL
   - ConvexPress username/email
   - ConvexPress password
3. App connects to the existing backend.
4. User authenticates with native ConvexPress credentials.
5. No first-admin creation runs in client mode.

## Admin Auth Contract

Admin auth is native ConvexPress auth.

Required properties:

- no Clerk dependency for admin runtime auth
- Electron install/bootstrap can create the first admin account
- admin login form accepts email or username plus password
- local auth provider owns login, refresh, logout, and current user state
- Convex auth/session state is used to gate admin routes after login

Current code already aligned with this direction:

- native local auth provider in `apps/web/src/lib/local-auth-context.tsx`
- native admin gate in `apps/web/src/components/auth/AdminGate.tsx`
- setup persistence in `packages/desktop/electron/ipc/setup.ts`
- first-admin action in `packages/backend/convex/auth/setup.ts`

## Website Auth Contract

Website auth must not define the admin product contract.

Rules:

- website auth decisions must remain isolated to website user features
- website auth must not block admin access or first-admin bootstrap
- detached website rendering must remain fully dynamic from backend data

Short-term note:

- the website currently still uses Clerk in several places
- that is a website-only migration concern, not the admin auth model

## Dynamic Frontend Contract

The public website is intended to be template-driven and fully data-backed.

Required properties:

- no hard-coded content in production routes
- all public content comes from backend-managed entities
- menus, site identity, theme values, SEO data, and content structure are dynamic
- custom developer-built frontends must be able to consume the same backend contracts cleanly

## Non-Goals

These are not required to satisfy the core install/auth contract:

- making the website own or deploy Convex resources
- using Clerk for administrator login
- coupling detached website templates to hard-coded sample content
