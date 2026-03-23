# PRD: Role & Permission System

> **System Code:** PLT-ROL
> **Phase:** 1 of 6
> **Priority:** P0 - Critical
> **Complexity:** Medium

---

## 1. Overview

### 1.1 Purpose

The Role & Permission System provides role-based access control (RBAC) for the shopping cart platform. It defines what each user type can access and do across all routes and actions in both the customer-facing storefront and admin dashboard. The system enables granular permission management, allowing administrators to create roles, assign capabilities, and control access at both route and action levels.

### 1.2 Scope

**In Scope:**
- Role definitions with hierarchy (levels)
- Route-level permissions (who can access what pages)
- Action-level permissions (who can perform what operations)
- Permission middleware for route protection
- Admin interface for role management
- Assign/change roles for users
- Permission inheritance based on role level
- Integration with Event System for audit trails

**Out of Scope:**
- Custom per-user permissions (only role-based)
- Permission expiration/time-limited access
- Dynamic permissions based on ownership (handled per-system)
- Team/organization permissions (future enhancement)

### 1.3 Design Philosophy

**Modeled after WordPress roles/capabilities system with enhancements:**

1. **Roles as containers** - Each role has a level and a set of capabilities
2. **Capabilities are atomic** - Each action is a capability that can be granted
3. **Route permissions** - Pages can require specific roles for access
4. **Additive model** - Higher levels inherit lower level permissions
5. **Airtable as source of truth** - Role and route definitions sync from Airtable

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Authentication System | PLT-AUT | 0 | Need user identity to assign/check roles |
| Event System | PLT-EVT | 0 | Emit events when roles change |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Admin Dashboard | ADM-DSH | 6 | Admin route protection |
| Testing & Debug Tools | ADM-TST | 6 | Role-based feature access |
| Airtable Sync System | PLT-SYN | 2 | Sync role/route definitions |
| Customer Accounts | USR-ACT | 1 | Display role in account |
| All Admin Routes | Various | 1-6 | Route-level access control |

### 2.3 Integration Hooks to Implement

| Hook | Purpose | Used By |
|------|---------|---------|
| `checkRouteAccess(userId, routePath)` | Verify user can access route | All protected routes |
| `checkPermission(userId, actionCode)` | Verify user can perform action | All protected mutations |
| `getUserRole(userId)` | Get user's current role | Account display, admin views |
| `getRoleCapabilities(roleId)` | List all capabilities for role | Admin role editor |
| `hasCapability(userId, capability)` | Check specific capability | Action guards |

---

## 3. Role Definitions

> Source: Airtable Roles table

### 3.1 Role Hierarchy

| Role | Level | Type | Default | Description |
|------|-------|------|---------|-------------|
| **Guest** | 0 | Customer | - | Unauthenticated visitor. Can browse, add to cart, checkout as guest. |
| **Customer** | 10 | Customer | Yes | Registered user. Full account features, order history, reviews. |
| **Staff** | 50 | Internal | - | Store staff. Process orders, handle support, view customers. No admin settings. |
| **Manager** | 80 | Internal | - | Store manager. Full commerce access, staff management. No system settings. |
| **Admin** | 100 | Internal | - | Full administrative access. All features including system settings and roles. |
| **System** | 999 | System | - | Automated operations. Used for webhooks, scheduled tasks, audit trails. |

### 3.2 Inheritance Model

Higher level roles inherit all capabilities of lower levels within the same type:

```
Customer Type:
  Guest (0) → Customer (10)

Internal Type:
  Staff (50) → Manager (80) → Admin (100)
```

**Note:** Customer-type roles do NOT inherit internal capabilities. A Manager does not automatically get Customer capabilities - those must be explicitly granted if needed.

### 3.3 Role Capabilities Summary

| Role | Route Access | Actions | Notes |
|------|--------------|---------|-------|
| Guest | 15 routes | 23 actions | Public pages, basic cart/checkout |
| Customer | 20 routes | 43 actions | + Account pages, wishlists, reviews |
| Staff | 10 routes | 22 actions | Admin orders, customers, support |
| Manager | 17 routes | 50 actions | + Products, inventory, reports |
| Admin | 26 routes | 65 actions | + Settings, roles, integrations |
| System | 0 routes | 11 actions | Backend operations only |

---

## 4. Routes

> Source: Airtable Routes table

### 4.1 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Roles & Permissions | `/admin/settings/roles` | _admin | Yes | Admin |

### 4.2 Route Permission Model

