# Role & Capability System - Expert Knowledge Document

**System:** Role & Capability System
**System ID:** `recLjkb6BJlxqHTQv`
**Expert Record:** `recKfqgHgJ6GTiCvz`
**Status:** Implementation Ready
**Priority:** P0 - Critical
**WordPress Equivalent:** `WP_Roles`, `WP_Role`, `WP_User::$roles`, `current_user_can()`, `map_meta_cap()`, User Role Editor plugin
**Last Analyzed:** 2026-02-08

---

## Quick Reference

### What This System Does

The Role & Capability System is the **foundation authorization layer** of ConvexPress. It is the WordPress equivalent of the `WP_Roles` class, the `current_user_can()` global function, and the `map_meta_cap()` ownership resolver. Every other system in ConvexPress depends on it to answer one question: "Can this user do this thing?" It implements five hierarchical roles (Administrator, Editor, Author, Contributor, Subscriber), each carrying a defined set of granular capability strings, and provides the `currentUserCan(ctx, capability)` helper that is called in every protected Convex mutation and query.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Capability** | A granular permission string like `post.create`, `role.assign`. There are 137 total. |
| **Role** | A named collection of capabilities with a hierarchical level (20-100). |
| **Primitive Capability** | Stored directly on the role's `capabilities[]` array. Checked via `includes()`. |
| **Meta Capability** | Contextual - resolves to different primitive capabilities based on resource ownership (e.g., `post.edit` -> own post: `post.update`, other's: requires Editor+ level). |
| **Role Level** | Numeric hierarchy: Admin=100, Editor=80, Author=60, Contributor=40, Subscriber=20. Higher = more powerful. |
| **Page Access** | Array of admin route paths a role can access. Used by TanStack Router `beforeLoad` guards. |
| **Protected Role** | Built-in roles (the 5 defaults) that cannot be deleted. Their capabilities CAN be modified. |
| **Default Role** | The role automatically assigned to new user registrations. Only one role can be default (Subscriber). |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| Database | Serialized PHP array in `wp_options` | Convex `roles` table (document per role) |
| Permission Check | `current_user_can($cap)` (synchronous) | `currentUserCan(ctx, cap)` (async, cached by Convex) |
| Reactivity | Changes require page refresh | Changes propagate instantly via Convex subscriptions |
| Role Storage | `WP_User::$roles` (array of slugs) | `users.roleId` (single `Id<"roles">` reference) |
| Multi-Role | Supported (rarely used) | Single-role only (field is `roleId`, not `roleIds`) |
| Meta Caps | `map_meta_cap()` in PHP | `mapMetaCap()` async function in Convex helpers |
| Auth Integration | WordPress sessions + cookies | auth identity -> Convex user lookup via `externalAuthId` |
| Route Guards | `current_user_can()` in PHP templates | TanStack Router `beforeLoad` checking `role.pageAccess[]` |
| UI Framework | jQuery admin UI | TanStack Router + Base UI components |
| Capability Count | ~70 core + plugin-added | 137 predefined across 20 domains |

---

## Architecture Overview

### Data Flow

```
User Action (UI)
  -> TanStack Router beforeLoad guard checks role.pageAccess[] (route-level)
  -> Component renders: useCan() hook checks role.capabilities[] (UI-level)
  -> User triggers mutation
    -> Convex mutation calls requireCan(ctx, "capability.string")
      -> getCurrentUser(ctx) fetches user via auth identity
      -> ctx.db.get(user.roleId) fetches role document (cached by Convex)
      -> role.capabilities.includes(capability) returns true/false
      -> If false: throws ConvexError with code "FORBIDDEN"
      -> If true: mutation proceeds
    -> For ownership checks: requireCanOnResource(ctx, "meta.cap", resourceId)
      -> mapMetaCap() resolves to primitive capabilities based on ownership
      -> Checks both capability AND role level
```

### Real-Time Behavior

Convex reactivity is the key advantage over WordPress:

1. **Role changes propagate instantly**: When an admin changes a user's role via `role.assign`, the `users` document is patched with a new `roleId`. All active `useQuery` hooks watching that user's data re-fire.
2. **AuthProvider updates**: The `role` object in `AuthProvider` updates automatically, causing all `useCan()` hooks to re-evaluate.
3. **Navigation updates live**: Menu items appear/disappear without page refresh based on `canAccessRoute()`.
4. **Route guards re-check**: On next navigation, `beforeLoad` guards use the updated role.
5. **Capability edits propagate**: If an admin modifies a role's capabilities, every user with that role sees UI changes immediately.

**Convex subscriptions needed:**
- `api.users.getCurrentUser` - Watches the current user document for `roleId` changes
- `api.roles.getRole` - Watches the role document for capability/pageAccess changes
- `api.roles.listRoles` - Admin page listing all roles (updates when roles are created/modified/deleted)

### Authentication & Authorization

**Auth Flow:**
1. Convex Auth provides user identity via `ctx.auth.getUserIdentity()`
2. `getCurrentUser(ctx)` looks up the Convex user by `identity.subject` (Convex Auth subject ID) using the `by_externalAuthId` index
3. User document contains `roleId` referencing the `roles` table
4. Role document contains `capabilities[]` array and `pageAccess[]` array
5. All checks are performed against these arrays

**Two Types of Authorization:**
- **Capability checks** (backend): `requireCan(ctx, "post.create")` in Convex mutations/queries
- **Route checks** (frontend): `beforeLoad` guards checking `role.pageAccess.includes(path)`

**Important:** Client-side checks (useCan, canAccessRoute) are for UI convenience only. The backend `requireCan()` is the security boundary. Never trust client-side checks alone.

---

## Database Schema

### `roles` Table

The central table storing all role definitions. Each role is a single document containing its name, hierarchy level, and the complete array of capability strings it grants.

```typescript
// ConvexPress-Admin/packages/backend/convex/schema.ts

roles: defineTable({
  // Identity
  name: v.string(),                    // "Administrator", "Editor", "Author", "Contributor", "Subscriber"
  slug: v.string(),                    // "admin", "editor", "author", "contributor", "subscriber"
  description: v.string(),            // Human-readable description of the role

  // Hierarchy
  level: v.number(),                   // 100, 80, 60, 40, 20 - higher = more powerful

  // Classification
  type: v.union(
    v.literal("internal"),             // Admin, Editor (ConvexPress-Admin only roles)
    v.literal("customer"),             // Author, Contributor, Subscriber
    v.literal("system")                // Reserved for future system roles
  ),

  // Flags
  isDefault: v.boolean(),             // Only one role can be default (Subscriber)
  isProtected: v.boolean(),           // Built-in roles cannot be deleted

  // Capabilities - array of action code strings
  capabilities: v.array(v.string()),  // ["post.create", "post.read", "post.update", ...]

  // Page Access - array of route paths this role can access in admin
  pageAccess: v.array(v.string()),    // ["/admin", "/admin/posts", ...]

  // Status
  status: v.union(
    v.literal("active"),
    v.literal("inactive")
  ),

  // Timestamps
  createdAt: v.number(),              // Date.now() at creation
  updatedAt: v.number(),              // Date.now() at last update
  createdBy: v.optional(v.id("users")), // Admin who created (null for seeded roles)
})
  .index("by_slug", ["slug"])          // Unique lookup by slug
  .index("by_level", ["level"])        // Query by hierarchy level
  .index("by_status", ["status"])      // Filter active/inactive roles
  .index("by_isDefault", ["isDefault"]), // Find the default role (Subscriber)
```

### `roleChanges` Table

Audit trail for all role assignment changes. Every time a user's role is modified, a record is created here.

```typescript
// ConvexPress-Admin/packages/backend/convex/schema.ts

roleChanges: defineTable({
  userId: v.id("users"),              // User whose role changed
  oldRoleId: v.optional(v.id("roles")), // Previous role (null for first assignment)
  newRoleId: v.id("roles"),           // New role
  changedBy: v.id("users"),           // Admin who made the change
  reason: v.optional(v.string()),     // Optional reason for the change
  timestamp: v.number(),              // Date.now() at change time
})
  .index("by_userId", ["userId"])      // History for a specific user
  .index("by_timestamp", ["timestamp"]), // Chronological audit trail
```

### User-Role Mapping (Cross-System Field)

The `users` table is owned by the User Profile System, but the Role & Capability System defines the `roleId` field and the `by_roleId` index:

```typescript
// Addition to users table (owned by User Profile System)

users: defineTable({
  // ... other user fields ...

  // Role assignment (owned by Role & Capability System)
  roleId: v.id("roles"),              // Reference to the user's assigned role

  // ... other fields ...
})
  .index("by_roleId", ["roleId"]),    // Find all users with a given role
```

### Indexes

| Table | Index | Fields | Purpose |
|-------|-------|--------|---------|
| `roles` | `by_slug` | `["slug"]` | Unique lookup for role by slug (e.g., find "admin" role) |
| `roles` | `by_level` | `["level"]` | Query roles by hierarchy level |
| `roles` | `by_status` | `["status"]` | Filter active/inactive roles |
| `roles` | `by_isDefault` | `["isDefault"]` | Find the default role for new user registration |
| `roleChanges` | `by_userId` | `["userId"]` | Get role change history for a specific user |
| `roleChanges` | `by_timestamp` | `["timestamp"]` | Chronological audit trail |
| `users` | `by_roleId` | `["roleId"]` | Find all users assigned to a specific role (needed for delete validation) |

### Relationships

```
roles (1) <------ (N) users.roleId
roles (1) <------ (N) roleChanges.newRoleId
roles (1) <------ (N) roleChanges.oldRoleId
users (1) <------ (N) roleChanges.userId
users (1) <------ (N) roleChanges.changedBy
```

---

## Actions & Functions

### Mutations

#### `role.create` - Create Role

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `role.create` (Administrator only)
- **Args:**
  ```typescript
  {
    name: v.string(),
    slug: v.string(),
    description: v.string(),
    level: v.number(),
    type: v.union(v.literal("internal"), v.literal("customer"), v.literal("system")),
    capabilities: v.array(v.string()),
    pageAccess: v.array(v.string()),
  }
  ```
- **Returns:** `Id<"roles">` - The new role's document ID
- **Behavior:**
  1. Call `requireCan(ctx, "role.create")` to verify admin permissions
  2. Validate slug uniqueness via `by_slug` index
  3. Validate that the level is not already occupied by a protected role
  4. Validate that all capability strings are valid action codes
  5. Insert role document with `isDefault: false`, `isProtected: false`, `status: "active"`
  6. Set `createdAt` and `updatedAt` to `Date.now()`
  7. Set `createdBy` to current user's ID
  8. Emit `role.created` event
- **Events:** `role.created`
- **Errors:**
  - `UNAUTHORIZED` - User not authenticated
  - `FORBIDDEN` - User lacks `role.create` capability
  - `Role slug already exists` - Duplicate slug
  - Invalid capability strings

#### `role.update` - Update Role

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `role.update` (Administrator only)
- **Args:**
  ```typescript
  {
    roleId: v.id("roles"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    level: v.optional(v.number()),
    capabilities: v.optional(v.array(v.string())),
    pageAccess: v.optional(v.array(v.string())),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Call `requireCan(ctx, "role.update")`
  2. Fetch the role document; throw if not found
  3. Diff changed fields for event payload (track what changed)
  4. Patch the role document with provided fields + `updatedAt: Date.now()`
  5. Emit `role.updated` event with change details
- **Events:** `role.updated`
- **Errors:**
  - `FORBIDDEN` - User lacks `role.update` capability
  - `Role not found` - Invalid roleId

#### `role.delete` - Delete Role

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `role.delete` (Administrator only)
- **Args:**
  ```typescript
  {
    roleId: v.id("roles"),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Call `requireCan(ctx, "role.delete")`
  2. Fetch the role; throw if not found
  3. Check `isProtected` flag; throw if true ("Cannot delete built-in role")
  4. Query `users` table via `by_roleId` index; throw if any users are assigned ("Cannot delete role with assigned users. Reassign users first.")
  5. Delete the role document
  6. Emit `role.deleted` event
- **Events:** `role.deleted`
- **Errors:**
  - `FORBIDDEN` - User lacks `role.delete` capability
  - `Role not found` - Invalid roleId
  - `Cannot delete built-in role` - Protected role
  - `Cannot delete role with assigned users` - Users still assigned

#### `role.assign` - Assign Role to User

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `role.assign` (Administrator only)
- **Args:**
  ```typescript
  {
    userId: v.id("users"),
    roleId: v.id("roles"),
    reason: v.optional(v.string()),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Call `requireCan(ctx, "role.assign")`
  2. Get current user; throw if target user is self ("Cannot change your own role")
  3. Fetch target user; throw if not found
  4. Fetch new role; throw if not found
  5. **Last admin protection:** If target user's current role is `admin` AND new role is not `admin`, count all admin users. If count <= 1, throw "Cannot remove the last Administrator"
  6. Save the old roleId for the change record
  7. Patch user document: `{ roleId: args.roleId }`
  8. Insert `roleChanges` record with old/new/changedBy/reason/timestamp
  9. Emit `role.assigned` event (triggers email + site notification + audit log)
- **Events:** `role.assigned`
- **Errors:**
  - `FORBIDDEN` - User lacks `role.assign` capability
  - `Cannot change your own role` - Self-modification prevented
  - `User not found` - Invalid userId
  - `Role not found` - Invalid roleId
  - `Cannot remove the last Administrator` - Last admin protection

#### `role.grant_capability` - Grant Capability to Role

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `role.grant_capability` (Administrator only)
- **Args:**
  ```typescript
  {
    roleId: v.id("roles"),
    capability: v.string(),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Call `requireCan(ctx, "role.grant_capability")`
  2. Fetch role; throw if not found
  3. Validate capability is a known action code via `isValidCapability()`
  4. Check for duplicates: if already in `capabilities[]`, return early (no-op)
  5. Patch role: append capability to `capabilities[]`, update `updatedAt`
  6. Emit `role.capability_granted` event
- **Events:** `role.capability_granted`
- **Errors:**
  - `FORBIDDEN` - Missing `role.grant_capability`
  - `Role not found`
  - `Unknown capability: {cap}` - Invalid capability string

#### `role.revoke_capability` - Revoke Capability from Role

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `role.revoke_capability` (Administrator only)
- **Args:**
  ```typescript
  {
    roleId: v.id("roles"),
    capability: v.string(),
  }
  ```
- **Returns:** `void`
- **Behavior:**
  1. Call `requireCan(ctx, "role.revoke_capability")`
  2. Fetch role; throw if not found
  3. Filter the capability out of `capabilities[]`
  4. Patch role with filtered array + `updatedAt: Date.now()`
- **Events:** `role.capability_revoked` (emitted for audit trail, consistent with grant)
- **Errors:**
  - `FORBIDDEN` - Missing `role.revoke_capability`
  - `Role not found`

### Queries

#### `roles.listRoles` - List All Roles

- **Type:** query
- **Auth:** Required (Administrator)
- **Args:** `{}`
- **Returns:** `Doc<"roles">[]` with user counts
- **Behavior:**
  1. Fetch all roles from the `roles` table
  2. For each role, count users assigned via `by_roleId` index
  3. Return roles sorted by level descending (Admin first)
- **Pagination:** Not needed (5-10 roles max)
- **Filters:** Optional `status` filter

#### `roles.getRole` - Get Single Role

- **Type:** query
- **Auth:** Required
- **Args:** `{ roleId: v.id("roles") }`
- **Returns:** `Doc<"roles"> | null`
- **Behavior:** Direct document lookup via `ctx.db.get(roleId)`

#### `roles.getRoleBySlug` - Get Role by Slug

- **Type:** query
- **Auth:** Required
- **Args:** `{ slug: v.string() }`
- **Returns:** `Doc<"roles"> | null`
- **Behavior:** Query via `by_slug` index

#### `roles.getDefaultRole` - Get Default Role

- **Type:** query
- **Auth:** Internal / Required
- **Args:** `{}`
- **Returns:** `Doc<"roles">`
- **Behavior:** Query via `by_isDefault` index where `isDefault === true`. Returns the Subscriber role.

#### `roles.getRoleChanges` - Get Role Change History

- **Type:** query
- **Auth:** Required (Administrator)
- **Args:** `{ userId: v.optional(v.id("users")) }`
- **Returns:** `Doc<"roleChanges">[]` with role names resolved
- **Behavior:**
  1. If `userId` provided, query via `by_userId` index
  2. Otherwise query via `by_timestamp` index (most recent first)
  3. Resolve role names from `oldRoleId` and `newRoleId`
  4. Resolve user names from `userId` and `changedBy`

---

## Permission Helper Functions

These are the most critical functions in the entire CMS. They live in `convex/helpers/permissions.ts`.

### `currentUserCan(ctx, capability)` -> `Promise<boolean>`

The ConvexPress equivalent of WordPress's `current_user_can()`. Non-throwing. Returns `true`/`false`.

```typescript
export async function currentUserCan(
  ctx: QueryCtx | MutationCtx,
  capability: string
): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  if (!user) return false;

  const role = await ctx.db.get(user.roleId);
  if (!role) return false;
  if (role.status !== "active") return false;

  return role.capabilities.includes(capability);
}
```

### `userCan(ctx, userId, capability)` -> `Promise<boolean>`

Check if a specific user has a capability. WordPress equivalent: `user_can($user, $cap)`.

```typescript
export async function userCan(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  capability: string
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  if (!user) return false;

  const role = await ctx.db.get(user.roleId);
  if (!role) return false;
  if (role.status !== "active") return false;

  return role.capabilities.includes(capability);
}
```

### `requireCan(ctx, capability)` -> `Promise<Doc<"users">>`

Throwing version. Use in mutations that must be protected. Returns the user document on success.

```typescript
export async function requireCan(
  ctx: QueryCtx | MutationCtx,
  capability: string
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }

  const role = await ctx.db.get(user.roleId);
  if (!role || role.status !== "active") {
    throw new ConvexError({ code: "FORBIDDEN", message: "No active role assigned" });
  }

  if (!role.capabilities.includes(capability)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `Missing capability: ${capability}`,
      capability,
      role: role.slug,
    });
  }

  return user;
}
```

### `requireCanOnResource(ctx, capability, resourceId)` -> `Promise<Doc<"users">>`

For meta/ownership-based checks. Resolves ownership before checking capabilities.

```typescript
export async function requireCanOnResource(
  ctx: QueryCtx | MutationCtx,
  capability: string,
  resourceId: Id<"posts"> | Id<"pages"> | Id<"media"> | Id<"comments">
): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) {
    throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
  }

  const role = await ctx.db.get(user.roleId);
  if (!role || role.status !== "active") {
    throw new ConvexError({ code: "FORBIDDEN", message: "No active role assigned" });
  }

  const metaResult = await mapMetaCap(ctx, capability, user._id, resourceId);

  if (!metaResult.allowed) {
    throw new ConvexError({ code: "FORBIDDEN", message: metaResult.reason || `Access denied: ${capability}` });
  }

  for (const requiredCap of metaResult.requiredCaps) {
    if (!role.capabilities.includes(requiredCap)) {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: `Missing capability: ${requiredCap}`,
        capability: requiredCap,
        role: role.slug,
      });
    }
  }

  if (metaResult.minRoleLevel && role.level < metaResult.minRoleLevel) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `Insufficient role level. Required: ${metaResult.minRoleLevel}, Have: ${role.level}`
    });
  }

  return user;
}
```

### `getCurrentUser(ctx)` -> `Promise<Doc<"users"> | null>`

Fetches the Convex user document from the auth identity.

```typescript
export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_externalAuthId", q => q.eq("externalAuthId", identity.subject))
    .unique();
}
```

### `getCurrentRoleLevel(ctx)` -> `Promise<number>`

Returns 0 if not authenticated or no active role.

```typescript
export async function getCurrentRoleLevel(
  ctx: QueryCtx | MutationCtx
): Promise<number> {
  const user = await getCurrentUser(ctx);
  if (!user) return 0;

  const role = await ctx.db.get(user.roleId);
  if (!role || role.status !== "active") return 0;

  return role.level;
}
```

### `mapMetaCap(ctx, capability, userId, resourceId)` -> `Promise<MetaCapResult>`

WordPress equivalent of `map_meta_cap()`. Resolves meta capabilities to primitive capabilities based on resource ownership.

```typescript
type MetaCapResult = {
  allowed: boolean;
  requiredCaps: string[];
  minRoleLevel?: number;
  reason?: string;
};
```

**Meta Capability Map:**

| Meta Capability | Check | Own Resource | Other's Resource |
|----------------|-------|-------------|-----------------|
| `post.edit` | Is user the author? | Requires `post.update` | Requires `post.update` + role level >= 80 |
| `post.delete_one` | Is user the author? | Requires `post.trash` | Requires `post.delete` |
| `post.publish_one` | Is user the author? | Requires `post.publish` | Denied for Author/Contributor |
| `page.edit` | Is user the author? | Requires `page.update` | Requires `page.update` + role level >= 80 |
| `media.edit` | Is user the uploader? | Requires `media.update` | Requires `media.update` + role level >= 80 |
| `media.delete_one` | Is user the uploader? | Requires `media.delete` | Requires `media.delete` + role level >= 80 |
| `comment.edit` | Is user the author? | Requires `comment.update` | Requires `comment.update` + role level >= 80 |
| `comment.delete_one` | Is user the author? | Denied | Requires `comment.delete` (moderator) |
| `seo.edit_post` | Is user the post author? | Requires `seo.update_post` | Requires `seo.update_post` + role level >= 80 |
| `custom_field.edit_value` | Is user the post author? | Requires `custom_field.set_value` | Requires `custom_field.set_value` + role level >= 80 |

**Known meta capability set:**
```typescript
const META_CAPABILITIES = new Set([
  "post.edit", "post.delete_one", "post.publish_one",
  "page.edit", "media.edit", "media.delete_one",
  "comment.edit", "comment.delete_one",
  "seo.edit_post", "custom_field.edit_value",
]);
```

---

## Events

### `role.created`

- **Type:** System
- **Triggered By:** `role.create` mutation
- **Payload:**
  ```typescript
  {
    roleId: Id<"roles">,
    name: string,
  }
  ```
- **Subscribers:**
  - Audit Log: Yes
  - Email: No
  - Site: No

### `role.updated`

- **Type:** System
- **Triggered By:** `role.update` mutation
- **Payload:**
  ```typescript
  {
    roleId: Id<"roles">,
    name: string,
    changes: string[], // List of changed field names
  }
  ```
- **Subscribers:**
  - Audit Log: Yes
  - Email: No
  - Site: No

### `role.deleted`

- **Type:** System
- **Triggered By:** `role.delete` mutation
- **Payload:**
  ```typescript
  {
    roleId: Id<"roles">,
    name: string,
  }
  ```
- **Subscribers:**
  - Audit Log: Yes
  - Email: No
  - Site: No

### `role.assigned`

- **Type:** User
- **Triggered By:** `role.assign` mutation
- **Payload:**
  ```typescript
  {
    userId: Id<"users">,
    oldRole: Id<"roles"> | undefined,
    newRole: Id<"roles">,
    assignedBy: Id<"users">,
  }
  ```
- **Subscribers:**
  - Email: "Your role has been updated to {role}" (to the affected user, immediate priority)
  - Site: "Your role updated to {role}" (persistent notification to the affected user)
  - Audit Log: Yes (records old role, new role, changedBy)
  - Side Effects:
    - Convex reactivity updates the user's UI immediately
    - Navigation items appear/disappear
    - Route access is updated
    - Action buttons are shown/hidden

**Event Chain:**
```
Admin changes user's role
  -> role.assign mutation executes
    -> User's roleId is updated in Convex
    -> roleChanges record is created
    -> role.assigned event is emitted
      -> Email Notification System: sends "Your role has been updated to {role}"
      -> Site Notification System: creates persistent notification "Your role updated to {role}"
      -> Audit Log System: records the role change with old/new/changedBy
      -> Convex reactivity: user's UI immediately reflects new permissions
```

### `role.capability_granted`

- **Type:** System
- **Triggered By:** `role.grant_capability` mutation
- **Payload:**
  ```typescript
  {
    roleId: Id<"roles">,
    capability: string,
  }
  ```
- **Subscribers:**
  - Audit Log: Yes
  - Email: No
  - Site: No

---

## Admin Routes & UI

### Roles & Capabilities (`/admin/roles`)

- **Purpose:** List all roles with user counts and capability counts. Entry point for role management.
- **WordPress Equivalent:** Users > Roles (via User Role Editor plugin)
- **Access:** Administrator only
- **Layout:** WordPress-style list table with columns: Role, Type, Level, Users, Capabilities
- **Key Components:**
  - `role-list.tsx` - Table component displaying all roles
  - `[+ Add New Role]` button in header (navigates to creation form)
- **Data Requirements:** `api.roles.listRoles` query (returns roles with user counts)
- **User Interactions:**
  - Click any row to navigate to `/admin/roles/$roleId/edit`
  - Click "Add New Role" to create a custom role
  - Default role is marked with asterisk and note
- **Real-Time:** Role list updates live when roles are created/modified/deleted

**UI Layout:**
```
+---------------------------------------------------------------+
| Roles & Capabilities                          [+ Add New Role] |
+---------------------------------------------------------------+
| Role            | Type     | Level | Users | Capabilities     |
|-----------------|----------|-------|-------|------------------|
| Administrator   | Internal | 100   | 2     | 137              |
| Editor          | Internal | 80    | 3     | 77               |
| Author          | Customer | 60    | 12    | 49               |
| Contributor     | Customer | 40    | 8     | 35               |
| Subscriber *    | Customer | 20    | 145   | 22               |
+---------------------------------------------------------------+
  * = Default role for new registrations
```

### Edit Role (`/admin/roles/$roleId/edit`)

- **Purpose:** Edit a role's capabilities and page access with grouped toggle switches.
- **WordPress Equivalent:** User Role Editor > Edit Role
- **Access:** Administrator only
- **Layout:**
  - Top section: Role metadata (name, slug, description, level, type)
  - Middle section: Capabilities grouped by domain (Posts, Pages, Media, etc.) with toggle switches and "Toggle All" per group
  - Bottom section: Page Access checkboxes for admin routes
- **Key Components:**
  - `capability-editor.tsx` - Grouped capability toggle component with domain-level "Toggle All"
  - Role metadata form fields
  - Page access checklist
- **Data Requirements:** `api.roles.getRole` query
- **User Interactions:**
  - Toggle individual capabilities on/off
  - Toggle all capabilities in a domain group
  - Toggle page access for admin routes
  - Edit role name, description, level
  - Slug is read-only for built-in (protected) roles
  - Save changes button at bottom
- **Real-Time:** Changes save immediately via optimistic UI with Convex. All users with this role see capability changes propagated instantly.

### All Users (`/admin/users`)

- **Purpose:** List all users with a role column showing their assigned role.
- **WordPress Equivalent:** Users > All Users
- **Access:** Administrator only
- **Key Components:**
  - User list table with role column
  - Role filter dropdown (show users by role)
- **Data Requirements:** User list query with role data joined
- **User Interactions:**
  - Filter by role
  - Click user to edit (navigate to `/admin/users/$userId/edit`)

### Add New User (`/admin/users/new`)

- **Purpose:** Create a new user with a role selector defaulting to Subscriber.
- **WordPress Equivalent:** Users > Add New
- **Access:** Administrator only
- **Key Components:**
  - `role-selector.tsx` - Role dropdown component
- **User Interactions:**
  - Select role from dropdown (defaults to Subscriber/default role)

### Edit User (`/admin/users/$userId/edit`)

- **Purpose:** Edit user details including role assignment.
- **WordPress Equivalent:** Users > Edit User
- **Access:** Administrator only
- **Key Components:**
  - Role section with dropdown and optional "Send notification" checkbox
  - `role-selector.tsx` - Role dropdown component
- **User Interactions:**
  - Change user's role via dropdown
  - Optional: check "Send notification to user about role change"
- **Real-Time:** Role change takes effect immediately via Convex reactivity

---

## Website Routes

The website app (TanStack Start) does NOT have dedicated routes for role management. All role management happens in the admin app. However, the website uses capability checks for:

### User Profile (`/profile`)

- **Purpose:** User's own profile page (public-facing)
- **Capability Checks:** `profile.view`, `profile.update`, `profile.upload_avatar`
- **Data Requirements:** Current user query with role data

### Content Interaction

- **Comment Forms:** Check `comment.create` before rendering comment form
- **Edit Post Link:** Check `post.update` + ownership before showing "Edit Post" link in admin bar
- **Profile Settings:** Check `profile.update` before showing edit controls

---

## Notifications

### Email Notifications

| Name | Event | Recipients | Priority | Subject Template |
|------|-------|------------|----------|-----------------|
| Role Changed | `role.assigned` | The user whose role changed | Immediate | "Your role has been updated to {role}" |

**Template Variables:**
- `{role}` - New role name (e.g., "Editor")
- `{oldRole}` - Previous role name
- `{siteName}` - Site name from settings
- `{adminName}` - Name of the admin who made the change
- `{dashboardUrl}` - Link to the user's dashboard

### Site Notifications

| Name | Event | Type | Persistent | Recipients |
|------|-------|------|-----------|------------|
| Role Changed | `role.assigned` | Info | Yes | The user whose role changed |

**Note:** Persistent means the notification stays in the notification center until explicitly dismissed. Role changes affect what the user can do, so awareness is critical.

---

## Role & Capability Matrix

### Complete Matrix by Domain

| Capability | Code | Admin | Editor | Author | Contributor | Subscriber |
|-----------|------|-------|--------|--------|-------------|-----------|
| **Posts (13)** | | | | | | |
| Create Post | `post.create` | Yes | Yes | Yes | Yes | - |
| Read Post | `post.read` | Yes | Yes | Yes | Yes | Yes |
| Update Post | `post.update` | Yes | Yes | Yes* | Yes* | - |
| Delete Post | `post.delete` | Yes | Yes | - | - | - |
| Publish Post | `post.publish` | Yes | Yes | Yes* | - | - |
| Unpublish Post | `post.unpublish` | Yes | Yes | - | - | - |
| Schedule Post | `post.schedule` | Yes | Yes | Yes* | - | - |
| Trash Post | `post.trash` | Yes | Yes | Yes* | - | - |
| Restore Post | `post.restore` | Yes | Yes | - | - | - |
| Duplicate Post | `post.duplicate` | Yes | Yes | Yes | - | - |
| Bulk Delete | `post.bulk_delete` | Yes | Yes | - | - | - |
| Bulk Publish | `post.bulk_publish` | Yes | Yes | - | - | - |
| Preview Post | `post.preview` | Yes | Yes | Yes | Yes | - |
| **Pages (7)** | | | | | | |
| Create Page | `page.create` | Yes | Yes | - | - | - |
| Read Page | `page.read` | Yes | Yes | Yes | Yes | Yes |
| Update Page | `page.update` | Yes | Yes | - | - | - |
| Delete Page | `page.delete` | Yes | Yes | - | - | - |
| Publish Page | `page.publish` | Yes | Yes | - | - | - |
| Reorder Pages | `page.reorder` | Yes | Yes | - | - | - |
| Set Page Parent | `page.set_parent` | Yes | Yes | - | - | - |
| **Media (6)** | | | | | | |
| Read Media | `media.read` | Yes | Yes | Yes | Yes | Yes |
| Upload Media | `media.upload` | Yes | Yes | Yes | - | - |
| Update Metadata | `media.update` | Yes | Yes | Yes* | - | - |
| Delete Media | `media.delete` | Yes | Yes | - | - | - |
| Crop Image | `media.crop` | Yes | Yes | Yes | - | - |
| Bulk Delete | `media.bulk_delete` | Yes | Yes | - | - | - |
| **Taxonomy (9)** | | | | | | |
| Create Category | `taxonomy.create_category` | Yes | Yes | - | - | - |
| Update Category | `taxonomy.update_category` | Yes | Yes | - | - | - |
| Delete Category | `taxonomy.delete_category` | Yes | Yes | - | - | - |
| Create Tag | `taxonomy.create_tag` | Yes | Yes | Yes | - | - |
| Update Tag | `taxonomy.update_tag` | Yes | Yes | - | - | - |
| Delete Tag | `taxonomy.delete_tag` | Yes | Yes | - | - | - |
| Assign Term | `taxonomy.assign` | Yes | Yes | Yes | Yes | - |
| Unassign Term | `taxonomy.unassign` | Yes | Yes | Yes | - | - |
| Merge Terms | `taxonomy.merge` | Yes | Yes | - | - | - |
| **Comments (13)** | | | | | | |
| Create Comment | `comment.create` | Yes | Yes | Yes | Yes | Yes |
| Read Comments | `comment.read` | Yes | Yes | Yes | Yes | Yes |
| Update Comment | `comment.update` | Yes | Yes | - | - | - |
| Delete Comment | `comment.delete` | Yes | Yes | - | - | - |
| Reply | `comment.reply` | Yes | Yes | Yes | - | - |
| Approve | `comment.approve` | Yes | Yes | - | - | - |
| Reject | `comment.reject` | Yes | Yes | - | - | - |
| Spam | `comment.spam` | Yes | Yes | - | - | - |
| Flag | `comment.flag` | Yes | Yes | Yes | Yes | Yes |
| Like | `comment.like` | Yes | Yes | Yes | Yes | Yes |
| Bulk Approve | `comment.bulk_approve` | Yes | Yes | - | - | - |
| Bulk Delete | `comment.bulk_delete` | Yes | Yes | - | - | - |
| Bulk Spam | `comment.bulk_spam` | Yes | Yes | - | - | - |
| **Roles & Capabilities (6)** | | | | | | |
| Create Role | `role.create` | Yes | - | - | - | - |
| Update Role | `role.update` | Yes | - | - | - | - |
| Delete Role | `role.delete` | Yes | - | - | - | - |
| Assign Role | `role.assign` | Yes | - | - | - | - |
| Grant Capability | `role.grant_capability` | Yes | - | - | - | - |
| Revoke Capability | `role.revoke_capability` | Yes | - | - | - | - |
| **User Profile (6)** | | | | | | |
| View Profile | `profile.view` | Yes | Yes | Yes | Yes | Yes |
| Update Profile | `profile.update` | Yes | Yes | Yes | Yes | Yes |
| Upload Avatar | `profile.upload_avatar` | Yes | Yes | Yes | Yes | Yes |
| Deactivate User | `profile.deactivate` | Yes | - | - | - | - |
| Delete User | `profile.delete_user` | Yes | - | - | - | - |
| Bulk Delete Users | `profile.bulk_delete` | Yes | - | - | - | - |
| **Auth (5)** | | | | | | |
| Login | `auth.login` | Yes | Yes | Yes | Yes | Yes |
| Logout | `auth.logout` | Yes | Yes | Yes | Yes | Yes |
| OAuth Login | `auth.oauth_login` | Yes | Yes | Yes | Yes | Yes |
| Refresh Session | `auth.refresh_session` | Yes | Yes | Yes | Yes | Yes |
| Verify Email | `auth.verify_email` | Yes | Yes | Yes | Yes | Yes |
| **Password (3)** | | | | | | |
| Change Password | `password.change` | Yes | Yes | Yes | Yes | Yes |
| Reset Password | `password.reset` | Yes | - | - | - | - |
| Request Reset | `password.request_reset` | Yes | - | - | - | - |
| **Registration (3)** | | | | | | |
| Register User | `registration.register` | Yes | - | - | - | - |
| Invite User | `registration.invite` | Yes | - | - | - | - |
| Resend Verification | `registration.resend_verification` | Yes | - | - | - | - |
| **Dashboard (4)** | | | | | | |
| View Dashboard | `dashboard.view` | Yes | Yes | Yes | Yes | - |
| Quick Draft | `dashboard.quick_draft` | Yes | Yes | Yes | Yes | - |
| Dismiss Widget | `dashboard.dismiss_widget` | Yes | Yes | Yes | Yes | - |
| Reorder Widgets | `dashboard.reorder_widgets` | Yes | Yes | Yes | Yes | - |
| **Content Editor (6)** | | | | | | |
| Add Block | `editor.add_block` | Yes | Yes | Yes | Yes | - |
| Remove Block | `editor.remove_block` | Yes | Yes | Yes | Yes | - |
| Reorder Blocks | `editor.reorder_blocks` | Yes | Yes | Yes | Yes | - |
| Save Draft | `editor.save_draft` | Yes | Yes | Yes | Yes | - |
| Save Reusable Block | `editor.save_reusable` | Yes | Yes | - | - | - |
| Autosave | `editor.autosave` | Yes | Yes | Yes | Yes | - |
| **Custom Fields (5)** | | | | | | |
| Create Field Group | `custom_field.create_group` | Yes | - | - | - | - |
| Update Field Group | `custom_field.update_group` | Yes | - | - | - | - |
| Delete Field Group | `custom_field.delete_group` | Yes | - | - | - | - |
| Set Field Value | `custom_field.set_value` | Yes | Yes | Yes* | - | - |
| Read Field Value | `custom_field.read_value` | Yes | Yes | Yes | Yes | Yes |
| **Revisions (4)** | | | | | | |
| View Revisions | `revision.view` | Yes | Yes | Yes | - | - |
| Compare Revisions | `revision.compare` | Yes | Yes | Yes | - | - |
| Restore Revision | `revision.restore` | Yes | Yes | - | - | - |
| Delete Revision | `revision.delete` | Yes | - | - | - | - |
| **SEO (4)** | | | | | | |
| Update Post SEO | `seo.update_post` | Yes | Yes | Yes* | - | - |
| Update Global SEO | `seo.update_global` | Yes | - | - | - | - |
| Update Robots.txt | `seo.update_robots` | Yes | - | - | - | - |
| Generate Sitemap | `seo.generate_sitemap` | Yes | - | - | - | - |
| **Search (2)** | | | | | | |
| Search Content | `search.query` | Yes | Yes | Yes | Yes | Yes |
| Reindex Content | `search.reindex` | Yes | - | - | - | - |
| **Menu System (8)** | | | | | | |
| Create Menu | `menu.create` | Yes | - | - | - | - |
| Update Menu | `menu.update` | Yes | - | - | - | - |
| Delete Menu | `menu.delete` | Yes | - | - | - | - |
| Add Menu Item | `menu.add_item` | Yes | - | - | - | - |
| Update Menu Item | `menu.update_item` | Yes | - | - | - | - |
| Delete Menu Item | `menu.delete_item` | Yes | - | - | - | - |
| Reorder Menu | `menu.reorder` | Yes | - | - | - | - |
| Assign Location | `menu.assign_location` | Yes | - | - | - | - |
| **Settings (9)** | | | | | | |
| General Settings | `settings.update_general` | Yes | - | - | - | - |
| Reading Settings | `settings.update_reading` | Yes | - | - | - | - |
| Writing Settings | `settings.update_writing` | Yes | - | - | - | - |
| Discussion Settings | `settings.update_discussion` | Yes | - | - | - | - |
| Permalink Settings | `settings.update_permalinks` | Yes | - | - | - | - |
| Privacy Settings | `settings.update_privacy` | Yes | - | - | - | - |
| Email Settings | `settings.update_email` | Yes | - | - | - | - |
| Export Settings | `settings.export` | Yes | - | - | - | - |
| Import Settings | `settings.import` | Yes | - | - | - | - |
| **Email Notifications (4)** | | | | | | |
| Send Email | `email.send` | Yes | - | - | - | - |
| Queue Email | `email.queue` | Yes | - | - | - | - |
| Retry Failed Email | `email.retry` | Yes | - | - | - | - |
| Update Template | `email.update_template` | Yes | - | - | - | - |
| **Site Notifications (5)** | | | | | | |
| Send Notification | `notification.send` | Yes | - | - | - | - |
| Mark Read | `notification.mark_read` | Yes | Yes | Yes | Yes | Yes |
| Mark All Read | `notification.mark_all_read` | Yes | Yes | Yes | Yes | Yes |
| Delete Notification | `notification.delete` | Yes | Yes | Yes | Yes | Yes |
| Update Preferences | `notification.update_preferences` | Yes | Yes | Yes | Yes | Yes |
| **Audit Log (3)** | | | | | | |
| View Audit Log | `audit.view` | Yes | - | - | - | - |
| Export Audit Log | `audit.export` | Yes | - | - | - | - |
| Clear Old Entries | `audit.clear` | Yes | - | - | - | - |
| **API System (6)** | | | | | | |
| Create API Key | `api.create_key` | Yes | - | - | - | - |
| Revoke API Key | `api.revoke_key` | Yes | - | - | - | - |
| Create Webhook | `api.create_webhook` | Yes | - | - | - | - |
| Update Webhook | `api.update_webhook` | Yes | - | - | - | - |
| Delete Webhook | `api.delete_webhook` | Yes | - | - | - | - |
| Test Webhook | `api.test_webhook` | Yes | - | - | - | - |
| **Event Dispatcher (3)** | | | | | | |
| Emit Event | `event.emit` | Yes | - | - | - | - |
| Register Listener | `event.register_listener` | Yes | - | - | - | - |
| Remove Listener | `event.remove_listener` | Yes | - | - | - | - |
| **Routing (3)** | | | | | | |
| Create Redirect | `routing.create_redirect` | Yes | - | - | - | - |
| Update Redirect | `routing.update_redirect` | Yes | - | - | - | - |
| Delete Redirect | `routing.delete_redirect` | Yes | - | - | - | - |

`*` = Own content only (meta capability applies)

### Capability Counts by Role

| Role | Total | Type | Level | Page Access |
|------|-------|------|-------|-------------|
| Administrator | 137 | Internal | 100 | 49 routes |
| Editor | 77 | Internal | 80 | 17 routes |
| Author | 49 | Customer | 60 | 7 routes |
| Contributor | 35 | Customer | 40 | 5 routes |
| Subscriber | 22 | Customer | 20 | 1 route |

### Ownership Check Matrix

| Resource Action | Admin | Editor | Author | Contributor | Subscriber |
|----------------|-------|--------|--------|-------------|-----------|
| Edit own post | Yes | Yes | Yes | Yes (drafts) | No |
| Edit others' posts | Yes | Yes | No | No | No |
| Delete own post | Yes | Yes | Yes (trash) | No | No |
| Delete others' posts | Yes | Yes | No | No | No |
| Publish own post | Yes | Yes | Yes | No | No |
| Edit own media | Yes | Yes | Yes | No | No |
| Edit others' media | Yes | Yes | No | No | No |
| Delete own media | Yes | Yes | No | No | No |
| Delete others' media | Yes | Yes | No | No | No |
| Moderate any comment | Yes | Yes | No | No | No |
| Edit own profile | Yes | Yes | Yes | Yes | Yes |
| Edit others' profile | Yes | No | No | No | No |

---

## Dependencies

### Depends On

| System | Type | What Is Needed |
|--------|------|---------------|
| **Auth System** (`recNGEVtMvLjp6o8h`) | **Hard** | auth identity via `ctx.auth.getUserIdentity()` to resolve the current user. Without auth, no permission checks can occur. The `getCurrentUser()` helper depends entirely on the Auth System providing a valid Convex Auth subject ID. |

### Depended On By

| System | Type | What They Need |
|--------|------|---------------|
| **Post System** | **Hard** | Every post mutation calls `requireCan("post.*")`. Post queries use `getCurrentRoleLevel()` to determine if user sees all posts or only their own. |
| **Page System** | **Hard** | Page mutations call `requireCan("page.*")`. Only Editor+ roles can manage pages. |
| **Settings System** | **Hard** | All 9 settings mutations call `requireCan("settings.*")`. Admin-only. |
| **API System** | **Hard** | API key/webhook mutations call `requireCan("api.*")`. Admin-only. |
| **Media System** | **Hard** | Media mutations call `requireCan("media.*")`. Upload restricted to Author+. Meta caps for ownership. |
| **Comment System** | **Hard** | Comment mutations call `requireCan("comment.*")`. Moderation restricted to Editor+. |
| **Taxonomy System** | **Hard** | Taxonomy mutations call `requireCan("taxonomy.*")`. Category management restricted to Editor+. |
| **Dashboard System** | **Hard** | Dashboard checks `requireCan("dashboard.*")`. Subscriber has no dashboard access. |
| **User Profile System** | **Hard** | Profile mutations check role levels. Admin-only for deactivate/delete. |
| **SEO System** | **Hard** | SEO mutations call `requireCan("seo.*")`. Global SEO is admin-only. |
| **Audit Log System** | **Hard** | Audit mutations call `requireCan("audit.*")`. View/export/clear are admin-only. |
| **Menu System** | **Hard** | Menu mutations call `requireCan("menu.*")`. All menu management is admin-only. |
| **Revision System** | **Hard** | Revision access checks `requireCan("revision.*")`. Restore is Editor+. |
| **Custom Field System** | **Hard** | Field mutations call `requireCan("custom_field.*")`. Group management is admin-only. |
| **Content Editor System** | **Hard** | Editor actions check capabilities. Reusable blocks are Editor+. |
| **Registration System** | **Soft** | Assigns the default role (Subscriber) on user creation via `getDefaultRole()` query. |
| **Email Notification System** | **Soft** | Listens for `role.assigned` event to send role change emails. |
| **Site Notification System** | **Soft** | Listens for `role.assigned` event to create persistent notifications. |
| **Event Dispatcher System** | **Soft** | Processes all role events (`role.created`, `role.updated`, etc.). |
| **Search System** | **Soft** | `search.reindex` is admin-only. `search.query` is available to all authenticated users. |
| **Routing System** | **Soft** | Redirect management (`routing.*`) is admin-only. |

**Summary:** This system is a dependency of **21 out of 28 total systems**. It is the second most critical system after Auth (which it depends on).

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/)

- [ ] `convex/schema.ts` - Add `roles` and `roleChanges` table definitions (2 tables)
- [ ] `convex/roles.ts` - All 6 mutations (create, update, delete, assign, grant, revoke) + 5 queries (listRoles, getRole, getRoleBySlug, getDefaultRole, getRoleChanges)
- [ ] `convex/helpers/permissions.ts` - Core permission helpers: `currentUserCan`, `requireCan`, `userCan`, `requireCanOnResource`, `mapMetaCap`, `getCurrentUser`, `getCurrentRoleLevel`, `getCurrentUserId`
- [ ] `convex/types/capabilities.ts` - TypeScript string literal union type for all 137 capabilities
- [ ] `convex/seed/roles.ts` - Built-in role seed data constants: `ADMIN_CAPABILITIES`, `EDITOR_CAPABILITIES`, `AUTHOR_CAPABILITIES`, `CONTRIBUTOR_CAPABILITIES`, `SUBSCRIBER_CAPABILITIES`, and corresponding `*_PAGE_ACCESS` arrays
- [ ] `convex/init.ts` - `seedRoles` internal mutation for first deployment (idempotent)

### Admin Frontend (ConvexPress-Admin/apps/web/)

- [ ] `src/lib/auth-context.tsx` - `AuthProvider` with `can()` and `canAccessRoute()` context
- [ ] `src/hooks/useCan.ts` - `useCan()` hook (overloaded: returns function or boolean)
- [ ] `src/routes/_admin.tsx` - Root admin layout with auth + role guard in `beforeLoad`
- [ ] `src/routes/_admin/roles/index.tsx` - Roles & Capabilities list page
- [ ] `src/routes/_admin/roles/$roleId/edit.tsx` - Edit Role page with capability toggles
- [ ] `src/routes/_admin/users/index.tsx` - Users list with role column and role filter
- [ ] `src/routes/_admin/users/new.tsx` - Add New User with role selector
- [ ] `src/routes/_admin/users/$userId/edit.tsx` - Edit User with role changer
- [ ] `src/components/roles/role-list.tsx` - Role list table component
- [ ] `src/components/roles/capability-editor.tsx` - Grouped capability toggle component
- [ ] `src/components/roles/role-selector.tsx` - Role dropdown for user forms
- [ ] `src/components/layout/nav-guard.tsx` - Navigation item visibility based on `canAccessRoute()`

### Website Frontend (ConvexPress-Website/apps/web/)

- [ ] `src/lib/auth.ts` - Client-side auth utilities using Convex queries
- [ ] `src/hooks/useCan.ts` - Same `useCan()` hook for website-side capability checks

---

## Edge Cases & Gotchas

1. **Last Administrator Protection**: The system MUST prevent removing the Administrator role from the last remaining admin user. The `role.assign` mutation must count admin users before allowing a role change away from `admin`. This check must happen atomically within the Convex mutation (race condition safe because Convex mutations are serialized).

2. **Self-Role-Change Prevention**: Users CANNOT change their own role. The `role.assign` mutation must compare `args.userId` against the current user's ID and throw if they match. This prevents an admin from accidentally locking themselves out.

3. **Protected Role Deletion**: Built-in roles (where `isProtected === true`) cannot be deleted. The `role.delete` mutation must check this flag. However, built-in roles CAN have their capabilities modified -- the `isProtected` flag only prevents deletion, not capability changes.

4. **Only One Default Role**: The `isDefault` flag must be unique across all roles. If a new role is set as default, the previous default must be unset. The `seedRoles` function sets only Subscriber as default.

5. **Custom Role Level Conflicts**: Custom roles can theoretically be created with the same level as a built-in role. The system should either prevent this or document that level ties are resolved by role name alphabetically. The PRD's open question suggests this needs a decision.

6. **Inactive Role Handling**: If a role's status is set to `inactive`, all users assigned to that role effectively lose all permissions. The `currentUserCan()` helper returns `false` for inactive roles. The admin should be warned before deactivating a role with assigned users.

7. **Capability Validation**: The `role.grant_capability` mutation validates capability strings against a known set. The `isValidCapability()` function must maintain a complete list of all 137 valid capability codes. Invalid strings must be rejected with a clear error message.

8. **Meta Capability Resource Resolution**: `mapMetaCap()` must handle cases where the resource ID doesn't exist (post deleted, etc.). It should return `{ allowed: false, reason: "Post not found" }` rather than throwing an uncaught error.

9. **Convex Caching Behavior**: Within a single Convex function execution, `ctx.db.get()` calls are cached. Multiple `currentUserCan()` calls in the same mutation do NOT result in multiple database reads for the user and role documents. However, across different function calls, Convex's automatic query caching handles this.

10. **Route Guard vs Backend Check Consistency**: Route guards (`beforeLoad`) use `pageAccess[]` while backend mutations use `capabilities[]`. These are separate arrays. It's possible for a user to access a route but not have the capability to perform the action on that route. Both checks must be maintained independently.

11. **Convex Auth Webhook Race Condition**: When a new user signs up via Convex Auth, the webhook handler creates the user in Convex and assigns the default role. If the webhook fires before the `roles` seed data exists, the user creation will fail because there's no default role to assign. The `seedRoles` function must run before any users can be created.

12. **Page Access Wildcard Matching**: The `canAccessRoute()` function uses prefix matching: `path.startsWith(allowed + "/")`. This means granting access to `/admin/posts` implicitly grants access to `/admin/posts/new`, `/admin/posts/$postId/edit`, etc. This is intentional but must be documented.

13. **Capability String Format**: All capabilities follow the `{domain}.{action}` format (e.g., `post.create`, `media.upload`). Meta capabilities follow the `{domain}.{meta_action}` format (e.g., `post.edit`, `media.delete_one`). The distinction between primitive and meta capabilities is enforced by the `META_CAPABILITIES` set, not by naming convention alone.

14. **Type Safety for Capabilities**: The `Capability` TypeScript union type should be used as the parameter type for `requireCan()` and `currentUserCan()` to catch typos at compile time. However, since capabilities are stored as `v.array(v.string())` in Convex (not typed literals), runtime validation is also needed via `isValidCapability()`.

15. **Role Deletion with Users**: A role with assigned users cannot be deleted. The admin must reassign all users to another role first. The `role.delete` mutation checks for this by querying the `users` table via the `by_roleId` index. If even one user is found, the deletion is rejected.

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `current_user_can($cap)` | `currentUserCan(ctx, capability)` | Async, returns Promise<boolean>. Non-throwing. |
| `user_can($user, $cap)` | `userCan(ctx, userId, capability)` | Checks a specific user, not the current user. |
| `map_meta_cap($cap, $user, ...$args)` | `mapMetaCap(ctx, capability, userId, resourceId)` | Returns `MetaCapResult` with required caps and min level. |
| `get_role($role)` / `WP_Roles::get_role()` | `ctx.db.query("roles").withIndex("by_slug", ...)` | Direct Convex query by slug. |
| `wp_roles()->add_role($slug, $name, $caps)` | `createRole` mutation | Convex mutation with full validation. |
| `wp_roles()->remove_role($slug)` | `deleteRole` mutation | Protected roles cannot be deleted. |
| `$user->set_role($role)` | `assignRole` mutation | Emits `role.assigned` event. Records change in `roleChanges`. |
| `$role->add_cap($cap)` | `grantCapability` mutation | Emits `role.capability_granted` event. |
| `$role->remove_cap($cap)` | `revokeCapability` mutation | No event emitted (per PRD). |
| `set_user_role` hook | `role.assigned` event | Triggers email, site notification, and audit log. |
| `get_users(['role' => 'editor'])` | `ctx.db.query("users").withIndex("by_roleId", ...)` | Convex index query. |
| `get_editable_roles()` | `listRoles` query | Returns all active roles with user counts. |
| `wp_dropdown_roles()` | `<RoleSelector />` component | Base UI dropdown, not `<select>`. |
| `is_admin()` | `getCurrentRoleLevel(ctx) >= 100` | Check if current user is Administrator. |
| `is_super_admin()` | N/A | ConvexPress is single-site, no super admin concept. |

### Client-Side Equivalents

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `<?php if (current_user_can('edit_posts')): ?>` | `{can("post.update") && <EditButton />}` | React conditional rendering via `useCan()` hook. |
| `wp_nav_menu_items` filter | `<NavGuard path="/admin/posts">` | Component wrapping nav items for visibility control. |
| `admin_menu` action (add/remove items) | `canAccessRoute("/admin/posts")` | Dynamically filters sidebar items. |

### Auth Context Provider Pattern

```typescript
// ConvexPress-Admin/src/lib/auth-context.tsx
interface AuthContext {
  user: Doc<"users"> | null;
  role: Doc<"roles"> | null;
  can: (capability: string) => boolean;
  canAccessRoute: (path: string) => boolean;
}
```

### useCan Hook Pattern

```typescript
// Overloaded: returns function or boolean
function useCan(): (capability: string) => boolean;
function useCan(capability: string): boolean;
```

### Route Guard Pattern

```typescript
// TanStack Router beforeLoad guard
export const Route = createFileRoute("/_admin/roles/")({
  beforeLoad: async ({ context }) => {
    const { role } = context.auth;
    if (!role.pageAccess.includes("/admin/roles")) {
      throw redirect({ to: "/admin", search: { error: "insufficient_permissions" } });
    }
  },
});
```

---

## Seeding & Initialization

The 5 built-in roles must be seeded on first deployment via an idempotent `seedRoles` internal mutation. The seed data includes:

| Role | Slug | Level | Type | Default | Protected | Capabilities | Page Access |
|------|------|-------|------|---------|-----------|-------------|-------------|
| Administrator | `admin` | 100 | internal | No | Yes | 137 | 49 routes |
| Editor | `editor` | 80 | internal | No | Yes | 77 | 17 routes |
| Author | `author` | 60 | customer | No | Yes | 49 | 7 routes |
| Contributor | `contributor` | 40 | customer | No | Yes | 35 | 5 routes |
| Subscriber | `subscriber` | 20 | customer | Yes | Yes | 22 | 1 route |

The seed function checks `if (existingRoles.length > 0) return;` to be idempotent. Capability arrays and page access arrays are defined as constants in `convex/seed/roles.ts`.

---

## Type Definitions

### Capability Type

```typescript
// convex/types/capabilities.ts
export type Capability =
  // Posts (13)
  | "post.create" | "post.read" | "post.update" | "post.delete"
  | "post.publish" | "post.unpublish" | "post.schedule" | "post.trash"
  | "post.restore" | "post.duplicate" | "post.bulk_delete" | "post.bulk_publish"
  | "post.preview"
  // Pages (7)
  | "page.create" | "page.read" | "page.update" | "page.delete"
  | "page.publish" | "page.reorder" | "page.set_parent"
  // Media (6)
  | "media.read" | "media.upload" | "media.update" | "media.delete"
  | "media.crop" | "media.bulk_delete"
  // Taxonomy (9)
  | "taxonomy.create_category" | "taxonomy.update_category" | "taxonomy.delete_category"
  | "taxonomy.create_tag" | "taxonomy.update_tag" | "taxonomy.delete_tag"
  | "taxonomy.assign" | "taxonomy.unassign" | "taxonomy.merge"
  // Comments (13)
  | "comment.create" | "comment.read" | "comment.update" | "comment.delete"
  | "comment.reply" | "comment.approve" | "comment.reject" | "comment.spam"
  | "comment.flag" | "comment.like" | "comment.bulk_approve" | "comment.bulk_delete"
  | "comment.bulk_spam"
  // Roles (6)
  | "role.create" | "role.update" | "role.delete" | "role.assign"
  | "role.grant_capability" | "role.revoke_capability"
  // Profile (6)
  | "profile.view" | "profile.update" | "profile.upload_avatar"
  | "profile.deactivate" | "profile.delete_user" | "profile.bulk_delete"
  // Auth (5)
  | "auth.login" | "auth.logout" | "auth.oauth_login"
  | "auth.refresh_session" | "auth.verify_email"
  // Password (3)
  | "password.change" | "password.reset" | "password.request_reset"
  // Registration (3)
  | "registration.register" | "registration.invite" | "registration.resend_verification"
  // Dashboard (4)
  | "dashboard.view" | "dashboard.quick_draft"
  | "dashboard.dismiss_widget" | "dashboard.reorder_widgets"
  // Editor (6)
  | "editor.add_block" | "editor.remove_block" | "editor.reorder_blocks"
  | "editor.save_draft" | "editor.save_reusable" | "editor.autosave"
  // Custom Fields (5)
  | "custom_field.create_group" | "custom_field.update_group" | "custom_field.delete_group"
  | "custom_field.set_value" | "custom_field.read_value"
  // Revisions (4)
  | "revision.view" | "revision.compare" | "revision.restore" | "revision.delete"
  // SEO (4)
  | "seo.update_post" | "seo.update_global" | "seo.update_robots" | "seo.generate_sitemap"
  // Search (2)
  | "search.query" | "search.reindex"
  // Menu (8)
  | "menu.create" | "menu.update" | "menu.delete"
  | "menu.add_item" | "menu.update_item" | "menu.delete_item"
  | "menu.reorder" | "menu.assign_location"
  // Settings (9)
  | "settings.update_general" | "settings.update_reading" | "settings.update_writing"
  | "settings.update_discussion" | "settings.update_permalinks" | "settings.update_privacy"
  | "settings.update_email" | "settings.export" | "settings.import"
  // Email (4)
  | "email.send" | "email.queue" | "email.retry" | "email.update_template"
  // Notifications (5)
  | "notification.send" | "notification.mark_read" | "notification.mark_all_read"
  | "notification.delete" | "notification.update_preferences"
  // Audit (3)
  | "audit.view" | "audit.export" | "audit.clear"
  // API (6)
  | "api.create_key" | "api.revoke_key"
  | "api.create_webhook" | "api.update_webhook" | "api.delete_webhook" | "api.test_webhook"
  // Events (3)
  | "event.emit" | "event.register_listener" | "event.remove_listener"
  // Routing (3)
  | "routing.create_redirect" | "routing.update_redirect" | "routing.delete_redirect"
  ;

// Meta capabilities (not stored on roles, resolved at runtime)
export type MetaCapability =
  | "post.edit" | "post.delete_one" | "post.publish_one"
  | "page.edit" | "media.edit" | "media.delete_one"
  | "comment.edit" | "comment.delete_one"
  | "seo.edit_post" | "custom_field.edit_value"
  ;
```

### Error Shape

```typescript
// All permission denial errors follow this shape
interface PermissionError {
  code: "UNAUTHORIZED" | "FORBIDDEN";
  message: string;
  capability?: string;  // The capability that was checked (if FORBIDDEN)
  role?: string;        // The user's current role slug (if FORBIDDEN)
}
```

### Client-Side Error Handling

```typescript
try {
  await publishPost({ postId });
} catch (error) {
  if (error.data?.code === "FORBIDDEN") {
    toast.error(`You don't have permission. Required: ${error.data.capability}`);
  }
}
```
