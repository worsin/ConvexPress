# Auth System - Expert Knowledge Document

**System:** Auth System
**Airtable System ID:** `recNGEVtMvLjp6o8h`
**Airtable Expert ID:** `rec1mdNjXeJvmY1r2`
**Status:** Complete (100%)
**Priority:** P0 - Critical
**Complexity:** Medium
**Category:** User & Auth
**Layer:** Full Stack
**WordPress Equivalent:** `wp-login.php`, `wp_authenticate()`, `wp_set_auth_cookie()`, `wp_logout()`, `is_user_logged_in()`, `wp_get_current_user()`, OAuth via plugins
**Last Analyzed:** 2026-02-13

---

## IMPORTANT: Convex Auth, Not Clerk

**The Airtable blueprint was designed assuming Clerk. The actual implementation uses Convex Auth.** This expert document reflects the real implementation. Key reasons for the switch:

- **Cost:** Convex Auth is free up to 1M MAUs vs Clerk's $25/mo + $0.02/MAU after 10K
- **Custom UI:** Convex Auth supports fully headless custom-branded auth with zero Convex Auth branding
- **Features:** Passkeys, user impersonation, enterprise SSO built-in
- **Simplicity:** No primary/satellite cookie domain complexity -- just add redirect URIs

The migration from Clerk to the auth system is complete across all system expert docs. The helper functions (`getCurrentUser`, `requireAuth`, etc.) remain the same interface regardless of provider.

---

## Quick Reference

### What This System Does

The Auth System is the foundational identity and session layer for ConvexPress. It answers the question every other system asks first: "Who is this user?" It handles user login (email/password, Google OAuth, passkeys), logout, session management, JWT token validation, user identity synchronization between Convex Auth and Convex, and the admin access gate via the `isInternal` + `internalRole` two-field pattern. In WordPress terms, it replaces `wp-login.php`, `wp_authenticate()`, `wp_set_auth_cookie()`, `wp_logout()`, `is_user_logged_in()`, `wp_get_current_user()`, and OAuth plugin functionality.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Convex Auth** | External auth provider that owns all credential storage, password hashing, OAuth flows, and session tokens. ConvexPress never stores passwords. |
| **Convex User Record** | Application-level user document in the `users` table. Created via auth webhook on first signup. Contains profile data AND access control fields. |
| **isInternal + internalRole** | Two-field access control pattern. `isInternal: true` gates access to the admin app. `internalRole` (admin/editor/author/contributor/support/customer) determines permissions within admin. |
| **JWT Dual Issuer** | Convex validates tokens from two Convex Auth JWT issuers: `https://api.auth.com/` and `https://api.auth.com/user_management/{clientId}` |
| **AuthKitProvider** | Client-side React context from `@auth-inc/authkit-react` that manages auth state, provides `useAuth()` hook, and handles OAuth redirects |
| **ConvexProviderWithAuthKit** | Bridge from `@convex-dev/auth` that passes Convex Auth tokens to Convex for server-side identity resolution |
| **Webhook User Sync** | Convex Auth fires `user.created`, `user.updated`, `user.deleted` events to Convex HTTP endpoint. ConvexPress syncs user records accordingly. |
| **Bootstrap Admin** | First authenticated user can self-promote to admin if no admin exists yet. After that, only existing admins can grant access. |
| **Custom Branded UI** | All auth UI (login, signup, profile) is fully custom. Users never see Convex Auth branding anywhere. |
| **Admin Access Gate** | The `_authenticated.tsx` layout route checks `checkAdminAccess` query. Only users with `isInternal === true` can access admin routes. |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| Session management | PHP sessions + auth cookies | Convex Auth JWT tokens validated by Convex |
| Password storage | `wp_users.user_pass` (bcrypt/phpass) | Convex Auth (never in Convex) |
| Login page | `wp-login.php` | `/login` website route (custom branded) |
| OAuth support | Via plugins (WP Social Login) | Native via Convex Auth (Google, GitHub, etc.) |
| Passkey support | None | Native via Convex Auth |
| User impersonation | Via plugins | Native Convex Auth feature |
| Session validation | `wp_validate_auth_cookie()` per request | JWT validation by Convex on every query/mutation |
| Admin access | `current_user_can('manage_options')` | `isInternal === true` check in `checkAdminAccess` |
| Role assignment | `$user->set_role('editor')` | `updateUserRole` mutation (admin only) |
| Identity provider | WordPress itself | Convex Auth (external) |
| Reactivity | None (page refresh) | Real-time via Convex subscriptions |
| Multi-app auth | Multisite cookies | Shared Convex Auth Client ID + per-app redirect URIs |
| User creation | `wp_insert_user()` direct | auth webhook -> `user.created` event -> Convex insert |

---

## Architecture Overview

### Data Flow

```
User Action (Click "Sign In")
    |
    v
Convex AuthProvider (SPA) or authMiddleware (SSR)
    |
    v
Convex Auth Hosted Auth UI (or custom headless UI in future)
    |
    +--> User authenticates (email/password, Google OAuth, passkey)
    |
    v
Convex Auth issues JWT + redirects to callback URL
    |
    +--> Admin: /callback (port 4105)
    +--> Website: /api/auth/callback (port 4106)
    |
    v
AuthKitProvider stores tokens in memory
    |
    v
ConvexProviderWithAuthKit passes token to Convex
    |
    v
Convex validates JWT against dual issuers (auth.config.ts)
    |
    v
ctx.auth.getUserIdentity() returns auth identity
    |
    v
getCurrentUser(ctx) looks up users table via by_clerkUserId index
    |
    v
User document available for permission checks
```

```
Convex Auth Webhook (user.created / user.updated / user.deleted)
    |
    v
Convex HTTP endpoint (http.ts) - authKit.registerRoutes(http)
    |
    v
Convex Auth signature verification (built into @convex-dev/auth-authkit)
    |
    v
auth.ts event handlers:
    user.created -> Insert new user (isInternal: false, internalRole: undefined)
    user.updated -> Patch profile fields ONLY (never touch role fields)
    user.deleted -> Delete user record
```

### Provider Stack