Each route in the system has associated roles that can access it. The middleware checks:

1. Is authentication required?
2. If yes, is user authenticated?
3. If yes, does user's role have access to this route?

```typescript
// Route permission check flow
async function canAccessRoute(userId: string | null, routePath: string): Promise<boolean> {
  const route = await getRouteByPath(routePath);

  // Public routes
  if (!route.authRequired) return true;

  // Auth required but no user
  if (!userId) return false;

  // Check role access
  const userRole = await getUserRole(userId);
  return route.allowedRoles.includes(userRole.id);
}
```

---

## 5. Data Model

### 5.1 Tables

```typescript
// admin-app/packages/backend/convex/schema.ts

// Roles table - synced from Airtable
roles: defineTable({
  name: v.string(),                    // "Admin", "Customer", etc.
  description: v.optional(v.string()), // Human-readable description
  level: v.number(),                   // 0-999, used for hierarchy
  type: v.union(                       // Role category
    v.literal("customer"),
    v.literal("internal"),
    v.literal("system")
  ),
  isDefault: v.boolean(),              // True for Customer role
  status: v.union(
    v.literal("active"),
    v.literal("inactive")
  ),
  capabilities: v.array(v.string()),   // Action codes this role can perform
  pageAccess: v.array(v.string()),     // Route paths this role can access

  // Airtable sync metadata
  airtableId: v.optional(v.string()),
  syncedAt: v.optional(v.number()),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_name", ["name"])
  .index("by_level", ["level"])
  .index("by_type", ["type"])
  .index("by_airtable_id", ["airtableId"]),

// User roles assignment (extends users table)
// Note: Added to users table, not separate table
users: defineTable({
  // ... existing user fields from Auth System ...

  // Role assignment
  roleId: v.id("roles"),               // Reference to roles table
  roleAssignedAt: v.number(),          // When role was assigned
  roleAssignedBy: v.optional(v.id("users")), // Who assigned it (null for default)

  // Previous role tracking for audit
  previousRoleId: v.optional(v.id("roles")),
  previousRoleChangedAt: v.optional(v.number()),
})
  .index("by_role", ["roleId"]),

// Route permissions - synced from Airtable
routePermissions: defineTable({
  name: v.string(),                    // Route display name
  path: v.string(),                    // Route path pattern
  app: v.union(                        // Which app this route belongs to
    v.literal("website"),
    v.literal("admin")
  ),
  layout: v.optional(v.string()),      // Layout template
  authRequired: v.boolean(),           // Requires authentication
  allowedRoles: v.array(v.id("roles")), // Roles that can access
  status: v.union(
    v.literal("active"),
    v.literal("planned"),
    v.literal("deprecated")
  ),

  // Airtable sync metadata
  airtableId: v.optional(v.string()),
  syncedAt: v.optional(v.number()),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_path", ["path"])
  .index("by_app", ["app"])
  .index("by_airtable_id", ["airtableId"]),

// Role change audit log
roleChangeLog: defineTable({
  userId: v.id("users"),               // User whose role changed
  oldRoleId: v.optional(v.id("roles")), // Previous role (null for new users)
  newRoleId: v.id("roles"),            // New role
  changedBy: v.id("users"),            // Admin who made change
  reason: v.optional(v.string()),      // Optional reason for change
  createdAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_changed_by", ["changedBy"])
  .index("by_date", ["createdAt"]),
```

### 5.2 Relationships

```
roles
  ↓ (one-to-many)
users.roleId
  ↓ (one-to-many)
roleChangeLog.userId

routePermissions.allowedRoles → roles
```

### 5.3 Forward-Looking Fields

| Field | Future System | Purpose |
|-------|---------------|---------|
| `roles.capabilities` | All Systems | Each system adds its action codes here |
| `routePermissions` | All Routes | Every new route gets permission entry |
| `roleChangeLog` | Analytics | Role change patterns, compliance reports |

---

## 6. Actions

> Source: Airtable Actions table

### 6.1 Admin Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| List Roles | `role.list` | View all roles and their permissions | Admin |
| Create Role | `role.create` | Create a new role with permissions | Admin |
| Update Role Permissions | `role.update_permissions` | Modify permissions for a role | Admin |
| Assign Role to User | `role.assign` | Assign a role to a user | Admin |

### 6.2 Internal Actions (System Use)

