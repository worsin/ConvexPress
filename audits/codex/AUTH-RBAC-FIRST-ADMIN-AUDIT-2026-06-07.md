# Auth/RBAC First-Admin Audit - 2026-06-07

## Summary

- Scope: ConvexPress Admin first-admin setup wizard, local admin login/session flow, AdminGate routing decisions, role/page access guards, and shared authorization helper error behavior.
- Result: Core first-admin setup/login and role guard tests pass. No setup-flow blocker found in the local code path. One hardening class was fixed: client-visible authorization failures no longer reveal exact missing capability/role details in shared helpers and public-crossing action wrappers.
- Remaining: Final end-to-end browser/user verification is still pending operator confirmation in the running app.

## System Map

- First-admin action: `ConvexPress-Admin/packages/backend/convex/auth/setup.ts`
- Local login/refresh/logout: `ConvexPress-Admin/packages/backend/convex/auth/login.ts`, `refresh.ts`, `logout.ts`
- Admin presence query: `ConvexPress-Admin/packages/backend/convex/auth/queries.ts`, `adminPresence.ts`
- Admin gate and wizard helpers: `ConvexPress-Admin/apps/web/src/components/auth/AdminGate.tsx`, `apps/web/src/lib/first-admin-setup.ts`
- Authenticated admin layout: `ConvexPress-Admin/apps/web/src/routes/_authenticated.tsx`, `_authenticated/_admin.tsx`
- RBAC helpers: `ConvexPress-Admin/packages/backend/convex/helpers/permissions.ts`, `roles/*`, `seed/roles.ts`
- Route/page access normalization: `ConvexPress-Admin/apps/web/src/lib/page-access.ts`

## Findings And Fixes

### Fixed: Permission Detail Disclosure

Several authorization paths returned exact missing capabilities, required role levels, or role details to clients. They now return generic `Insufficient permissions` errors and keep diagnostic detail in server logs.

Files changed:

- `ConvexPress-Admin/packages/backend/convex/helpers/permissions.ts`
- `ConvexPress-Admin/packages/backend/convex/helpers/postAuth.ts`
- `ConvexPress-Admin/packages/backend/convex/helpers/revisions.ts`
- `ConvexPress-Admin/packages/backend/convex/sitemaps/helpers/auth.ts`
- `ConvexPress-Admin/packages/backend/convex/api/internals.ts`
- `ConvexPress-Admin/packages/backend/convex/search/actions.ts`
- `ConvexPress-Admin/packages/backend/convex/shipping/internals.ts`

## Checklist Results

| Check | Result | Notes |
|---|---:|---|
| First-admin public availability query is intentional and minimal | PASS | `auth.queries.hasAdmin` exposes only whether a usable local admin exists. |
| First-admin creation blocks duplicate active local admins | PASS | Covered by `firstAdmin.test.ts`; action checks before and after role seed. |
| Non-local deployments require setup token unless explicitly allowed | PASS | Covered by tests and `FIRST_ADMIN_SETUP_SECRET` handling. |
| Setup token is consumed after token-gated setup | PASS | Covered by `authSetupState` tests. |
| Roles are seeded before first administrator assignment | PASS | `createFirstAdmin` runs `seedRoles` and repairs setup page access. |
| Admin login rejects inactive/non-internal/customer-role users | PASS | Login and refresh use role type/status checks. |
| Refresh token rotation revokes old tokens | PASS | Covered by HTTP route test. |
| Logout revokes valid refresh token and clears cookies | PASS | Covered by HTTP route test. |
| AdminGate routes setup/login flow correctly | PASS | Covered by `admin-gate-decision.test.ts` and helper tests. |
| Page access path normalization handles layout-stripped routes | PASS | Covered by `auth-context.test.ts`. |
| Role management prevents self lockout and last-admin demotion | PASS | Covered by role mutation and first-admin tests. |
| Capability and sensitive settings queries require admin capability | PASS | Covered by focused capability/settings tests. |
| Client-visible authorization errors avoid capability/role-level detail | PASS | Hardened in this pass. |

## Verification

- `bun test packages/backend/convex/auth/__tests__/firstAdmin.test.ts packages/backend/convex/auth/__tests__/httpSecurity.test.ts packages/backend/convex/password/__tests__/authorization.test.ts packages/backend/convex/roles/__tests__/mutations.test.ts packages/backend/convex/roles/__tests__/pageAccess.test.ts packages/backend/convex/capabilities/__tests__/queries.test.ts packages/backend/convex/settings/__tests__/queries.test.ts packages/backend/convex/shipping/__tests__/queries.test.ts apps/web/src/lib/first-admin-setup.test.ts apps/web/src/components/auth/admin-gate-decision.test.ts apps/web/src/lib/auth-context.test.ts` - 60 pass
- `bunx tsc -p packages/backend/convex/tsconfig.json --noEmit` - pass
- `bunx tsc --noEmit` in `ConvexPress-Admin/apps/web` - pass
- `bun run check:guardrails` - pass
- `bun run check:smoke` - pass, 467 generated routes and 131 nav targets checked

## Pending Operator Verification

The code and static/runtime-focused tests are ready. The goal should stay open until the first-admin setup/login flow is personally verified in the running app.
