# User Profile System - Expert Knowledge Document

**System:** User Profile System
**System ID:** `recC5k3UpvlW4vaAb`
**Expert Record:** `recRuEyMIAxW2DoSw`
**Status:** Complete (100%)
**Priority:** P1 - High
**Complexity:** Medium
**Category:** User & Auth
**Layer:** Full Stack
**WordPress Equivalent:** Users > Your Profile, Users > All Users, Users > Edit User, `wp_users` + `wp_usermeta` tables, `get_userdata()`, `wp_update_user()`, `get_avatar()`, author archive template
**Last Analyzed:** 2026-02-15

---

## Quick Reference

### What This System Does

The User Profile System is the **identity and personalization layer** of ConvexPress. It manages everything about a user beyond authentication credentials: display names, bios, avatars, social links, notification preferences, and account settings. It also provides the admin-side user management interface (list, edit, deactivate, delete users) and public author archive pages. WordPress splits this across `wp_users` and `wp_usermeta` (key-value). ConvexPress uses a single structured Convex `users` table with full type safety.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Convex Auth-Synced Fields** | Email, firstName, lastName, profilePictureUrl, phone, emailVerified -- owned by the auth system, synced via webhooks, read-only in ConvexPress |
| **ConvexPress-Managed Fields** | nickname, displayName, bio, socialLinks, avatarUrl, preferences, locale, timezone -- editable in ConvexPress |
| **Avatar Resolution** | Custom upload (avatarUrl, highest priority) > Convex Auth/OAuth avatar (profilePictureUrl) > Generated initials fallback |
| **Display Name Dropdown** | Auto-generated options from firstName, lastName, nickname, email username (matches WordPress) |
| **Slug** | URL-safe identifier for author archive pages. Set once on creation, stable for URLs |
| **User Status** | `active`, `inactive`, `banned` -- deactivation (inactive) is reversible, prevents login. Note: `pending` status from original PRD is not implemented. |
| **Content Disposition** | On user deletion: reassign content to another user OR delete all content |
| **Denormalized Counts** | `postCount` and `commentCount` updated via events from Post/Comment systems |
| **Multi-App Auth** | Admin + Website share the same Convex Auth organization and redirect URIs. Profile data is the same in both apps. |

### ConvexPress vs WordPress

| Feature | WordPress | ConvexPress |
|---------|-----------|-------------|
| User data storage | `wp_users` (core) + `wp_usermeta` (key-value) | Single `users` Convex table (structured, type-safe) |
| Profile reads | `get_userdata()` with meta joins | Single document read, O(1), Convex-cached |
| Avatar | Gravatar (email hash) + filter hooks | Custom upload (avatarUrl) > Convex Auth OAuth (profilePictureUrl) > Initials fallback |
| Auth fields | Same database, same table | Convex Auth owns auth (email, password, OAuth), Convex owns profile |
| Real-time | Page refresh required | Convex reactivity - all clients update instantly on profile change |
| Extensibility | `wp_usermeta` key-value (flexible, untyped) | Structured fields (typed, validated). Custom Field System for extensibility. |
| Display name | Dropdown from name components | Identical behavior, `generateDisplayNameOptions()` |
| Author archive | `author.php` template | `/author/$slug` route in website app |
| User management | Users > All Users in wp-admin | `/admin/users` in admin app |
| Deletion | Reassign or delete content + delete user | Same workflow, plus Convex Auth user deletion via Backend API |

---

## Architecture Overview

### Data Flow

```
User Action (edit profile / upload avatar / admin action)
  |
  v
Frontend Form (TanStack Form + Zod validation)
  |
  v
Convex Mutation (e.g., profile.update)
  |
  +--> Validate auth (requireCan)
  +--> Validate input (bio length, URL format, etc.)
  +--> Patch user document (only changed fields)
  +--> Emit event (e.g., profile.updated)
  |       |
  |       +--> Audit Log records the change
  |       +--> Email notification (deactivation/deletion only)
  |       +--> Site notification (toast for profile updates)
  |
  v
Convex Reactivity
  +--> All subscribed components re-render with new data
  +--> Author names update across posts
  +--> Avatar updates in comment threads
  +--> Profile cards update everywhere
```

### auth webhook Data Flow (user.created / user.updated)

```
OAuth Login / Convex Auth Profile Update
  |
  v
auth webhook --> convex/http.ts handler
  |
  v
profiles/internals.syncFromAuth (internalMutation)
  |
  +--> Sync: email, firstName, lastName, profilePictureUrl, emailVerified
  +--> On create: generate displayName, slug, assign default role
  +--> On update: patch only Convex Auth-owned fields (never overwrite ConvexPress fields)
```

### Real-Time Behavior

- **Profile edit page**: User sees their own profile data live. If Convex Auth syncs a name change while they're editing, the read-only fields update instantly.
- **User list (admin)**: New registrations appear without refresh. Status changes (deactivation) update the row live.
- **Author archive**: Display name and avatar changes propagate to the public author page in real time.
- **Post/comment author display**: When a user changes their display name or avatar, ALL posts and comments showing that user's info update for all connected clients.

### Authentication & Authorization

**Convex Auth provides identity.** Every Convex function calls `ctx.auth.getUserIdentity()` which returns the Convex Auth token subject (the `clerkUserId`). The `users` table is looked up by `clerkUserId` via the `by_clerkUserId` index to get the ConvexPress user.

**Capability checks** use `requireCan(ctx, actionCode)` from the Role & Capability System. Key capabilities:

| Capability | Who Has It | What It Does |
|------------|-----------|--------------|
| `profile.view` | All authenticated | View own profile + public fields of others |
| `profile.update` | All authenticated | Edit own profile fields |
| `profile.upload_avatar` | All authenticated | Upload/remove own avatar |
| `profile.deactivate` | Administrator only | Deactivate/reactivate other users |
| `profile.delete_user` | Administrator only | Delete other users |
| `profile.bulk_delete` | Administrator only | Bulk delete users |

**Admin-only escalation**: When a mutation receives a `userId` that differs from the current user, it checks `roleLevel >= 100` (Administrator). Non-admins editing another user's profile get `FORBIDDEN`.

---

## Database Schema

### Users Table

This is the **central user table** for the entire CMS. The User Profile System owns the table definition, but many fields are referenced or populated by other systems (e.g., `roleId` by Role & Capability System, `postCount` by Post System).