| Action | Code | Description | Used By |
|--------|------|-------------|---------|
| Check Route Access | `permission.check_route` | Verify route access | Middleware |
| Check Action Permission | `permission.check_action` | Verify action permission | Mutations |
| Get User Role | `permission.get_user_role` | Retrieve user's role | Various |

---

## 7. Events

> Source: Airtable Events table

### 7.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| User Role Changed | `admin.user_role_changed` | When admin changes a user's role | `{ adminId: Id, userId: Id, oldRole: string, newRole: string, reason?: string }` |

### 7.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| `auth.user_registered` | Authentication | Assign default Customer role |

---

## 8. Notifications

### 8.1 Email Notifications

> Source: Airtable Email Notifications table

| Name | Trigger Event | Recipient | Template Variables |
|------|---------------|-----------|-------------------|
| Role Changed | `admin.user_role_changed` | Customer | `{{customer_name}}, {{old_role}}, {{new_role}}` |

**Email Template: Role Changed**

| Field | Value |
|-------|-------|
| Subject | Your Account Permissions Have Changed |
| Provider | Resend |
| Priority | Immediate |

```html
<!-- email template -->
Hi {{customer_name}},

Your account permissions have been updated.

Previous role: {{old_role}}
New role: {{new_role}}

If you have any questions about this change, please contact our support team.

Best regards,
The Store Team
```

### 8.2 Site Notifications

| Name | Trigger Event | Recipient | Message |
|------|---------------|-----------|---------|
| Role Updated | `admin.user_role_changed` | Target User | "Your account role has been updated to {{new_role}}" |

---

## 9. User Interface

### 9.1 Components Needed

**Admin App:**

- [ ] `RoleList` - Display all roles with stats
- [ ] `RoleCard` - Individual role summary card
- [ ] `RoleEditor` - Edit role name, description, level
- [ ] `CapabilitySelector` - Multi-select for capabilities
- [ ] `RouteAccessSelector` - Multi-select for route access
- [ ] `UserRoleAssigner` - Dialog to change user's role
- [ ] `RoleChangeHistory` - Audit log viewer
- [ ] `RoleBadge` - Display role badge on user cards

**Website App:**

- [ ] `RoleBadge` - Display user's role (staff indicator, etc.)

### 9.2 Admin UI: Roles & Permissions Page

