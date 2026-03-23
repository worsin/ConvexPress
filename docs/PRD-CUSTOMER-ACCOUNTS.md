# PRD: Customer Accounts

> **System Code:** USR-ACT
> **Phase:** 1 of 6
> **Priority:** P0 - Critical
> **Complexity:** Medium

---

## 1. Overview

### 1.1 Purpose

The Customer Accounts system manages user profiles, preferences, and personal data for registered customers. It provides a central hub where customers can view their order history, manage shipping/billing addresses, update account settings, and access their personalized dashboard. This system also powers the admin's customer management capabilities, enabling staff to view customer details, search accounts, and provide better support.

### 1.2 Scope

**In Scope:**
- User profile management (name, email, phone)
- Account dashboard with activity overview
- Address book management (multiple shipping/billing addresses)
- Account settings page
- Password management (change password, linked to Auth)
- Admin customer list with search/filter
- Admin customer detail view
- Account deletion (GDPR compliance)
- Email change with verification flow

**Out of Scope:**
- Order history display (handled by Order Management, displayed here)
- Wishlist management (Phase 5, tab placeholder here)
- Support tickets view (Phase 5, tab placeholder here)
- Saved payment methods (handled by Payment System)
- Social login profiles (handled by Auth System)

### 1.3 Design Philosophy

The account dashboard should be a **single source of truth** for customers about their relationship with the store. While other systems own their data (orders, wishlists, etc.), the account dashboard displays it in one cohesive interface.

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Authentication System | PLT-AUT | 0 | Need auth for user identity and session |
| Event System | PLT-EVT | 0 | Emit events on profile changes |
| Role & Permission System | PLT-ROL | 1 | Assign roles, control admin access |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Checkout System | ORD-CHK | 4 | Retrieve saved addresses for checkout |
| Wishlist System | USR-WSH | 5 | Display wishlist in account dashboard |
| Reviews & Ratings | CON-REV | 5 | Link reviews to customer accounts |
| Customer Support | SUP-TKT | 5 | Display tickets in account dashboard |
| Analytics & Reporting | ADM-RPT | 6 | Customer analytics and reports |

### 2.3 Integration Hooks to Implement

| Hook | Purpose | Used By |
|------|---------|---------|
| `getCustomerProfile(userId)` | Retrieve customer profile | All systems needing user info |
| `getCustomerAddresses(userId)` | List customer's saved addresses | Checkout, Shipping |
| `getDefaultAddress(userId, type)` | Get default shipping/billing address | Checkout |
| `searchCustomers(query, filters)` | Search customers | Admin, Support |
| `getCustomerStats(userId)` | Get customer metrics (order count, total spent) | Admin detail view, Analytics |

---

## 3. Routes

> Source: Airtable Routes table

### 3.1 Customer-Facing Routes (Website App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Account Dashboard | `/account` | _dashboard | Yes | Customer |
| Account Settings | `/account/settings` | _dashboard | Yes | Customer |
| Address Book | `/account/addresses` | _dashboard | Yes | Customer |

**Note:** Additional account routes exist but are owned by other systems:
- `/account/orders` - Order Management
- `/account/orders/:orderId` - Order Management
- `/account/wishlist` - Wishlist System
- `/account/notifications` - Site Notification System
- `/account/support` - Customer Support

### 3.2 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Customer List | `/admin/customers` | _admin | Yes | Staff, Manager, Admin |
| Customer Detail | `/admin/customers/:id` | _admin | Yes | Staff, Manager, Admin |

---

## 4. Data Model

### 4.1 Tables