```typescript
// convex/schema/users.ts (modular schema file)

export const usersTables = {
  users: defineTable({
    // === Convex Auth-Synced Fields (read-only in ConvexPress, updated via webhooks) ===
    clerkUserId: v.string(),              // user identifier (e.g., "user_2abc123")
    email: v.string(),                     // Primary email from the auth system
    emailVerified: v.boolean(),            // Email verification status from the auth system
    firstName: v.optional(v.string()),     // First name from the auth system
    lastName: v.optional(v.string()),      // Last name from the auth system
    phone: v.optional(v.string()),         // Phone number from the auth system
    profilePictureUrl: v.optional(v.string()), // Avatar URL from the auth system (OAuth provider)

    // === ConvexPress-Managed Profile Fields ===
    username: v.optional(v.string()),      // Separate username field
    nickname: v.optional(v.string()),      // User-chosen nickname (WordPress equivalent of user_nicename)
    displayName: v.optional(v.string()),   // Chosen display name (from dropdown of options, optional for new users)
    slug: v.optional(v.string()),          // URL-safe slug for author archive (generated lazily)
    bio: v.optional(v.string()),           // Biography/description (max 500 chars)
    url: v.optional(v.string()),           // Personal website URL
    avatarUrl: v.optional(v.string()),     // Custom avatar (uploaded to Convex) -- overrides Convex Auth avatar
    avatarMediaId: v.optional(v.id("media")), // Reference to media library item for avatar
    avatarStorageId: v.optional(v.string()), // Convex Storage ID for the custom avatar (for deletion)

    // === Social Links ===
    socialLinks: v.optional(v.object({
      twitter: v.optional(v.string()),     // X/Twitter URL or handle
      facebook: v.optional(v.string()),    // Facebook URL
      instagram: v.optional(v.string()),   // Instagram URL or handle
      linkedin: v.optional(v.string()),    // LinkedIn URL
      youtube: v.optional(v.string()),     // YouTube channel URL
      github: v.optional(v.string()),      // GitHub URL or username
      website: v.optional(v.string()),     // Website (legacy, prefer top-level `url`)
    })),

    // === Role (Managed by Role & Capability System) ===
    roleId: v.optional(v.id("roles")),     // Reference to the user's role (optional for migration)

    // === Account Status ===
    status: v.union(
      v.literal("active"),                 // Normal active account
      v.literal("inactive"),               // Admin-deactivated (cannot login)
      v.literal("banned")                  // Banned account
    ),
    deactivatedAt: v.optional(v.number()), // When the account was deactivated
    deactivatedBy: v.optional(v.id("users")), // Admin who deactivated the account

    // === Preferences ===
    preferences: v.optional(v.object({
      adminColorScheme: v.optional(v.string()),
      showAdminBar: v.optional(v.boolean()),
      editorMode: v.optional(v.union(v.literal("visual"), v.literal("code"))),
      emailDigest: v.optional(v.union(
        v.literal("immediate"), v.literal("daily"),
        v.literal("weekly"), v.literal("none")
      )),
      notifyOnComment: v.optional(v.boolean()),
      notifyOnReply: v.optional(v.boolean()),
      notifyOnMention: v.optional(v.boolean()),
    })),

    // === Locale & Timezone ===
    locale: v.optional(v.string()),        // Preferred language
    timezone: v.optional(v.string()),      // Preferred timezone

    // === Denormalized Counts ===
    postCount: v.optional(v.number()),     // Published post count (updated by Post System)
    commentCount: v.optional(v.number()),  // Comment count (updated by Comment System)

    // === Registration Metadata (populated by Registration System) ===
    registrationMethod: v.optional(v.string()),  // "self" | "invite" | "oauth" | "import"
    invitedBy: v.optional(v.id("users")),        // Admin who invited this user
    emailVerifiedAt: v.optional(v.number()),     // Unix timestamp (ms) when email was verified
    registeredAt: v.optional(v.number()),        // Unix timestamp (ms) of account registration

    // === Metadata ===
    lastLoginAt: v.optional(v.number()),   // Last login timestamp (updated by Auth System)

    // === Password Management System Fields ===
    lastPasswordChangedAt: v.optional(v.number()),
    passwordResetRequestedAt: v.optional(v.number()),
    passwordResetCount: v.optional(v.number()),

    // === Legacy Fields (preserved for backward compatibility) ===
    internalRole: v.optional(v.string()),
    isInternal: v.optional(v.boolean()),

    // === Timestamps ===
    createdAt: v.number(),                 // Registration timestamp
    updatedAt: v.number(),                 // Last profile update
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_email", ["email"])
    .index("by_slug", ["slug"])
    .index("by_username", ["username"])
    .index("by_roleId", ["roleId"])
    .index("by_status", ["status"])
    .index("by_displayName", ["displayName"])
    .index("by_createdAt", ["createdAt"])
    .index("by_internal_role", ["internalRole"])
    .index("by_is_internal", ["isInternal"]),
};
```

### Indexes

| Index | Fields | Purpose |
|-------|--------|---------|
| `by_clerkUserId` | `["clerkUserId"]` | Look up user from auth identity (every authenticated request) |
| `by_email` | `["email"]` | Look up user by email (webhook sync, search) |
| `by_slug` | `["slug"]` | Author archive page lookup |
| `by_username` | `["username"]` | Look up user by username |
| `by_roleId` | `["roleId"]` | Filter users by role on admin user list |
| `by_status` | `["status"]` | Filter users by status (active/inactive/banned) |
| `by_displayName` | `["displayName"]` | Sort users alphabetically |
| `by_createdAt` | `["createdAt"]` | Sort users by registration date (default) |
| `by_internal_role` | `["internalRole"]` | Legacy: look up users by old role string |
| `by_is_internal` | `["isInternal"]` | Legacy: filter internal vs external users |

### Relationships

| Field | References | System |
|-------|-----------|--------|
| `roleId` | `roles._id` | Role & Capability System |
| `deactivatedBy` | `users._id` | Self-referential (admin who deactivated) |
| `avatarStorageId` | `_storage._id` | Convex Storage (for avatar file deletion) |

### Schema Design Rationale

- **Flat fields over key-value**: Unlike WordPress's `wp_usermeta`, ConvexPress uses structured fields for type safety, single-document reads (O(1)), schema-level validation, and IDE autocomplete.
- **Separate `authAvatarUrl` and `avatarUrl`**: Custom avatar takes priority. Removing custom falls back to the auth system. Convex Auth avatar updates independently via webhooks.
- **Denormalized counts**: `postCount` and `commentCount` avoid expensive count queries. Updated by Post System and Comment System via events.
- **Stable slug**: The slug is set once on creation and does not auto-change when display name changes (which would break URLs).