```
/admin/settings/roles

┌─────────────────────────────────────────────────────────────┐
│  Roles & Permissions                          [+ New Role]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  👤 Guest                                   Level: 0 │   │
│  │  Unauthenticated visitor                            │   │
│  │  15 routes • 23 actions              [Disabled]     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  👤 Customer                    Level: 10 [Default] │   │
│  │  Registered user                                    │   │
│  │  20 routes • 43 actions                    [Edit]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  👔 Staff                              Level: 50    │   │
│  │  Store staff                                        │   │
│  │  10 routes • 22 actions                    [Edit]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  👔 Manager                            Level: 80    │   │
│  │  Store manager                                      │   │
│  │  17 routes • 50 actions                    [Edit]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ⚙️ Admin                              Level: 100   │   │
│  │  Full administrative access                         │   │
│  │  26 routes • 65 actions                    [Edit]   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 Role Editor Modal

```
┌─────────────────────────────────────────────────────────────┐
│  Edit Role: Manager                               [X Close] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Name: [Manager_______________]                             │
│                                                             │
│  Description:                                               │
│  [Full commerce access, staff management. No system...   ]  │
│                                                             │
│  Level: [80_]  Type: [Internal ▼]                          │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ROUTE ACCESS                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ [✓] Admin Dashboard         /admin                  │   │
│  │ [✓] Orders List             /admin/orders           │   │
│  │ [✓] Order Detail            /admin/orders/:id       │   │
│  │ [✓] Products List           /admin/products         │   │
│  │ [✓] Product Editor          /admin/products/:id     │   │
│  │ [✓] Inventory               /admin/inventory        │   │
│  │ [ ] Settings                /admin/settings/*       │   │
│  │ ...                                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  CAPABILITIES (Actions)                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Order Management                                    │   │
│  │ [✓] order.view    [✓] order.update_status           │   │
│  │ [✓] order.cancel  [✓] order.refund                  │   │
│  │                                                     │   │
│  │ Product Management                                  │   │
│  │ [✓] product.list  [✓] product.create                │   │
│  │ [✓] product.edit  [✓] product.delete                │   │
│  │ ...                                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                               [Cancel]  [Save Changes]      │
└─────────────────────────────────────────────────────────────┘
```

### 9.4 States

| State | Description | UI Behavior |
|-------|-------------|-------------|
| Loading | Fetching roles | Skeleton cards |
| Empty | No custom roles | Show defaults only |
| Success | Changes saved | Toast notification |
| Error | Save failed | Error message, retry option |
| Syncing | Airtable sync in progress | Spinner, disabled editing |

---

## 10. Business Rules

### 10.1 Validation Rules

| Rule | Description |
|------|-------------|
| Unique role names | No two roles can have the same name |
| Level range | Role level must be 0-999 |
| Default role required | Exactly one role must be marked as default |
| Cannot delete default | The default role cannot be deleted |
| Cannot delete if assigned | Roles with assigned users cannot be deleted |

### 10.2 Business Logic

**Role Assignment:**
1. New users automatically receive the default role (Customer)
2. Only Admin role can change user roles
3. Role changes emit `admin.user_role_changed` event
4. Previous role is stored for audit purposes

**Permission Inheritance:**
1. Roles do NOT automatically inherit from lower levels
2. All permissions must be explicitly granted
3. Level is for display ordering and reference, not inheritance

**Sync from Airtable:**
1. Airtable is the source of truth for role definitions
2. Local changes can be made but may be overwritten on sync
3. Route permissions are fully managed via Airtable
4. Capability assignments can be adjusted locally

### 10.3 Edge Cases

| Case | Handling |
|------|----------|
| User's role deleted | Reassign to default role |
| Route permission removed | Return 403 forbidden |
| Admin removes their own admin role | Prevent (last admin protection) |
| Duplicate role in Airtable sync | Merge by airtableId, update existing |
| User with no role | Treat as Guest |

---

## 11. API Design

### 11.1 Queries (Read Operations)

```typescript
// List all roles
export const listRoles = query({
  args: {},
  handler: async (ctx) => {
    await checkPermission(ctx, "role.list");

    return await ctx.db
      .query("roles")
      .withIndex("by_level")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});

// Get single role with full details
export const getRole = query({
  args: { roleId: v.id("roles") },
  handler: async (ctx, args) => {
    await checkPermission(ctx, "role.list");

    const role = await ctx.db.get(args.roleId);
    if (!role) throw new Error("Role not found");

    // Get user count for this role
    const users = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("roleId", args.roleId))
      .collect();

    return {
      ...role,
      userCount: users.length,
    };
  },
});

// Get user's role
export const getUserRole = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    // If no userId, get current user
    const userId = args.userId ?? await getCurrentUserId(ctx);
    if (!userId) {
      // Return guest role for unauthenticated
      return await ctx.db
        .query("roles")
        .withIndex("by_name", (q) => q.eq("name", "Guest"))
        .unique();
    }

    const user = await ctx.db.get(userId);
    if (!user || !user.roleId) {
      // Return default role
      return await ctx.db
        .query("roles")
        .filter((q) => q.eq(q.field("isDefault"), true))
        .unique();
    }

    return await ctx.db.get(user.roleId);
  },
});

// Check if user can access route
export const canAccessRoute = query({
  args: {
    path: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const route = await ctx.db
      .query("routePermissions")
      .withIndex("by_path", (q) => q.eq("path", args.path))
      .unique();

    if (!route) return true; // Route not found, allow (fail open)
    if (!route.authRequired) return true;

    if (!args.userId) return false; // Auth required but no user

    const userRole = await getUserRole(ctx, { userId: args.userId });
    return route.allowedRoles.includes(userRole._id);
  },
});

// Check if user has capability
export const hasCapability = query({
  args: {
    actionCode: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const userRole = await getUserRole(ctx, { userId: args.userId });
    return userRole.capabilities.includes(args.actionCode);
  },
});

// Get role change history for user
export const getRoleChangeHistory = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await checkPermission(ctx, "role.list");

    const logs = await ctx.db
      .query("roleChangeLog")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(50);

    // Hydrate role names
    return Promise.all(logs.map(async (log) => ({
      ...log,
      oldRole: log.oldRoleId ? await ctx.db.get(log.oldRoleId) : null,
      newRole: await ctx.db.get(log.newRoleId),
      changedByUser: await ctx.db.get(log.changedBy),
    })));
  },
});
```

### 11.2 Mutations (Write Operations)

```typescript
// Create new role
export const createRole = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    level: v.number(),
    type: v.union(v.literal("customer"), v.literal("internal"), v.literal("system")),
    capabilities: v.array(v.string()),
    pageAccess: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await checkPermission(ctx, "role.create");

    // Validate unique name
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    if (existing) throw new Error("Role name already exists");

    // Validate level range
    if (args.level < 0 || args.level > 999) {
      throw new Error("Level must be between 0 and 999");
    }

    const now = Date.now();
    return await ctx.db.insert("roles", {
      ...args,
      isDefault: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});

// Update role permissions
export const updateRolePermissions = mutation({
  args: {
    roleId: v.id("roles"),
    capabilities: v.optional(v.array(v.string())),
    pageAccess: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await checkPermission(ctx, "role.update_permissions");

    const role = await ctx.db.get(args.roleId);
    if (!role) throw new Error("Role not found");

    await ctx.db.patch(args.roleId, {
      ...(args.capabilities && { capabilities: args.capabilities }),
      ...(args.pageAccess && { pageAccess: args.pageAccess }),
      updatedAt: Date.now(),
    });

    return args.roleId;
  },
});

// Assign role to user
export const assignRole = mutation({
  args: {
    userId: v.id("users"),
    roleId: v.id("roles"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await checkPermission(ctx, "role.assign");

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const newRole = await ctx.db.get(args.roleId);
    if (!newRole) throw new Error("Role not found");

    const adminId = await getCurrentUserId(ctx);
    const oldRoleId = user.roleId;
    const oldRole = oldRoleId ? await ctx.db.get(oldRoleId) : null;

    // Update user's role
    const now = Date.now();
    await ctx.db.patch(args.userId, {
      roleId: args.roleId,
      roleAssignedAt: now,
      roleAssignedBy: adminId,
      previousRoleId: oldRoleId,
      previousRoleChangedAt: now,
    });

    // Log the change
    await ctx.db.insert("roleChangeLog", {
      userId: args.userId,
      oldRoleId,
      newRoleId: args.roleId,
      changedBy: adminId!,
      reason: args.reason,
      createdAt: now,
    });

    // Emit event
    await dispatchEvent(ctx, "admin.user_role_changed", {
      adminId,
      userId: args.userId,
      oldRole: oldRole?.name ?? null,
      newRole: newRole.name,
      reason: args.reason,
    });

    return args.userId;
  },
});

// Set default role
export const setDefaultRole = mutation({
  args: { roleId: v.id("roles") },
  handler: async (ctx, args) => {
    await checkPermission(ctx, "role.update_permissions");

    const role = await ctx.db.get(args.roleId);
    if (!role) throw new Error("Role not found");
    if (role.type !== "customer") {
      throw new Error("Only customer-type roles can be default");
    }

    // Remove default from all other roles
    const allRoles = await ctx.db.query("roles").collect();
    for (const r of allRoles) {
      if (r.isDefault && r._id !== args.roleId) {
        await ctx.db.patch(r._id, { isDefault: false, updatedAt: Date.now() });
      }
    }

    // Set new default
    await ctx.db.patch(args.roleId, { isDefault: true, updatedAt: Date.now() });

    return args.roleId;
  },
});
```

### 11.3 Helper Functions

```typescript
// convex/lib/permissions.ts

import { QueryCtx, MutationCtx } from "../_generated/server";

/**
 * Check if current user has a specific capability
 * Throws if not authorized
 */
