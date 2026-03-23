# Auth Migration: WorkOS → Custom Local Auth (Admin) + Clerk (Website)

**Date:** 2026-03-20
**Status:** Draft
**Scope:** Remove WorkOS from both apps. Replace with custom JWT auth for admin, Clerk for website.

---

## 1. Architecture Overview

Two auth systems, one database, one `users` table.

| App | Auth Method | Provider | UI |
|-----|------------|----------|-----|
| Admin (Vite SPA → Electron) | Username + password | Custom Convex JWT | Our own login form |
| Website (TanStack Start SSR) | Email, OAuth, phone, etc. | Clerk (custom UI via hooks) | Our own forms using Clerk hooks |

**Single `users` table.** Each user has an `authSource` field (`"local"` or `"clerk"`). Same role/capability system for all users regardless of auth source.

**Convex `auth.config.ts`** supports two JWT providers simultaneously: a custom local issuer for admin auth and Clerk's issuer for website auth.

**WorkOS is fully removed** — all packages, env vars, webhook handlers, and references deleted.

---

## 2. Admin Auth — Custom Convex JWT

### 2.1 Login Flow

1. User enters username/email + password on admin login form
2. Admin calls a Convex HTTP action `POST /auth/login`
3. HTTP action validates credentials:
   - Looks up user by email or username (must have `authSource: "local"`)
   - Compares password via bcryptjs (pure JS, runs in a Convex action for Node.js runtime)
   - Checks account lockout status before validating (see Section 2.7)
   - On failure: returns 401, records failed attempt
4. On success: signs a JWT containing:
   - `sub`: Convex user `_id` (enables direct `ctx.db.get()` lookup — O(1), no index needed)
   - `email`: user's email
   - `name`: user's display name
   - `iss`: `"smithharper-admin"` (hardcoded constant, used to distinguish from Clerk in `getCurrentUser()`)
   - `aud`: `"smithharper-admin"` (must match `applicationID` in `auth.config.ts`)
   - `iat`: issued-at timestamp
   - `exp`: expiration (15 minutes for access token)
   - JWT signed with `AUTH_PRIVATE_KEY` (ES256/ECDSA P-256 — shorter signatures than RSA, equally secure)
5. Also issues a refresh token (opaque, stored in a `refreshTokens` table — see Section 2.2)
6. Refresh token returned as an httpOnly, Secure, SameSite=Strict cookie
7. Access token returned in the response body, stored in memory by the client
8. `ConvexReactClient` configured with custom `useAuth` hook via `ConvexProviderWithAuth` that returns the in-memory access token
9. `ctx.auth.getUserIdentity()` works in all Convex functions — returns identity with `subject` = user `_id`

### 2.2 Token Refresh & Storage

**Access token:** Stored in-memory only (React state). Lost on page refresh. Short-lived (15 min).

**Refresh token:** Opaque random string stored in a `refreshTokens` Convex table:
```
refreshTokens: defineTable({
  token: v.string(),          // hashed opaque token
  userId: v.id("users"),
  expiresAt: v.number(),      // 7 days from creation
  createdAt: v.number(),
  revokedAt: v.optional(v.number()),
}).index("by_token", ["token"])
```

**Refresh flow:**
1. Client's access token nears expiry (or page loads with no access token in memory)
2. Browser automatically sends the httpOnly refresh cookie with `POST /auth/refresh`
3. HTTP action validates the refresh token hash against the `refreshTokens` table
4. If valid and not expired/revoked: issue new access token + rotate refresh token (new token issued, old one revoked)
5. If invalid/expired: return 401, client redirects to login

**Cookie attributes:** `httpOnly`, `Secure` (production), `SameSite=Strict`, `Path=/auth/refresh`, max-age = 7 days.

**For Electron (future):** Replace cookie with Electron's `safeStorage` API for the refresh token. The access token remains in-memory.

### 2.3 JWKS Endpoint