**Admin App (SPA):**
```
<AuthKitProvider clientId={...} redirectUri={...}>
  <ConvexProviderWithAuthKit client={convex} useAuth={useAuth}>
    <RouterProvider />
  </ConvexProviderWithAuthKit>
</AuthKitProvider>
```

**Website App (SSR):**
```
TanStack Start with authMiddleware()
  -> AuthKitProvider (client-side)
    -> ConvexProvider
      -> RouterProvider
```

### Real-Time Behavior

- **Auth state:** `useAuth()` hook provides reactive `isLoading`, `user`, `signIn()`, `signOut()` state.
- **Convex auth:** `useConvexAuth()` provides `isLoading` + `isAuthenticated` for Convex-level auth state.
- **Admin access check:** `checkAdminAccess` query reactively reflects admin status. If an admin revokes someone's `isInternal` flag, they lose admin access in real-time.
- **User profile sync:** When Convex Auth fires `user.updated`, the Convex user document updates and all subscriptions re-fire.

### Authentication & Authorization

| Context | Auth Strategy |
|---------|---------------|
| Website `/login` | Public - Convex Auth `signIn()` redirects to auth flow |
| Website `/api/auth/callback` | Public - `handleCallbackRoute()` processes OAuth return |
| Admin `/callback` | Public - AuthKitProvider handles token exchange |
| Admin `/_authenticated/*` | Authenticated + `isInternal === true` via `checkAdminAccess` query |
| Convex mutations/queries | `ctx.auth.getUserIdentity()` validates JWT. `requireAuth()` / `requireAdmin()` helpers enforce access. |
| auth webhook handler | Webhook signature verification (Convex Auth native, not Svix) |

---

## Database Schema

### Users Table (Auth-Relevant Fields)

The `users` table is the central user record shared across Auth, Registration, Role & Capability, User Profile, and Password Management systems. The Auth System creates and manages the core identity and access control fields.

```typescript
// ConvexPress-Admin/packages/backend/convex/schema.ts

users: defineTable({
  // === Identity (set by auth webhook) ===
  clerkUserId: v.string(),                    // user identifier (e.g., "user_01ABC...")
  email: v.string(),                           // Primary email address
  emailVerified: v.boolean(),                  // Whether email is verified via Convex Auth

  // === Profile (synced from the auth system) ===
  firstName: v.optional(v.string()),           // First name
  lastName: v.optional(v.string()),            // Last name
  phone: v.optional(v.string()),               // Phone number
  profilePictureUrl: v.optional(v.string()),   // Avatar URL from the auth system/OAuth

  // === Access Control (isInternal + internalRole pattern) ===
  internalRole: v.optional(v.string()),        // "admin" | "editor" | "author" | "contributor" | "support" | "customer"
  isInternal: v.optional(v.boolean()),         // true = can access admin app. false/undefined = customer only.

  // === Profile (application-managed) ===
  username: v.optional(v.string()),            // Unique username (slug-safe)
  displayName: v.optional(v.string()),         // Public display name
  bio: v.optional(v.string()),                 // User biography
  url: v.optional(v.string()),                 // Personal website URL

  // === Status ===
  status: v.union(
    v.literal("active"),                       // Normal active user
    v.literal("inactive"),                     // Deactivated account
    v.literal("banned"),                       // Banned user
  ),

  // === Timestamps ===
  createdAt: v.number(),                       // Unix timestamp of account creation
  updatedAt: v.number(),                       // Last modification timestamp
})
  .index("by_clerkUserId", ["clerkUserId"])  // Lookup by auth identity
  .index("by_email", ["email"])                // Lookup by email
  .index("by_internal_role", ["internalRole"]) // Filter by internal role
  .index("by_is_internal", ["isInternal"])     // Filter internal vs external users
  .index("by_status", ["status"]),             // Filter by account status
```

### Roles Table

The `roles` table stores role definitions for the role hierarchy system. Seeded with 6 default roles.

```typescript
roles: defineTable({
  name: v.string(),                    // "Admin", "Editor", "Author", etc.
  slug: v.string(),                    // "admin", "editor", "author", etc.
  description: v.optional(v.string()), // Human-readable description
  level: v.number(),                   // Hierarchy level (1=highest, 10=lowest)
  type: v.string(),                    // "internal" or "customer"
  isDefault: v.boolean(),              // Only one role can be default
  status: v.string(),                  // "Active" or "Inactive"
})
  .index("by_slug", ["slug"])
  .index("by_level", ["level"])
  .index("by_status", ["status"]),
```

### Indexes

| Table | Index | Fields | Purpose |
|-------|-------|--------|---------|
| `users` | `by_clerkUserId` | `["clerkUserId"]` | Lookup by auth identity (webhook idempotency, auth resolution) |
| `users` | `by_email` | `["email"]` | Lookup by email (invitation matching, duplicate check) |
| `users` | `by_internal_role` | `["internalRole"]` | Filter users by internal role (admin listing) |
| `users` | `by_is_internal` | `["isInternal"]` | Separate internal team from customers |
| `users` | `by_status` | `["status"]` | Filter by account status |
| `roles` | `by_slug` | `["slug"]` | Role lookup by slug |
| `roles` | `by_level` | `["level"]` | Role hierarchy queries |
| `roles` | `by_status` | `["status"]` | Active/inactive role filtering |

### The isInternal + internalRole Pattern

This is the core access control pattern, modeled after the EZ-Entity-Setup project:

```
isInternal: true  + internalRole: "admin"       = Full admin access
isInternal: true  + internalRole: "editor"      = Content management access
isInternal: true  + internalRole: "author"      = Own content management
isInternal: true  + internalRole: "contributor"  = Draft-only access
isInternal: true  + internalRole: "support"     = Customer support access
isInternal: false + internalRole: "customer"    = Website-only customer
isInternal: false + internalRole: undefined     = New user, no role assigned
```

**Security rules:**
1. `isInternal` is the hard gate to the admin app. Period.
2. `internalRole` determines permissions within admin.
3. New users are ALWAYS created with `isInternal: false` and `internalRole: undefined`.
4. Only existing admins can modify `isInternal` and `internalRole` fields.
5. auth webhook user.updated NEVER touches role fields.
6. The `bootstrapAdmin` mutation is the only exception: it allows the first user to self-promote IF no admin exists.