export async function checkPermission(
  ctx: QueryCtx | MutationCtx,
  actionCode: string
): Promise<void> {
  const userId = await getCurrentUserId(ctx);

  // Get user's role
  let role;
  if (!userId) {
    role = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", "Guest"))
      .unique();
  } else {
    const user = await ctx.db.get(userId);
    role = user?.roleId ? await ctx.db.get(user.roleId) : null;

    // Fallback to default role
    if (!role) {
      role = await ctx.db
        .query("roles")
        .filter((q) => q.eq(q.field("isDefault"), true))
        .unique();
    }
  }

  if (!role) {
    throw new Error("Unauthorized: No role found");
  }

  if (!role.capabilities.includes(actionCode)) {
    throw new Error(`Unauthorized: Missing capability '${actionCode}'`);
  }
}

/**
 * Check if current user can access a route
 * Returns boolean instead of throwing
 */
export async function canAccessRoute(
  ctx: QueryCtx,
  path: string
): Promise<boolean> {
  const route = await ctx.db
    .query("routePermissions")
    .withIndex("by_path", (q) => q.eq("path", path))
    .unique();

  if (!route || !route.authRequired) return true;

  const userId = await getCurrentUserId(ctx);
  if (!userId) return false;

  const user = await ctx.db.get(userId);
  const roleId = user?.roleId;
  if (!roleId) return false;

  return route.allowedRoles.some((id) => id === roleId);
}