```typescript
// admin-app/packages/backend/convex/schema.ts

// Users table - extended from Auth system
users: defineTable({
  // === Auth fields (from PLT-AUT) ===
  email: v.string(),
  passwordHash: v.optional(v.string()),
  emailVerified: v.boolean(),

  // === Role fields (from PLT-ROL) ===
  roleId: v.id("roles"),
  roleAssignedAt: v.number(),
  roleAssignedBy: v.optional(v.id("users")),

  // === Profile fields ===
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  displayName: v.optional(v.string()),    // Computed or custom
  phone: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),

  // === Preferences ===
  locale: v.optional(v.string()),          // "en-US", "es-ES", etc.
  currency: v.optional(v.string()),        // "USD", "EUR", etc.
  timezone: v.optional(v.string()),        // "America/New_York"

  // === Marketing preferences ===
  marketingOptIn: v.boolean(),             // Email marketing consent
  smsOptIn: v.boolean(),                   // SMS marketing consent

  // === Account status ===
  status: v.union(
    v.literal("active"),
    v.literal("suspended"),
    v.literal("deactivated"),
    v.literal("deleted")
  ),
  suspendedAt: v.optional(v.number()),
  suspendedReason: v.optional(v.string()),
  deactivatedAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),       // Soft delete timestamp

  // === Computed/cached fields (updated by triggers) ===
  orderCount: v.number(),                  // Updated by Order Management
  totalSpent: v.number(),                  // Updated by Order Management
  lastOrderAt: v.optional(v.number()),     // Updated by Order Management

  // === Default addresses ===
  defaultShippingAddressId: v.optional(v.id("addresses")),
  defaultBillingAddressId: v.optional(v.id("addresses")),

  // === Tax exempt (B2B) ===
  isTaxExempt: v.boolean(),
  taxExemptId: v.optional(v.string()),     // Tax exempt certificate number

  // === Timestamps ===
  createdAt: v.number(),
  updatedAt: v.number(),
  lastLoginAt: v.optional(v.number()),
})
  .index("by_email", ["email"])
  .index("by_status", ["status"])
  .index("by_role", ["roleId"])
  .index("by_created", ["createdAt"]),

// Addresses table
addresses: defineTable({
  userId: v.id("users"),

  // === Type ===
  type: v.union(
    v.literal("shipping"),
    v.literal("billing"),
    v.literal("both")                      // Can be used for either
  ),

  // === Label ===
  label: v.optional(v.string()),           // "Home", "Work", "Mom's House"

  // === Contact ===
  firstName: v.string(),
  lastName: v.string(),
  company: v.optional(v.string()),
  phone: v.optional(v.string()),

  // === Address lines ===
  addressLine1: v.string(),
  addressLine2: v.optional(v.string()),
  city: v.string(),
  state: v.string(),                       // State/Province/Region
  postalCode: v.string(),
  country: v.string(),                     // ISO 3166-1 alpha-2 (US, CA, GB)

  // === Flags ===
  isDefault: v.boolean(),                  // Default for its type
  isVerified: v.optional(v.boolean()),     // Address validation passed

  // === Metadata ===
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_user_type", ["userId", "type"])
  .index("by_user_default", ["userId", "isDefault"]),

// Email change requests (pending verification)
emailChangeRequests: defineTable({
  userId: v.id("users"),
  oldEmail: v.string(),
  newEmail: v.string(),
  token: v.string(),                       // Verification token
  expiresAt: v.number(),
  status: v.union(
    v.literal("pending"),
    v.literal("verified"),
    v.literal("expired"),
    v.literal("cancelled")
  ),
  createdAt: v.number(),
})
  .index("by_token", ["token"])
  .index("by_user", ["userId"])
  .index("by_status", ["status"]),

// Account deletion requests (GDPR)
accountDeletionRequests: defineTable({
  userId: v.id("users"),
  reason: v.optional(v.string()),
  scheduledDeletionAt: v.number(),         // 30 days from request
  status: v.union(
    v.literal("pending"),                  // Waiting for deletion
    v.literal("cancelled"),                // User cancelled
    v.literal("completed")                 // Account deleted
  ),
  requestedAt: v.number(),
  completedAt: v.optional(v.number()),
})
  .index("by_user", ["userId"])
  .index("by_status", ["status"])
  .index("by_scheduled", ["scheduledDeletionAt"]),
```

### 4.2 Relationships

```
users
  ↓ (one-to-many)
addresses.userId

users
  ↓ (one-to-many)
emailChangeRequests.userId

users
  ↓ (one-to-many)
accountDeletionRequests.userId

users.defaultShippingAddressId → addresses
users.defaultBillingAddressId → addresses
```

### 4.3 Forward-Looking Fields