---

## Actions & Functions

### Convex Backend Functions

#### `users.getCurrentUser` - Get Current User (Query)

- **Type:** `query`
- **File:** `convex/users.ts`
- **Auth:** Any authenticated user
- **Args:** `{}`
- **Returns:** `Doc<"users"> | null`
- **Behavior:** Calls `getCurrentUser(ctx)` helper which resolves auth identity → user document.

#### `users.checkAdminAccess` - Check Admin Access (Query)

- **Type:** `query`
- **File:** `convex/users.ts`
- **Auth:** Any authenticated user
- **Airtable Action Codes:** Maps to `auth.login` capability check
- **Args:** `{}`
- **Returns:** `{ id, email, firstName, lastName, profilePictureUrl, internalRole, isInternal } | null`
- **Behavior:**
  1. Get identity via `ctx.auth.getUserIdentity()`. Return `null` if unauthenticated.
  2. Look up user via `by_clerkUserId` index.
  3. If user not found OR `isInternal !== true`, return `null`.
  4. Return safe subset of user data for the admin app header/sidebar.
- **Used By:** `_authenticated.tsx` layout route to gate admin access.

#### `users.hasAnyAdmin` - Check If Any Admin Exists (Query)

- **Type:** `query`
- **File:** `convex/users.ts`
- **Auth:** Any authenticated user
- **Args:** `{}`
- **Returns:** `boolean | null`
- **Behavior:** Queries `users` table for any record with `isInternal: true` AND `internalRole: "admin"`. Returns `true` if found, `false` if not, `null` if unauthenticated.
- **Used By:** Bootstrap admin flow -- shows "Become Admin" button only if no admin exists.

#### `users.bootstrapAdmin` - Bootstrap First Admin (Mutation)

- **Type:** `mutation`
- **File:** `convex/users.ts`
- **Auth:** Any authenticated user (ONE-TIME use)
- **Args:** `{}`
- **Returns:** `{ success: true, action: "updated" | "created", userId }`
- **Behavior:**
  1. Verify authentication.
  2. Check if any admin already exists. If yes, throw error.
  3. Look up current user by `clerkUserId`.
  4. If user exists: patch with `isInternal: true, internalRole: "admin"`.
  5. If user doesn't exist: insert new user record with admin access.
- **Security:** This is the ONLY way for a non-admin to get admin access. It's guarded by the "no existing admin" check. After the first admin is created, this mutation always throws.
- **Errors:**
  - `"Not authenticated"` -- No auth identity.
  - `"Admin already exists. Contact an existing admin for access."` -- Admin exists.

#### `users.updateUserRole` - Update User Role (Mutation)

- **Type:** `mutation`
- **File:** `convex/users.ts`
- **Auth:** Admin only (via `requireAdmin()`)
- **Args:**
  ```typescript
  {
    userId: v.id("users"),
    internalRole: v.string(),
    isInternal: v.boolean(),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Call `requireAdmin(ctx)` to verify caller is admin.
  2. Prevent self-role-change (throws if `currentUser._id === args.userId`).
  3. Fetch target user. Throw if not found.
  4. Last-admin protection: if demoting from admin, count remaining admins and throw if this is the last one.
  5. Patch target user with new `internalRole`, `isInternal`, and `updatedAt`.
  6. Emit `role.assigned` event via Event Dispatcher.
- **Events:** Emits `role.assigned` event via `emitEvent()` with payload `{ userId, previousRole, newRole, previousIsInternal, newIsInternal }`. Uses `ROLE_EVENTS.ASSIGNED` constant and `SYSTEM.ROLE` system slug. Event has 90-day retention (compliance-sensitive).
- **Errors:**
  - `"You cannot change your own role. Ask another admin to make this change."` -- Self-role-change attempt.
  - `"Target user not found."` -- Invalid userId.
  - `"Cannot demote the last admin. Promote another user to admin first."` -- Last-admin protection.

#### `users.setAdminByEmail` - Set Admin by Email (Internal Mutation)

- **Type:** `internalMutation`
- **File:** `convex/users.ts`
- **Auth:** None (CLI / system use only)
- **Args:** `{ email: v.string() }`
- **Returns:** `{ success: true, userId, email }`
- **Behavior:** Look up user by email, set `isInternal: true, internalRole: "admin"`.
- **Usage:** `npx convex run users:setAdminByEmail '{"email":"admin@example.com"}'`

#### `users.setCustomerByEmail` - Set Customer by Email (Internal Mutation)

- **Type:** `internalMutation`
- **File:** `convex/users.ts`
- **Auth:** None (CLI / system use only)
- **Args:** `{ email: v.string() }`
- **Returns:** `{ success: true, userId, email }`
- **Behavior:** Look up user by email, set `isInternal: false, internalRole: "customer"`.

#### `users.seedRoles` - Seed Default Roles (Internal Mutation)

- **Type:** `internalMutation`
- **File:** `convex/users.ts`
- **Auth:** None (CLI / system use only)
- **Args:** `{}`
- **Returns:** `{ message: string, count?: number }`
- **Behavior:** Idempotent. Checks if roles exist, inserts 6 default roles if empty:
  - Admin (level 1, internal)
  - Editor (level 3, internal)
  - Author (level 5, internal)
  - Contributor (level 7, internal)
  - Support (level 8, internal)
  - Customer (level 10, customer, isDefault: true)

### Auth Helper Functions

Located in `convex/helpers/auth.ts`. These are the most critical functions for the entire CMS.

#### `getCurrentUser(ctx)` → `Promise<Doc<"users"> | null>`

```typescript
export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
}
```

#### `requireAuth(ctx)` → `Promise<Doc<"users">>`

Throwing version. Returns user or throws `"Authentication required"`.

#### `isInternal(ctx)` → `Promise<boolean>`

Returns true if current user has `isInternal === true`.

#### `requireInternal(ctx)` → `Promise<Doc<"users">>`

Throwing version. Returns user or throws `"Internal team access required"`.

#### `isAdmin(ctx)` → `Promise<boolean>`

Returns true if `isInternal === true && internalRole === "admin"`.

#### `requireAdmin(ctx)` → `Promise<Doc<"users">>`

Throwing version. Returns user or throws `"Admin access required"`.

#### `getRoleLevel(ctx, roleSlug)` → `Promise<number>`

Resolves role slug to numeric level. Checks `roles` table first, falls back to legacy hierarchy:
```typescript
const LEGACY_ROLE_HIERARCHY = {
  admin: 100, editor: 80, author: 60,
  contributor: 40, support: 30, customer: 10,
};
```

#### `hasRoleOrHigher(ctx, minimumRoleSlug)` → `Promise<boolean>`

Checks if current user's role level >= the minimum required level.

#### `requireRoleOrHigher(ctx, minimumRoleSlug)` → `Promise<Doc<"users">>`

Throwing version of `hasRoleOrHigher`.

#### `hasRole(ctx, role)` → `Promise<boolean>`

Exact role match check.

#### `isEmployee(ctx)` → `Promise<boolean>`

Returns true if user is internal AND has an employee role (admin, editor, author, contributor, support).

#### `isCustomer(ctx)` → `Promise<boolean>`

Returns true if user is NOT internal.

#### `requireAdminOrOwner(ctx, resourceUserId)` → `Promise<Doc<"users">>`

Allows access if user is admin OR owns the resource.

#### `canAccessResource(ctx, resourceUserId)` → `Promise<boolean>`

Non-throwing version of admin-or-owner check.

### Convex Auth Integration Layer

#### `auth.ts` - Convex Auth Component + Event Handlers

```typescript
// ConvexPress-Admin/packages/backend/convex/auth.ts
import { AuthKit } from "@convex-dev/auth-authkit";

