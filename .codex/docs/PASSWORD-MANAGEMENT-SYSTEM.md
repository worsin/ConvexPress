# Password Management System - Expert Knowledge Document

**System:** Password Management System
**Airtable System ID:** `recEFTu5tLbUiNsTW`
**Airtable Expert ID:** `recse1G4jpbhsKOi0`
**Status:** Implementation Ready
**Priority:** P1 - High
**Complexity:** Simple
**Category:** User & Auth
**Layer:** Full Stack
**WordPress Equivalent:** `wp-login.php` (lost password / reset password) + Profile Account Management section
**Last Analyzed:** 2026-02-08

---

## MANDATORY: Agent Self-Calibration (2026-02-17)

This agent's pretrained assumptions can be stale. I must self-audit against the Airtable stack-update source before I classify framework behavior as a bug.

### Self-Audit Inputs

- Agent: $(@{Name=Password Management System Expert; Path=.codex/docs/PASSWORD-MANAGEMENT-SYSTEM.md}.Name)
- Source file: $(@{Name=Password Management System Expert; Path=.codex/docs/PASSWORD-MANAGEMENT-SYSTEM.md}.Path)
- Airtable base: pphc1Zda0HD51mla
- Airtable table: 	blls7sBy3NVr6vxb
- Airtable view: iwEsk5xdgAJH6Fwj
- Context7 Convex library: $context7Id (available)

### Updates I Marked As Applicable

- [Medium] **Codegen path unification requires deployment connectivity** (v1.28.0): Do not assume fully-offline codegen in CI without deployment/env availability.
- [Medium] **Components architecture available** (v1.28.0+): When evaluating architecture changes, consider official components/workflow/agent patterns.
- [High] **ConvexHttpClient mutations queue by default** (v1.25.0): Do not assume parallel mutation execution; use skipQueue: true only intentionally.
- [Critical] **ctx.db table name required for get/patch/replace/delete** (v1.31.0): Always call as ctx.db.get("table", id) and equivalent for patch/replace/delete.
- [Medium] **Deploy safety prompt for large index deletion** (v1.30.0): Expect explicit confirmation for large index deletes and adapt deploy automation.
- [High] **Direct function calls deprecated** (v1.18.0): Treat direct function calls as invalid going forward; enforce helper/run* patterns.
- [High] **Direct registered function calls no longer typecheck** (v1.20.0): Do not call registered functions directly; use extracted helpers or ctx.run* with internal.* references.
- [Medium] **File storage string IDs deprecated** (vpre-1.13+): Use Id<"_storage"> typed IDs for storage APIs instead of raw strings.
- [Medium] **New validator composition methods (nullable/pick/omit/partial/extend)** (v1.29.0): Prefer modern validator composition helpers over manual union/object cloning patterns.
- [High] **Node 18 dropped for Actions runtime** (v1.31.5): Target Node 20 or 22 for Convex Actions and convex.json runtime settings.

### Updates Deferred (Not Primary For This Agent)

- None.

### Non-Negotiable Workflow

1. Re-check Airtable stack updates before diagnosing API/framework bugs.
2. Query Context7 for the exact library/version docs before proposing changes.
3. Compare the repo's current patterns with docs before declaring code invalid.
4. If Context7 is unavailable, stop and report that explicitly before any API-level conclusions.
## Quick Reference

### What This System Does

The Password Management System handles the complete password lifecycle: forgot password, reset password, and change password flows. It is the ConvexPress equivalent of WordPress's `wp-login.php?action=lostpassword`, `wp-login.php?action=rp`, and the Profile "Account Management" section. Crucially, **Convex Auth handles all cryptographic password operations** (storage, hashing, validation, reset tokens, rate limiting). ConvexPress's role is strictly limited to providing branded UI pages, emitting events for the audit trail, sending optional custom notification emails, and enabling admin-initiated password resets.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Convex Auth Boundary** | Convex Auth owns ALL password cryptography. ConvexPress never stores, hashes, or validates passwords. |
| **Event Plumbing** | ConvexPress's primary job is orchestrating events (`password.reset_requested`, `password.changed`, `password.reset_completed`) for audit and notification. |
| **Webhook Detection** | Password changes are detected via Convex Auth's `user.updated` webhook. A timestamp heuristic distinguishes reset completions from profile changes. |
| **Admin Reset** | Admins can trigger a reset (Convex Auth sends the email) but can never see or set another user's password -- more secure than WordPress. |
| **Email Enumeration Prevention** | The forgot-password form always shows the same success message regardless of whether the email exists. |
| **OAuth Users** | Users who signed up via OAuth may not have a password. The system handles "Add Password" vs "Change Password" UI states. |
| **Multi-App Auth** | Password reset/forgot flows happen on the Website app. Admin app redirects to the website for these flows via Convex Auth redirect URIs. |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| Password storage | `wp_users.user_pass` (bcrypt/phpass hash) | Convex Auth (never in Convex) |
| Reset token storage | `wp_users.user_activation_key` | Convex Auth (internal token system) |
| Reset token expiry | 24 hours (filterable via `password_reset_expiration`) | Convex Auth-managed (configurable in Dashboard) |
| Password hashing | `wp_hash_password()` / phpass | Convex Auth (bcrypt) |
| Password validation | `wp_check_password()` | Convex Auth (internal) |
| Strength meter | jQuery zxcvbn on Profile + reset forms | Convex Auth built-in enforcement |
| Lost password page | `wp-login.php?action=lostpassword` | `/forgot-password` (Convex Auth component) |
| Reset password page | `wp-login.php?action=rp` | `/reset-password` (Convex Auth component) |
| Profile password change | Profile > Account Management > "Generate Password" | `/dashboard/settings` > Password section |
| Rate limiting | Basic (WordPress core) | Convex Auth built-in rate limiting |
| Session invalidation | `wp_destroy_other_sessions()` | Convex Auth auto-invalidates other sessions |
| Admin password reset | Admin can set password directly | Admin can only trigger reset email (more secure) |
| Reset email | `retrieve_password()` sends email | Convex Auth sends email + optional ConvexPress supplement |
| Changed confirmation | `wp_password_change_notification()` | ConvexPress `password.changed` event -> email via Resend |
| Real-time updates | None | Convex reactive `lastPasswordChangedAt` updates |