---

## Actions & Functions

### Queries

#### `getCurrentUser` - Get Current User Profile

- **Type:** query
- **File:** `convex/profiles/queries.ts`
- **Auth:** Required (auth identity)
- **Capabilities:** None (implicit -- any authenticated user)
- **Args:** `{}`
- **Returns:** `Doc<"users"> | null`
- **Behavior:**
  1. Get auth identity via `ctx.auth.getUserIdentity()`
  2. If no identity, return `null`
  3. Query `users` by `by_clerkUserId` index using `identity.subject`
  4. Return the full user document
- **Used By:** Every authenticated page, every mutation that needs the current user

#### `getUser` - Get User by ID

- **Type:** query
- **File:** `convex/profiles/queries.ts`
- **Auth:** Required
- **Capabilities:** `profile.view`
- **Args:**
  ```typescript
  { userId: v.id("users") }
  ```
- **Returns:** `Doc<"users">` (full for self/admin) or public-only fields (for non-admins viewing others)
- **Behavior:**
  1. Get current user via `getCurrentUser(ctx)`
  2. Throw `UNAUTHORIZED` if not authenticated
  3. Get target user by ID
  4. If current user is Administrator (role level 100), return full document
  5. If viewing another user as non-admin, return public fields only: `_id`, `displayName`, `slug`, `bio`, `avatarUrl` (resolved), `websiteUrl`, `socialLinks`, `postCount`, `status`
  6. If viewing own profile, return full document
- **Public Fields:** `_id`, `displayName`, `slug`, `bio`, `avatarUrl` (resolved via `resolveAvatarUrl`), `url`, `socialLinks`, `postCount`, `status`

#### `getUserBySlug` - Get User by Slug (Author Archive)

- **Type:** query
- **File:** `convex/profiles/queries.ts`
- **Auth:** Not required (public)
- **Args:**
  ```typescript
  { slug: v.string() }
  ```
- **Returns:** Public profile data or `null`
- **Behavior:**
  1. Query `users` by `by_slug` index
  2. If not found or status is not `active`, return `null`
  3. Return public fields only: `_id`, `displayName`, `slug`, `bio`, `avatarUrl ?? authAvatarUrl`, `websiteUrl`, `socialLinks`, `postCount`
- **Used By:** Author archive page (`/author/$slug`)

#### `listUsers` - List All Users (Admin)

- **Type:** query
- **File:** `convex/profiles/queries.ts`
- **Auth:** Required
- **Capabilities:** `profile.view` + role level 100 (Administrator)
- **Args:**
  ```typescript
  {
    search: v.optional(v.string()),
    roleFilter: v.optional(v.id("roles")),
    statusFilter: v.optional(v.union(v.literal("active"), v.literal("deactivated"), v.literal("pending"))),
    sortBy: v.optional(v.union(v.literal("displayName"), v.literal("email"), v.literal("createdAt"), v.literal("postCount"))),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),  // Default: 50
  }
  ```
- **Returns:**
  ```typescript
  {
    users: Doc<"users">[],
    hasMore: boolean,
    totalCount: number,
  }
  ```
- **Behavior:**
  1. `requireCan(ctx, "profile.view")` + verify role level 100
  2. Apply index filter if `roleFilter` or `statusFilter` provided
  3. Collect all matching users
  4. Client-side search filter on `displayName`, `email`, `nickname` (case-insensitive includes)
  5. Sort by `sortBy` field (default: `createdAt` desc)
  6. Slice to `limit` (default: 50)
  7. Return users, hasMore flag, and totalCount
- **Real-Time:** New registrations and status changes appear without refresh
- **Note:** Full-text search is client-side for v1. Convex full-text search can be added later for scale.

### Mutations

#### `updateProfile` (`profile.update`) - Update User Profile

