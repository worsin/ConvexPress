# Registration System - Expert Knowledge Document

**System:** Registration System
**Airtable System ID:** `[redacted-airtable-record-id]`
**Status:** Implementation Ready
**Priority:** P0 - Critical
**Complexity:** Simple
**Category:** User & Auth
**Layer:** Full Stack
**WordPress Equivalent:** `wp-login.php?action=register`, `Users > Add New`, `wp_create_user()`, `wp_insert_user()`, `wp_new_user_notification()`
**Last Analyzed:** 2026-02-08

---

## MANDATORY: Agent Self-Calibration (2026-02-17)

This agent's pretrained assumptions can be stale. I must self-audit against the Airtable stack-update source before I classify framework behavior as a bug.

### Self-Audit Inputs

- Agent: $(@{Name=Registration System Expert; Path=.codex/docs/REGISTRATION-SYSTEM.md}.Name)
- Source file: $(@{Name=Registration System Expert; Path=.codex/docs/REGISTRATION-SYSTEM.md}.Path)
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

The Registration System is the gateway through which every user enters ConvexPress. It handles user signup (self-registration, OAuth, invitation-based), email verification, admin-initiated user creation via invitations, and the welcome onboarding flow. In WordPress terms, it replaces `wp-login.php?action=register`, the `Users > Add New` admin screen, `wp_create_user()` / `wp_insert_user()`, and `wp_new_user_notification()`. The system bridges two layers: **Convex Auth** owns authentication identity (email, password, OAuth, sessions), and **Convex** owns the application user record (role, profile, preferences, timestamps).

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Self-Registration** | User signs up directly on the website `/register` page (when enabled) |
| **Invitation Registration** | Admin creates invitation, user receives email with token link, completes signup |
| **OAuth Registration** | User signs up via Google/GitHub, Convex Auth handles identity, Convex creates app record |
| **Import Registration** | Bulk import via admin tool (v2 / out of scope for v1) |
| **Registration Gate** | `anyoneCanRegister` setting controls whether self-registration is open |
| **Default Role** | Role assigned to self-registered users (configurable, default: subscriber) |
| **Invitation Token** | URL-safe secure token with configurable expiry (default: 7 days) |
| **Convex Auth-Convex Bridge** | Convex Auth `user.created` webhook triggers Convex user record creation |
| **Multi-App Auth** | Both apps share the same Convex Auth organization. Registration happens on the website app; admin redirects there via Convex Auth redirect URIs. |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| User creation | Immediate via `wp_insert_user()` | Two-step: Convex Auth auth identity + Convex app record via webhook |
| Password handling | Auto-generated, sent via email | User sets own password via Convex Auth signup form |
| Email verification | Password-set link email | Convex Auth-native email verification |
| Admin user creation | Creates user immediately with password | Creates invitation; user must complete Convex Auth signup |
| Registration toggle | `get_option('users_can_register')` | `settings.general.anyoneCanRegister` in Convex |
| Default role | `get_option('default_role')` | `settings.general.defaultRole` in Convex |
| OAuth support | Via plugins (WP Social Login, etc.) | Native via Convex Auth (Google, GitHub, etc.) |
| Invitation system | None (users created immediately) | Full invitation lifecycle: create, send, resend, revoke, expire |
| Real-time updates | None | Convex reactive queries update admin UI in real-time |
| Reactivity | Page reload required | Live subscription to user/invitation changes |

---

## Architecture Overview

### Data Flow

```
User Action (Signup)
    |
    v
Convex Auth <AuthKitSignUp /> Component (Website /register)
    |
    v
Convex Auth creates auth identity + fires user.created webhook
    |
    v
Convex HTTP endpoint receives webhook (convex/http.ts)
    |
    v
Svix signature verification
    |
    v
handleExternalAuthUserCreated() internal mutation:
    1. Idempotency check (externalAuthId already exists?)
    2. Check for matching pending invitation (by email)
    3. Determine role (invitation role OR settings.defaultRole)
    4. Generate unique username from email
    5. Insert user record into Convex
    6. Mark invitation as accepted (if applicable)
    7. Emit registration.user_registered event via Event Dispatcher
        |
        v
    Event Dispatcher routes to subscribers:
        - Welcome Email (Resend)
        - Email Verification (Resend, conditional)
        - New User Notification - Admin (Resend, batched)
        - New User Registered site notification (admin feed)
```

```
Admin Action (Invite User)
    |
    v
Admin fills InviteUserForm at /admin/users/new
    |
    v
inviteUser() mutation:
    1. Validate admin is Administrator
    2. Validate email not already registered
    3. Validate no pending invitation for email
    4. Generate secure token
    5. Create invitation record (status: pending)
    6. Emit registration.user_invited event
        |
        v
    Event Dispatcher:
        - User Invitation email (Resend, if sendNotification=true)
        - User Invited toast (admin who sent)
```

### Real-Time Behavior