Convex validates JWTs via a JWKS endpoint. We expose `GET /auth/.well-known/jwks.json` as a Convex HTTP action that returns the public key derived from `AUTH_PRIVATE_KEY`. This lets Convex's built-in JWT validation work without any custom verification code in each function.

The JWKS endpoint must include CORS headers (`Access-Control-Allow-Origin: *`) since Convex's internal validator fetches it.

### 2.4 Password Storage

- Passwords hashed with **bcryptjs** (pure JavaScript implementation — the native `bcrypt` package uses C++ bindings that do not work in Convex's action runtime)
- Hash stored in `passwordHash` field on the `users` table
- Cost factor: 12
- Password hashing runs in a Convex `action` (not `mutation`) because it needs Node.js runtime
- The action calls an internal mutation to write the hash

### 2.5 Admin Provider Stack (main.tsx)

```
ConvexProviderWithAuth (with custom useAuth hook)
  └─ RouterProvider
       └─ _authenticated layout (checks ctx.auth identity)
```

Replaces the current `AuthKitProvider > ConvexProviderWithAuthKit` wrapper.

The custom `useAuth` hook manages:
- In-memory access token state
- Automatic refresh on page load (via refresh cookie)
- Token refresh before expiry
- `fetchAccessToken()` callback that Convex calls to get the current JWT

### 2.6 First Admin User

Created during install wizard (future phase). For now, a seed script or setup route creates the first administrator account with `authSource: "local"` and the administrator role.

### 2.7 Account Lockout

The admin login endpoint checks lockout status before validating credentials:
- **Per-account:** Lock after 5 failed attempts within 15 minutes. Lock duration: 15 minutes.
- **Per-IP:** Lock after 20 failed attempts within 5 minutes (existing `failedLoginAttempts` pattern).
- Lockout state derived from the existing `failedLoginAttempts` table (no new table needed).
- The login HTTP action queries recent failures for the email/username and rejects with 429 if locked.
- Successful login clears the failure count for that account.

---

## 3. Website Auth — Clerk with Custom UI

### 3.1 Integration Pattern

- `@clerk/tanstack-react-start` for TanStack Start SSR integration
- `convex/react-clerk` (`ConvexProviderWithClerk`) for Convex JWT bridging
- Clerk configured as a second provider in Convex `auth.config.ts`

### 3.2 Custom UI via Clerk Hooks

No prebuilt Clerk components (`<SignIn />`, `<SignUp />`). Instead:

- `useSignIn()` hook drives our custom `LoginForm` component
- `useSignUp()` hook drives our custom `RegisterForm` component
- OAuth buttons use `signIn.authenticateWithRedirect({ strategy: "oauth_google" })` etc.
- All forms use Base UI components and our existing design system
- Clerk branding is invisible — users see SmithHarper branding only

### 3.3 Dynamic Auth Options

Clerk's `<SignIn />` and `<SignUp />` auto-adapt to dashboard config, but since we're using custom UI, we need to detect what's enabled.

**Approach (using hooks):** Use Clerk's `useSignIn()` / `useSignUp()` hooks which expose `supportedFirstFactors` and `supportedExternalAccounts`. These dynamically reflect what the admin enabled in Clerk Dashboard. Our custom forms read these arrays and render the appropriate fields/buttons. If the admin enables Google OAuth in Clerk Dashboard, our form automatically shows a "Sign in with Google" button. No code changes needed.

### 3.4 Provider Stack (Website)

```
ClerkProvider (publishableKey from settings or env)
  └─ ConvexProviderWithClerk (client, useAuth)
       └─ RouterProvider
```

### 3.5 Clerk Webhooks → Convex

Clerk sends webhooks to `https://<deployment>.convex.site/webhooks/clerk` for:
- `user.created` → Create user in `users` table with `authSource: "clerk"`
- `user.updated` → Sync profile fields (email, name, avatar)
- `user.deleted` → Remove or deactivate user

Webhook verification via `svix` package (same pattern WorkOS used, Clerk uses Svix too).

### 3.6 Just-In-Time User Provisioning

**Problem:** A user could authenticate via Clerk and make their first Convex query before the `user.created` webhook has been processed. `getCurrentUser()` would return null.

**Solution:** The existing `authTracking/mutations.ts` `getOrCreateCurrentUserForLogin()` pattern is adapted for Clerk. When `getCurrentUser()` finds no user for a Clerk `identity.subject`, the website frontend calls a `provisionClerkUser` mutation that:
1. Reads the Clerk identity claims from `ctx.auth.getUserIdentity()` (email, name, etc.)
2. Creates the user in the `users` table with `authSource: "clerk"` and `clerkUserId` = identity subject
3. Assigns the default subscriber role

This ensures users are never stuck in a "no user found" state, even if the webhook is delayed.

### 3.7 Clerk Configuration Storage

Clerk API keys stored as Convex environment variables:
- `CLERK_PUBLISHABLE_KEY` — also needed client-side (passed to website via env var `VITE_CLERK_PUBLISHABLE_KEY`)
- `CLERK_SECRET_KEY` — server-side only (Convex env var)
- `CLERK_JWT_ISSUER_DOMAIN` — used in `auth.config.ts` (Convex env var)
- `CLERK_WEBHOOK_SECRET` — webhook verification (Convex env var)

---

## 4. Schema Changes

### 4.1 Users Table Modifications

**Remove:**
- `workosUserId` field (kept as optional during grace period, then removed)
- `by_workosUserId` index (removed immediately — no code will use it)

**Add:**
- `authSource: v.union(v.literal("local"), v.literal("clerk"))` — required
- `passwordHash: v.optional(v.string())` — only for `authSource: "local"`
- `clerkUserId: v.optional(v.string())` — only for `authSource: "clerk"`
- `by_clerkUserId` index on `["clerkUserId"]`
- `by_authSource` index on `["authSource"]`

**Keep unchanged:**
- All profile fields, role fields, preferences, social links, timestamps, WordPress import fields
- All existing indexes except `by_workosUserId`

### 4.2 New Table: `refreshTokens`

```typescript
refreshTokens: defineTable({
  token: v.string(),
  userId: v.id("users"),
  expiresAt: v.number(),
  createdAt: v.number(),
  revokedAt: v.optional(v.number()),
}).index("by_token", ["token"])
  .index("by_userId", ["userId"])
```

### 4.3 Auth Tracking Tables

The `authTracking` schema stays largely the same. The `recordLogin` mutation changes to accept the auth source but the table structure is compatible.

---

## 5. Backend Changes

### 5.1 `auth.config.ts` — Dual Provider

```typescript
export default {
  providers: [
    {
      // Admin: custom JWT provider
      // domain must match the issuer URL where JWKS is served
      domain: process.env.AUTH_ISSUER_URL,  // e.g., https://<deployment>.convex.site
      applicationID: "smithharper-admin",
    },
    {
      // Website: Clerk provider
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
```

Note: `process.env` IS available in `auth.config.ts` (it runs at deploy time, not in query/mutation context).

### 5.2 `convex.config.ts` — Remove WorkOS Component

```typescript
// BEFORE:
import workOSAuthKit from "@convex-dev/workos-authkit/convex.config";
const app = defineApp();
app.use(workOSAuthKit);

// AFTER:
import { defineApp } from "convex/server";
const app = defineApp();
export default app;
```

### 5.3 `helpers/permissions.ts` — User Lookup Change

The critical change: `getCurrentUser()` currently looks up users by `workosUserId` via `identity.subject`. With dual auth:

- **Admin JWT:** `identity.subject` = Convex user `_id` (we control what goes in the JWT)
- **Clerk JWT:** `identity.subject` = Clerk user ID (e.g., `user_2abc...`)

**Important:** `process.env` is NOT available in Convex query/mutation handlers. We use `identity.tokenIdentifier` (which is `issuer|subject`) to distinguish auth sources. The admin issuer string `"smithharper-admin"` is a hardcoded constant.

```typescript
const ADMIN_ISSUER = "smithharper-admin";

export async function getCurrentUser(ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  // tokenIdentifier format: "issuer|subject"
  // For admin JWTs: "smithharper-admin|<convex-user-id>"
  // For Clerk JWTs: "https://clerk.xxx.dev|<clerk-user-id>"
  const isAdminAuth = identity.tokenIdentifier.startsWith(ADMIN_ISSUER + "|");

  if (isAdminAuth) {
    // Admin local auth — subject is Convex user _id (direct fetch, no index needed)
    return await ctx.db.get(identity.subject as Id<"users">);
  } else {
    // Clerk auth — subject is Clerk user ID
    return await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", identity.subject)
      )
      .unique();
  }
}
```

**All other permission helpers (`requireCan`, `currentUserCan`, `requireAuth`, etc.) remain unchanged** — they all call `getCurrentUser()` internally.

### 5.4 Files with Direct `by_workosUserId` Usage (21 files)

Beyond `getCurrentUser()`, 21 backend files directly query `by_workosUserId`. These need individual attention:

**Delete entirely (WorkOS-specific, replaced by new auth system):**
- `convex/auth.ts` — WorkOS webhook handlers → replaced by `convex/auth/clerkWebhook.ts`

**Refactor to use `getCurrentUser()` or the new dual-lookup pattern:**
- `convex/users.ts` — `checkAdminAccess` and `bootstrapAdmin` (use `getCurrentUser()`)
- `convex/authTracking/mutations.ts` — `getOrCreateCurrentUserForLogin` (rewrite for dual auth)
- `convex/registration/internals.ts` — `handleWorkOSUserCreated` (rewrite for Clerk webhooks)
- `convex/profiles/queries.ts` — user lookup (use `getCurrentUser()`)
- `convex/profiles/internals.ts` — user lookup (use `getCurrentUser()`)
- `convex/password/queries.ts` — user lookup (use `getCurrentUser()`)
- `convex/password/internals.ts` — user lookup
- `convex/password/actions.ts` — user lookup
- `convex/notifications/internals.ts` — user lookup
- `convex/comments/internals.ts` — user lookup
- `convex/feeds/internals.ts` — user lookup
- `convex/emails/internals.ts` — user lookup
- `convex/search/internals.ts` — user lookup
- `convex/sitemaps/helpers/auth.ts` — user lookup
- `convex/auditLogs/internals.ts` — user lookup
- `convex/api/internals.ts` — user lookup
- `convex/airtableSync/_internal.ts` — user lookup
- `convex/wordpressSync/phases/users.ts` — WorkOS user creation (rewrite for local auth)
- `convex/wordpressSync/phases/menus.ts` — user lookup

**Pattern for most refactors:** Replace `.withIndex("by_workosUserId", ...)` with either `getCurrentUser(ctx)` (if in an authenticated context) or a lookup by `userId` (Convex `_id`) where the user ID is already known.

### 5.5 `auth.ts` — Replace WorkOS Webhooks with Clerk Webhooks

Delete the entire WorkOS `authKit` event handler. Replace with a Clerk webhook handler registered in `http.ts`.

### 5.6 `http.ts` — New Routes

**Add:**
- `POST /auth/login` — admin login endpoint (with CORS headers)
- `POST /auth/refresh` — admin token refresh (with CORS headers)
- `GET /auth/.well-known/jwks.json` — public key for JWT validation (with permissive CORS)
- `OPTIONS /auth/login` — CORS preflight
- `OPTIONS /auth/refresh` — CORS preflight
- `POST /webhooks/clerk` — Clerk user webhook receiver

**Remove:**
- `authKit.registerRoutes(http)` — WorkOS routes

**CORS:** The admin SPA runs on a different origin (e.g., `localhost:4105`) than the Convex `.site` domain. All `/auth/*` endpoints must include `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`, and appropriate headers. Use the existing `corsPreflightResponse()` helper.

### 5.7 New Files

| File | Purpose |
|------|---------|
| `convex/schema/auth.ts` | `refreshTokens` table schema |
| `convex/auth/login.ts` | Login HTTP action (validate credentials, issue JWT, set refresh cookie) |
| `convex/auth/refresh.ts` | Token refresh HTTP action |
| `convex/auth/jwks.ts` | JWKS endpoint HTTP action |
| `convex/auth/helpers.ts` | JWT signing utilities (ES256 via `jose`), bcryptjs helpers |
| `convex/auth/clerkWebhook.ts` | Clerk webhook handler (user.created/updated/deleted) |

### 5.8 Environment Variables

**Remove from Convex Dashboard:**
- `WORKOS_CLIENT_ID`
- `WORKOS_API_KEY`

**Add to Convex Dashboard:**
- `AUTH_PRIVATE_KEY` — ES256 (ECDSA P-256) private key for signing admin JWTs
- `AUTH_ISSUER_URL` — The Convex site URL (must match the `domain` in `auth.config.ts`)
- `CLERK_JWT_ISSUER_DOMAIN` — Clerk's Frontend API URL
- `CLERK_WEBHOOK_SECRET` — Clerk webhook signing secret

**Keep:**
- `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, etc. (unchanged)

### 5.9 `jose` Library Compatibility

The `jose` library is pure JavaScript with no native dependencies. It should work in Convex's action runtime (which supports standard Node.js APIs including `crypto`). If issues arise, fallback to manual JWT construction using Node.js `crypto.sign()` with the ES256 key — the JWT format is simple enough for hand-rolling.

### 5.10 `authTracking/mutations.ts` — Provisioning Rewrite

The `getOrCreateCurrentUserForLogin()` function (60+ lines) currently reads WorkOS identity claims, derives legacy role fields, and provisions users. This is rewritten:

**For admin auth:** No provisioning needed on login — admin users are pre-created (via wizard or seed script). The login endpoint just validates credentials.

**For Clerk auth:** The just-in-time provisioning (Section 3.6) creates users from Clerk identity claims. The existing function is simplified to handle only this case.

---

## 6. Admin Frontend Changes

### 6.1 Package Changes

**Remove:**
- `@workos-inc/authkit-react`
- `@convex-dev/workos`

**Add:**
- No new auth packages needed. JWT handling is vanilla JS. The `ConvexProviderWithAuth` component is already in the `convex/react` package.

### 6.2 `main.tsx` — New Provider Stack

Replace `AuthKitProvider` + `ConvexProviderWithAuthKit` with `ConvexProviderWithAuth` + custom `useAuth` hook:

```typescript
import { ConvexProviderWithAuth } from "convex/react";

function useLocalAuth() {
  // Manages access token in state
  // On mount: attempts refresh via /auth/refresh
  // Provides fetchAccessToken() callback for Convex
  // Returns { isLoading, isAuthenticated }
}

// In router Wrap:
<ConvexProviderWithAuth client={convex} useAuth={useLocalAuth}>
  {children}
</ConvexProviderWithAuth>
```

### 6.3 `_authenticated.tsx` — Simplified

Replace WorkOS `useAuth()` with `useConvexAuth()` (from `convex/react`):
- `useConvexAuth()` returns `{ isLoading, isAuthenticated }` based on whether the token provider has a valid token
- If not authenticated: show login form
- If authenticated: proceed to `checkAdminAccess` query (rewritten to use `getCurrentUser()`)

### 6.4 Login Page

New login form at the root route (`/`) or `/login`:
- Email/username field + password field
- Calls `POST /auth/login` via fetch (to the Convex `.site` URL)
- On success: stores access token in auth store state, refresh cookie auto-set by the response
- On failure: shows error message (with lockout messaging if applicable)

### 6.5 Files to Delete

- `routes/callback.tsx` — WorkOS callback route (no longer needed)

### 6.6 Files to Modify

- `main.tsx` — provider stack
- `_authenticated.tsx` — auth guard (replace WorkOS `useAuth` with `useConvexAuth`)
- `routes/index.tsx` — login UI
- `components/header.tsx` — user menu (remove WorkOS sign-out, use custom logout)
- `components/layout/UserMenu.tsx` — same
- `lib/auth-context.tsx` — update to use Convex identity (the `AuthProvider` that resolves user + role stays, just the data source changes)
- `env.d.ts` — remove WorkOS env types, add new ones
- `components/registration/InviteUserForm.tsx` — remove WorkOS references
- `components/password/ResetPasswordButton.tsx` — adjust for local auth
- `components/users/user-form.tsx` — remove WorkOS fields
- `components/users/avatar.tsx` — remove WorkOS avatar URL references

---

## 7. Website Frontend Changes

### 7.1 Package Changes

**Remove:**
- `@workos-inc/node`
- `@workos/authkit-tanstack-react-start`

**Add:**
- `@clerk/tanstack-react-start`
- `@clerk/clerk-react` (peer dep)

### 7.2 `start.ts` — Replace Middleware

Replace `authkitMiddleware()` with Clerk's TanStack Start middleware (or handle auth via Clerk's `getAuth()` in route loaders).

### 7.3 Auth Routes — Custom UI with Clerk Hooks

- `login.tsx` — Use `useSignIn()` hook with custom form. Detect available strategies (`supportedFirstFactors`) to dynamically show email/phone/OAuth options.
- `register.tsx` — Use `useSignUp()` hook with custom form. Same dynamic field detection.
- `forgot-password.tsx` — Use Clerk's password reset flow via hooks.
- `api/auth/callback.tsx` — Replace WorkOS callback with Clerk's OAuth callback handling.

### 7.4 Auth Components to Rewrite

- `OAuthButtons.tsx` — Use `signIn.authenticateWithRedirect()` per provider
- `LoginForm.tsx` — Use `useSignIn().create()` / `.prepareFirstFactor()`
- `RegisterForm.tsx` — Use `useSignUp().create()`
- `ForgotPasswordForm.tsx` — Use Clerk's reset flow

### 7.5 SSR Auth Helpers

Replace `getAuth()` and `getSignInUrl()` from WorkOS with Clerk equivalents:
- `getAuth()` from `@clerk/tanstack-react-start/server`
- Session handling via Clerk's server-side utilities

### 7.6 Website Files Referencing WorkOS (35 files)

All files in the website app that import from `@workos-inc/*` or `@workos/*`:
- `start.ts` — middleware
- `routes/__root.tsx` — auth context
- `routes/login.tsx`, `register.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `verify-email.tsx`, `logout.tsx` — auth pages
- `routes/dashboard.tsx` and dashboard sub-routes — auth checks
- `routes/api/auth/callback.tsx` — OAuth callback
- `components/auth/*` — all auth form components
- `components/layout/*` — header, user menu, mobile nav (auth state checks)
- `components/dashboard/*` — profile, settings, comments (auth-gated)
- `hooks/useCurrentUser.ts`, `useLoginTracker.ts`, `useAvatarUrl.ts` — auth hooks
- `lib/auth/*` — auth utilities and types

---

## 8. Migration Path

### 8.1 Existing Users

Current users have `workosUserId` but no `passwordHash` or `clerkUserId`. Migration strategy:

1. **Admin users:** Must set a new password during first login after migration (password reset flow or setup prompt). Their `workosUserId` is cleared and `authSource` set to `"local"`.
2. **Website users:** If Clerk is configured, existing users need to re-register via Clerk (or admin imports them via Clerk's Backend API). Their records get `clerkUserId` populated and `authSource` set to `"clerk"`.
3. **Grace period:** Keep `workosUserId` field as optional during migration. Remove it in a later cleanup phase.

### 8.2 Data Preservation

All content (posts, pages, comments, media, settings, roles, etc.) is untouched. Only the auth layer changes. `authorId` references on posts/pages/comments remain valid Convex `Id<"users">` — those don't change.

### 8.3 Rollback Plan

If the migration fails partway:
- The `workosUserId` field is preserved during the grace period, so re-adding WorkOS config would restore the old auth flow
- No content data is modified, so there is nothing to reverse on the content side
- The rollback would require: re-adding WorkOS packages, restoring `auth.config.ts`, and restoring the `by_workosUserId` index
- To minimize risk, the migration is done in phases (see implementation plan) with each phase independently deployable

---

## 9. Packages to Remove (Full List)

### Admin App (`ConvexPress-Admin/apps/web/`)
- `@workos-inc/authkit-react`
- `@convex-dev/workos`

### Admin Backend (`ConvexPress-Admin/packages/backend/`)
- `@convex-dev/workos-authkit` (Convex component)

### Website App (`ConvexPress-Website/apps/web/`)
- `@workos-inc/node`
- `@workos/authkit-tanstack-react-start`

### New Dependencies

| Package | Location | Purpose |
|---------|----------|---------|
| `bcryptjs` | Admin backend | Password hashing (pure JS, Convex-compatible) |
| `jose` | Admin backend | JWT signing/JWKS (pure JS, no native deps) |
| `svix` | Admin backend | Clerk webhook signature verification |
| `@clerk/tanstack-react-start` | Website app | Clerk + TanStack Start SSR integration |
| `@clerk/clerk-react` | Website app | Clerk React hooks (peer dep) |

---

## 10. Environment Variable Changes

### Admin App `.env` — Remove
- `VITE_WORKOS_CLIENT_ID`
- `VITE_WORKOS_REDIRECT_URI`

### Admin App `.env` — Add
- `VITE_CONVEX_URL` (keep)
- `VITE_CONVEX_SITE_URL` — Convex `.site` URL for auth HTTP actions

### Website App `.env.local` — Remove
- `WORKOS_CLIENT_ID`
- `WORKOS_API_KEY`
- `WORKOS_COOKIE_PASSWORD`
- `WORKOS_REDIRECT_URI`

### Website App `.env.local` — Add
- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

### Convex Dashboard — Remove
- `WORKOS_CLIENT_ID`
- `WORKOS_API_KEY`

### Convex Dashboard — Add
- `AUTH_PRIVATE_KEY` — ES256 (ECDSA P-256) private key
- `AUTH_ISSUER_URL` — Convex site URL (e.g., `https://amiable-mongoose-989.convex.site`)
- `CLERK_JWT_ISSUER_DOMAIN` — Clerk Frontend API URL
- `CLERK_WEBHOOK_SECRET` — Clerk webhook signing secret

---

## 11. Security Considerations

- **Admin JWT signing:** ES256 (ECDSA P-256) with private key in Convex env. Public key exposed via JWKS endpoint for validation only. Shorter signatures than RSA, equally secure.
- **Password hashing:** bcryptjs with cost factor 12. Runs in Convex actions (Node runtime). Pure JS — no native binary compatibility issues.
- **Token storage:** Access tokens in memory only. Refresh tokens in httpOnly Secure SameSite=Strict cookies. No localStorage.
- **Refresh token rotation:** New refresh token issued on each refresh. Old token revoked. Stolen refresh tokens are single-use.
- **Account lockout:** 5 failed attempts per account → 15-minute lockout. 20 failed attempts per IP → 5-minute lockout. Uses existing `failedLoginAttempts` table.
- **Clerk webhook verification:** Svix signature validation on every webhook. Reject unverified payloads.
- **CORS:** Auth HTTP endpoints include proper CORS headers for the admin SPA origin. Credentials mode enabled for cookie-based refresh.
- **HTTPS only:** In production, all auth endpoints require HTTPS (Convex `.site` domain is HTTPS by default).

---

## 12. What Does NOT Change

- Role & Capability System (roles table, capabilities, `requireCan`, `currentUserCan`)
- All content systems (posts, pages, comments, media, taxonomies, etc.)
- Event Dispatcher System
- Email Notification System
- Site Notification System
- Audit Log System
- API System (HTTP endpoints for external access)
- Admin UI layout (sidebar, admin bar, list tables, editors)
- Website UI layout (header, footer, blog, search)
- Settings System (except adding Clerk config fields)
- All `authorId`/`userId` references throughout the database (they use Convex `_id`, not auth provider IDs)
