# ConvexPress Admin RBAC Audit

Date: 2026-06-07

## Scope

This pass focused on the first-admin setup/login path, route authorization, role and capability resolution, membership-linked access, admin write surfaces, and provider-cost actions.

Reviewed primary authorization surfaces:

- `packages/backend/convex/helpers/permissions.ts`
- `packages/backend/convex/auth/setup.ts`
- `packages/backend/convex/auth/internals.ts`
- `packages/backend/convex/auth/login.ts`
- `packages/backend/convex/auth/refresh.ts`
- `packages/backend/convex/auth/logout.ts`
- `packages/backend/convex/auth/jwks.ts`
- `packages/backend/convex/membership/mutations.ts`
- `packages/backend/convex/membership/access.ts`
- `packages/backend/convex/themes/mutations.ts`
- `packages/backend/convex/blocks/ai.ts`
- `packages/backend/convex/blocks/queries.ts`
- `packages/backend/convex/users.ts`
- `packages/backend/convex/roles/queries.ts`
- `packages/backend/convex/roles/mutations.ts`
- `packages/backend/convex/registration/queries.ts`
- `packages/backend/convex/registration/mutations.ts`
- `packages/backend/convex/password/actions.ts`
- `packages/backend/convex/password/queries.ts`
- `packages/backend/convex/schema/roles.ts`
- `packages/backend/convex/schema/capabilities.ts`
- `apps/web/src/components/auth/AdminGate.tsx`
- `apps/web/src/lib/first-admin-setup.ts`
- `apps/web/src/lib/auth-context.tsx`
- `apps/web/src/lib/route-permission-guard.tsx`
- `apps/web/src/lib/page-access.ts`
- `apps/web/src/routes/_authenticated.tsx`
- `apps/web/src/routes/_authenticated/_admin.tsx`
- `apps/web/src/routes/_authenticated/_admin/roles/**`

RBAC system map:

- Schema: `packages/backend/convex/schema/roles.ts`, `packages/backend/convex/schema/capabilities.ts`
- Helpers: `packages/backend/convex/helpers/permissions.ts`, `packages/backend/convex/helpers/auth.ts`
- Route guards: `apps/web/src/routes/_authenticated.tsx`, `apps/web/src/routes/_authenticated/_admin.tsx`, `apps/web/src/lib/route-permission-guard.tsx`
- Admin UI: `apps/web/src/routes/_authenticated/_admin/roles/**`, `apps/web/src/routes/_authenticated/_admin/tools/roles.tsx`, `apps/web/src/routes/_authenticated/_admin/tools/capabilities.tsx`
- Types/seed registry: `packages/backend/convex/types/capabilities.ts`, `packages/backend/convex/seed/roles.ts`

## Findings Fixed

### Critical: missing auth issuer could leave first-admin setup tokenless

`auth.setup.createFirstAdmin` treated a missing `AUTH_ISSUER_URL` as local development. On a misconfigured non-local deployment this could allow tokenless first-admin bootstrap and create an admin whose later JWT verification path was not configured correctly.

Fixes:

- First-admin setup now requires `AUTH_ISSUER_URL` to be present, parseable, and `http:` or `https:` before any seeding or user side effects.
- Tokenless setup is allowed only when `AUTH_ISSUER_URL` is explicitly local (`localhost`, `127.0.0.1`, or `::1`) or `CONVEXPRESS_ALLOW_PUBLIC_FIRST_ADMIN_SETUP=true` is explicitly set.
- Missing, malformed, and non-HTTP issuer values are rejected even when a setup token is configured, so setup cannot succeed into an unverifiable auth state.

### High: setup wizard accepted invalid local admin signing keys

The desktop setup path could reuse an existing `AUTH_PRIVATE_KEY` without proving it matched the ES256 local-admin JWT contract. The example backend env also showed an RSA private key, which would not match the P-256 signing path.

Fixes:

- Desktop setup now validates existing `AUTH_PRIVATE_KEY` as a PEM-encoded P-256 PKCS8 private key before writing the temporary Convex env file.
- Invalid or RSA private keys fail setup validation with a concrete error instead of producing a deployment that cannot log in.
- `.env.example` and the setup checklist now describe the required P-256 PKCS8 ES256 key.

### High: legacy role update path skipped roleChanges and could drift fields

The live user edit UI uses `roles.mutations.assign`, but the legacy public `users.updateUserRole` mutation remained callable by users with `role.assign`. It wrote role fields directly without a `roleChanges` record and trusted the caller-provided `isInternal` flag instead of deriving it from the target role type.

Fixes:

- `users.updateUserRole` now derives `internalRole` and `isInternal` from the resolved target role.
- The legacy mutation now writes a `roleChanges` audit row with old/new role IDs and the acting user.
- First-admin bootstrap now records its administrator role assignment in `roleChanges` with `reason: "first_admin_setup"`.

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
- `git diff --check`

Full Admin test result:

- 1,952 tests passed
- 0 tests failed
- 6,721 assertions passed

Targeted first-admin and auth coverage included:

- `packages/backend/convex/auth/__tests__/firstAdmin.test.ts`
- `apps/web/src/lib/first-admin-setup.test.ts`
- `apps/web/src/components/auth/admin-gate-decision.test.ts`
- `apps/web/src/lib/auth-context.test.ts`
- `packages/desktop/electron/wizard.test.js`
- `packages/desktop/electron/launchRoute.test.ts`

Browser smoke:

- Existing Admin dev server was available at `http://127.0.0.1:4105/dashboard`.
- `/dashboard` and `/setup` both rendered the `ConvexPress Admin` sign-in gate with email/username and password fields.
- No browser console errors were observed during the smoke check.
- `bun run check:smoke:browser` did not complete because `ADMIN_SMOKE_USER` and `ADMIN_SMOKE_PASSWORD` are not configured for this environment.

## Residual Limits

- This was a targeted hardening pass, not a full endpoint-by-endpoint audit of every public Convex function in the Admin app.
- A fresh-deployment first-admin browser flow was not executed against the current running deployment because it already routes `/setup` to the sign-in gate. Automated first-admin setup/login tests passed, and the current browser instance is left ready for manual verification with real credentials or a fresh setup target.