| Field | Future System | Purpose |
|-------|---------------|---------|
| `users.orderCount` | Order Management | Cached order count for display |
| `users.totalSpent` | Order Management | Lifetime value for analytics |
| `users.lastOrderAt` | Order Management | Activity tracking |
| `users.isTaxExempt` | Tax Calculation | B2B tax exemption |
| `addresses.isVerified` | Checkout/Shipping | Address validation integration |

---

## 5. Actions

> Source: Airtable Actions table

### 5.1 Customer Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| View Profile | `account.view_profile` | View user profile and account information | Customer |
| Update Profile | `account.update_profile` | Update profile information (name, email, etc.) | Customer |
| Add Address | `account.add_address` | Add a new shipping or billing address | Customer |
| Update Address | `account.update_address` | Update an existing address | Customer |
| Delete Address | `account.delete_address` | Remove an address from address book | Customer |
| View Order History | `account.view_orders` | View list of past orders | Customer |
| Delete Account | `account.delete_account` | Permanently delete account (GDPR) | Customer |

### 5.2 Staff/Admin Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Admin View Customer | `account.admin_view` | View customer profile and details | Staff, Manager, Admin |
| Admin Search Customers | `account.admin_search` | Search/filter customer list | Staff, Manager, Admin |

---

## 6. Events

> Source: Airtable Events table

### 6.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| User Registered | `user.registered` | New account created | `{ userId: Id, email: string, name?: string }` |
| Profile Updated | `user.profile_updated` | User updates profile | `{ userId: Id, email: string, changedFields: string[] }` |
| Email Changed | `user.email_changed` | User changes email | `{ userId: Id, oldEmail: string, newEmail: string }` |
| Address Added | `user.address_added` | User adds address | `{ userId: Id, addressId: Id, type: 'shipping' \| 'billing' }` |
| Account Deactivated | `user.account_deactivated` | User deactivates account | `{ userId: Id, email: string, reason?: string }` |
| Account Deleted | `user.account_deleted` | Account deletion completed | `{ userId: Id, email: string, deletedAt: timestamp }` |

### 6.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| `auth.user_registered` | Authentication | Create customer profile record |
| `order.placed` | Order Management | Update orderCount, totalSpent, lastOrderAt |

---

## 7. Notifications

### 7.1 Email Notifications

> Source: Airtable Email Notifications table

| Name | Trigger Event | Recipient | Template Variables |
|------|---------------|-----------|-------------------|
| Welcome Email | `user.registered` | Customer | `{{storeName}}, {{customer_name}}` |
| Email Change Confirmation | `user.email_changed` | New Email | `{{customer_name}}, {{verification_link}}` |
| Email Change Notification | `user.email_changed` | Old Email | `{{customer_name}}, {{new_email}}` |
| Account Deactivated | `user.account_deactivated` | Customer | `{{customer_name}}, {{reactivation_link}}` |
| Account Deleted | `user.account_deleted` | Customer | `{{customer_name}}` |

### 7.2 Site Notifications

> Source: Airtable Site Notifications table

| Name | Trigger Event | Recipient | Message |
|------|---------------|-----------|---------|
| Welcome | `user.registered` | Customer | "Welcome to the store! Start shopping and earn rewards." |
| Profile Updated | `user.profile_updated` | Customer | "Your profile has been updated" |
| Email Changed | `user.email_changed` | Customer | "Your email address has been updated successfully" |

---

## 8. User Interface

### 8.1 Components Needed

**Customer Dashboard (Website App):**

- [ ] `AccountLayout` - Sidebar navigation + content area
- [ ] `AccountSidebar` - Navigation menu for account sections
- [ ] `AccountDashboard` - Overview with stats and quick actions
- [ ] `ProfileCard` - Display user info with edit button
- [ ] `ProfileForm` - Edit profile information
- [ ] `AddressList` - Display saved addresses
- [ ] `AddressCard` - Single address with actions
- [ ] `AddressForm` - Add/edit address modal/drawer
- [ ] `AccountSettings` - Settings with toggles and preferences
- [ ] `DeleteAccountDialog` - Confirmation for account deletion

**Admin (Admin App):**

- [ ] `CustomerTable` - Searchable/filterable customer list
- [ ] `CustomerCard` - Customer row in table
- [ ] `CustomerDetail` - Full customer view
- [ ] `CustomerProfile` - Profile info section
- [ ] `CustomerOrders` - Recent orders section
- [ ] `CustomerAddresses` - Addresses section
- [ ] `CustomerActivityLog` - Activity timeline
- [ ] `CustomerSearch` - Search input with filters