- **Admin Invitations List**: Subscribes to `getInvitations` query. Updates live when invitations are created, resent, revoked, accepted, or expired. No page refresh needed.
- **Registration Stats**: Dashboard widget subscribes to `getRegistrationStats`. New registrations appear in counts in real-time.
- **Site Notifications**: Admin notification bell shows "New user: email (role)" in real-time via Convex subscription.
- **Website /register**: `canRegister` query reactively reflects setting changes. If admin toggles registration off, the page updates without reload.

### Authentication & Authorization

| Context | Auth Strategy |
|---------|---------------|
| Website `/register` | **Public** - No auth required. Convex Auth `<AuthKitSignUp />` handles credential collection. |
| Website `/register?token=...` | **Public** - Token validation via `getInvitationByToken` query (no auth). |
| Admin `/admin/users/new` | **Authenticated** - Requires auth session + Administrator role via `requireRole()`. |
| auth webhook handler | **Webhook auth** - Svix signature verification (not user auth). |
| `handleExternalAuthUserCreated` | **Internal mutation** - Only callable by webhook handler, not by clients. |
| All admin mutations | **Administrator role** - `requireRole(ctx, "administrator")` check. |

---

## Database Schema

### Users Table (Registration-Relevant Fields)

The `users` table is shared across Auth, Registration, Role & Capability, and User Profile systems. The Registration System creates/sets these fields during user creation.

```typescript
// ConvexPress-Admin/packages/backend/convex/schema.ts (registration-relevant subset)

users: defineTable({
  // === Identity (set by auth webhook) ===
  externalAuthId: v.string(),                    // user identifier (e.g., "user_2abc...")
  email: v.string(),                      // Primary email address
  username: v.string(),                   // Unique username (slug-safe)

  // === Profile (set during registration) ===
  firstName: v.optional(v.string()),      // First name (admin invite can pre-fill)
  lastName: v.optional(v.string()),       // Last name (admin invite can pre-fill)
  displayName: v.string(),               // Public display name (defaults to username)
  avatarUrl: v.optional(v.string()),     // Convex Auth-provided avatar URL

  // === Role (set during registration) ===
  role: v.string(),                       // "administrator" | "editor" | "author" | "contributor" | "subscriber"

  // === Registration Metadata ===
  registrationMethod: v.union(
    v.literal("self"),                    // User self-registered on website
    v.literal("invite"),                  // Admin invited user
    v.literal("oauth"),                   // User signed up via OAuth (Google, GitHub, etc.)
    v.literal("import")                   // Bulk imported via admin tool
  ),
  invitedBy: v.optional(v.id("users")),  // Admin who invited this user (if method=invite)
  emailVerified: v.boolean(),            // Whether email has been verified via Convex Auth
  status: v.union(
    v.literal("active"),                 // Normal active user
    v.literal("inactive"),               // Deactivated account
    v.literal("banned")                  // Banned by admin
  ),

  // === Timestamps ===
  registeredAt: v.number(),              // Unix timestamp of account creation
  lastLoginAt: v.optional(v.number()),   // Last login timestamp (updated by Auth System)
  emailVerifiedAt: v.optional(v.number()), // When email was verified
})
  .index("by_clerkUserId", ["clerkUserId"])
  .index("by_email", ["email"])
  .index("by_username", ["username"])
  .index("by_roleId", ["roleId"])
  .index("by_status", ["status"])
  .index("by_createdAt", ["createdAt"]),
```

### Invitations Table

```typescript
// ConvexPress-Admin/packages/backend/convex/schema.ts

invitations: defineTable({
  // === Invitation Details ===
  email: v.string(),                     // Email address invited
  role: v.string(),                      // Role to assign on acceptance
  message: v.optional(v.string()),       // Optional personal message from admin

  // === Tracking ===
  invitedBy: v.id("users"),             // Admin who created the invitation
  status: v.union(
    v.literal("pending"),                // Invitation sent, not yet accepted
    v.literal("accepted"),               // User completed signup
    v.literal("expired"),                // Invitation expired (configurable TTL)
    v.literal("revoked")                 // Admin manually revoked
  ),
  token: v.string(),                     // Unique invitation token (URL-safe)
  expiresAt: v.number(),                // Unix timestamp when invitation expires

  // === Resolution ===
  acceptedBy: v.optional(v.id("users")), // User who accepted (after signup)
  acceptedAt: v.optional(v.number()),    // When invitation was accepted
  revokedAt: v.optional(v.number()),     // When invitation was revoked
  revokedBy: v.optional(v.id("users")), // Admin who revoked

  // === Timestamps ===
  createdAt: v.number(),
  resentAt: v.optional(v.number()),     // Last time invitation was resent
  resentCount: v.number(),              // Number of times resent (max 5)
})
  .index("by_email", ["email"])
  .index("by_token", ["token"])
  .index("by_status", ["status"])
  .index("by_invitedBy", ["invitedBy"])
  .index("by_expiresAt", ["expiresAt"]),
```