/**
 * Get the current user's role with capabilities
 */
export async function getCurrentRole(ctx: QueryCtx) {
  const userId = await getCurrentUserId(ctx);

  if (!userId) {
    return await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", "Guest"))
      .unique();
  }

  const user = await ctx.db.get(userId);
  if (!user?.roleId) {
    return await ctx.db
      .query("roles")
      .filter((q) => q.eq(q.field("isDefault"), true))
      .unique();
  }

  return await ctx.db.get(user.roleId);
}
```

---

## 12. Security Considerations

### 12.1 Authentication Requirements

| Route/Action | Requirement |
|--------------|-------------|
| View roles list | Admin role |
| Create/edit roles | Admin role |
| Assign roles | Admin role |
| Check own permissions | Any authenticated user |

### 12.2 Authorization Rules

1. **Last Admin Protection:** Cannot remove Admin role from the last admin user
2. **Self-Demotion Warning:** Warn when admin removes their own privileges
3. **System Role Protection:** System role cannot be assigned to regular users
4. **Capability Validation:** Only grant capabilities that exist in the system

### 12.3 Data Privacy

1. Role change history is admin-only
2. Users can see their own role but not others'
3. Capability list is not exposed to customers
4. Audit logs retained for compliance

---

## 13. Testing Strategy

### 13.1 Unit Tests

- [ ] Role CRUD operations
- [ ] Permission check helper functions
- [ ] Role inheritance logic (if implemented)
- [ ] Default role assignment on registration

### 13.2 Integration Tests

- [ ] Route protection middleware
- [ ] Role assignment with event emission
- [ ] Email notification on role change
- [ ] Airtable sync integration

### 13.3 E2E Tests

- [ ] Admin creates new role
- [ ] Admin assigns role to user
- [ ] User access changes with role
- [ ] Protected route returns 403 for wrong role

---

## 14. Implementation Checklist

### Phase 1: Foundation
- [ ] Schema definition for roles, routePermissions, roleChangeLog
- [ ] Add roleId field to users table
- [ ] Basic CRUD mutations for roles
- [ ] Permission check helper functions

### Phase 2: Core Features
- [ ] Admin roles page route
- [ ] Role list component
- [ ] Role editor modal
- [ ] Capability selector
- [ ] Route access selector

### Phase 3: Integration
- [ ] Event emission on role change
- [ ] Email notification integration
- [ ] Route protection middleware
- [ ] Permission checks in existing mutations

### Phase 4: Polish
- [ ] Role change audit log
- [ ] Last admin protection
- [ ] Sync with Airtable (when Sync System built)
- [ ] Error handling and edge cases

---

## 15. Future Considerations

1. **Permission Groups** - Group capabilities into logical sets for easier management
2. **Time-Limited Roles** - Grant temporary elevated access
3. **Team/Organization Roles** - Multi-tenant role management
4. **Custom Permissions** - Per-user permission overrides
5. **Role Hierarchy Inheritance** - Automatic capability inheritance by level
6. **Permission Caching** - Cache permission checks for performance

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System | recPvKicci9ch9b1h |
| Route | recm8Nt9fXLI5KcI6 |
| Actions | recj8mP669tmX5BqZ, recojqUBXv7oBPmTY, recRio09S4ROBXWBn, recag4kvn6Z9IwTVW |
| Events | reczLbXUWTqLS3nsF |
| Email Notifications | reczH51dmRbw2fzzr |

### B. Role Record IDs

| Role | Record ID |
|------|-----------|
| Guest | reciDOFD30sksJy2T |
| Customer | recUTdHhBrmatNJEl |
| Staff | rechTw9lsLBiOtJmS |
| Manager | recunLmLIplRqJ5rv |
| Admin | recnZRWT4FxR48vAD |
| System | recS6TkbDx41Ig20t |

### C. Related Documentation

- [Action Plan](./ACTION-PLAN.md)
- [Authentication System PRD](./PRD-AUTH-SYSTEM.md)
- [Event System PRD](./PRD-EVENT-SYSTEM.md)
- [Tech Stack](../.claude/CLAUDE.md)

---

**PRD Version:** 1.0
**Created:** January 30, 2025
**Last Updated:** January 30, 2025
**Author:** Claude (AI Assistant)