### 8.2 Account Dashboard Layout

```
/account

┌─────────────────────────────────────────────────────────────────┐
│  My Account                                      [👤 John Doe]  │
├─────────────┬───────────────────────────────────────────────────┤
│             │                                                   │
│  Dashboard  │  Welcome back, John!                              │
│  Orders     │                                                   │
│  Wishlist   │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │
│  Addresses  │  │  📦 Orders  │ │  💰 Spent   │ │  ❤️ Wishlist │  │
│  Settings   │  │     12      │ │   $2,450    │ │     8       │  │
│  Support    │  └─────────────┘ └─────────────┘ └─────────────┘  │
│             │                                                   │
│             │  Recent Orders                                    │
│             │  ┌───────────────────────────────────────────┐   │
│             │  │ #1234 • Dec 15, 2024 • $89.99 • Delivered │   │
│             │  │ #1233 • Dec 10, 2024 • $45.00 • Shipped   │   │
│             │  │ #1232 • Dec 5, 2024 • $120.50 • Delivered │   │
│             │  └───────────────────────────────────────────┘   │
│             │  [View All Orders →]                              │
│             │                                                   │
└─────────────┴───────────────────────────────────────────────────┘
```

### 8.3 Address Book Layout

```
/account/addresses

┌─────────────────────────────────────────────────────────────────┐
│  My Addresses                                   [+ Add Address] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SHIPPING ADDRESSES                                             │
│                                                                 │
│  ┌─────────────────────────────────┐ ┌─────────────────────────┐│
│  │ 🏠 Home                ⭐ Default│ │ 🏢 Work                 ││
│  │                                 │ │                         ││
│  │ John Doe                        │ │ John Doe                ││
│  │ 123 Main Street                 │ │ Acme Corp               ││
│  │ Apt 4B                          │ │ 456 Business Ave        ││
│  │ New York, NY 10001              │ │ Suite 100               ││
│  │ United States                   │ │ Chicago, IL 60601       ││
│  │                                 │ │ United States           ││
│  │ [Edit] [Delete] [Set Default]   │ │ [Edit] [Delete]         ││
│  └─────────────────────────────────┘ └─────────────────────────┘│
│                                                                 │
│  BILLING ADDRESSES                                              │
│                                                                 │
│  ┌─────────────────────────────────┐                            │
│  │ 💳 Primary           ⭐ Default │                            │
│  │                                 │                            │
│  │ John Doe                        │                            │
│  │ 123 Main Street, Apt 4B         │                            │
│  │ New York, NY 10001              │                            │
│  │                                 │                            │
│  │ [Edit] [Delete]                 │                            │
│  └─────────────────────────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.4 Admin Customer Detail

```
/admin/customers/:id

┌─────────────────────────────────────────────────────────────────┐
│  ← Customers    John Doe                    [Email] [Suspend]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────┐ ┌─────────────────────────────┐│
│  │ PROFILE                     │ │ STATS                       ││
│  │                             │ │                             ││
│  │ 👤 John Doe                 │ │ Orders: 12                  ││
│  │ john@example.com            │ │ Total Spent: $2,450.00      ││
│  │ +1 (555) 123-4567           │ │ Last Order: Dec 15, 2024    ││
│  │                             │ │ Member Since: Jan 1, 2024   ││
│  │ Role: Customer              │ │                             ││
│  │ Status: Active              │ │ Avg Order: $204.17          ││
│  └─────────────────────────────┘ └─────────────────────────────┘│
│                                                                 │
│  RECENT ORDERS                           [View All Orders →]    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Order      │ Date       │ Total    │ Status    │ Action  │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ #1234      │ Dec 15     │ $89.99   │ Delivered │ [View]  │  │
│  │ #1233      │ Dec 10     │ $45.00   │ Shipped   │ [View]  │  │
│  │ #1232      │ Dec 5      │ $120.50  │ Delivered │ [View]  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ADDRESSES                                                      │
│  ┌────────────────────────┐ ┌────────────────────────┐         │
│  │ 🏠 Home (Shipping)     │ │ 💳 Primary (Billing)   │         │
│  │ 123 Main St, Apt 4B    │ │ Same as shipping       │         │
│  │ New York, NY 10001     │ │                        │         │
│  └────────────────────────┘ └────────────────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 8.5 States