---

## Architecture Overview

### Data Flow

```
User Action (UI)
    |
    v
Convex Auth Component (handles all crypto)
    |
    +--> Convex Auth sends reset email (forgot-password flow)
    +--> Convex Auth updates password (change/reset flow)
    |
    v
Convex Auth fires user.updated webhook --> Convex HTTP endpoint
    |
    v
ConvexPress webhook handler (convex/http.ts)
    |
    +--> Detects password change via timestamp heuristic
    +--> Calls handlePasswordChanged() or handlePasswordResetCompleted()
    |
    v
Internal mutation updates user record
    |
    +--> Updates lastPasswordChangedAt, passwordResetCount
    |
    v
Event Dispatcher (internal.events.dispatch)
    |
    +--> password.changed or password.reset_completed event
    |
    v
Event subscribers:
    +--> Audit Log System (logs entry)
    +--> Email Notification System (sends confirmation email)
    +--> Site Notification System (shows toast)
```

### Password Change Detection Heuristic

Convex Auth does not fire a dedicated "password changed" webhook. ConvexPress uses a timestamp-based heuristic:

1. When user submits forgot-password form, ConvexPress records `passwordResetRequestedAt` timestamp.
2. When `user.updated` webhook fires, check if `passwordResetRequestedAt` is within the last 1 hour.
3. If yes: this is a **reset completion** -> emit `password.reset_completed`.
4. If no: this is a **profile password change** -> emit `password.changed`.

**Limitation:** If Convex Auth's `user.updated` webhook fires for non-password reasons (e.g., profile name change), ConvexPress may incorrectly emit a password event. Future improvement: check Convex Auth's `password_enabled` field or session metadata more precisely.

### Real-Time Behavior

- **`lastPasswordChangedAt`** updates reactively via Convex subscription. The `/dashboard/settings` page shows "Last changed: just now" immediately.
- **Site notifications** (toasts) are delivered via Convex real-time subscription to the `siteNotifications` table.
- **No polling** -- all updates are pushed via Convex's reactive query system.

### Authentication & Authorization

| Context | Auth Requirement |
|---------|-----------------|
| `/forgot-password` page | None (public). Redirects authenticated users to `/dashboard/settings`. |
| `/reset-password` page | None (public). Requires valid Convex Auth reset token in URL. |
| `/dashboard/settings` | Authenticated (any role). Users can only change their own password. |
| `getPasswordStatus` query (own) | Authenticated (any role). |
| `getPasswordStatus` query (other user) | Administrator only. |
| `adminResetUserPassword` action | Administrator only. |
| `recordResetRequest` mutation | Internal only (called from server action, not client). |

---

## Database Schema

### Users Table (Password-Relevant Fields)

The Password Management System does NOT define its own table. It adds fields to the shared `users` table (owned by the Auth System). These are the three password-specific fields:

```typescript
// convex/schema.ts (password-relevant subset within the shared users table)

users: defineTable({
  // ... (fields from Auth, Registration, Profile, Role & Capability systems) ...

  // === Password Management Fields ===
  lastPasswordChangedAt: v.optional(v.number()),     // Unix timestamp (ms) of last password change
  passwordResetRequestedAt: v.optional(v.number()),  // Unix timestamp (ms) of last reset request
  passwordResetCount: v.optional(v.number()),         // Total lifetime password resets (integer)
})
// ... (existing indexes from other systems) ...
```

**Field Details:**

| Field | Type | Default | Purpose | Set By |
|-------|------|---------|---------|--------|
| `lastPasswordChangedAt` | `v.optional(v.number())` | `undefined` | Unix timestamp of last password change (from profile or reset). Used to display "Last changed: {date}" in settings. | `handlePasswordChanged`, `handlePasswordResetCompleted` |
| `passwordResetRequestedAt` | `v.optional(v.number())` | `undefined` | Unix timestamp of most recent reset request. Used by the webhook heuristic to distinguish reset completions from profile changes. | `recordResetRequest`, `recordAdminReset` |
| `passwordResetCount` | `v.optional(v.number())` | `undefined` (treat as 0) | Lifetime count of password resets (not profile changes). Useful for admin audit view. | `handlePasswordResetCompleted` |

### Indexes

No new indexes are required for the Password Management System. It relies on existing indexes:

| Index | Fields | Used By |
|-------|--------|---------|
| `by_email` | `["email"]` | `recordResetRequest` -- look up user by email |
| `by_clerkUserId` | `["clerkUserId"]` | Webhook handler -- look up user by the auth system ID |

### Relationships

| Related Table | Relationship | Notes |
|---------------|-------------|-------|
| `auditLog` (Audit Log System) | Password events are logged to the shared audit log table. No direct FK; events are dispatched. | Downstream consumer |
| `siteNotifications` (Site Notification System) | Password changed notifications are created in this table. FK via `recipientId`. | Downstream consumer |
| `settings` (Settings System) | Password email settings are stored here (`sendPasswordResetEmail`, `sendPasswordChangedEmail`, `notifyAdminOnPasswordReset`). | Read-only dependency |

### Password Settings (in Settings Table)

These settings live in the shared `settings` table under the `"email"` group:

| Group | Key | Type | Default | Label | Description |
|-------|-----|------|---------|-------|-------------|
| `email` | `sendPasswordResetEmail` | `boolean` | `false` | Send Custom Password Reset Email | Send ConvexPress-branded reset email in addition to the auth system's. |
| `email` | `sendPasswordChangedEmail` | `boolean` | `true` | Send Password Changed Confirmation | Send confirmation email when password changes. |
| `email` | `notifyAdminOnPasswordReset` | `boolean` | `false` | Notify Admin on Password Reset | Send admin notification when any user resets password. |

---

## Actions & Functions

### Mutations

#### recordResetRequest (Internal Mutation)

- **Type:** `internalMutation`
- **File:** `convex/password/mutations.ts`
- **Auth:** None (internal -- called from server action, never exposed to client)
- **WordPress Equivalent:** `retrieve_password()` firing `lostpassword_post` action
- **Args:**
  ```typescript
  {
    email: v.string(),   // Email address submitted in forgot-password form
  }
  ```
- **Returns:** `void` (always succeeds to prevent email enumeration)
- **Behavior:**
  1. Query `users` table by email using `by_email` index.
  2. If user exists:
     a. Patch user record: set `passwordResetRequestedAt` to `Date.now()`.
     b. Schedule `internal.events.dispatch` with event code `password.reset_requested`.
  3. If user does NOT exist: do nothing (silent -- no error, no event).
  4. Always returns successfully to caller.
- **Events:** `password.reset_requested` (only if user exists)
- **Errors:** None thrown (by design -- email enumeration prevention)
- **Security:** Never reveals whether the email address belongs to an existing account.

#### handlePasswordChanged (Internal Mutation)