- **Type:** mutation
- **File:** `convex/profiles/mutations.ts`
- **Auth:** Required
- **Capabilities:** `profile.update` (all authenticated)
- **Args:**
  ```typescript
  {
    userId: v.optional(v.id("users")),   // If omitted, updates current user
    nickname: v.optional(v.string()),
    displayName: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    bio: v.optional(v.string()),
    socialLinks: v.optional(v.object({
      twitter: v.optional(v.string()),
      facebook: v.optional(v.string()),
      instagram: v.optional(v.string()),
      linkedin: v.optional(v.string()),
      github: v.optional(v.string()),
      youtube: v.optional(v.string()),
    })),
    preferences: v.optional(v.object({
      adminColorScheme: v.optional(v.string()),
      showAdminBar: v.optional(v.boolean()),
      editorMode: v.optional(v.union(v.literal("visual"), v.literal("code"))),
      emailDigest: v.optional(v.union(v.literal("immediate"), v.literal("daily"), v.literal("weekly"), v.literal("none"))),
      notifyOnComment: v.optional(v.boolean()),
      notifyOnReply: v.optional(v.boolean()),
      notifyOnMention: v.optional(v.boolean()),
    })),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. `requireCan(ctx, "profile.update")`
  2. Determine target user: if `userId` is provided and different from current user, check admin role (level 100). Otherwise, target is current user.
  3. Get target user document
  4. Build update payload -- only include fields that actually changed (compare with existing values)
  5. Validate: bio max 500 chars, websiteUrl is valid URL format
  6. Merge `socialLinks` and `preferences` with existing values (spread existing, overlay new)
  7. Set `updatedAt = Date.now()`
  8. `ctx.db.patch(targetUserId, updates)`
  9. Emit `profile.updated` event with `{ userId, changes[] }`
  10. If no fields changed, return early (no-op)
- **Events:** `profile.updated`
- **Errors:**
  - `UNAUTHORIZED` - Not authenticated
  - `FORBIDDEN` - Non-admin editing another user
  - `"User not found"` - Invalid userId
  - `"Invalid website URL format"` - Bad URL
  - `"Bio must be 500 characters or less"` - Bio too long

#### `uploadAvatar` (`profile.upload_avatar`) - Upload Custom Avatar

- **Type:** mutation
- **File:** `convex/profiles/mutations.ts`
- **Auth:** Required
- **Capabilities:** `profile.upload_avatar` (all authenticated)
- **Args:**
  ```typescript
  {
    userId: v.optional(v.id("users")),  // If omitted, updates current user
    storageId: v.string(),              // Convex Storage ID from generateUploadUrl()
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. `requireCan(ctx, "profile.upload_avatar")`
  2. Determine target user (same admin escalation logic as updateProfile)
  3. If target user has existing `avatarStorageId`, delete old file from `ctx.storage`
  4. Get URL for new avatar via `ctx.storage.getUrl(storageId)`
  5. Patch user with `avatarUrl`, `avatarStorageId`, `updatedAt`
  6. Emit `profile.avatar_changed` event
- **Events:** `profile.avatar_changed`
- **Avatar Upload Flow:**
  1. Client: User selects image file
  2. Client: Crop dialog opens (square aspect ratio enforced)
  3. Client: Call `generateUploadUrl()` to get Convex upload URL
  4. Client: Upload cropped image to the URL
  5. Client: Get `storageId` from upload response
  6. Client: Call `uploadAvatar` mutation with `storageId`
  7. Server: Resolve URL, patch user, emit event

#### `removeAvatar` - Remove Custom Avatar

- **Type:** mutation
- **File:** `convex/profiles/mutations.ts`
- **Auth:** Required
- **Capabilities:** `profile.upload_avatar` (all authenticated)
- **Args:**
  ```typescript
  { userId: v.optional(v.id("users")) }
  ```
- **Returns:** `void`
- **Behavior:**
  1. `requireCan(ctx, "profile.upload_avatar")`
  2. Determine target user
  3. If `avatarStorageId` exists, delete from `ctx.storage`
  4. Patch user: `avatarUrl = undefined`, `avatarStorageId = undefined`
  5. Emit `profile.avatar_changed` with fallback URL (`profilePictureUrl ?? null`)
- **Events:** `profile.avatar_changed`

#### `deactivateUser` (`profile.deactivate`) - Deactivate User Account

- **Type:** mutation
- **File:** `convex/profiles/mutations.ts`
- **Auth:** Required
- **Capabilities:** `profile.deactivate` (Administrator only)
- **Args:**
  ```typescript
  {
    userId: v.id("users"),
    reason: v.optional(v.string()),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. `requireCan(ctx, "profile.deactivate")`
  2. **Self-protection**: Throw if `userId === currentUser._id` ("You cannot deactivate your own account")
  3. Get target user, throw if not found
  4. Throw if already deactivated
  5. **Last admin protection**: If target is an admin, count active admins. If count <= 1, throw "Cannot deactivate the last active Administrator"
  6. Patch user: `status = "inactive"`, `deactivatedAt = Date.now()`, `deactivatedBy = currentUser._id`
  7. Schedule `revokeAuthSessions` internal action (revokes all auth sessions)
  8. Emit `profile.deactivated` event
- **Events:** `profile.deactivated`
- **Errors:**
  - `"You cannot deactivate your own account"`
  - `"User is already deactivated"`
  - `"Cannot deactivate the last active Administrator"`

#### `reactivateUser` - Reactivate Deactivated User

- **Type:** mutation
- **File:** `convex/profiles/mutations.ts`
- **Auth:** Required
- **Capabilities:** `profile.deactivate` (Administrator only)
- **Args:**
  ```typescript
  { userId: v.id("users") }
  ```
- **Returns:** `void`
- **Behavior:**
  1. `requireCan(ctx, "profile.deactivate")`
  2. Get target user, throw if not found or not deactivated
  3. Patch user: `status = "active"`, clear `deactivatedAt` and `deactivatedBy`
  4. Emit `profile.updated` event with `changes: ["status"]`
- **Events:** `profile.updated`

#### `deleteUser` (`profile.delete_user`) - Permanently Delete User

- **Type:** mutation
- **File:** `convex/profiles/mutations.ts`
- **Auth:** Required
- **Capabilities:** `profile.delete_user` (Administrator only)
- **Args:**
  ```typescript
  {
    userId: v.id("users"),
    contentAction: v.union(v.literal("reassign"), v.literal("delete")),
    reassignToUserId: v.optional(v.id("users")),  // Required if contentAction is "reassign"
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. `requireCan(ctx, "profile.delete_user")`
  2. **Self-protection**: Throw if deleting yourself
  3. **Last admin protection**: Same check as deactivation
  4. **Content handling**:
     - If `reassign`: Transfer all posts and pages to `reassignToUserId`. Update reassign target's `postCount`.
     - If `delete`: Delete all posts and pages by this user.
  5. Delete custom avatar from Convex Storage if exists
  6. Store `email` and `clerkUserId` before deleting the record
  7. Delete Convex user record (`ctx.db.delete`)
  8. Schedule `deleteAuthUser` internal action
  9. Emit `profile.deleted` event with stored email
- **Events:** `profile.deleted`
- **Errors:**
  - `"You cannot delete your own account"`
  - `"Cannot delete the last Administrator"`
  - `"Must specify a user to reassign content to"` (if reassign without target)
  - `"Reassignment target user not found"`

#### `bulkDeleteUsers` (`profile.bulk_delete`) - Bulk Delete Users

- **Type:** mutation
- **File:** `convex/profiles/mutations.ts`
- **Auth:** Required
- **Capabilities:** `profile.bulk_delete` (Administrator only)
- **Args:**
  ```typescript
  {
    userIds: v.array(v.id("users")),
    contentAction: v.union(v.literal("reassign"), v.literal("delete")),
    reassignToUserId: v.optional(v.id("users")),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. `requireCan(ctx, "profile.bulk_delete")`
  2. Iterate over `userIds`, skip self
  3. Delegate each to `deleteUser` (handles all validation and events per user)
  4. Each deletion emits its own `profile.deleted` event (individual events, not batch)
- **Events:** `profile.deleted` (one per user)

### Internal Actions (External API Calls)

#### `revokeAuthSessions` - Revoke All Convex Auth Sessions

- **Type:** `internalAction`
- **File:** `convex/profiles/internals.ts`
- **Args:** `{ clerkUserId: v.string() }`
- **Behavior:**
  1. Read `AUTH_API_KEY` from environment variables
  2. POST to `https://api.auth.com/user_management/sessions/revoke` with `{ user_id: clerkUserId }`
  3. Log success/failure (non-blocking -- deactivation succeeds even if revocation fails)
- **Called By:** `deactivateUser` via `ctx.scheduler.runAfter(0, ...)`

#### `deleteAuthUser` - Delete Convex Auth User Account

- **Type:** `internalAction`
- **File:** `convex/profiles/internals.ts`
- **Args:** `{ clerkUserId: v.string() }`
- **Behavior:**
  1. Read `AUTH_API_KEY` from environment variables
  2. Skip if `clerkUserId` starts with `manual_` (manually-created users have no auth account)
  3. DELETE to `https://api.auth.com/user_management/users/{clerkUserId}`
  4. Treat 404 responses as success (user already deleted in Convex Auth)
  5. Log success/failure (non-blocking -- deletion succeeds even if Convex Auth cleanup fails)
- **Called By:** `deleteUser` and `bulkDeleteUsers` via `ctx.scheduler.runAfter(0, ...)`

---

## Events

### `profile.updated`

- **Type:** User
- **Triggered By:** `profile.update` mutation, `reactivateUser` mutation
- **Payload:**
  ```typescript
  {
    userId: Id<"users">,
    changes: string[],  // Array of changed field names (e.g., ["displayName", "bio", "socialLinks"])
  }
  ```
- **Subscribers:**
  - **Site Notification**: "Profile updated successfully" (success toast, ephemeral, to the user who made the change)
  - **Audit Log**: Profile change recorded with field diff
  - **Side Effects**: Convex reactivity updates all components showing user data (author name on posts, avatar in comments, profile cards)

### `profile.avatar_changed`

- **Type:** User
- **Triggered By:** `profile.upload_avatar` mutation, `removeAvatar` mutation
- **Payload:**
  ```typescript
  {
    userId: Id<"users">,
    avatarUrl: string | null,  // New effective avatar URL (or null if removed and no Convex Auth avatar)
  }
  ```
- **Subscribers:**
  - **Site Notification**: "Profile avatar updated" (success toast, ephemeral)
  - **Audit Log**: Avatar change recorded
  - **Side Effects**: All avatar instances update in real time across the site

### `profile.deactivated`

- **Type:** User
- **Triggered By:** `profile.deactivate` mutation
- **Payload:**
  ```typescript
  {
    userId: Id<"users">,
    deactivatedBy: Id<"users">,
    reason?: string,
  }
  ```
- **Subscribers:**
  - **Email Notification**: "Your account has been deactivated" (immediate, to the deactivated user)
  - **Audit Log**: Deactivation recorded with admin and reason
  - **Side Effects**:
    - Author archive page returns 404 for this user
    - auth sessions revoked (async)
    - User cannot log in

### `profile.deleted`

- **Type:** User
- **Triggered By:** `profile.delete_user` mutation
- **Payload:**
  ```typescript
  {
    userId: Id<"users">,       // The now-deleted user's ID
    deletedBy: Id<"users">,    // Admin who performed the deletion
    email: string,              // Stored before deletion for notification
  }
  ```
- **Subscribers:**
  - **Email Notification**: "Your account has been deleted" (immediate, to the deleted user's stored email)
  - **Audit Log**: Deletion recorded with admin and content disposition
  - **Side Effects**:
    - Content reassigned or deleted
    - Convex Auth user deleted (async)
    - All references to this user should show "Deleted User"

### Event Chains

**Profile Update Chain:**
```
User edits profile -> profile.update mutation
  -> Fields validated and patched
  -> profile.updated event emitted
    -> Toast: "Profile updated successfully"
    -> Audit Log: records change
    -> Convex reactivity: all clients see new data instantly
```

**Deactivation Chain:**
```
Admin deactivates user -> profile.deactivate mutation
  -> Status set to "deactivated"
  -> auth sessions revoked (async)
  -> profile.deactivated event emitted
    -> Email: "Your account has been deactivated"
    -> Audit Log: deactivation recorded
    -> Author archive returns 404
    -> Active sessions terminated
```

**Deletion Chain:**
```
Admin deletes user -> profile.delete_user mutation
  -> Content reassigned or deleted
  -> Custom avatar deleted from storage
  -> Convex user record deleted
  -> Convex Auth user deleted (async)
  -> profile.deleted event emitted
    -> Email: "Your account has been deleted"
    -> Audit Log: deletion recorded
```

---

## Admin Routes & UI

### All Users Page (`/admin/users`)

- **Purpose:** List all users with search, filter, sort, and bulk actions
- **WordPress Equivalent:** Users > All Users
- **Layout:** WordPress-style list table with header bar, filter row, data table, bulk action bar, pagination
- **Auth:** Administrator only
- **Key Components:**
  - `user-list-table.tsx` - Data table with columns: checkbox, avatar (40x40 circle), display name (link to edit), email, role (colored badge), posts (count), date registered, status
  - `bulk-actions.tsx` - Bulk action toolbar: Change Role dropdown, Delete button, Apply button
  - `avatar.tsx` - Avatar display (custom > Convex Auth > initials)
  - `user-status-badge.tsx` - Active/Deactivated status badge
- **Data Requirements:**
  - `listUsers` query (with search, roleFilter, statusFilter, sortBy, sortOrder, limit)
  - Roles list (for role filter dropdown and role badges)
- **User Interactions:**
  - Search by name/email
  - Filter by role, status
  - Sort by any column
  - Select users (checkboxes) for bulk actions
  - Click user row to navigate to edit page
  - "Add New User" button (links to `/admin/users/new`, owned by Registration System)
- **Real-Time:** New registrations, status changes, and role changes appear without refresh
- **UI Notes:**
  - Deactivated users shown with muted row and "Deactivated" badge
  - Avatar shows custom > Convex Auth > initials (40x40px circle)
  - Role shows colored badge (internal roles = blue, customer roles = green)
  - Posts column shows denormalized `postCount`

### Edit User Page (`/admin/users/$userId/edit`)

- **Purpose:** Edit any user's profile, role, and status. Deactivate or delete users.
- **WordPress Equivalent:** Users > Edit User
- **Layout:** Full-page form with sections: Avatar, Account Information (read-only Convex Auth fields), Profile Information, Social Links, Role & Permissions, Account Status
- **Auth:** Administrator only
- **Key Components:**
  - `user-form.tsx` - Shared profile form (reused by Your Profile page)
  - `avatar-upload.tsx` - Avatar with upload button, crop dialog, remove button
  - `display-name-selector.tsx` - Dropdown generated from name components
  - `social-links-form.tsx` - Social links form section
  - `delete-user-dialog.tsx` - Delete confirmation with content reassignment choice
  - `deactivate-user-dialog.tsx` - Deactivation confirmation with optional reason
- **Data Requirements:**
  - `getUser(userId)` query
  - Roles list (for role selector)
  - User's role details (for capability count display)
- **User Interactions:**
  - View/edit profile fields (nickname, display name, website, bio, social links)
  - View read-only Convex Auth fields (email, first/last name) with "Manage in Convex Auth" link
  - Upload/remove avatar with crop dialog
  - Change user's role (delegates to Role System's `role.assign`)
  - Deactivate user (confirmation dialog)
  - Delete user (confirmation dialog with content disposition choice)
  - Save changes

### Your Profile Page (`/admin/profile`)

- **Purpose:** Edit your own profile
- **WordPress Equivalent:** Users > Your Profile
- **Layout:** Same as Edit User, but WITHOUT:
  - Role & Permissions section (cannot change own role)
  - Deactivate/Delete buttons (cannot deactivate/delete self)
  - Account Status shows role as read-only info
- **Auth:** All authenticated users
- **Key Components:** Same as Edit User (shares `user-form.tsx`)
- **Data Requirements:** `getCurrentUser` query

### Users API Endpoint (`/api/admin/users`)

- **Purpose:** REST API for user management (if needed for external integrations)
- **Auth:** Administrator only
- **Note:** This may be replaced entirely by Convex client queries; included for completeness

---

## Website Routes

### Author Archive Page (`/author/$slug`)

- **Purpose:** Public page showing a user's profile and published posts
- **WordPress Equivalent:** `author.php` template
- **Auth:** Not required (public)
- **Layout:** Large avatar, display name, bio, website link, social links, then a list of published posts by this author
- **SEO:** Meta tags with author name, description (bio), OG image (avatar), structured data (Person schema)
- **Data Requirements:**
  - `getUserBySlug(slug)` query for author profile
  - Posts query filtered by `authorId` (from Post System)
- **Caching:** SSR with Convex. Page updates reactively if author profile changes.
- **Edge Cases:**
  - Returns 404 if user not found, deactivated, or has no published posts (FR-11)
  - Deactivated user's archive page returns 404

### User Dashboard Page (`/dashboard`)

- **Purpose:** Landing page after login. Shows user's recent activity.
- **Auth:** All authenticated users
- **Layout:** Welcome message, recent posts (if Author+), recent comments, quick stats (posts, comments, member since), unread notification count
- **Data Requirements:**
  - `getCurrentUser` query
  - Recent posts by user (from Post System)
  - Recent comments by user (from Comment System)
  - Unread notification count (from Notification System)

### Edit Profile Page (`/dashboard/profile`)

- **Purpose:** Website-side profile editing (simpler than admin version)
- **Auth:** All authenticated users
- **Layout:** Avatar with "Change Photo", display name dropdown, nickname, website, bio (with char counter), social links
- **Key Components:**
  - `profile-form.tsx` - Simpler form (no role section, no admin actions)
  - `avatar.tsx` - Avatar display and upload
- **Data Requirements:** `getCurrentUser` query
- **Note:** Does NOT include Role section, deactivate/delete buttons, or detailed account status

### Account Settings Page (`/dashboard/settings`)

- **Purpose:** User preferences and account deletion
- **Auth:** All authenticated users
- **Layout:** Email preferences (digest frequency, notification toggles), display preferences (editor mode), Danger Zone (delete account)
- **Key Components:**
  - `delete-account-dialog.tsx` - Self-service deletion dialog (requires typing email to confirm)
- **Data Requirements:** `getCurrentUser` query
- **User Interactions:**
  - Change email digest frequency
  - Toggle notification preferences
  - Change editor mode
  - Delete own account (requires email confirmation, processes content same as admin deletion)

---

## Notifications

### Email Notifications

| # | Name | Event | Recipients | Priority | Subject Template | Provider |
|---|------|-------|-----------|----------|-----------------|----------|
| 1 | Account Deactivated | `profile.deactivated` | The deactivated user | Immediate | "Your account has been deactivated" | Resend |
| 2 | User Deletion Confirmation | `profile.deleted` | The deleted user (stored email) | Immediate | "Your account has been deleted" | Resend |

**Account Deactivated Email Variables:**
- `{userName}` - Deactivated user's display name
- `{siteName}` - Site name from settings
- `{reason}` - Reason for deactivation (if provided)
- `{supportEmail}` - Site support email

**User Deletion Email Variables:**
- `{userName}` - Deleted user's display name
- `{siteName}` - Site name from settings
- `{supportEmail}` - Site support email
- `{contentAction}` - "reassign" or "delete" (affects body text)

### Site Notifications

| # | Name | Event | Type | Persistent | Recipients | Message Template |
|---|------|-------|------|-----------|------------|-----------------|
| 1 | Profile Updated | `profile.updated` | Success | No (toast) | The user who updated | "Profile updated successfully" |
| 2 | Avatar Changed | `profile.avatar_changed` | Success | No (toast) | The user who changed | "Profile avatar updated" |

**Note:** Profile update notifications are ephemeral toasts only. Deactivation/deletion do not produce site notifications (the user is being removed).

---

## Role & Capability Matrix

| Action | Code | Admin (100) | Editor (80) | Author (60) | Contributor (40) | Subscriber (20) |
|--------|------|-------------|-------------|-------------|-------------------|-----------------|
| View Own Profile | `profile.view` | Yes | Yes | Yes | Yes | Yes |
| View Other Profiles (full) | `profile.view` + level 100 | Yes | No | No | No | No |
| View Other Profiles (public) | `profile.view` | Yes | Yes | Yes | Yes | Yes |
| Update Own Profile | `profile.update` | Yes | Yes | Yes | Yes | Yes |
| Update Other's Profile | `profile.update` + level 100 | Yes | No | No | No | No |
| Upload Own Avatar | `profile.upload_avatar` | Yes | Yes | Yes | Yes | Yes |
| Upload Other's Avatar | `profile.upload_avatar` + level 100 | Yes | No | No | No | No |
| Deactivate User | `profile.deactivate` | Yes | No | No | No | No |
| Reactivate User | `profile.deactivate` | Yes | No | No | No | No |
| Delete User | `profile.delete_user` | Yes | No | No | No | No |
| Bulk Delete Users | `profile.bulk_delete` | Yes | No | No | No | No |
| List All Users | `listUsers` (level 100) | Yes | No | No | No | No |

---

## Dependencies

### Depends On

| System | Type | What is Needed |
|--------|------|----------------|
| **Auth System** (`recNGEVtMvLjp6o8h`) | **Hard** | auth identity for user lookup (`ctx.auth.getUserIdentity()`). auth webhooks sync identity fields (`user.created`, `user.updated`). Auth system for session revocation and user deletion. Convex Auth redirect-based auth for shared sessions between admin and website apps. |
| **Role & Capability System** (`recLjkb6BJlxqHTQv`) | **Soft** | `requireCan()` for permission checks. Role data for user list display (role badge). `role.assign` mutation for role changes on Edit User page. Default role lookup for user creation. `roles` table with `by_isDefault` and `by_slug` indexes. |

### Depended On By

| System | Type | What They Need |
|--------|------|----------------|
| **Post System** | **Soft** | `authorId` references `users._id`. Author name and avatar displayed on posts. Post creation/deletion updates `postCount`. |
| **Page System** | **Soft** | `authorId` references `users._id`. Same as Post System for pages. |
| **Comment System** | **Soft** | Comments reference user for author display. Comment creation/deletion updates `commentCount`. |
| **Dashboard System** | **Soft** | Shows user-specific content and stats. Uses `getCurrentUser` query. |
| **Email Notification System** | **Soft** | Reads `preferences.emailDigest`, `preferences.notifyOnComment`, etc. for digest settings. Reads `email` for delivery. |
| **Site Notification System** | **Soft** | Reads user profile for notification delivery. Uses `displayName` and `avatarUrl` in notifications. |
| **Registration System** | **Hard** | Creates user records in the `users` table. The `users` table schema must exist. Default role must be queryable. |

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/)

- [x] `convex/schema/users.ts` - `usersTables` export with `users` table definition (modular schema)
- [x] `convex/profiles/queries.ts` - Queries: `getProfile`, `getUser`, `getUserBySlug`, `listUsers`, `getDisplayNameOptions`, `counts`
- [x] `convex/profiles/mutations.ts` - Mutations: `updateProfile`, `updateUser`, `createUser`, `uploadAvatar`, `removeAvatar`, `deactivateUser`, `reactivateUser`, `deleteUser`, `bulkDeleteUsers`
- [x] `convex/profiles/internals.ts` - Internal functions: `updatePostCount`, `updateCommentCount`, `generateSlugForUser`, `syncFromAuth`, `ensureSlug`, `updateLastLogin`, `revokeAuthSessions`, `deleteAuthUser`
- [x] `convex/profiles/validators.ts` - Shared argument validators and constants
- [x] `convex/helpers/profile.ts` - Helpers: `resolveAvatarUrl`, `getInitials`, `generateDisplayNameOptions`, `generateDisplayName`, `generateSlug`, `ensureUniqueSlug`, `extractPublicFields`, `validateBio`, `isValidUrl`, `countActiveAdmins`
- [ ] auth webhook handler updates in `convex/http.ts` - delegates to `profiles/internals.syncFromAuth`

### Admin Frontend (ConvexPress-Admin/apps/web/)

- [ ] `src/routes/_admin/users/index.tsx` - All Users list page
- [ ] `src/routes/_admin/users/$userId/edit.tsx` - Edit User page
- [ ] `src/routes/_admin/profile.tsx` - Your Profile page
- [ ] `src/components/users/user-list-table.tsx` - User list table with pagination
- [ ] `src/components/users/user-form.tsx` - Shared profile form
- [ ] `src/components/users/avatar-upload.tsx` - Avatar upload with crop dialog
- [ ] `src/components/users/avatar.tsx` - Avatar display (image + initials fallback)
- [ ] `src/components/users/display-name-selector.tsx` - Display name dropdown
- [ ] `src/components/users/social-links-form.tsx` - Social links form section
- [ ] `src/components/users/user-status-badge.tsx` - Active/Deactivated badge
- [ ] `src/components/users/delete-user-dialog.tsx` - Delete confirmation dialog
- [ ] `src/components/users/deactivate-user-dialog.tsx` - Deactivation confirmation dialog
- [ ] `src/components/users/bulk-actions.tsx` - Bulk action toolbar

### Website Frontend (ConvexPress-Website/apps/web/)

- [ ] `src/routes/author/$slug.tsx` - Author archive page (SSR)
- [ ] `src/routes/dashboard/index.tsx` - User dashboard page
- [ ] `src/routes/dashboard/profile.tsx` - Edit Profile page
- [ ] `src/routes/dashboard/settings.tsx` - Account Settings page
- [ ] `src/components/profile/profile-form.tsx` - Website profile form
- [ ] `src/components/profile/avatar.tsx` - Avatar component
- [ ] `src/components/profile/author-card.tsx` - Author bio card for archive page
- [ ] `src/components/profile/delete-account-dialog.tsx` - Self-service deletion dialog

---

## Edge Cases & Gotchas

1. **auth webhook race condition**: A user might authenticate via Convex Auth before the `user.created` webhook has been processed. The `getCurrentUser` query may return `null` briefly. Frontend should handle this gracefully with a loading state, not an error.

2. **Slug uniqueness on name collision**: Two users named "John Doe" would both generate slug `john-doe`. The `ensureUniqueSlug` helper appends a counter (`john-doe-2`). The while loop must not be infinite -- though in practice, slug collisions beyond a handful are extremely rare.

3. **Display name options deduplication**: If a user's nickname is the same as their first name, `generateDisplayNameOptions` uses a `Set` to avoid duplicate entries in the dropdown.

4. **Convex Auth-managed fields are READ ONLY**: The profile form must NEVER attempt to patch `email`, `firstName`, `lastName`, or `authAvatarUrl` via the `updateProfile` mutation. These are synced via webhooks only. The UI shows them as disabled inputs with a link to the auth system's account management page.

5. **Avatar storage cleanup**: When uploading a new avatar, the old avatar file MUST be deleted from Convex Storage before the new one is saved. Failing to do this creates orphaned files. The `avatarStorageId` field is the key to the old file.

6. **Last admin protection**: Both deactivation and deletion check for the last active admin. The check counts active admins by querying users with the admin role AND `status === "active"`. If the count is <= 1, the operation is blocked.

7. **Self-action prevention**: Users cannot deactivate or delete themselves. This is enforced server-side in the mutation, not just in the UI.

8. **Content disposition on delete**: Deletion REQUIRES specifying `contentAction` (reassign or delete). If `reassign`, the `reassignToUserId` must be provided and must point to a valid, active user. The admin must choose -- there is no default.

9. **Deletion order matters**: When deleting a user, the email and clerkUserId must be stored BEFORE deleting the Convex record, because the event handler needs the email for notification and the internal action needs the clerkUserId for Convex Auth deletion.

10. **Denormalized count drift**: If events are lost or processed out of order, `postCount` and `commentCount` can drift from reality. A periodic reconciliation job may be needed (not in v1, but keep in mind).

11. **Bio HTML stripping**: The bio field accepts plain text only. Any HTML must be stripped server-side to prevent XSS. The max length check (500 chars) should be applied AFTER stripping.

12. **Social links flexibility**: Social links support both full URLs and handles (e.g., `@johndoe` for Twitter). The UI should normalize these for display but store as-is. Platform-specific validation can be added later.

13. **Preferences merge behavior**: When updating preferences, new values are merged with existing ones (not replaced entirely). Setting `preferences.notifyOnComment = false` should not wipe out `preferences.emailDigest = "daily"`. Use spread: `{ ...existing.preferences, ...args.preferences }`.

14. **Deactivated users in author lists**: Deactivated users should NOT appear in public-facing author lists or dropdowns. Their content remains visible but the author link shows "Deactivated User" instead of linking to the (now 404) author archive.

15. **Webhook idempotency**: Convex Auth may retry webhooks. The `syncFromAuth` internal mutation is idempotent -- if a user with the given `clerkUserId` already exists, it updates instead of trying to insert a duplicate.

16. **Bulk delete skips self silently**: The `bulkDeleteUsers` mutation skips the current user's ID silently (no error, just skip). This prevents admins from accidentally including themselves in a bulk deletion.

---

## Known Gaps

1. **Author Archive Page (`/author/$slug`)**: The backend query `getUserBySlug` exists and works correctly, but the ConvexPress-Website frontend route (`/author/$slug`) has not been implemented yet. This requires coordination with the Website Blog & Content UI Expert (`/experts:website-blog-ui`) and/or Website Layout & Navigation UI Expert (`/experts:website-layout-ui`). The route should be created at `ConvexPress-Website/apps/web/src/routes/author/$slug.tsx` and should display the author's public profile (avatar, display name, bio, social links) and a list of their published posts, with SSR for SEO.

2. **`pending` status not implemented**: The original PRD specified a `pending` status for users awaiting email verification. The actual schema uses `active`/`inactive`/`banned`. Users are created as `active` immediately upon auth webhook processing. If a `pending` state is needed in the future, it would require schema migration and updates to the Registration System.

3. **Legacy `users.ts` coexistence**: A legacy `convex/users.ts` file exists alongside the modular `convex/profiles/` directory. It contains backward-compatible functions (`getCurrentUser`, `hasAnyAdmin`, `checkAdminAccess`, `bootstrapAdmin`) that use the old `isInternal`/`internalRole` fields. These are still referenced by some admin app routes. They should be migrated to use the `profiles/` equivalents and the Role & Capability System.

---

## WordPress Functions Reference

| WordPress Function | ConvexPress Equivalent | Notes |
|-------------------|------------------------|-------|
| `get_userdata($id)` | `getUser(ctx, { userId })` query | Returns full user document (admins) or public fields (non-admins) |
| `get_user_by('slug', $slug)` | `getUserBySlug(ctx, { slug })` query | For author archive pages |
| `wp_get_current_user()` | `getCurrentUser(ctx, {})` query | Uses auth identity to find Convex user |
| `wp_update_user($userdata)` | `updateProfile` mutation | Partial field update with change tracking |
| `get_user_meta($id, $key)` | Direct field access: `user.fieldName` | No key-value pattern, structured fields |
| `update_user_meta($id, $key, $value)` | `ctx.db.patch(userId, { field: value })` | Direct patch on user document |
| `get_avatar($id_or_email)` | `getAvatarUrl(user)` helper | Custom > Convex Auth > null (client renders initials) |
| `count_users()` | `listUsers` query with `totalCount` | Paginated with real-time updates |
| `wp_create_user($login, $pass, $email)` | Convex Auth `user.created` webhook -> `handleExternalAuthUserCreated` | Convex Auth handles auth creation, webhook creates Convex record |
| `wp_delete_user($id, $reassign)` | `deleteUser` mutation | Handles content reassignment + Convex Auth deletion |
| `get_the_author_meta('description')` | `user.bio` field | Direct field, no meta indirection |
| `get_the_author_meta('display_name')` | `user.displayName` field | Direct field |
| `get_author_posts_url($id)` | `/author/${user.slug}` | Route-based, not function-based |
| `user_can($user, $cap)` | `requireCan(ctx, capCode)` | Delegates to Role & Capability System |
| `is_user_logged_in()` | `ctx.auth.getUserIdentity() !== null` | auth identity check |
| `wp_list_authors()` | Custom query on `users` with `postCount > 0` | No direct equivalent, build from `listUsers` |
| `sanitize_user($username)` | `generateSlug(displayName)` | URL-safe slug generation |

---

## Helper Functions Reference

### `resolveAvatarUrl(user): string | null`

Resolves the effective avatar URL following the priority chain:
1. `user.avatarUrl` (custom upload) -- highest priority
2. `user.profilePictureUrl` (Convex Auth/OAuth provider)
3. `null` (client should render initials)

### `getInitials(displayName: string): string`

Generates 1-2 character initials from a display name:
- "John Doe" -> "JD"
- "Jane" -> "J"
- "" -> "?"

### `generateDisplayNameOptions(user): string[]`

Generates dropdown options from available name components (matching WordPress behavior):
- Email username (always included as fallback)
- First name (if available)
- Last name (if available)
- "First Last" (if both available)
- "Last, First" (if both available)
- Nickname (if available and different from first/last name)

Uses a `Set` to deduplicate.

### `generateDisplayName(firstName?, lastName?, email?): string`

Generates a default display name for new users:
- "First Last" if both names available
- First name only if available
- Last name only if available
- Email username if only email available
- "Anonymous" as ultimate fallback

### `generateSlug(displayName: string): string`

Converts a display name to a URL-safe slug:
- Lowercase
- Remove non-alphanumeric except spaces and hyphens
- Replace spaces with hyphens
- Collapse multiple hyphens
- Strip leading/trailing hyphens
- Fallback to "user" if empty result

### `ensureUniqueSlug(ctx, slug, excludeUserId?): Promise<string>`

Ensures slug uniqueness by querying the `by_slug` index:
- If slug is available, return it
- If taken, append counter: `slug-2`, `slug-3`, etc.
- `excludeUserId` allows a user to keep their own slug during updates