| State | Description | UI Behavior |
|-------|-------------|-------------|
| Loading | Fetching profile data | Skeleton placeholders |
| Empty Addresses | No addresses saved | Empty state with CTA |
| Saving | Updating profile/address | Disabled form, spinner |
| Success | Save completed | Toast notification |
| Error | Save failed | Error message, retry option |
| Deleting Account | Deletion in progress | Full-screen confirmation flow |

---

## 9. Business Rules

### 9.1 Validation Rules

| Field | Rule |
|-------|------|
| Email | Valid email format, unique |
| Phone | Valid phone format (optional) |
| First Name | 1-50 characters |
| Last Name | 1-50 characters |
| Address Line 1 | 1-100 characters |
| City | 1-50 characters |
| Postal Code | Valid format for country |
| Country | Valid ISO 3166-1 alpha-2 code |

### 9.2 Business Logic

**Email Change Flow:**
1. User requests email change
2. System sends verification link to NEW email
3. System notifies OLD email of pending change
4. User clicks verification link
5. Email is updated, both emails notified

**Account Deletion (GDPR):**
1. User requests deletion
2. System schedules deletion for 30 days
3. User receives confirmation email
4. User can cancel within 30 days
5. After 30 days, account is anonymized/deleted
6. Orders are retained but anonymized

**Address Management:**
- Maximum 10 addresses per user
- At least one default shipping address if addresses exist
- Cannot delete an address used in pending orders
- Default billing can fall back to default shipping

### 9.3 Edge Cases

| Case | Handling |
|------|----------|
| Email already exists | Error: "Email already in use" |
| Delete last address | Allow, clear default |
| Delete address in use | Prevent with explanation |
| Verify expired token | Error with resend option |
| Cancel deletion after 30 days | Account already deleted |
| Admin views deleted account | Show anonymized data |

---

## 10. API Design

### 10.1 Queries (Read Operations)

```typescript
// Get current user's profile
export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Get role
    const role = user.roleId ? await ctx.db.get(user.roleId) : null;

    // Get default addresses
    const defaultShipping = user.defaultShippingAddressId
      ? await ctx.db.get(user.defaultShippingAddressId)
      : null;
    const defaultBilling = user.defaultBillingAddressId
      ? await ctx.db.get(user.defaultBillingAddressId)
      : null;

    return {
      ...user,
      role: role?.name,
      defaultShippingAddress: defaultShipping,
      defaultBillingAddress: defaultBilling,
      // Omit sensitive fields
      passwordHash: undefined,
    };
  },
});

// Get user's addresses
export const getMyAddresses = query({
  args: {
    type: v.optional(v.union(v.literal("shipping"), v.literal("billing"), v.literal("both"))),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    let query = ctx.db
      .query("addresses")
      .withIndex("by_user", (q) => q.eq("userId", userId));

    const addresses = await query.collect();

    if (args.type) {
      return addresses.filter(
        (a) => a.type === args.type || a.type === "both"
      );
    }

    return addresses;
  },
});

// Admin: List customers
export const listCustomers = query({
  args: {
    search: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("suspended"),
      v.literal("deactivated")
    )),
    sortBy: v.optional(v.union(
      v.literal("createdAt"),
      v.literal("lastOrderAt"),
      v.literal("totalSpent")
    )),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await checkPermission(ctx, "account.admin_search");

    // Get customer role ID
    const customerRole = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", "Customer"))
      .unique();

    let customers = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("roleId", customerRole?._id))
      .collect();

    // Filter by status
    if (args.status) {
      customers = customers.filter((c) => c.status === args.status);
    }

    // Search by name or email
    if (args.search) {
      const search = args.search.toLowerCase();
      customers = customers.filter(
        (c) =>
          c.email.toLowerCase().includes(search) ||
          c.firstName?.toLowerCase().includes(search) ||
          c.lastName?.toLowerCase().includes(search)
      );
    }

    // Sort
    const sortBy = args.sortBy || "createdAt";
    const sortOrder = args.sortOrder || "desc";
    customers.sort((a, b) => {
      const aVal = a[sortBy] ?? 0;
      const bVal = b[sortBy] ?? 0;
      return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });

    // Paginate
    const limit = args.limit || 20;
    return customers.slice(0, limit);
  },
});

// Admin: Get customer detail
export const getCustomer = query({
  args: { customerId: v.id("users") },
  handler: async (ctx, args) => {
    await checkPermission(ctx, "account.admin_view");

    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new Error("Customer not found");

    // Get addresses
    const addresses = await ctx.db
      .query("addresses")
      .withIndex("by_user", (q) => q.eq("userId", args.customerId))
      .collect();

    // Get role
    const role = customer.roleId ? await ctx.db.get(customer.roleId) : null;

    return {
      ...customer,
      role: role?.name,
      addresses,
      passwordHash: undefined, // Never expose
    };
  },
});
```