export const authKit: AuthKit<DataModel> = new AuthKit<DataModel>(
  components.convexAuth,
  { authFunctions: { authKitEvent: internal.auth.authKitEvent } },
);

export const { authKitEvent } = authKit.events({
  "user.created": async (ctx, event) => {
    // Insert user with isInternal: false, internalRole: undefined
    // SECURITY: New users are ALWAYS non-internal
  },
  "user.updated": async (ctx, event) => {
    // SECURITY: Only update profile fields, NEVER role fields
    // Updates: email, emailVerified, firstName, lastName, profilePictureUrl
  },
  "user.deleted": async (ctx, event) => {
    // Delete user record from Convex
  },
});
```

#### `http.ts` - Webhook HTTP Routes

```typescript
import { httpRouter } from "convex/server";
import { authKit } from "./auth";
const http = httpRouter();
authKit.registerRoutes(http);
export default http;
```

#### `auth.config.ts` - JWT Validation Config

```typescript
const clientId = process.env.AUTH_CLIENT_ID!;
export default {
  providers: [
    {
      type: "customJwt" as const,
      issuer: "https://api.auth.com/",
      algorithm: "RS256" as const,
      applicationID: clientId,
      jwks: `https://api.auth.com/sso/jwks/${clientId}`,
    },
    {
      type: "customJwt" as const,
      issuer: `https://api.auth.com/user_management/${clientId}`,
      algorithm: "RS256" as const,
      jwks: `https://api.auth.com/sso/jwks/${clientId}`,
    },
  ],
};
```

---

## Events

### `auth.logged_in`

- **Airtable ID:** `recr0GBy9Qb5MbZBT`
- **Event Code:** `auth.logged_in`
- **Type:** Auth
- **Triggered By:** `auth.login` action (Convex Auth successful authentication callback)
- **Payload:**
  ```typescript
  {
    userId: Id<"users">,
    method: "email" | "oauth" | "passkey",
    ip: string,
    userAgent: string,
  }
  ```
- **Subscribers:**
  - Email: "Login from New Device" (`rec8f9NmCCPDKcKZV`) -- Subject: "New login detected from {device}"
  - Site: "Login from New Location" (`recvBhDIVzygFb7G2`) -- Warning, Persistent
  - Audit Log: Yes -- "User logged in via {method}"
- **Implementation Status:** Event definition exists in Airtable. Not yet wired to Event Dispatcher.

### `auth.logged_out`

- **Airtable ID:** `recGsO50Od44TqyUw`
- **Event Code:** `auth.logged_out`
- **Type:** Auth
- **Triggered By:** `auth.logout` action (Convex Auth `signOut()`)
- **Payload:**
  ```typescript
  {
    userId: Id<"users">,
  }
  ```
- **Subscribers:**
  - Email: None
  - Site: None
  - Audit Log: Yes -- "User logged out"
- **Implementation Status:** Not yet wired.

### `auth.oauth_completed`

- **Airtable ID:** `rec4C4BQm2qtb6ENO`
- **Event Code:** `auth.oauth_completed`
- **Type:** Auth
- **Triggered By:** `auth.oauth_login` action (successful OAuth flow)
- **Payload:**
  ```typescript
  {
    userId: Id<"users">,
    provider: string, // "google", "github", etc.
  }
  ```
- **Subscribers:**
  - Audit Log: Yes -- "User logged in via {provider}"
- **Implementation Status:** Not yet wired.

### `auth.email_verified`

- **Airtable ID:** `rec3PztxmTYabBEog`
- **Event Code:** `auth.email_verified`
- **Type:** Auth
- **Triggered By:** `auth.verify_email` action (Convex Auth email verification)
- **Payload:**
  ```typescript
  {
    userId: Id<"users">,
    email: string,
  }
  ```
- **Subscribers:**
  - Audit Log: Yes -- "Email verified for {email}"
- **Implementation Status:** Handled implicitly by `user.updated` webhook (sets `emailVerified: true`).

### `auth.login_failed`

- **Airtable ID:** `recME7RdKaskG0UA2`
- **Event Code:** `auth.login_failed`
- **Type:** Auth
- **Triggered By:** `auth.login` action (failed authentication)
- **Payload:**
  ```typescript
  {
    email: string,
    ip: string,
    reason: string, // "invalid_password", "account_locked", etc.
  }
  ```
- **Subscribers:**
  - Email: "Failed Login Attempts" (`recy3HI1eAl3UPLRB`) -- Admin notification, immediate
  - Site: "Failed Login Alert" (`reciRBOAiZR80N1SL`) -- Error, Persistent, to the affected user
  - Audit Log: Yes -- "Failed login attempt for {email} from {ip}: {reason}"
- **Implementation Status:** Not yet wired. Convex Auth handles rate limiting internally.

---

## Admin Routes & UI

### Admin Authentication Gate (`/_authenticated`)

- **File:** `ConvexPress-Admin/apps/web/src/routes/_authenticated.tsx`
- **Purpose:** Layout route that gates ALL admin routes behind authentication + admin access check
- **WordPress Equivalent:** `auth_redirect()` + `current_user_can('manage_options')` check
- **Behavior:**
  1. Check `useAuth().isLoading` (Convex Auth) + `useConvexAuth().isLoading` (Convex). Show `<Loader />` while loading.
  2. If no user: call `signIn()` to redirect to the auth system auth. Show "Redirecting to login..." message.
  3. Query `checkAdminAccess`. If `null` (not internal): show "Access Denied" page.
  4. If all checks pass: render `<Outlet />` for child routes.
- **Real-Time:** If admin revokes someone's `isInternal` flag, the `checkAdminAccess` query updates reactively and the denied user sees the "Access Denied" page immediately.

### Admin Header - Auth Controls

- **File:** `ConvexPress-Admin/apps/web/src/components/header.tsx`
- **Purpose:** Display user info and Sign Out button in admin header
- **Behavior:** Uses `useAuth()` from `@auth-inc/authkit-react`. Shows user email when authenticated, "Sign In" button when not.

### Admin Callback (`/callback`)

- **File:** `ConvexPress-Admin/apps/web/src/routes/callback.tsx`
- **Purpose:** Handle OAuth redirect return from the auth system
- **Behavior:** AuthKitProvider handles the token exchange automatically. The route renders a brief "Completing sign in..." message, then redirects to `/`.

---

## Website Routes

### Login (`/login`)

- **Airtable ID:** `recayYVCv3sPMuPA8`
- **Purpose:** User login page
- **App:** Website (TanStack Start)
- **Layout:** Marketing layout
- **Auth Required:** No (redirects authenticated users)
- **WordPress Equivalent:** `wp-login.php`
- **SEO:** `noindex, nofollow`
- **Current Implementation:** Uses `getSignInUrl()` server-side to get Convex Auth auth URL. Displays sign-in button that redirects to the auth system hosted UI.
- **Future Implementation:** Fully custom branded login form using the auth system headless API -- email/password inputs, Google OAuth button, passkey support. Zero Convex Auth branding visible.

### Website Callback (`/api/auth/callback`)

- **File:** `ConvexPress-Website/apps/web/src/routes/api/auth/callback.tsx`
- **Purpose:** Handle Convex Auth OAuth callback
- **Behavior:** Uses `handleCallbackRoute()` from `@auth/authkit-tanstack-react-start`.

### Website Header - Auth Controls

- **File:** `ConvexPress-Website/apps/web/src/components/header.tsx`
- **Purpose:** Display login/logout in website navigation
- **Behavior:** Uses `useAuth()` from `@auth/authkit-tanstack-react-start/client`. Shows "Sign In" link to `/login` when unauthenticated, "Sign Out" button when authenticated.

---

## Notifications

### Email Notifications

| Name | Airtable ID | Event | Recipients | Priority | Subject Template |
|------|-------------|-------|------------|----------|------------------|
| Login from New Device | `rec8f9NmCCPDKcKZV` | `auth.logged_in` | Customer (the user) | Immediate | `New login detected from {device}` |
| Failed Login Attempts | `recy3HI1eAl3UPLRB` | `auth.login_failed` | Admin (all administrators) | Immediate | `Multiple failed login attempts detected` |

### Site Notifications

| Name | Airtable ID | Event | Type | Persistent | Recipients |
|------|-------------|-------|------|-----------|------------|
| Login from New Location | `recvBhDIVzygFb7G2` | `auth.logged_in` | Warning | Yes | Customer (the user) |
| Failed Login Alert | `reciRBOAiZR80N1SL` | `auth.login_failed` | Error | Yes | Customer (affected user) |

---

## Role & Capability Matrix

### Action Permissions

| Action | Admin | Editor | Author | Contributor | Support | Customer | Anonymous |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Login (email/password) | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Login (OAuth) | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Login (passkey) | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Logout | Yes | Yes | Yes | Yes | Yes | Yes | - |
| Refresh session | Yes | Yes | Yes | Yes | Yes | Yes | - |
| Verify email | Yes | Yes | Yes | Yes | Yes | Yes | - |
| Access admin app | Yes | Yes | Yes | Yes | Yes | - | - |
| Bootstrap admin | * | - | - | - | - | - | - |
| Update user role | Yes | - | - | - | - | - | - |
| Set admin by email (CLI) | System | - | - | - | - | - | - |

`*` Bootstrap admin only works once (when no admin exists)

### Route Access

| Route | App | Roles | Auth Required | Notes |
|-------|-----|-------|:---:|-------|
| `/login` | Website | Anonymous | No | Redirects if already logged in |
| `/api/auth/callback` | Website | Anonymous | No | Convex Auth OAuth callback |
| `/callback` | Admin | Anonymous | No | Convex Auth OAuth callback |
| `/_authenticated/*` | Admin | Internal only | Yes | `isInternal === true` required |

---

## Dependencies

### Depends On

| System | Type | What Is Needed |
|--------|------|---------------|
| **Convex Auth (External)** | **Hard** | All credential storage, password hashing, OAuth flows, JWT issuance, session tokens, passkey management, user impersonation. Without Convex Auth, no auth exists. |

The Auth System has NO internal system dependencies. It is the foundation that everything else depends on.

### Depended On By

| System | Type | What They Need |
|--------|------|---------------|
| **Registration System** (`recSG6RltDScSL69w`) | **Hard** | User creation via webhook, identity resolution, auth session for invitation flow |
| **Role & Capability System** (`recLjkb6BJlxqHTQv`) | **Hard** | `getCurrentUser(ctx)` for all permission checks, `ctx.auth.getUserIdentity()` for identity |
| **User Profile System** (`recC5k3UpvlW4vaAb`) | **Hard** | User record created by auth webhook, session for profile editing |
| **Password Management System** (`recEFTu5tLbUiNsTW`) | **Hard** | Convex Auth handles all password operations, webhook for password change detection |
| **Post System** (`rec6ZGXFgdJ8mU51f`) | **Hard** | `requireAuth()` / `requireRoleOrHigher()` for all post mutations |
| **Page System** (`rec0NwZiBsaVRjet6`) | **Hard** | Same auth helpers for page mutations |
| **Media System** (`rec6CCnf6VJNNyLyE`) | **Hard** | Auth helpers for media operations |
| **Comment System** (`rechYtZ2IKH1CzDJ6`) | **Hard** | Auth helpers for comment operations |
| **Event Dispatcher System** (`recIKbZ37ZDrxE8zv`) | **Hard** | Identity context for event emission |
| **All 28 Systems** | **Hard/Soft** | Every system that calls any `require*()` or `is*()` helper depends on Auth |

**Summary:** This is the #1 most critical system. ALL other systems depend on it either directly (Hard) or indirectly (Soft). It has zero internal dependencies.

---

## Implementation Status

### Completed

- [x] `convex/auth.config.ts` - Dual JWT issuer configuration for Convex
- [x] `convex/convex.config.ts` - Convex Auth component mounted
- [x] `convex/schema.ts` - Users table with `isInternal` + `internalRole` pattern + roles table
- [x] `convex/auth.ts` - Convex Auth event handlers (user.created, user.updated, user.deleted) with idempotency, OAuth detection, password change detection
- [x] `convex/http.ts` - Webhook HTTP routes registered + full REST API
- [x] `convex/users.ts` - All queries (getCurrentUser, hasAnyAdmin, checkAdminAccess) + mutations (bootstrapAdmin, updateUserRole with self-change prevention + last-admin protection, setAdminByEmail, setCustomerByEmail, seedRoles)
- [x] `convex/helpers/auth.ts` - Full auth helper system (15+ functions)
- [x] `convex/helpers/permissions.ts` - Full capability-based permission system (requireCan, currentUserCan, mapMetaCap, requireCanOnResource)
- [x] `convex/authTracking/queries.ts` - Auth-specific queries (getAuthInfo, getLoginHistory)
- [x] `convex/authTracking/mutations.ts` - Login/logout tracking with Event Dispatcher wiring (recordLogin, recordLogout)
- [x] `convex/authTracking/validators.ts` - Shared argument validators
- [x] `convex/events/constants.ts` - Auth event codes registered (auth.login, auth.logout, auth.session_refreshed, auth.oauth_completed, auth.email_verified, auth.login_failed)
- [x] Admin `vite.config.ts` - Port set to 4105
- [x] Admin `main.tsx` - AuthKitProvider + ConvexProviderWithAuthKit
- [x] Admin `_authenticated.tsx` - Auth gate with admin access check + login tracking
- [x] Admin `callback.tsx` - OAuth callback route
- [x] Admin `header.tsx` - Sign In/Out controls with logout event tracking
- [x] Admin `lib/auth-context.tsx` - Full auth context provider with capability checking
- [x] Website `vite.config.ts` - Port set to 4106
- [x] Website `start.ts` - authMiddleware configured with canonical URL middleware
- [x] Website `api/auth/callback.tsx` - Server callback handler
- [x] Website `login.tsx` - Login page with the auth system redirect + custom branded UI (Phase 1)
- [x] Website `register.tsx` - Registration page with registration gate + invitation support
- [x] Website `forgot-password.tsx` - Forgot password page with the auth system integration
- [x] Website `__root.tsx` - AuthKitProvider wrapper + LoginTracker
- [x] Website `header.tsx` - Auth controls with logout event tracking
- [x] Website auth component library (14 components): AuthPageLayout, OAuthButtons, AuthDivider, LoginForm, RegisterForm, ForgotPasswordForm, ForgotPasswordSuccess, PasswordStrengthIndicator, RegistrationGate, RegistrationClosedMessage, InvitationRequiredMessage, InvitationInvalidMessage, AuthError, AuthLink, LoginTracker
- [x] Website auth utilities: `lib/auth/types.ts`, `lib/auth/auth.ts` (client-side capability checking)
- [x] Website auth hooks: `usePasswordStrength`, `useRegistrationGate`, `useInvitationValidation`, `useLoginTracker`
- [x] Convex environment variables set (AUTH_CLIENT_ID, AUTH_API_KEY, AUTH_WEBHOOK_SECRET)
- [x] Website env variables set (AUTH_CLIENT_ID, AUTH_API_KEY, AUTH_COOKIE_PASSWORD, AUTH_REDIRECT_URI)
- [x] Roles seeded (6 default roles)
- [x] Convex deployed successfully
- [x] **Event Dispatcher wiring** - auth.login and auth.logout events emitted via emitEvent() in recordLogin/recordLogout mutations
- [x] **Role assignment event** - `updateUserRole` mutation emits `role.assigned` event via `emitEvent()` with full before/after payload (userId, previousRole, newRole, previousIsInternal, newIsInternal). Uses `ROLE_EVENTS.ASSIGNED` constant from `events/constants.ts`.
- [x] **Login tracking** - recordLogin mutation updates lastLoginAt, records IP/userAgent/method/app, emits auth.login event
- [x] **Website env variables** - AUTH_COOKIE_PASSWORD set in .env.local

- [x] **Failed login detection** - `failedLoginAttempts` table with schema, `recordFailedLogin` mutation (no auth required), `markFailedLoginReviewed` admin mutation, `getFailedLoginAttempts` admin query, `getUnreviewedFailedLoginCount` badge query, `getSecurityOverview` user query. Event Dispatcher wired for `auth.login_failed` events.
- [x] **Session management / Security UI** - Website dashboard `/dashboard/security` route with `SecurityOverview` component. Shows login history (from events table), failed login attempts (from failedLoginAttempts table), security stats, and security tips. Added "Security" nav item to dashboard sidebar.
- [x] **User impersonation UI** - Admin user edit page includes Impersonation section with "Impersonate User" button. Wired to `getImpersonationUrl` Convex action that calls Convex Auth User Management API `POST /users/{id}/impersonate`. Opens impersonation session in new tab. Handles all Auth API error codes (403 not enabled, 404 user not found, 422 rejected).
- [x] **Login error handling** - Login page detects Convex Auth error redirect params (`?error=...&error_description=...`), displays user-friendly error message, and records failed attempt via `recordFailedLogin` mutation.

### TODO

- [ ] **Custom branded login UI (Phase 2)** - Replace Convex Auth hosted auth redirect with fully headless Auth API for email/password login. Login/register forms already render fields but redirect to the auth system on submit. See HEADLESS-AUTH-STRATEGY below.
- [ ] **Passkey support** - Enable and configure passkey authentication in custom UI (depends on Phase 2)
- [ ] **Session revocation** - Add ability for users to revoke active sessions via Convex Auth Admin SDK `DELETE /user_management/sessions/{id}` endpoint
- [ ] **End-to-end testing** - Full login flow test across both apps

### Headless Auth Strategy (Phase 2)

The current login flow redirects to the auth system hosted auth pages. To achieve fully custom
branded auth with zero Convex Auth branding:

**Required Auth APIs:**
1. **Email + Password Authentication:**
   - `POST /user_management/authenticate` with `{ grant_type: "password", email, password, client_id }`
   - Returns access token + refresh token on success
   - Returns error code on failure (invalid_credentials, user_locked, etc.)

2. **Email Verification:**
   - `POST /user_management/email_verification/send` to send verification email
   - Convex Auth sends email with a code, user enters code
   - `POST /user_management/email_verification/confirm` with the code

3. **Registration:**
   - `POST /user_management/users` to create a user
   - Then authenticate via password flow above

4. **MFA / Passkeys:**
   - `POST /user_management/authenticate` with `{ grant_type: "passkey" }`
   - Requires WebAuthn browser API integration

**Implementation Steps:**
1. Create server-side API routes in TanStack Start (`/api/auth/login`, `/api/auth/register`)
2. These server routes call Auth API directly with `AUTH_API_KEY`
3. On success, create session cookie via `authMiddleware` session management
4. On failure, return structured error for `recordFailedLogin` integration
5. Update `LoginForm` and `RegisterForm` to POST to these server routes instead of redirecting
6. Remove `getSignInUrl()` calls from loaders (no longer needed)

**Dependencies:**
- Convex Auth must have "Email + Password" auth method enabled (already is)
- Server routes need access to `AUTH_API_KEY` and `AUTH_CLIENT_ID`
- Session cookie creation must match what `authMiddleware` expects

---

## Edge Cases & Gotchas

1. **Webhook idempotency:** Convex Auth may retry webhook delivery. The `user.created` handler SHOULD check for existing user by `clerkUserId` before inserting. Currently, Convex's `unique()` on the index would throw on duplicates. Add an idempotency guard.

2. **Role field protection on webhook:** The `user.updated` webhook handler MUST never touch `isInternal` or `internalRole` fields. If Convex Auth sends user profile updates, only `email`, `emailVerified`, `firstName`, `lastName`, `profilePictureUrl` should be patched. This is correctly implemented.

3. **Bootstrap admin race condition:** If two users try to bootstrap admin simultaneously, Convex's serialized mutations prevent race conditions. The second mutation will find the first admin exists and throw.

4. **Last admin protection:** The `updateUserRole` mutation checks if the target is the last admin before demotion. It counts remaining admins with `isInternal === true` and `internalRole === "admin"` (excluding the target), and throws `"Cannot demote the last admin. Promote another user to admin first."` if count is 0.

5. **Self-role-change prevention:** The `updateUserRole` mutation prevents admins from changing their own role. If `currentUser._id === args.userId`, it throws `"You cannot change your own role. Ask another admin to make this change."` to prevent accidental lockout.

6. **JWT dual issuer:** Both issuers MUST be configured in `auth.config.ts`. Convex Auth may use either issuer format depending on the authentication flow (direct auth vs user management). Missing either issuer will cause random auth failures.

7. **Port consistency:** Admin runs on 4105, Website on 4106. These must match the Convex Auth Dashboard redirect URIs. If ports change, Convex Auth Dashboard must be updated manually (no API for this).

8. **AUTH_WEBHOOK_SECRET:** Must be set in Convex environment. The AuthKit component validates webhook signatures at request time. If the secret is wrong or missing, all user sync stops silently.

9. **Convex deployment:** ONLY deploy from `ConvexPress-Admin/packages/backend/`. Never from ConvexPress-Website. The admin app owns the Convex database.

10. **Custom UI requirement:** The user explicitly mandated "They cannot see Convex Auth anywhere. Anywhere." Current implementation uses Convex Auth's hosted auth page. The custom branded UI is the highest-priority remaining task.

11. **Convex Auth one-project model:** Convex Auth uses one project with two environments (staging/production), not multiple projects per site. For development, all local apps share one Convex Auth environment with multiple redirect URIs. For production, separate auth accounts per client site.

12. **OAuth email auto-verification:** Users who sign up via Google OAuth have pre-verified emails. The `emailVerified` field from the auth webhook reflects this correctly.

13. **Multiple redirect URIs:** Both admin (localhost:4105/callback) and website (localhost:4106/api/auth/callback) must be registered in Convex Auth Dashboard. Convex Auth matches the redirect URI from the request to determine which app to return to.

14. **Session cookie for SSR:** The website app (TanStack Start) uses `authMiddleware()` which manages server-side sessions via cookies. The `AUTH_COOKIE_PASSWORD` environment variable must be a 32+ character random string for cookie encryption.

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `wp_authenticate($username, $password)` | Convex Auth `signIn()` via AuthKitProvider | Convex Auth handles all credential validation |
| `wp_set_auth_cookie($user_id)` | Convex Auth JWT token stored in AuthKitProvider state | No cookies in admin SPA; SSR uses `authMiddleware()` cookies |
| `wp_logout()` | `signOut()` from `useAuth()` hook | Clears auth session |
| `is_user_logged_in()` | `useAuth().user !== undefined` (client) / `ctx.auth.getUserIdentity() !== null` (server) | |
| `wp_get_current_user()` | `getCurrentUser(ctx)` helper | Returns Convex user doc, not auth identity |
| `get_current_user_id()` | `(await getCurrentUser(ctx))?._id` | Returns Convex document ID |
| `wp_redirect(wp_login_url())` | `signIn()` redirects to the auth system auth | AuthKitProvider handles the redirect flow |
| `wp_login_url($redirect)` | Convex Auth `getSignInUrl()` server-side or `signIn()` client-side | |
| `wp_logout_url($redirect)` | `signOut()` from `useAuth()` hook | |
| `auth_redirect()` | `_authenticated.tsx` layout route | Checks auth + admin access, redirects or shows denied |
| `check_admin_referer()` | Convex mutation auth (JWT validated per call) | No nonces needed -- Convex validates auth on every call |
| `wp_verify_nonce()` | N/A -- Convex mutations are auth-gated | Convex's mutation model eliminates CSRF |
| `wp_create_nonce()` | N/A | Not needed with JWT-based auth |
| `current_user_can('manage_options')` | `isAdmin(ctx)` or `requireAdmin(ctx)` | |
| `is_admin()` | `isInternal(ctx)` | Checks if user can access admin app |
| `wp_new_user_notification()` | `user.created` webhook -> Convex insert | Convex Auth handles the welcome email |
| `wp_signon()` | Convex Auth `signIn()` | |

---

## Configuration Reference

### Convex Environment Variables

| Variable | Value | Set Via |
|----------|-------|---------|
| `AUTH_CLIENT_ID` | `client_01KB30DBDW30RNV110C5X2G4EH` | `npx convex env set` |
| `AUTH_API_KEY` | `sk_test_...` (secret) | `npx convex env set` |
| `AUTH_WEBHOOK_SECRET` | `ueuVwJ...` (secret) | `npx convex env set` |

### Admin App Environment Variables (`.env`)

| Variable | Value |
|----------|-------|
| `VITE_CONVEX_URL` | `https://amiable-mongoose-989.convex.cloud` |
| `VITE_AUTH_CLIENT_ID` | `client_01KB30DBDW30RNV110C5X2G4EH` |
| `VITE_AUTH_REDIRECT_URI` | `http://localhost:4105/callback` |

### Website App Environment Variables (`.env.local`)

| Variable | Value |
|----------|-------|
| `VITE_CONVEX_URL` | `https://amiable-mongoose-989.convex.cloud` |
| `AUTH_CLIENT_ID` | `client_01KB30DBDW30RNV110C5X2G4EH` |
| `AUTH_API_KEY` | (server-side only, secret) |
| `AUTH_COOKIE_PASSWORD` | (32+ char random string) |
| `AUTH_REDIRECT_URI` | `http://localhost:4106/api/auth/callback` |

### Convex Auth Dashboard Settings

| Setting | Value |
|---------|-------|
| **Redirect URIs** | `http://localhost:4105/callback`, `http://localhost:4106/api/auth/callback` |
| **Sign-out redirect** | `http://localhost:4106` |
| **Auth methods** | Email + Password, Google OAuth |
| **CORS origins** | `http://localhost:4105`, `http://localhost:4106` |
| **User impersonation** | Enabled |
| **Passkeys** | Enabled |

### NPM Packages

| Package | Location | Purpose |
|---------|----------|---------|
| `@auth-inc/authkit-react` | `ConvexPress-Admin/apps/web/` | SPA auth (AuthKitProvider, useAuth, signIn/signOut) |
| `@convex-dev/auth-authkit` | `ConvexPress-Admin/packages/backend/` | Convex server component (webhooks, user sync) |
| `@convex-dev/auth` | `ConvexPress-Admin/apps/web/` | Client bridge (ConvexProviderWithAuthKit) |
| `@auth/authkit-tanstack-react-start` | `ConvexPress-Website/apps/web/` | SSR auth (authMiddleware, handleCallbackRoute, getAuth, getSignInUrl) |

---

## Airtable Record Reference

### System Record

| Field | Value |
|-------|-------|
| Record ID | `recNGEVtMvLjp6o8h` |
| Name | Auth System |
| Category | User & Auth |
| Priority | P0 - Critical |
| Complexity | Medium |
| Status | Not Started → **Partially Implemented** |

### Routes

| Record ID | Name | Path | App | Auth |
|-----------|------|------|-----|------|
| `recayYVCv3sPMuPA8` | Login | `/login` | Website | No |

### Actions

| Record ID | Name | Action Code |
|-----------|------|-------------|
| `reck3ld02PoeUcdOd` | Login | `auth.login` |
| `recbzCjjoR3yfzHnr` | Logout | `auth.logout` |
| `recLtu2pXO3a2oYJQ` | OAuth Login | `auth.oauth_login` |
| `rec7kiftnisGAni5K` | Refresh Session | `auth.refresh_session` |
| `recy0w4EUaemTNiRG` | Verify Email | `auth.verify_email` |

### Events

| Record ID | Name | Event Code |
|-----------|------|------------|
| `recr0GBy9Qb5MbZBT` | User Logged In | `auth.logged_in` |
| `recGsO50Od44TqyUw` | User Logged Out | `auth.logged_out` |
| `rec4C4BQm2qtb6ENO` | OAuth Login | `auth.oauth_completed` |
| `rec3PztxmTYabBEog` | Email Verified | `auth.email_verified` |
| `recME7RdKaskG0UA2` | Login Failed | `auth.login_failed` |

### Email Notifications

| Record ID | Name | Triggered By |
|-----------|------|-------------|
| `rec8f9NmCCPDKcKZV` | Login from New Device | `auth.logged_in` |
| `recy3HI1eAl3UPLRB` | Failed Login Attempts | `auth.login_failed` |

### Site Notifications

| Record ID | Name | Triggered By |
|-----------|------|-------------|
| `recvBhDIVzygFb7G2` | Login from New Location | `auth.logged_in` |
| `reciRBOAiZR80N1SL` | Failed Login Alert | `auth.login_failed` |