### Registration Settings (within Settings System)

Stored in the `settings` table under `"general"` and `"registration"` groups:

| Group | Key | Default | Type | Description |
|-------|-----|---------|------|-------------|
| `general` | `anyoneCanRegister` | `false` | boolean | Allow open self-registration on the website |
| `general` | `defaultRole` | `"subscriber"` | select | Role assigned to new self-registered users |
| `registration` | `invitationExpiryDays` | `7` | number | Days before an invitation link expires |
| `registration` | `maxResendsPerInvitation` | `5` | number | Max times an invitation email can be resent |
| `registration` | `requireEmailVerification` | `true` | boolean | Require email verification before member features |

### Indexes

| Table | Index | Fields | Purpose |
|-------|-------|--------|---------|
| `users` | `by_clerkUserId` | `["clerkUserId"]` | Lookup by auth identity (webhook idempotency check) |
| `users` | `by_email` | `["email"]` | Lookup by email (duplicate check, invitation matching) |
| `users` | `by_username` | `["username"]` | Username uniqueness enforcement |
| `users` | `by_roleId` | `["roleId"]` | Filter users by role (admin user listing) |
| `users` | `by_status` | `["status"]` | Filter by account status |
| `users` | `by_createdAt` | `["createdAt"]` | Registration stats time-based queries |
| `invitations` | `by_email` | `["email"]` | Match invitation to incoming Convex Auth signup |
| `invitations` | `by_token` | `["token"]` | Validate invitation token from URL |
| `invitations` | `by_status` | `["status"]` | Filter invitations by status (admin listing) |
| `invitations` | `by_invitedBy` | `["invitedBy"]` | Filter invitations by admin who sent them |
| `invitations` | `by_expiresAt` | `["expiresAt"]` | Expiration cron job cleanup |

### Relationships

| From | To | Relationship |
|------|----|-------------|
| `users.invitedBy` | `users._id` | Self-referencing: which admin invited this user |
| `invitations.invitedBy` | `users._id` | Which admin created the invitation |
| `invitations.acceptedBy` | `users._id` | Which user accepted the invitation |
| `invitations.revokedBy` | `users._id` | Which admin revoked the invitation |

---

## Actions & Functions

### Mutations

#### `registration.register` - Create User From Convex Auth (Internal)

- **Function:** `handleExternalAuthUserCreated`
- **Type:** `internalMutation`
- **Auth:** None (internal -- called by webhook handler only)
- **Airtable ID:** `[redacted-airtable-record-id]`
- **Args:**
  ```typescript
  {
    externalAuthId: v.string(),
    email: v.string(),
    username: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    emailVerified: v.boolean(),
    oauthProvider: v.optional(v.string()),  // "google", "github", etc.
  }
  ```