### 10.2 Mutations (Write Operations)

```typescript
// Update profile
export const updateProfile = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    locale: v.optional(v.string()),
    currency: v.optional(v.string()),
    marketingOptIn: v.optional(v.boolean()),
    smsOptIn: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Track changed fields
    const changedFields: string[] = [];
    Object.entries(args).forEach(([key, value]) => {
      if (value !== undefined && user[key] !== value) {
        changedFields.push(key);
      }
    });

    if (changedFields.length === 0) return userId;

    // Update
    await ctx.db.patch(userId, {
      ...args,
      displayName: args.firstName && args.lastName
        ? `${args.firstName} ${args.lastName}`
        : user.displayName,
      updatedAt: Date.now(),
    });

    // Emit event
    await dispatchEvent(ctx, "user.profile_updated", {
      userId,
      email: user.email,
      changedFields,
    });

    return userId;
  },
});

// Request email change
export const requestEmailChange = mutation({
  args: { newEmail: v.string() },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Check if email is already in use
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.newEmail))
      .unique();

    if (existing) throw new Error("Email already in use");

    // Cancel any pending requests
    const pending = await ctx.db
      .query("emailChangeRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    for (const req of pending) {
      await ctx.db.patch(req._id, { status: "cancelled" });
    }

    // Create new request
    const token = generateSecureToken();
    const request = await ctx.db.insert("emailChangeRequests", {
      userId,
      oldEmail: user.email,
      newEmail: args.newEmail,
      token,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      status: "pending",
      createdAt: Date.now(),
    });

    // Emit event (triggers emails)
    await dispatchEvent(ctx, "user.email_change_requested", {
      userId,
      oldEmail: user.email,
      newEmail: args.newEmail,
      token,
    });

    return request;
  },
});

// Add address
export const addAddress = mutation({
  args: {
    type: v.union(v.literal("shipping"), v.literal("billing"), v.literal("both")),
    label: v.optional(v.string()),
    firstName: v.string(),
    lastName: v.string(),
    company: v.optional(v.string()),
    phone: v.optional(v.string()),
    addressLine1: v.string(),
    addressLine2: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    postalCode: v.string(),
    country: v.string(),
    setAsDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    // Check address limit
    const existing = await ctx.db
      .query("addresses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    if (existing.length >= 10) {
      throw new Error("Maximum 10 addresses allowed");
    }

    // Determine if this should be default
    const typeAddresses = existing.filter(
      (a) => a.type === args.type || a.type === "both"
    );
    const isDefault = args.setAsDefault || typeAddresses.length === 0;

    // If setting as default, unset others
    if (isDefault) {
      for (const addr of typeAddresses.filter((a) => a.isDefault)) {
        await ctx.db.patch(addr._id, { isDefault: false });
      }
    }

    const now = Date.now();
    const addressId = await ctx.db.insert("addresses", {
      userId,
      type: args.type,
      label: args.label,
      firstName: args.firstName,
      lastName: args.lastName,
      company: args.company,
      phone: args.phone,
      addressLine1: args.addressLine1,
      addressLine2: args.addressLine2,
      city: args.city,
      state: args.state,
      postalCode: args.postalCode,
      country: args.country,
      isDefault,
      createdAt: now,
      updatedAt: now,
    });

    // Update user's default address reference
    if (isDefault) {
      const update: any = {};
      if (args.type === "shipping" || args.type === "both") {
        update.defaultShippingAddressId = addressId;
      }
      if (args.type === "billing" || args.type === "both") {
        update.defaultBillingAddressId = addressId;
      }
      await ctx.db.patch(userId, update);
    }

    // Emit event
    await dispatchEvent(ctx, "user.address_added", {
      userId,
      addressId,
      type: args.type,
    });

    return addressId;
  },
});

// Delete address
export const deleteAddress = mutation({
  args: { addressId: v.id("addresses") },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const address = await ctx.db.get(args.addressId);
    if (!address) throw new Error("Address not found");
    if (address.userId !== userId) throw new Error("Unauthorized");

    // Check if address is in use by pending orders
    // (This would query orders table when implemented)

    const user = await ctx.db.get(userId);

    // Clear default references if this was default
    const update: any = {};
    if (user?.defaultShippingAddressId === args.addressId) {
      update.defaultShippingAddressId = undefined;
    }
    if (user?.defaultBillingAddressId === args.addressId) {
      update.defaultBillingAddressId = undefined;
    }
    if (Object.keys(update).length > 0) {
      await ctx.db.patch(userId, update);
    }

    // Delete
    await ctx.db.delete(args.addressId);

    return args.addressId;
  },
});

// Request account deletion
export const requestAccountDeletion = mutation({
  args: { reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getCurrentUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Check for existing pending request
    const existing = await ctx.db
      .query("accountDeletionRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .unique();

    if (existing) throw new Error("Deletion already requested");

    const now = Date.now();
    const request = await ctx.db.insert("accountDeletionRequests", {
      userId,
      reason: args.reason,
      scheduledDeletionAt: now + 30 * 24 * 60 * 60 * 1000, // 30 days
      status: "pending",
      requestedAt: now,
    });

    // Update user status
    await ctx.db.patch(userId, {
      status: "deactivated",
      deactivatedAt: now,
    });

    // Emit event
    await dispatchEvent(ctx, "user.account_deactivated", {
      userId,
      email: user.email,
      reason: args.reason,
    });

    return request;
  },
});
```