- **Type:** `internalMutation`
- **File:** `convex/password/mutations.ts`
- **Auth:** None (internal -- called from webhook handler)
- **WordPress Equivalent:** `wp_set_password()` within `wp_update_user()` + `profile_update` action
- **Args:**
  ```typescript
  {
    userId: v.id("users"),   // ConvexPress user ID
    externalAuthId: v.string(),     // user identifier
    timestamp: v.number(),   // Unix timestamp of the change
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Patch user record: set `lastPasswordChangedAt` to `args.timestamp`.
  2. Schedule `internal.events.dispatch` with event code `password.changed`.
- **Events:** `password.changed`

#### handlePasswordResetCompleted (Internal Mutation)

- **Type:** `internalMutation`
- **File:** `convex/password/mutations.ts`
- **Auth:** None (internal -- called from webhook handler)
- **WordPress Equivalent:** `reset_password()` + `after_password_reset` action
- **Args:**
  ```typescript
  {
    userId: v.id("users"),   // ConvexPress user ID
    externalAuthId: v.string(),     // user identifier
    timestamp: v.number(),   // Unix timestamp of the reset
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Get user record. If not found, return early.
  2. Patch user record:
     a. Set `lastPasswordChangedAt` to `args.timestamp`.
     b. Increment `passwordResetCount` by 1.
  3. Schedule `internal.events.dispatch` with event code `password.reset_completed`.
- **Events:** `password.reset_completed`

#### recordAdminReset (Internal Mutation)

- **Type:** `internalMutation`
- **File:** `convex/password/mutations.ts`
- **Auth:** None (internal -- called from `adminResetUserPassword` action which enforces auth)
- **WordPress Equivalent:** No direct equivalent (WordPress admins set passwords directly)
- **Args:**
  ```typescript
  {
    targetUserId: v.id("users"),   // User whose password is being reset
    adminId: v.id("users"),        // Admin who initiated the reset
    timestamp: v.number(),         // Unix timestamp
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Patch target user record: set `passwordResetRequestedAt` to `args.timestamp`.
  2. Get target user's email from database.
  3. Schedule `internal.events.dispatch` with event code `password.reset_requested` and `isAdminInitiated: true` in payload.
- **Events:** `password.reset_requested` (with `isAdminInitiated: true`, `initiatedBy: adminId`)

### Actions

#### adminResetUserPassword (Public Action)

- **Type:** `action`
- **File:** `convex/password/actions.ts`
- **Auth:** Required -- Administrator role only
- **WordPress Equivalent:** No direct equivalent (WordPress admins set passwords directly; ConvexPress is more secure)
- **Args:**
  ```typescript
  {
    targetUserId: v.id("users"),   // User to reset password for
  }
  ```
- **Returns:** `void` (throws on failure)
- **Behavior:**
  1. Verify caller has Administrator role via `requireRole(ctx, "administrator")`.
  2. Get target user via `internal.users.getById`. Throw "User not found" if missing.
  3. Call Convex Auth Admin API: `PATCH /v1/users/{externalAuthId}` with `skip_password_checks: true` to clear the user's password, forcing them to set a new one.
  4. Call `internal.password.mutations.recordAdminReset` to record the event.
- **Events:** `password.reset_requested` (via `recordAdminReset`)
- **Errors:**
  - `"User not found."` -- target user doesn't exist in Convex.
  - `"Failed to initiate password reset via Convex Auth."` -- Auth API returned non-OK response.
  - Auth error if caller is not Administrator.

### Queries

#### getPasswordStatus (Public Query)

- **Type:** `query`
- **File:** `convex/password/queries.ts`
- **Auth:** Required (any authenticated user for own status; Administrator for another user's status)
- **WordPress Equivalent:** No direct equivalent (WordPress doesn't expose password metadata)
- **Args:**
  ```typescript
  {
    userId: v.optional(v.id("users")),   // Optional: view another user's status (admin only)
  }
  ```
- **Returns:**
  ```typescript
  {
    lastPasswordChangedAt: number | null,
    passwordResetRequestedAt: number | null,
    passwordResetCount: number,
  } | null
  ```
- **Behavior:**
  1. Get caller identity via `ctx.auth.getUserIdentity()`. Return `null` if unauthenticated.
  2. If `args.userId` is provided:
     a. Require Administrator role via `requireRole(ctx, "administrator")`.
     b. Get target user via `ctx.db.get(args.userId)`.
  3. If `args.userId` is NOT provided:
     a. Look up current user via `by_externalAuthId` index using `identity.subject`.
  4. If user not found, return `null`.
  5. Return password status fields (defaulting `passwordResetCount` to 0 if undefined).
- **Used By:**
  - `/dashboard/settings` page -- shows "Last changed: {date}".
  - `/admin/users/$userId/edit` page -- admin views user's password info.

### Webhook Handler Integration

The password system hooks into the **shared auth webhook handler** in `convex/http.ts`. This handler is shared with the Auth System and Registration System.

```typescript
// Inside the "user.updated" case of the auth webhook handler:

// 1. Look up ConvexPress user by externalAuthId
const user = await ctx.runQuery(internal.users.getByIdentifier, { externalAuthId: id });
if (!user) break;

// 2. Determine if this is a password change event
//    Heuristic: check if passwordResetRequestedAt is within last hour
const wasResetRequested = user.passwordResetRequestedAt &&
  (Date.now() - user.passwordResetRequestedAt) < 60 * 60 * 1000;

// 3. Route to appropriate handler
if (wasResetRequested) {
  await ctx.runMutation(internal.password.mutations.handlePasswordResetCompleted, {
    userId: user._id, externalAuthId: id, timestamp: Date.now(),
  });
} else {
  await ctx.runMutation(internal.password.mutations.handlePasswordChanged, {
    userId: user._id, externalAuthId: id, timestamp: Date.now(),
  });
}
```

**Important caveat:** The `user.updated` webhook fires for ANY user update (name change, email change, etc.), not just password changes. The implementation must distinguish password changes from other updates. Possible approaches:
1. Compare `password_enabled` field (if Convex Auth provides it in webhook).
2. Compare `updated_at` with stored `lastPasswordChangedAt`.
3. Check if specific password-related fields changed.

This is an **open question** in the PRD and should be refined during implementation.

---

## Events

### password.reset_requested

- **Airtable ID:** `rec3apXxW71f9kAaE`
- **Event Code:** `password.reset_requested`
- **Type:** Auth
- **Triggered By:** `recordResetRequest` mutation (user-initiated) or `recordAdminReset` mutation (admin-initiated)
- **Payload:**
  ```typescript
  {
    email: string,                         // Email address that requested reset
    userId: Id<"users">,                   // ConvexPress user ID
    initiatedBy?: Id<"users">,            // Admin ID (if admin-triggered)
    isAdminInitiated?: boolean,            // true if admin-triggered
  }
  ```
- **Subscribers:**
  - Email: "Password Reset Request" (`rec4b2xU9mhSZRFpv`) -- **conditional** on `sendPasswordResetEmail` setting (default: false)
  - Site Notification: None
  - Audit Log: Yes -- "Password reset requested for {email}" or "Admin {admin} requested password reset for {email}"

### password.changed

- **Airtable ID:** `recwXx9LwQYv97x3y`
- **Event Code:** `password.changed`
- **Type:** Auth
- **Triggered By:** `handlePasswordChanged` mutation (via Convex Auth `user.updated` webhook)
- **Payload:**
  ```typescript
  {
    userId: Id<"users">,                   // ConvexPress user ID
    externalAuthId: string,                       // user identifier
  }
  ```
- **Subscribers:**
  - Email: "Password Changed Confirmation" (`recwJQkFEscgrjfQl`) -- **conditional** on `sendPasswordChangedEmail` setting (default: true)
  - Site Notification: "Password Changed" success toast (`rec47ICLndaYlXW83`)
  - Audit Log: Yes -- "Password changed by {user}"

### password.reset_completed

- **Airtable ID:** `reczxiDTapEmbr6IW`
- **Event Code:** `password.reset_completed`
- **Type:** Auth
- **Triggered By:** `handlePasswordResetCompleted` mutation (via Convex Auth `user.updated` webhook when reset detected)
- **Payload:**
  ```typescript
  {
    userId: Id<"users">,                   // ConvexPress user ID
    externalAuthId: string,                       // user identifier
  }
  ```
- **Subscribers:**
  - Email: None (the `password.changed` event covers the confirmation email)
  - Site Notification: None
  - Audit Log: Yes -- "Password reset completed by {user}"

**Note:** `password.reset_completed` is distinct from `password.changed` to enable differentiation in the audit log. However, the Email Notification System may also send the "Password Changed Confirmation" email for reset completions -- this is configurable.

---

## Admin Routes & UI

### User Edit Page -- Reset Password Button (`/admin/users/$userId/edit`)

- **Airtable Route ID:** (part of User Profile System route)
- **Purpose:** Allow administrators to trigger a password reset for another user
- **WordPress Equivalent:** Users > Edit User (WordPress lets admins set passwords directly; ConvexPress only allows triggering a reset email)
- **Layout:** Admin layout with sidebar
- **Key Components:**
  - `ResetPasswordButton` -- A button within the existing user edit page
  - Confirmation dialog: "Send a password reset email to {email}?"
  - Success toast: "Password reset email sent to {email}"
- **Data Requirements:**
  - `getPasswordStatus({ userId })` query -- shows last changed date and reset count
  - `adminResetUserPassword({ targetUserId })` action -- triggers the reset
- **User Interactions:**
  - Admin clicks "Reset Password" button
  - Confirmation dialog appears
  - Admin confirms -> Convex Auth sends reset email to user
  - Admin sees success toast
- **Real-Time:** The `lastPasswordChangedAt` and `passwordResetRequestedAt` fields update reactively when the target user completes their reset.

---

## Website Routes

### Forgot Password (`/forgot-password`)

- **Airtable Route ID:** `recOOJ6YJvlpcF1WK`
- **Purpose:** Allow users to request a password reset by entering their email
- **App:** Website (TanStack Start)
- **Layout:** Marketing layout (`_marketing`) -- centered card, same style as `/login` and `/register`
- **Auth Required:** No (public). Redirects authenticated users to `/dashboard/settings`.
- **WordPress Equivalent:** `wp-login.php?action=lostpassword`
- **SEO:** `noindex, nofollow` -- no search indexing needed
- **Data Requirements:**
  - Server action to call `recordResetRequest` (internal mutation) after form submission
  - Convex Auth component or `useAuth()` hook for forgot-password flow
- **UI Components:**
  ```
  /forgot-password
  +-- <PageHeader> "Forgot your password?"
  +-- <ForgotPasswordForm>
  |   +-- <Convex AuthForgotPassword />    (Convex Auth's forgot-password component)
  |   |   +-- Email input field
  |   |   +-- "Send Reset Link" submit button
  |   +-- <SuccessMessage />         "Check your inbox" (shown after submit)
  +-- <BackToLogin />                 Link to /login
  +-- <Footer />
  ```
- **User Flow:**
  1. Display email input form.
  2. User enters email, clicks submit.
  3. Convex Auth sends reset email (Convex Auth handles delivery).
  4. ConvexPress calls `recordResetRequest` server action for audit.
  5. Show: "If an account exists with that email, we've sent a password reset link. Check your inbox."
  6. Show "Back to login" link.

### Reset Password (`/reset-password`)

- **Airtable Route ID:** `rec63QGyl7y4w2jWk`
- **Purpose:** Allow users to set a new password after clicking the reset link in their email
- **App:** Website (TanStack Start)
- **Layout:** Marketing layout (`_marketing`) -- centered card
- **Auth Required:** No (public -- accessed via email link with the auth system token)
- **WordPress Equivalent:** `wp-login.php?action=rp&key={key}&login={login}`
- **SEO:** `noindex, nofollow`
- **Data Requirements:**
  - Convex Auth reset password component (validates token, enforces strength, updates password)
  - No direct Convex queries (webhook handles the backend update)
- **UI Components:**
  ```
  /reset-password
  +-- <PageHeader> "Reset your password"
  +-- <ResetPasswordForm>
  |   +-- <Convex AuthResetPassword />     (Convex Auth's reset-password component)
  |   |   +-- New password input
  |   |   +-- Confirm password input
  |   |   +-- Password strength indicator (Convex Auth built-in)
  |   |   +-- Submit button
  |   +-- <TokenExpired />           "This link is expired" error state
  |   +-- <TokenInvalid />           "This link is invalid" error state
  +-- <RequestNewLink />              Link to /forgot-password
  +-- <Footer />
  ```
- **User Flow:**
  1. User arrives from email link with the auth system token params.
  2. Convex Auth validates token:
     - Invalid/expired: show error + link to `/forgot-password`.
     - Valid: show new password form.
  3. User enters new password.
  4. Convex Auth enforces strength, updates password, invalidates other sessions.
  5. Convex Auth fires `user.updated` webhook.
  6. ConvexPress webhook handler detects reset completion, emits `password.reset_completed`.
  7. Redirect to `/login` with message: "Your password has been reset. Please log in with your new password."

### Account Settings -- Password Section (`/dashboard/settings`)

- **Airtable Route ID:** `recq5KczTiT7IyRJ0`
- **Purpose:** Allow authenticated users to change their password from their dashboard
- **App:** Website (TanStack Start)
- **Layout:** Dashboard layout (`_dashboard`)
- **Auth Required:** Yes (all authenticated roles)
- **Shared With:** User Profile System (`recC5k3UpvlW4vaAb`)
- **WordPress Equivalent:** Profile > Account Management > "Generate Password"
- **Data Requirements:**
  - `getPasswordStatus()` query (no args = own status)
  - Convex Auth `<AuthKitUserProfile />` component or `useUser()` hook for password change
- **UI Components (Password Section Only):**
  ```
  /dashboard/settings
  +-- ... (Profile section - User Profile System)
  +-- <PasswordSection>
  |   +-- <SectionHeader title="Password" />
  |   +-- <PasswordLastChanged>
  |   |   +-- "Last changed: February 5, 2026" or "Never changed"
  |   +-- <ChangePasswordButton />
  |   |   +-- <Convex AuthPasswordChange />  (Convex Auth's password management component)
  |   +-- <OAuthNotice />              (conditional: "You signed in with Google")
  +-- ... (Notification preferences - Site Notification System)
  ```
- **OAuth User Handling:**
  - If user has no password (OAuth-only): show "You signed in with {provider}. You can add a password for email/password login." + "Add Password" button.
  - If user has password: show "Last changed: {date}" + "Change Password" button.
  - If user has both OAuth and password: show normal "Change Password" UI.

---

## Notifications

### Email Notifications

| Name | Airtable ID | Event | Recipients | Priority | Subject | Conditional |
|------|-------------|-------|------------|----------|---------|-------------|
| Password Reset Request | `rec4b2xU9mhSZRFpv` | `password.reset_requested` | Customer (requesting user) | Immediate | "Reset your password for {site_name}" | Only if `sendPasswordResetEmail` = true (default: false) |
| Password Changed Confirmation | `recwJQkFEscgrjfQl` | `password.changed` | Customer (user whose password changed) | Immediate | "Your password was changed" | Only if `sendPasswordChangedEmail` = true (default: true) |

#### Password Reset Request Email Template Variables

| Variable | Source | Example |
|----------|--------|---------|
| `{site_name}` | Settings > General > Site Title | "My Blog" |
| `{user_email}` | User email | "troy@example.com" |
| `{display_name}` | User display name | "Troy" |
| `{reset_url}` | Convex Auth's reset URL or `/forgot-password` | "https://example.com/reset-password?token=..." |
| `{ip_address}` | Request IP from context | "192.168.1.1" |
| `{timestamp}` | Formatted date/time | "February 8, 2026 at 3:45 PM" |

#### Password Changed Confirmation Email Template Variables

| Variable | Source | Example |
|----------|--------|---------|
| `{site_name}` | Settings > General > Site Title | "My Blog" |
| `{user_email}` | User email | "troy@example.com" |
| `{display_name}` | User display name | "Troy" |
| `{timestamp}` | Formatted date/time | "February 8, 2026 at 3:45 PM" |
| `{settings_url}` | Account settings URL | "https://example.com/dashboard/settings" |

### Site Notifications

| Name | Airtable ID | Event | Type | Persistent | Recipients | Message |
|------|-------------|-------|------|-----------|------------|---------|
| Password Changed | `rec47ICLndaYlXW83` | `password.changed` | Success (toast) | No | Customer (user) | "Your password was changed successfully" |

---

## Role & Capability Matrix

### Action Permissions

| Action | Admin | Editor | Author | Contributor | Subscriber | Anonymous |
|--------|:-----:|:------:|:------:|:-----------:|:----------:|:---------:|
| Request password reset (self) | Yes | Yes | Yes | Yes | Yes | Yes |
| Request password reset (for another user) | Yes | No | No | No | No | No |
| Complete password reset (self) | Yes | Yes | Yes | Yes | Yes | Yes* |
| Change password (own profile) | Yes | Yes | Yes | Yes | Yes | No |
| View own password status | Yes | Yes | Yes | Yes | Yes | No |
| View another user's password status | Yes | No | No | No | No | No |
| Trigger admin password reset for user | Yes | No | No | No | No | No |

*Anonymous users with a valid reset token can complete the reset without being logged in.

### Route Access

| Route | Roles | Auth Required | Notes |
|-------|-------|:------------:|-------|
| `/forgot-password` | Anonymous | No | Public. Redirects authenticated users to `/dashboard/settings`. |
| `/reset-password` | Anonymous | No | Public. Requires valid Convex Auth reset token. |
| `/dashboard/settings` | All authenticated | Yes | Password section available to all roles. |
| `/admin/users/$userId/edit` | Administrator | Yes | Admin can trigger password reset for users. |

### Airtable Discrepancy Note

The Airtable records show `password.request_reset` and `password.reset` linked only to the Administrator role. This is an architectural oversight in the Airtable data:
- `password.request_reset` MUST be accessible to anonymous users (otherwise forgot-password doesn't work).
- `password.reset` (self-service) MUST be accessible to anonymous users with a valid token.
- Only the admin-initiated variant of `password.reset` requires Administrator role.

---

## Dependencies

### Depends On

| System | Type | What's Needed |
|--------|------|---------------|
| **Auth System** (`recNGEVtMvLjp6o8h`) | **Hard** | Convex Auth integration, shared webhook handler in `convex/http.ts`, session management, `requireRole()` helper, `getUserIdentity()`. Without Auth, nothing works. |
| **Event Dispatcher System** | **Hard** | `internal.events.dispatch` function. All password events flow through the dispatcher. Without it, no audit trail, no notifications. |
| **Settings System** | **Soft** | Reads `sendPasswordResetEmail`, `sendPasswordChangedEmail`, `notifyAdminOnPasswordReset` settings. System works without it (uses defaults). |
| **Email Notification System** | **Soft** | Delivers password-related emails via Resend. System works without it (Convex Auth's built-in emails handle the critical path). |
| **Site Notification System** | **Soft** | Delivers "Password Changed" success toast. System works without it (no toast, but password still changes). |
| **User Profile System** (`recC5k3UpvlW4vaAb`) | **Medium** | Shares the `/dashboard/settings` route. Password section is embedded within the Profile System's settings page. |

### Depended On By

| System | What They Need |
|--------|---------------|
| **Audit Log System** | Consumes `password.reset_requested`, `password.changed`, `password.reset_completed` events for audit trail entries. |

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/)

- [ ] `convex/password/mutations.ts` -- 4 internal mutations: `recordResetRequest`, `handlePasswordChanged`, `handlePasswordResetCompleted`, `recordAdminReset`
- [ ] `convex/password/actions.ts` -- 1 action: `adminResetUserPassword`
- [ ] `convex/password/queries.ts` -- 1 query: `getPasswordStatus`
- [ ] `convex/schema.ts` -- Add 3 fields to `users` table: `lastPasswordChangedAt`, `passwordResetRequestedAt`, `passwordResetCount`
- [ ] `convex/http.ts` -- Add password change detection logic to existing Convex Auth `user.updated` webhook handler

### Admin Frontend (ConvexPress-Admin/apps/web/)

- [ ] `src/components/password/ResetPasswordButton.tsx` -- Admin "Reset Password" button with confirmation dialog
- [ ] Integration into existing `src/routes/admin/users/$userId/edit.tsx` page (add ResetPasswordButton + password status display)

### Website Frontend (ConvexPress-Website/apps/web/)

- [ ] `src/routes/forgot-password.tsx` -- Forgot password page route
- [ ] `src/routes/reset-password.tsx` -- Reset password page route
- [ ] `src/routes/dashboard/settings.tsx` -- Password section within shared settings page (or contribute PasswordSection component)
- [ ] `src/components/password/ForgotPasswordForm.tsx` -- Convex Auth forgot-password wrapper
- [ ] `src/components/password/ResetPasswordForm.tsx` -- Convex Auth reset-password wrapper
- [ ] `src/components/password/PasswordSection.tsx` -- Dashboard settings password section
- [ ] `src/components/password/PasswordLastChanged.tsx` -- "Last changed: {date}" display

### Email Templates

- [ ] `emails/password-reset-request.tsx` -- React Email template for password reset request
- [ ] `emails/password-changed.tsx` -- React Email template for password changed confirmation

### Convex Auth Configuration

- [ ] Enable password authentication in Convex Auth Dashboard
- [ ] Set password strength to Medium or higher
- [ ] Enable forgot password flow
- [ ] Configure `user.updated` webhook pointing to Convex HTTP endpoint
- [ ] Set password reset URL to `/reset-password`
- [ ] Set after sign-in URL to `/dashboard`

---

## Edge Cases & Gotchas

1. **Convex Auth `user.updated` fires for all updates, not just passwords.** The webhook handler must distinguish password changes from name/email/profile changes. The current heuristic (checking `passwordResetRequestedAt` within 1 hour) is imperfect. During implementation, investigate whether Convex Auth provides more specific fields in the webhook payload to detect password-specific changes.

2. **Email enumeration prevention is critical.** The `/forgot-password` form must ALWAYS return the same success message ("If an account exists...") regardless of whether the email exists. The `recordResetRequest` mutation silently does nothing if the user is not found. Never expose user existence through error messages.

3. **OAuth users without passwords.** A user who signed up via Google/GitHub may have no password. The `/dashboard/settings` password section must detect this state (via Convex Auth's `password_enabled` field or `user.passwordEnabled`) and show "Add Password" instead of "Change Password". Visiting `/forgot-password` for an OAuth-only account should display a helpful message, not an error.

4. **Race condition: webhook arrives before `recordResetRequest` completes.** If the user submits the forgot-password form and Convex Auth sends the reset email very quickly, the user might click the reset link and complete the reset before ConvexPress's `recordResetRequest` mutation sets `passwordResetRequestedAt`. In this edge case, the webhook heuristic would incorrectly classify the reset as a "profile change" instead of a "reset completion". Mitigate by ensuring `recordResetRequest` is called synchronously before Convex Auth's form submission (or accept the minor audit log inaccuracy).

5. **Admin-initiated resets vs self-service resets.** Admin resets set `isAdminInitiated: true` in the event payload. The audit log should clearly distinguish "Admin Troy reset password for User Alice" from "User Alice requested a password reset". Both go through the same event code but with different payload shapes.

6. **Cross-app redirect pattern.** Password reset and forgot-password pages exist ONLY on the Website app. The Admin app does NOT have these pages -- it redirects to the website via Convex Auth redirect URIs. Admin users who need to reset their own password must use the Website app's pages or the Convex Auth-provided flow.

7. **Session invalidation after password change.** Convex Auth automatically invalidates all other sessions when a password is changed. ConvexPress does not need to handle this, but the UI should account for the possibility that the user's other tabs/devices may be logged out.

8. **Multiple rapid reset requests.** A user might submit the forgot-password form multiple times. Each submission updates `passwordResetRequestedAt` and creates a new audit log entry. Convex Auth handles rate limiting on the email delivery side. ConvexPress records each request but does not enforce its own rate limit.

9. **Password changed confirmation should fire for reset completions too.** The "Password Changed Confirmation" email (triggered by `password.changed`) should also be sent when a password is reset (triggered by `password.reset_completed`). The event handler for `password.reset_completed` should consider also emitting `password.changed` or the email notification handler should listen to both events.

10. **Settings dependency graceful degradation.** If the Settings System is not yet implemented, all email settings should use their default values (`sendPasswordResetEmail: false`, `sendPasswordChangedEmail: true`, `notifyAdminOnPasswordReset: false`). The password system should not crash if settings queries return null.

11. **Convex Auth component versioning.** Convex Auth's React components (`<SignIn />`, `<AuthKitUserProfile />`) evolve across versions. The wrapper components (`ForgotPasswordForm`, `ResetPasswordForm`, `PasswordSection`) should be thin wrappers so they can adapt to Auth API changes with minimal impact.

12. **Migration from WordPress.** WordPress password hashes cannot be imported into the auth system. All migrated users must reset their passwords. Consider using the auth system's "force password reset on first login" feature for imported users. The migration script should set `lastPasswordChangedAt: null` and `passwordResetCount: 0`.

---

## WordPress Functions Reference

| WordPress Function | ConvexPress Equivalent | Notes |
|-------------------|------------------------|-------|
| `wp_hash_password($password)` | N/A -- Convex Auth handles | Convex Auth uses bcrypt internally |
| `wp_check_password($password, $hash)` | N/A -- Convex Auth handles | Convex Auth validates during authentication |
| `wp_set_password($password, $user_id)` | Convex Auth `updateUser()` API | Called via admin API or Convex Auth component |
| `get_password_reset_key($user)` | Convex Auth's reset token system | Convex Auth generates tokens internally |
| `check_password_reset_key($key, $login)` | Convex Auth's token validation | Convex Auth validates tokens internally |
| `retrieve_password()` | Convex Auth's forgot-password flow + `recordResetRequest` | Convex Auth sends email; ConvexPress records event |
| `reset_password($user, $new_password)` | Convex Auth reset completion + `handlePasswordResetCompleted` | Convex Auth updates password; ConvexPress records event |
| `wp_password_change_notification($user)` | `password.changed` event -> Email Notification System | ConvexPress sends email via Resend |

### WordPress Hooks Mapping

| WordPress Hook | Type | ConvexPress Event |
|---------------|------|-------------------|
| `lostpassword_post` | Action | `password.reset_requested` |
| `retrieve_password_key` | Filter | N/A -- Convex Auth internal |
| `retrieve_password_message` | Filter | Email template customization |
| `password_reset_expiration` | Filter | Convex Auth Dashboard configuration |
| `password_reset` | Action | `password.reset_completed` |
| `after_password_reset` | Action | `password.reset_completed` |
| `profile_update` (password context) | Action | `password.changed` |

---

## Airtable Record Reference

### System Record

| Field | Value |
|-------|-------|
| Record ID | `recEFTu5tLbUiNsTW` |
| Name | Password Management System |
| Category | User & Auth |
| Priority | P1 - High |
| Complexity | Simple |
| Depends On | Auth System (`recNGEVtMvLjp6o8h`) |

### Routes

| Record ID | Name | Path | App | Auth |
|-----------|------|------|-----|------|
| `recOOJ6YJvlpcF1WK` | Forgot Password | `/forgot-password` | Website | No |
| `rec63QGyl7y4w2jWk` | Reset Password | `/reset-password` | Website | No |
| `recq5KczTiT7IyRJ0` | Account Settings | `/dashboard/settings` | Website | Yes |

### Actions

| Record ID | Name | Action Code |
|-----------|------|-------------|
| `reczfWB01n2eFtwKY` | Request Password Reset | `password.request_reset` |
| `recJE7KfoRvA75ggJ` | Reset Password | `password.reset` |
| `recDrZ0ugxs9VHdvi` | Change Password | `password.change` |

### Events

| Record ID | Name | Event Code |
|-----------|------|------------|
| `rec3apXxW71f9kAaE` | Password Reset Requested | `password.reset_requested` |
| `recwXx9LwQYv97x3y` | Password Changed | `password.changed` |
| `reczxiDTapEmbr6IW` | Password Reset Completed | `password.reset_completed` |

### Email Notifications

| Record ID | Name | Triggered By |
|-----------|------|-------------|
| `rec4b2xU9mhSZRFpv` | Password Reset Request | `password.reset_requested` |
| `recwJQkFEscgrjfQl` | Password Changed Confirmation | `password.changed` |

### Site Notifications

| Record ID | Name | Triggered By |
|-----------|------|-------------|
| `rec47ICLndaYlXW83` | Password Changed | `password.changed` |


