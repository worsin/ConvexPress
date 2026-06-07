# ConvexPress Admin RBAC Audit

Date: 2026-06-07

## Scope

This pass focused on the first-admin setup/login path, route authorization, role and capability resolution, membership-linked access, admin write surfaces, and provider-cost actions.

Reviewed primary authorization surfaces:

- `packages/backend/convex/helpers/permissions.ts`
- `packages/backend/convex/auth/firstAdmin.ts`
- `packages/backend/convex/membership/mutations.ts`
- `packages/backend/convex/membership/access.ts`
- `packages/backend/convex/themes/mutations.ts`
- `packages/backend/convex/blocks/ai.ts`
- `packages/backend/convex/blocks/queries.ts`
- `apps/web/src/components/auth/AdminGate.tsx`
- `apps/web/src/lib/first-admin-setup.ts`
- `apps/web/src/lib/auth-context.tsx`
- `apps/web/src/lib/route-permission-guard.tsx`
- `apps/web/src/lib/page-access.ts`
- `apps/web/src/routes/_authenticated.tsx`
- `apps/web/src/routes/_authenticated/_admin.tsx`
- `apps/web/src/routes/_authenticated/_admin/roles/**`

## Findings Fixed

### Critical: membership-linked roles could become authorization grants

Membership plan `linkedRole` and `linkedCapabilities` values were resolved through the same helper path used by RBAC checks. A plan configured with an internal/system role or admin capability string could cause a customer account to receive administrative authorization at runtime.

Fixes:

- `resolveUserRole` now only accepts active customer roles from membership links.
- Internal and system base roles are preserved and cannot be overwritten by membership-derived roles.
- Membership-linked authorization capabilities are limited to the conservative built-in customer capability set.
- Known internal/admin/meta capability strings are rejected when creating or updating membership plans.
- The membership plan editor only offers active customer roles.

### High: deprecated theme builder mutations lacked admin authorization

Deprecated theme/template write mutations were still publicly callable Convex mutations. Some had no authentication gate and `activate` only required a logged-in user.

Fix:

- Theme builder write mutations now require `manage_options`.

### High: block AI actions could trigger provider work before edit authorization

Several block AI actions loaded the document and reached provider-generation paths before checking whether the caller could edit the target post or page.

Fixes:

- Added an internal document loader that requires `post.update` or `page.update` before AI generation.
- Wired block generation, regeneration, variants, and block-type swaps through that authorization gate before provider calls.

## Verification

Passed:

- `bun run check-types`
- `bun run check:guardrails`
- `bun run check:smoke`
- `bun run check:blocks`
- `node_modules/.bin/tsc -p packages/backend/convex/tsconfig.json --noEmit`
- `bun test`
- `git diff --check -- ConvexPress-Admin`

Full Admin test result:

- 1,945 tests passed
- 0 tests failed
- 6,678 assertions passed

Targeted first-admin and auth coverage included:

- `packages/backend/convex/auth/__tests__/firstAdmin.test.ts`
- `apps/web/src/lib/first-admin-setup.test.ts`
- `apps/web/src/components/auth/admin-gate-decision.test.ts`
- `apps/web/src/lib/auth-context.test.ts`
- `packages/desktop/electron/wizard.test.js`
- `packages/desktop/electron/launchRoute.test.ts`

Browser smoke:

- Existing Admin dev server was available at `http://127.0.0.1:4105/dashboard`.
- The page rendered the `ConvexPress Admin` sign-in gate with email/username and password fields.
- No browser console errors were observed during the smoke check.

## Residual Limits

- This was a targeted hardening pass, not a full endpoint-by-endpoint audit of every public Convex function in the Admin app.
- A fresh-deployment first-admin browser flow was not executed against the current cloud deployment because the deployment already has an admin account. Automated first-admin setup/login tests passed, and the current browser instance is left ready for manual verification with real credentials or a fresh setup target.