### 10.3 Actions (External/Async Operations)

```typescript
// Verify email change token
export const verifyEmailChange = action({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.runQuery(internal.users.getEmailChangeRequest, {
      token: args.token,
    });

    if (!request) throw new Error("Invalid token");
    if (request.status !== "pending") throw new Error("Token already used");
    if (request.expiresAt < Date.now()) {
      await ctx.runMutation(internal.users.expireEmailChangeRequest, {
        requestId: request._id,
      });
      throw new Error("Token expired");
    }

    // Update user's email
    await ctx.runMutation(internal.users.completeEmailChange, {
      requestId: request._id,
      userId: request.userId,
      newEmail: request.newEmail,
    });

    // Emit event
    await ctx.runMutation(internal.events.dispatch, {
      event: "user.email_changed",
      payload: {
        userId: request.userId,
        oldEmail: request.oldEmail,
        newEmail: request.newEmail,
      },
    });

    return { success: true };
  },
});

// Process scheduled account deletions (scheduled task)
export const processAccountDeletions = action({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const pendingDeletions = await ctx.runQuery(
      internal.users.getPendingDeletions,
      { beforeTimestamp: now }
    );

    for (const request of pendingDeletions) {
      // Anonymize user data
      await ctx.runMutation(internal.users.anonymizeUser, {
        userId: request.userId,
      });

      // Mark request complete
      await ctx.runMutation(internal.users.completeDeletion, {
        requestId: request._id,
      });

      // Emit event
      await ctx.runMutation(internal.events.dispatch, {
        event: "user.account_deleted",
        payload: {
          userId: request.userId,
          email: "deleted",
          deletedAt: now,
        },
      });
    }

    return { processed: pendingDeletions.length };
  },
});
```

---

## 11. Security Considerations

### 11.1 Authentication Requirements

| Route/Action | Requirement |
|--------------|-------------|
| View own profile | Authenticated user |
| Update own profile | Authenticated user |
| Manage own addresses | Authenticated user |
| View customer list | Staff+ role |
| View customer detail | Staff+ role |