- **Returns:** `Id<"users">` (the created user's Convex ID)
- **Behavior:**
  1. **Idempotency guard:** Check if user with `externalAuthId` already exists. If yes, return existing `_id`.
  2. **Invitation matching:** Query `invitations` by email for a `"pending"` invitation.
  3. **Role determination:**
     - If invitation found: `role = invitation.role`, `registrationMethod = "invite"`, `invitedBy = invitation.invitedBy`
     - If OAuth provider present (no invitation): `role = settings.defaultRole`, `registrationMethod = "oauth"`
     - Otherwise (self-registration): Check `anyoneCanRegister` setting. If false and no invitation, throw error. `role = settings.defaultRole`, `registrationMethod = "self"`
  4. **Username generation:** Use provided username or generate from email via `generateUsernameFromEmail()`.
  5. **Username uniqueness:** Call `ensureUniqueUsername()` to append numeric suffix if taken.
  6. **Create user record:** Insert into `users` table with all fields. `displayName` defaults to `"firstName lastName"` or `username`.
  7. **Mark invitation accepted:** If invitation was matched, patch invitation with `status: "accepted"`, `acceptedBy`, `acceptedAt`.
  8. **Emit event:** Schedule `registration.user_registered` event via Event Dispatcher.
- **Events:** `registration.user_registered`
- **Errors:**
  - `"User registration is currently not allowed."` - Self-registration when `anyoneCanRegister === false` and no invitation.

#### `registration.invite` - Invite User

- **Function:** `inviteUser`
- **Type:** `mutation`
- **Auth:** Required -- Administrator only
- **Airtable ID:** `[redacted-airtable-record-id]`
- **Args:**
  ```typescript
  {
    email: v.string(),
    role: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    message: v.optional(v.string()),
    sendNotification: v.boolean(),
  }
  ```
- **Returns:** `{ invitationId: Id<"invitations">, token: string }`
- **Behavior:**
  1. **Auth check:** `requireRole(ctx, "administrator")`.
  2. **Email uniqueness:** Query `users` by email. If exists, throw error.
  3. **Pending invitation check:** Query `invitations` by email with status `"pending"`. If exists, throw error (must resend or revoke first).
  4. **Role validation:** Validate against `["subscriber", "contributor", "author", "editor", "administrator"]`.
  5. **Token generation:** Call `generateSecureToken()`.
  6. **Expiry calculation:** Read `invitationExpiryDays` setting (default: 7), compute `expiresAt`.
  7. **Create invitation record:** Insert into `invitations` table with `status: "pending"`, `resentCount: 0`.
  8. **Emit event:** Schedule `registration.user_invited` event.
- **Events:** `registration.user_invited`
- **Errors:**
  - `"A user with email {email} already exists."` - Email already registered.
  - `"An invitation for {email} is already pending. Resend or revoke it first."` - Duplicate pending invitation.
  - `"Invalid role: {role}"` - Role not in valid roles list.

#### `registration.resend_verification` - Resend Invitation

- **Function:** `resendInvitation`
- **Type:** `mutation`
- **Auth:** Required -- Administrator only
- **Airtable ID:** `[redacted-airtable-record-id]`
- **Args:**
  ```typescript
  {
    invitationId: v.id("invitations"),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. **Auth check:** `requireRole(ctx, "administrator")`.
  2. **Get invitation:** Fetch by ID. Throw if not found or not `"pending"`.
  3. **Resend limit:** Check `resentCount` against `maxResendsPerInvitation` setting (default: 5). Throw if exceeded.
  4. **Expiry extension:** If invitation has expired, recalculate `expiresAt` with fresh expiry window.
  5. **Update record:** Patch `resentAt`, increment `resentCount`, update `expiresAt`.
  6. **Emit event:** Schedule `registration.user_invited` event with `isResend: true`.
- **Events:** `registration.user_invited` (with `isResend: true`)
- **Errors:**
  - `"Invitation not found."` - Invalid invitation ID.
  - `"Cannot resend: invitation is {status}."` - Non-pending invitation.
  - `"Maximum resend limit ({max}) reached. Revoke and create a new invitation."` - Hit resend cap.

#### Revoke Invitation

- **Function:** `revokeInvitation`
- **Type:** `mutation`
- **Auth:** Required -- Administrator only
- **Args:**
  ```typescript
  {
    invitationId: v.id("invitations"),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. **Auth check:** `requireRole(ctx, "administrator")`.
  2. **Get invitation:** Fetch by ID. Throw if not found or not `"pending"`.
  3. **Revoke:** Patch with `status: "revoked"`, `revokedAt: Date.now()`, `revokedBy: admin._id`.
- **Events:** None (revocation is silent -- no notifications emitted).
- **Errors:**
  - `"Invitation not found."` - Invalid invitation ID.
  - `"Cannot revoke: invitation is {status}."` - Non-pending invitation.

#### Expire Invitations (Cron)

- **Function:** `expireInvitations`
- **Type:** `internalMutation`
- **Auth:** None (internal -- called by cron scheduler)
- **Schedule:** Daily at 03:00 UTC
- **Behavior:**
  1. Query all invitations with `status: "pending"`.
  2. For each where `expiresAt < Date.now()`, patch `status: "expired"`.
- **Events:** None.

### Queries

#### `getInvitations` - List All Invitations

- **Type:** `query`
- **Auth:** Required -- Administrator only
- **Args:**
  ```typescript
  {
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("expired"),
      v.literal("revoked")
    )),
  }
  ```
- **Returns:** `Array<Doc<"invitations">>` (ordered by `_creationTime` descending)
- **Behavior:** If `status` provided, filter by status index. Otherwise return all invitations.
- **Pagination:** None (collects all). Consider pagination for large invitation counts in future.
- **Filters:** Optional `status` filter.

#### `getInvitationByToken` - Validate Invitation Token (Public)

- **Type:** `query`
- **Auth:** Public (no auth required)
- **Args:**
  ```typescript
  { token: v.string() }
  ```
- **Returns:** `{ email, role, message, expiresAt } | null`
- **Behavior:**
  1. Query `invitations` by `by_token` index.
  2. Return `null` if not found, status is not `"pending"`, or `expiresAt < Date.now()`.
  3. Return safe subset (email, role, message, expiresAt) -- never expose token or internal IDs to public.

#### `canRegister` - Check If Self-Registration Is Allowed (Public)

- **Type:** `query`
- **Auth:** Public (no auth required)
- **Args:** `{}`
- **Returns:** `boolean`
- **Behavior:** Read `anyoneCanRegister` setting from Settings System. Default: `false`.
- **WordPress equivalent:** `get_option('users_can_register')`

#### `getRegistrationStats` - Admin Dashboard Statistics

- **Type:** `query`
- **Auth:** Required -- Administrator only
- **Args:** `{}`
- **Returns:**
  ```typescript
  {
    total: number,
    last24h: number,
    last7d: number,
    last30d: number,
    pendingInvitations: number,
  }
  ```
- **Behavior:** Query all users and compute time-windowed counts. Query pending invitations count.
- **Performance Note:** For large user bases, consider adding dedicated counters or more efficient indexed queries.

### Webhook Handler

#### auth webhook (`user.created`)

- **Type:** `httpAction`
- **Location:** `convex/http.ts` (shared with Auth System)
- **Auth:** Svix webhook signature verification
- **Behavior:**
  1. Verify auth webhook signature via Svix library.
  2. Extract `user.created` payload: `id`, `email_addresses`, `username`, `first_name`, `last_name`, `image_url`, `external_accounts`.
  3. Find primary email from `email_addresses` array.
  4. Detect OAuth provider from `external_accounts[0].provider`.
  5. Call `internal.registration.mutations.handleExternalAuthUserCreated` with extracted data.
  6. Handle `user.updated` and `user.deleted` -- delegate to Auth System (not Registration's concern).

### Helper Functions

#### `generateUsernameFromEmail(email: string): string`
- Extract local part (before `@`)
- Lowercase, remove non-alphanumeric characters
- Truncate to 60 characters
- Example: `"troy.smith@example.com"` -> `"troysmith"`

#### `ensureUniqueUsername(ctx: MutationCtx, base: string): Promise<string>`
- Check if `base` exists via `by_username` index
- If taken, append incrementing suffix: `base2`, `base3`, ...
- Return first available candidate

#### `generateSecureToken(): string`
- Generate two `crypto.randomUUID()` values, strip hyphens, concatenate
- Produces 64-character URL-safe token

---

## Events

### `registration.user_registered`

- **Airtable ID:** `[redacted-airtable-record-id]`
- **Type:** User
- **Triggered By:** `registration.register` action (`handleExternalAuthUserCreated` mutation)
- **Payload:**
  ```typescript
  {
    userId: Id<"users">,
    email: string,
    role: string,
    registrationMethod: "self" | "invite" | "oauth" | "import",
    invitedBy: Id<"users"> | null,
    oauthProvider: string | null,
  }
  ```
- **Subscribers:**
  - Email: Welcome Email (immediate), Email Verification (immediate, conditional), New User Notification - Admin (batched)
  - Site: New User Registered (admin feed notification)
  - Audit Log: Yes -- "User registered" entry
  - Side Effects: None

### `registration.user_invited`

- **Airtable ID:** `[redacted-airtable-record-id]`
- **Type:** User
- **Triggered By:** `registration.invite` action (`inviteUser` mutation), `registration.resend_verification` action (`resendInvitation` mutation)
- **Payload:**
  ```typescript
  {
    invitationId: Id<"invitations">,
    email: string,
    role: string,
    invitedBy: Id<"users">,
    sendNotification: boolean,
    firstName: string | null,
    lastName: string | null,
    isResend: boolean | undefined,
  }
  ```
- **Subscribers:**
  - Email: User Invitation (immediate, only if `sendNotification === true`)
  - Site: User Invited (success toast to inviting admin)
  - Audit Log: Yes -- "User invited" entry
  - Side Effects: None

---

## Admin Routes & UI

### Add New User (`/admin/users/new`)

- **Airtable ID:** `[redacted-airtable-record-id]`
- **Purpose:** Allow administrators to invite new users (WordPress equivalent: `Users > Add New`)
- **WordPress Equivalent:** `user-new.php`
- **Layout:** Admin sidebar layout with main content area
- **Auth:** Authenticated + Administrator role
- **Key Components:**
  - `<PageHeader title="Add New User" />` - Page title
  - `<InviteUserForm>` - Main form with fields:
    - `<EmailField />` - Required, validated for format + uniqueness
    - `<FirstNameField />` - Optional text input
    - `<LastNameField />` - Optional text input
    - `<RoleSelect />` - Dropdown of valid roles, defaults to site default role
    - `<PersonalMessageField />` - Optional textarea
    - `<SendNotificationCheckbox />` - Default: checked (mirrors WordPress behavior)
    - `<SubmitButton label="Add New User" />` - Triggers `inviteUser` mutation
  - `<InvitationsList>` - Table of all invitations with columns:
    - Email, Role, Status, Invited By, Sent Date, Expires Date, Actions
    - Actions: Resend button (pending only), Revoke button (pending only)
  - `<HelpText>` - "An invitation email will be sent. The user must complete signup to activate their account."
- **Data Requirements:**
  - `getInvitations()` query (reactive -- updates when invitations change)
  - `inviteUser` mutation
  - `resendInvitation` mutation
  - `revokeInvitation` mutation
- **User Interactions:**
  - Fill form and submit to create invitation
  - Click "Resend" on pending invitation to re-send email
  - Click "Revoke" on pending invitation to cancel it
- **Real-Time:** Invitations list updates live as invitations are created, accepted, resent, revoked, or expired.

---

## Website Routes

### Register (`/register`)

- **Airtable ID:** `[redacted-airtable-record-id]`
- **Purpose:** User signup page (self-registration and invitation-based)
- **WordPress Equivalent:** `wp-login.php?action=register`
- **Layout:** Marketing layout (no admin sidebar)
- **Auth:** Public (redirects authenticated users to `/dashboard`)
- **SEO:** `noindex, nofollow` (signup pages should not be indexed)
- **Key Components:**
  - `<RegistrationGate>` - Main gate component that checks conditions:
    - `<RegistrationClosed />` - Displayed when `anyoneCanRegister === false` and no token. Message: "User registration is currently not allowed. Contact an administrator for access."
    - `<InvitationExpired />` - Displayed when token is invalid or expired. Message: "This invitation is invalid or has expired. Contact the administrator who invited you."
    - `<RegistrationForm>` - Displayed when registration is allowed:
      - `<InvitationBanner />` - Shows "You've been invited as {role}" with optional personal message (invitation flow only)
      - `<Convex AuthSignUp />` - Convex Auth's `<AuthKitSignUp />` component with ConvexPress branding. For invitations, email is pre-filled and locked.
      - `<OAuthProviders />` - Google/GitHub buttons via Convex Auth configuration
  - `<LoginLink />` - "Already have an account? Log in"
- **Data Requirements:**
  - `canRegister` query (no token flow)
  - `getInvitationByToken(token)` query (token flow)
- **Caching:** No SSR caching (reactive query determines what to render)
- **Behavior Modes:**
  1. **No token + open registration:** Show Convex Auth `<AuthKitSignUp />` with branding
  2. **No token + closed registration:** Show `<RegistrationClosed />`
  3. **Valid token:** Show invitation details + Convex Auth `<AuthKitSignUp />` with pre-filled email
  4. **Invalid/expired token:** Show `<InvitationExpired />`
  5. **Already authenticated:** Redirect to `/dashboard`

---

## Notifications

### Email Notifications

| Name | Airtable ID | Event | Recipients | Priority | Subject Template |
|------|-------------|-------|------------|----------|------------------|
| Welcome Email | `[redacted-airtable-record-id]` | `registration.user_registered` | Customer (new user) | Immediate | `Welcome to {site_name}!` |
| Email Verification | `[redacted-airtable-record-id]` | `registration.user_registered` | Customer (new user) | Immediate | `Verify your email for {site_name}` |
| User Invitation | `[redacted-airtable-record-id]` | `registration.user_invited` | Customer (invited person) | Immediate | `You've been invited to {site_name}` |
| New User Notification (Admin) | `[redacted-airtable-record-id]` | `registration.user_registered` | Admin (all administrators) | Batched | `New user registered: {user_email}` |

#### Welcome Email Details
- **Provider:** Resend
- **Template Variables:** `{site_name}`, `{user_email}`, `{display_name}`, `{dashboard_url}`, `{role}`
- **Conditional Logic:** Always sent on user registration.

#### Email Verification Details
- **Provider:** Resend
- **Template Variables:** `{site_name}`, `{user_email}`, `{verification_url}`
- **Conditional Logic:**
  - Skip if `emailVerified === true` at registration time (OAuth signups auto-verify)
  - Skip if `requireEmailVerification === false` in settings
  - Note: Convex Auth also handles its own verification email; this is supplementary

#### User Invitation Details
- **Provider:** Resend
- **Template Variables:** `{site_name}`, `{invited_email}`, `{role}`, `{inviter_name}`, `{personal_message}`, `{register_url}`, `{expires_at}`
- **Conditional Logic:** Only sent if `sendNotification === true` in event payload.
- **Register URL format:** `https://{website_domain}/register?token={invitation_token}`

#### New User Notification (Admin) Details
- **Provider:** Resend
- **Template Variables:** `{site_name}`, `{user_email}`, `{display_name}`, `{role}`, `{registration_method}`, `{admin_users_url}`
- **Conditional Logic:** Always sent. Batched/digested (not immediate).

### Site Notifications

| Name | Airtable ID | Event | Type | Persistent | Recipients |
|------|-------------|-------|------|-----------|------------|
| New User Registered | `[redacted-airtable-record-id]` | `registration.user_registered` | Info | Yes (admin feed) | All Administrators |
| User Invited | `[redacted-airtable-record-id]` | `registration.user_invited` | Success | No (toast) | Specific admin who invited |

#### New User Registered (Admin Feed)
```typescript
{
  type: "info",
  message: `New user: ${email} (${role})`,
  recipientRole: "administrator",
  link: `/admin/users/${userId}/edit`,
  read: false,
  createdAt: Date.now(),
}
```

#### User Invited (Admin Toast)
```typescript
{
  type: "success",
  message: `Invitation sent to ${email}`,
  recipientId: invitedBy,  // Specific admin, not broadcast
  link: `/admin/users/new`,
  read: false,
  createdAt: Date.now(),
}
```

---

## Role & Capability Matrix

### Action Permissions

| Action | Administrator | Editor | Author | Contributor | Subscriber | Anonymous |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|
| Self-register (website) | - | - | - | - | - | Yes (if enabled) |
| Register via invitation | - | - | - | - | - | Yes (with valid token) |
| Register via OAuth | - | - | - | - | - | Yes (if enabled) |
| Invite user | Yes | No | No | No | No | No |
| Resend invitation | Yes | No | No | No | No | No |
| Revoke invitation | Yes | No | No | No | No | No |
| View invitations list | Yes | No | No | No | No | No |
| View registration stats | Yes | No | No | No | No | No |
| Change registration settings | Yes | No | No | No | No | No |
| Change default role setting | Yes | No | No | No | No | No |

### Route Access

| Route | Roles | Notes |
|-------|-------|-------|
| `/register` | Anonymous | Public. Redirects logged-in users to `/dashboard`. |
| `/register?token=...` | Anonymous | Public. Validates invitation token. |
| `/admin/users/new` | Administrator | Admin SPA. Requires auth + Administrator role. |

---

## Dependencies

### Depends On

| System | Type | What Is Needed |
|--------|------|---------------|
| **Auth System** (`[redacted-airtable-record-id]`) | **Hard** | Convex Auth integration, webhook HTTP endpoint, session management, `requireRole()` helper, Svix verification |
| **Event Dispatcher System** | **Hard** | Event emission via `ctx.scheduler.runAfter(0, internal.events.dispatch, {...})`. All notifications and audit entries flow through events. |
| **Role & Capability System** | **Hard** | Valid role list for invitation form dropdown, role assignment during user creation, `requireRole()` capability check |
| **Settings System** | **Soft** | Reads `anyoneCanRegister`, `defaultRole`, `invitationExpiryDays`, `maxResendsPerInvitation`, `requireEmailVerification`. System works with defaults if settings unavailable. |
| **Email Notification System** | **Soft** | Delivers welcome email, verification email, invitation email, admin notification. Registration works without emails (just no notifications sent). |
| **Site Notification System** | **Soft** | Delivers admin feed and toast notifications. Registration works without site notifications. |

### Depended On By

| System | What They Need |
|--------|---------------|
| **User Profile System** | After Registration creates the user record, Profile System manages ongoing profile edits (displayName, avatar, bio, etc.) |
| **Auth System** | Auth System handles `user.updated` and `user.deleted` webhooks for users that Registration created |
| **Any system reading `users` table** | All systems that query users depend on Registration having created the records |

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/)

- [ ] `convex/schema.ts` - Add `users` table fields (registration subset) + `invitations` table (2 tables)
- [ ] `convex/registration/mutations.ts` - 5 mutations: `handleExternalAuthUserCreated` (internal), `inviteUser`, `resendInvitation`, `revokeInvitation`, `expireInvitations` (internal)
- [ ] `convex/registration/queries.ts` - 4 queries: `getInvitations`, `getInvitationByToken`, `canRegister`, `getRegistrationStats`
- [ ] `convex/registration/helpers.ts` - 3 helpers: `generateUsernameFromEmail`, `ensureUniqueUsername`, `generateSecureToken`
- [ ] `convex/http.ts` - auth webhook handler (shared with Auth System) -- `user.created` case calls `handleExternalAuthUserCreated`
- [ ] `convex/crons.ts` - `expire-invitations` daily cron job at 03:00 UTC

### Admin Frontend (ConvexPress-Admin/apps/web/)

- [ ] `src/routes/admin/users/new.tsx` - Add New User page route
- [ ] `src/components/registration/InviteUserForm.tsx` - Invitation creation form
- [ ] `src/components/registration/InvitationsList.tsx` - Table of invitations with resend/revoke actions

### Website Frontend (ConvexPress-Website/apps/web/)

- [ ] `src/routes/register.tsx` - Registration page route
- [ ] `src/components/registration/RegistrationGate.tsx` - Condition checker (can register? valid token?)
- [ ] `src/components/registration/RegistrationClosed.tsx` - "Registration not available" message
- [ ] `src/components/registration/InvitationBanner.tsx` - "You've been invited as {role}" banner
- [ ] `src/components/registration/InvitationExpired.tsx` - "Invitation invalid/expired" message

### Email Templates

- [ ] `emails/welcome.tsx` - Welcome Email template
- [ ] `emails/email-verification.tsx` - Email Verification template (conditional)
- [ ] `emails/user-invitation.tsx` - User Invitation template
- [ ] `emails/admin-new-user.tsx` - New User Notification (Admin) template

---

## Edge Cases & Gotchas

1. **Webhook idempotency:** Convex Auth may retry the `user.created` webhook. `handleExternalAuthUserCreated` MUST check for existing user by `externalAuthId` first and return early if found. Never create duplicate user records.

2. **Invitation email matching:** When `handleExternalAuthUserCreated` runs, it matches invitations by email. If the user signs up with a different email than the one invited, the invitation will NOT be matched and the user gets the default role. The invitation stays pending.

3. **Race condition: invitation + self-registration:** If registration is open and an admin invites a user, the user might self-register before clicking the invitation link. `handleExternalAuthUserCreated` checks invitations first, so if the invitation exists, the invited role takes precedence. This is correct behavior.

4. **Expired invitation resend:** When resending an expired invitation, the system automatically extends the expiry date. This is an intentional UX improvement over simply rejecting the resend.

5. **OAuth email auto-verification:** OAuth signups (Google, GitHub) have pre-verified emails. The Email Verification notification should be suppressed for these users. Check `emailVerified === true` in the event payload.

6. **Convex Auth multi-app pattern:** Registration ALWAYS happens on the website app, never on the admin app. The admin app redirects to the website via Convex Auth redirect URIs. The invitation URL must point to the website domain, not the admin domain.

7. **Username generation edge cases:**
   - Email with only special characters before `@` (e.g., `...@example.com`) would produce empty string. Handle by falling back to `"user"`.
   - Very long email local parts (e.g., 100+ chars) are truncated to 60.
   - Incrementing suffix loop could theoretically run many times. In practice, capped by total user count.

8. **Settings dependency:** If the Settings System is not yet implemented, `getSettingValue()` should return `undefined` and the defaults (`false` for anyoneCanRegister, `"subscriber"` for defaultRole, etc.) must be used via nullish coalescing (`??`).

9. **Token security:** The invitation token MUST be cryptographically random and URL-safe. Never use sequential IDs or predictable patterns. The token is the sole authentication for invitation acceptance.

10. **Multiple pending invitations:** The system prevents creating a new invitation if one is already pending for the same email. The admin must either resend or revoke the existing one first. This prevents token confusion.

11. **Admin self-invitation:** There is no restriction on an admin inviting their own email. This would fail at user creation if they're already registered (email uniqueness check). No special handling needed.

12. **Registration closed + OAuth:** When `anyoneCanRegister` is false, OAuth signup buttons should be hidden on the login page. However, the Convex-level check in `handleExternalAuthUserCreated` provides a safety net -- even if Convex Auth allows the OAuth signup, the Convex mutation will reject it if registration is closed and no invitation exists.

13. **Webhook signature verification failure:** If Svix verification fails, return 400/401 immediately. Never process unverified webhooks. Log the failure for debugging.

14. **Cron timing:** The `expireInvitations` cron runs daily at 03:00 UTC. Between cron runs, expired invitations may still show as "pending" in the database, but `getInvitationByToken` checks `expiresAt` at query time, so expired tokens are rejected immediately regardless of status field.

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `get_option('users_can_register')` | `canRegister` query / `getSettingValue(ctx, "general", "anyoneCanRegister")` | Returns boolean |
| `get_option('default_role')` | `getSettingValue(ctx, "general", "defaultRole")` | Returns role string |
| `wp_create_user($username, $password, $email)` | `handleExternalAuthUserCreated` internal mutation | Called by webhook, not directly |
| `wp_insert_user($userdata)` | `handleExternalAuthUserCreated` internal mutation | Full user record creation |
| `wp_new_user_notification($user_id, null, 'both')` | `registration.user_registered` event | Triggers Welcome Email + Admin Notification |
| `wp-login.php?action=register` | `/register` website route | Public signup page |
| `user-new.php` (Users > Add New) | `/admin/users/new` admin route | Admin invitation form |
| `register_new_user` action hook | `registration.user_registered` event | Post-registration event |
| `user_register` action hook | `registration.user_registered` event | Same event covers both WP hooks |
| `registration_errors` filter | Convex validation in `handleExternalAuthUserCreated` + Convex Auth validation | No filter mechanism; validation is inline |
| `register_form` action hook | Convex Auth `<AuthKitSignUp />` component appearance config | Customized via Convex Auth Dashboard |
| `sanitize_user()` | `generateUsernameFromEmail()` | Strips non-alphanumeric chars |
| `username_exists()` | `ensureUniqueUsername()` query on `by_username` index | Returns boolean / appends suffix |
| `email_exists()` | Query `users` by `by_email` index | Used in `inviteUser` validation |
| `wp_generate_password()` | N/A (Convex Auth handles passwords) | Users set own password via Convex Auth |
| N/A (no WP equivalent) | `inviteUser` mutation | ConvexPress invitation system is new |
| N/A (no WP equivalent) | `resendInvitation` mutation | ConvexPress invitation management |
| N/A (no WP equivalent) | `revokeInvitation` mutation | ConvexPress invitation management |
| N/A (no WP equivalent) | `getInvitationByToken` query | Token validation for invitation flow |
| N/A (no WP equivalent) | `expireInvitations` cron | Automatic invitation expiry cleanup |