### 11.2 Authorization Rules

1. **Own Data Only:** Customers can only view/edit their own data
2. **Admin Override:** Staff+ can view any customer data
3. **No Edit By Staff:** Only customers can edit their own profiles
4. **Role Protected:** All admin routes require internal roles

### 11.3 Data Privacy

1. **Password Never Exposed:** Never return password hash in queries
2. **Email Verification:** New emails must be verified before change
3. **Old Email Notification:** Always notify old email of changes
4. **Anonymization:** Account deletion anonymizes, doesn't hard delete
5. **Audit Trail:** All changes logged for compliance
6. **Data Export:** Provide mechanism for data export (GDPR)

---

## 12. Testing Strategy

### 12.1 Unit Tests

- [ ] Profile update validation
- [ ] Address CRUD operations
- [ ] Email change token validation
- [ ] Account deletion scheduling

### 12.2 Integration Tests

- [ ] Email change flow (request → verify → complete)
- [ ] Account deletion flow (request → scheduled → execute)
- [ ] Event emission on profile changes
- [ ] Notification triggers

### 12.3 E2E Tests

- [ ] Customer updates profile
- [ ] Customer adds/edits/deletes address
- [ ] Customer requests email change
- [ ] Customer requests account deletion
- [ ] Admin searches customers
- [ ] Admin views customer detail

---

## 13. Implementation Checklist

### Phase 1: Foundation
- [ ] Schema definition for users extension, addresses
- [ ] Basic profile CRUD mutations
- [ ] Address CRUD mutations
- [ ] Permission check integration

### Phase 2: Core Features
- [ ] Account dashboard route + UI
- [ ] Account settings page
- [ ] Address book page
- [ ] Profile edit form

### Phase 3: Admin Integration
- [ ] Admin customer list route
- [ ] Admin customer detail route
- [ ] Customer search functionality
- [ ] Customer stats display

### Phase 4: Advanced Features
- [ ] Email change flow
- [ ] Account deletion flow
- [ ] Event emission
- [ ] Notification integration

---

## 14. Future Considerations

1. **Address Validation:** Integrate address validation API (SmartyStreets, Google)
2. **Social Profiles:** Display linked social accounts
3. **Account Merge:** Merge duplicate accounts
4. **Customer Tags:** Admin tagging for segmentation
5. **Customer Notes:** Admin notes on customer records
6. **Activity Timeline:** Full activity log view
7. **Data Export:** Self-service data export (GDPR)

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System | rec4gpuvhYO6DtQtP |
| Routes | recqGrIve6gQhK67f, recMMSNtc8WrZ2QFG, rec9wYzPIg7s01zeG, recgo80nkau4z6khh, rec0C0lMIE4P6EKUa |
| Actions | recycpg0ixGzwbrma, recCXf8bsFzXH7d6O, rec66js9g2gy0K3ec, recjmyF5SbAOMnNmZ, recBDAJCleq0VcIAM, recK17rsU8xULOi0e, recBBps6TfnTZs0Qc, recEaVZrqwduWGEPu, rechDRkZTeSTMo7fK |
| Events | recCrJozYQ6acrXef, recHR3nOTyeUjOJ4H, rec7Wr9OIHhy2qL44, rec1OeWWn28TRrOEB, recgzphznNTLtADkv, recMX5kYQYDWuxONh |
| Email Notifications | recrOxrLEhC4dwLVl, recgP2aOFIWUhssIh, recCvjQOwoQjy9yYM, rec6MIMPGrsdfhYs6, recU2Ehbjom35b2Gd |
| Site Notifications | recbF3VLbZg3bEFS7, recEBrukmbQBgMgaM, recSdfZAAKSYyghGA |

### B. Related Documentation

- [Action Plan](./ACTION-PLAN.md)
- [Authentication System PRD](./PRD-AUTH-SYSTEM.md)
- [Role & Permission System PRD](./PRD-ROLE-PERMISSION-SYSTEM.md)
- [Tech Stack](../.claude/CLAUDE.md)

---

**PRD Version:** 1.0
**Created:** January 30, 2025
**Last Updated:** January 30, 2025
**Author:** Claude (AI Assistant)
