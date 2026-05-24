# PRD: Authentication System

> **System Code:** PLT-AUT
> **Phase:** 0 of 6
> **Priority:** P0 - Critical
> **Complexity:** Medium

---

## 1. Overview

### 1.1 Purpose

The Authentication System provides secure user identity management for the e-commerce platform. It handles user registration, login/logout, password management, and session handling. This system is foundational - almost every other system depends on it to identify users and enforce access controls.

### 1.2 Scope

**In Scope:**
- User registration with email/password
- User login with email/password
- User logout (session termination)
- Password reset flow (request + reset)
- Email verification
- Password change (for authenticated users)
- Session management
- Integration with Event System for audit logging

**Out of Scope:**
- OAuth/social login (future enhancement)
- Multi-factor authentication (future enhancement)
- Role management (handled by Roles System)
- User profile management (handled by Customer Accounts System)
- Admin user management (handled by Admin Dashboard)

### 1.3 Out of Scope

- **OAuth Providers:** Google, Apple, Facebook login (Phase 2+)
- **MFA:** TOTP, SMS verification (Phase 3+)
- **SSO:** Single sign-on for enterprise (not planned)
- **Biometric:** WebAuthn/passkeys (future consideration)

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Event System | PLT-EVT | 0 | Auth events must be dispatched for notifications and audit logging |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Shopping Cart | ORD-CRT | 1 | Cart association with authenticated users |
| Payment Processing | BIL-PAY | 1 | Customer identity for payment methods |
| Site Notifications | PLT-SNT | 1 | User targeting for notifications |
| Admin Dashboard | ADM-DSH | 1 | Admin authentication and session |
| Media Library | PLT-MED | 1 | User-uploaded file ownership |
| Roles & Permissions | ADM-ROL | 1 | Role assignment requires user identity |
| Customer Accounts | USR-ACC | 1 | Profile management requires authentication |
| Reviews & Ratings | PRD-RVW | 3 | Verified purchase reviews |
| Wishlist | PRD-WIS | 3 | User wishlist ownership |
| Order Management | ORD-MGT | 2 | Order association with users |

### 2.3 Integration Hooks to Implement

```typescript
// Events emitted by Authentication System
type AuthEvents =
  | "user.registered"           // New user created
  | "user.logged_in"            // Successful login
  | "user.logged_out"           // Session ended
  | "user.password_reset_requested" // Reset email sent
  | "user.password_changed";    // Password updated

// Auth context provider for all systems
interface AuthContext {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
}
```

---

## 3. Routes

> Source: Airtable Routes table

### 3.1 Customer-Facing Routes (Website App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Sign In | `/auth/signin` | _marketing | No | Guest |
| Sign Up | `/auth/signup` | _marketing | No | Guest |
| Forgot Password | `/auth/forgot-password` | _marketing | No | Guest |
| Reset Password | `/auth/reset-password` | _marketing | No | Guest |

### 3.2 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Admin Sign In | `/auth/signin` | _auth | No | Guest |

> Note: Admin logout is handled via the global navigation component, not a dedicated route.

---

## 4. Data Model

### 4.1 Tables

```typescript
// admin-app/packages/backend/convex/schema.ts

// Users table - core identity
users: defineTable({
  // Identity
  email: v.string(),
  emailVerified: v.optional(v.boolean()),
  passwordHash: v.string(),

  // Profile basics (minimal - full profile in Customer Accounts)
  name: v.optional(v.string()),

  // Role & Status
  roleId: v.optional(v.id("roles")),
  status: v.union(
    v.literal("active"),
    v.literal("inactive"),
    v.literal("suspended"),
    v.literal("pending_verification")
  ),

  // Metadata
  createdAt: v.number(),
  updatedAt: v.number(),
  lastLoginAt: v.optional(v.number()),

  // Future: OAuth fields (added now, used later)
  oauthProvider: v.optional(v.string()),
  oauthProviderId: v.optional(v.string()),
})
  .index("by_email", ["email"])
  .index("by_status", ["status"])
  .index("by_role", ["roleId"]),

// Sessions table - active user sessions
sessions: defineTable({
  userId: v.id("users"),
  token: v.string(), // Session token (hashed)
  expiresAt: v.number(),

  // Session metadata
  ipAddress: v.optional(v.string()),
  userAgent: v.optional(v.string()),

  createdAt: v.number(),
  lastActivityAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_token", ["token"])
  .index("by_expires", ["expiresAt"]),

// Password reset tokens
passwordResetTokens: defineTable({
  userId: v.id("users"),
  token: v.string(), // Hashed token
  expiresAt: v.number(),
  used: v.boolean(),
  createdAt: v.number(),
})
  .index("by_token", ["token"])
  .index("by_user", ["userId"])
  .index("by_expires", ["expiresAt"]),

// Email verification tokens
emailVerificationTokens: defineTable({
  userId: v.id("users"),
  token: v.string(), // Hashed token
  email: v.string(), // Email being verified
  expiresAt: v.number(),
  used: v.boolean(),
  createdAt: v.number(),
})
  .index("by_token", ["token"])
  .index("by_user", ["userId"]),
```

### 4.2 Relationships

```
users
  ├── sessions (1:many) - Active login sessions
  ├── passwordResetTokens (1:many) - Reset requests
  ├── emailVerificationTokens (1:many) - Verification requests
  └── roles (many:1) - Assigned role
```

### 4.3 Forward-Looking Fields

| Field | Future System | Purpose |
|-------|---------------|---------|
| `oauthProvider` | OAuth Integration | Store provider name (google, apple) |
| `oauthProviderId` | OAuth Integration | Provider's user ID |
| `emailVerified` | Email Verification | Track verification status |
| `lastLoginAt` | Analytics/Security | Login frequency tracking |

---

## 5. Actions

> Source: Airtable Actions table

### 5.1 Customer Actions

| Action | Code | Description | Roles | Triggers Events |
|--------|------|-------------|-------|-----------------|
| Register Account | `auth.register` | Create a new user account | Guest | `user.registered` |
| Login | `auth.login` | Authenticate and log into account | Guest | `user.logged_in`, `admin.logged_in` |
| Logout | `auth.logout` | End current session and log out | Customer, Staff, Manager, Admin | `user.logged_out` |
| Verify Email | `auth.verify_email` | Verify email address via verification link | Guest | - |
| Request Password Reset | `auth.request_password_reset` | Request a password reset email | Guest | `user.password_reset_requested` |
| Reset Password | `auth.reset_password` | Complete password reset with new password | Guest | - |
| Change Password | `auth.change_password` | Change password from within account settings | Customer | `user.password_changed` |

### 5.2 Staff/Admin Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Admin Login | `auth.login` | Same login action, different event | Staff, Manager, Admin |
| Admin Logout | `auth.logout` | Same logout action | Staff, Manager, Admin |

---

## 6. Events

> Source: Airtable Events table

### 6.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| User Registered | `user.registered` | New account created | `{ userId: Id, email: string, name?: string }` |
| User Logged In | `user.logged_in` | Successful customer login | `{ userId: Id, email: string, method: 'password' \| 'oauth', ipAddress?: string }` |
| Admin Logged In | `admin.logged_in` | Successful admin/staff login | `{ adminId: Id, email: string, ipAddress?: string }` |
| User Logged Out | `user.logged_out` | Session terminated | `{ userId: Id, email: string }` |
| Password Reset Requested | `user.password_reset_requested` | Reset email requested | `{ userId: Id, email: string, resetToken: string }` |
| Password Changed | `user.password_changed` | Password updated | `{ userId: Id, email: string }` |

### 6.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| None | - | Auth system is event producer only |

---

## 7. Notifications

### 7.1 Email Notifications

> Source: Airtable Email Notifications table

| Name | Trigger Event | Recipient | Subject Template | Priority |
|------|---------------|-----------|------------------|----------|
| Welcome Email | `user.registered` | Customer | "Welcome to {{storeName}}!" | Immediate |
| Password Reset | `user.password_reset_requested` | Customer | "Reset Your Password" | Immediate |
| Password Changed Notification | `user.password_changed` | Customer | "Your Password Was Changed" | Immediate |

### 7.2 Site Notifications

> Source: Airtable Site Notifications table

| Name | Trigger Event | Recipient | Message Template | Type |
|------|---------------|-----------|------------------|------|
| Welcome | `user.registered` | Customer | "Welcome to the store! Start shopping and earn rewards." | Success |
| Password Changed | `user.password_changed` | Customer | "Your password has been changed successfully" | Success |

---

## 8. User Interface

### 8.1 Components Needed

**Shared Components:**
- [ ] `AuthLayout` - Centered card layout for auth pages
- [ ] `AuthCard` - Styled card container with logo
- [ ] `FormField` - Input with label, error state, validation
- [ ] `PasswordInput` - Password field with show/hide toggle
- [ ] `SubmitButton` - Loading state button
- [ ] `AuthLink` - Styled link for navigation between auth pages

**Page Components:**
- [ ] `SignInForm` - Email/password login form
- [ ] `SignUpForm` - Registration form with validation
- [ ] `ForgotPasswordForm` - Email input for reset request
- [ ] `ResetPasswordForm` - New password input with confirmation
- [ ] `VerifyEmailBanner` - Banner prompting email verification

### 8.2 Wireframes

```
┌─────────────────────────────────────┐
│           [Store Logo]              │
│                                     │
│  ┌───────────────────────────────┐  │
│  │         Sign In               │  │
│  │                               │  │
│  │  Email                        │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │                         │  │  │
│  │  └─────────────────────────┘  │  │
│  │                               │  │
│  │  Password                     │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │                      👁  │  │  │
│  │  └─────────────────────────┘  │  │
│  │                               │  │
│  │  [Forgot password?]           │  │
│  │                               │  │
│  │  ┌─────────────────────────┐  │  │
│  │  │       Sign In           │  │  │
│  │  └─────────────────────────┘  │  │
│  │                               │  │
│  │  Don't have an account?       │  │
│  │  [Sign up]                    │  │
│  └───────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

### 8.3 States

**Loading States:**
- Form submission loading (spinner in button)
- Session validation loading (full page skeleton)
- Password visibility toggle

**Error States:**
- Invalid credentials
- Email already registered
- Invalid/expired reset token
- Password validation errors (min length, complexity)
- Network error

**Success States:**
- Registration complete (redirect to verification prompt)
- Login successful (redirect to intended destination)
- Password reset email sent
- Password changed successfully

---

## 9. Business Rules

### 9.1 Validation Rules

**Email:**
- Required
- Valid email format
- Unique in system (for registration)
- Max 255 characters

**Password:**
- Required
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- Max 128 characters

**Password Reset Token:**
- Valid for 1 hour
- Single use only
- Invalidate previous tokens when new one requested

**Session:**
- Default expiry: 7 days
- Sliding window: Extend on activity
- Max sessions per user: 5 (optional limit)

### 9.2 Business Logic

1. **Registration Flow:**
   - Validate email uniqueness
   - Hash password with bcrypt (cost factor 12)
   - Create user with status `pending_verification`
   - Generate email verification token
   - Dispatch `user.registered` event
   - Send welcome email with verification link

2. **Login Flow:**
   - Lookup user by email
   - Verify password hash
   - Check user status (must be `active` or `pending_verification`)
   - Create session with token
   - Update `lastLoginAt`
   - Dispatch `user.logged_in` or `admin.logged_in` event
   - Return session token

3. **Password Reset Flow:**
   - Lookup user by email
   - Invalidate existing reset tokens
   - Generate new reset token (random 32 bytes, hashed for storage)
   - Dispatch `user.password_reset_requested` event
   - Send reset email with token
   - On reset: Verify token, update password, invalidate all sessions

4. **Logout Flow:**
   - Invalidate current session
   - Dispatch `user.logged_out` event
   - Clear client-side auth state

### 9.3 Edge Cases

| Scenario | Handling |
|----------|----------|
| User tries to register with existing email | Return generic "check your email" (don't reveal if email exists) |
| Multiple rapid login attempts | Rate limit: 5 attempts per 15 minutes |
| Password reset for non-existent email | Return success (don't reveal if email exists) |
| Expired session | Return 401, redirect to login |
| Suspended user tries to login | Return "account suspended, contact support" |
| User has multiple sessions | Allow (configurable max limit) |
| Password reset while logged in | Allow, invalidate all sessions |

---

## 10. API Design

### 10.1 Queries (Read Operations)

```typescript
// Get current authenticated user
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .unique();
  },
});

// Check if email is available (for registration form)
export const isEmailAvailable = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .unique();
    return !existing;
  },
});

// Get user's active sessions (for account settings)
export const getActiveSessions = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .unique();

    if (!user) throw new Error("User not found");

    return await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.gt(q.field("expiresAt"), Date.now()))
      .collect();
  },
});
```

### 10.2 Mutations (Write Operations)

```typescript
// Register new user
export const register = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();

    // Check email uniqueness
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (existing) {
      throw new Error("Email already registered");
    }

    // Hash password
    const passwordHash = await hashPassword(args.password);

    // Create user
    const userId = await ctx.db.insert("users", {
      email,
      passwordHash,
      name: args.name,
      status: "pending_verification",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Generate verification token
    const token = generateSecureToken();
    await ctx.db.insert("emailVerificationTokens", {
      userId,
      token: await hashToken(token),
      email,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      used: false,
      createdAt: Date.now(),
    });

    // Dispatch event
    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "user.registered",
      payload: { userId, email, name: args.name },
    });

    return { userId, verificationToken: token };
  },
});

// Login user
export const login = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (!user) {
      throw new Error("Invalid credentials");
    }

    // Check status
    if (user.status === "suspended") {
      throw new Error("Account suspended. Please contact support.");
    }
    if (user.status === "inactive") {
      throw new Error("Account inactive. Please contact support.");
    }

    // Verify password
    const valid = await verifyPassword(args.password, user.passwordHash);
    if (!valid) {
      throw new Error("Invalid credentials");
    }

    // Create session
    const sessionToken = generateSecureToken();
    await ctx.db.insert("sessions", {
      userId: user._id,
      token: await hashToken(sessionToken),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    });

    // Update last login
    await ctx.db.patch(user._id, { lastLoginAt: Date.now() });

    // Dispatch event (different for admin vs customer)
    const isAdmin = user.roleId && await isAdminRole(ctx, user.roleId);
    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: isAdmin ? "admin.logged_in" : "user.logged_in",
      payload: {
        userId: user._id,
        email: user.email,
        method: "password",
      },
    });

    return { sessionToken, user: sanitizeUser(user) };
  },
});

// Logout user
export const logout = mutation({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .unique();

    if (!user) throw new Error("User not found");

    // Invalidate session
    if (args.sessionToken) {
      const session = await ctx.db
        .query("sessions")
        .withIndex("by_token", (q) => q.eq("token", await hashToken(args.sessionToken)))
        .unique();
      if (session) {
        await ctx.db.delete(session._id);
      }
    }

    // Dispatch event
    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "user.logged_out",
      payload: { userId: user._id, email: user.email },
    });

    return { success: true };
  },
});

// Request password reset
export const requestPasswordReset = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    // Always return success (don't reveal if email exists)
    if (!user) {
      return { success: true };
    }

    // Invalidate existing tokens
    const existingTokens = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const token of existingTokens) {
      await ctx.db.patch(token._id, { used: true });
    }

    // Generate new token
    const resetToken = generateSecureToken();
    await ctx.db.insert("passwordResetTokens", {
      userId: user._id,
      token: await hashToken(resetToken),
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
      used: false,
      createdAt: Date.now(),
    });

    // Dispatch event
    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "user.password_reset_requested",
      payload: { userId: user._id, email: user.email, resetToken },
    });

    return { success: true };
  },
});

// Reset password with token
export const resetPassword = mutation({
  args: {
    token: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const tokenHash = await hashToken(args.token);

    const resetToken = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_token", (q) => q.eq("token", tokenHash))
      .unique();

    if (!resetToken) {
      throw new Error("Invalid or expired reset link");
    }

    if (resetToken.used) {
      throw new Error("This reset link has already been used");
    }

    if (resetToken.expiresAt < Date.now()) {
      throw new Error("This reset link has expired");
    }

    // Update password
    const passwordHash = await hashPassword(args.newPassword);
    await ctx.db.patch(resetToken.userId, {
      passwordHash,
      updatedAt: Date.now(),
    });

    // Mark token as used
    await ctx.db.patch(resetToken._id, { used: true });

    // Invalidate all sessions
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", resetToken.userId))
      .collect();

    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    return { success: true };
  },
});

// Change password (authenticated)
export const changePassword = mutation({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", identity.email))
      .unique();

    if (!user) throw new Error("User not found");

    // Verify current password
    const valid = await verifyPassword(args.currentPassword, user.passwordHash);
    if (!valid) {
      throw new Error("Current password is incorrect");
    }

    // Update password
    const passwordHash = await hashPassword(args.newPassword);
    await ctx.db.patch(user._id, {
      passwordHash,
      updatedAt: Date.now(),
    });

    // Dispatch event
    await ctx.scheduler.runAfter(0, internal.events.dispatch, {
      eventCode: "user.password_changed",
      payload: { userId: user._id, email: user.email },
    });

    return { success: true };
  },
});
```

### 10.3 Actions (External/Async Operations)

```typescript
// Verify email address
export const verifyEmail = action({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const tokenHash = await hashToken(args.token);

    const verificationToken = await ctx.runQuery(
      internal.auth.getVerificationToken,
      { tokenHash }
    );

    if (!verificationToken) {
      throw new Error("Invalid verification link");
    }

    if (verificationToken.used) {
      throw new Error("This link has already been used");
    }

    if (verificationToken.expiresAt < Date.now()) {
      throw new Error("This verification link has expired");
    }

    // Update user
    await ctx.runMutation(internal.auth.markEmailVerified, {
      userId: verificationToken.userId,
      tokenId: verificationToken._id,
    });

    return { success: true };
  },
});
```

---

## 11. Security Considerations

### 11.1 Authentication Requirements

| Route/Action | Requirement |
|--------------|-------------|
| Sign In | Unauthenticated only |
| Sign Up | Unauthenticated only |
| Forgot Password | Unauthenticated only |
| Reset Password | Valid reset token |
| Change Password | Authenticated + current password |
| Logout | Authenticated |

### 11.2 Authorization Rules

- **Guests** can only access auth routes
- **Authenticated users** are redirected away from sign-in/sign-up
- **Session tokens** must be validated on every request
- **Password reset tokens** are single-use and time-limited

### 11.3 Data Privacy

**Sensitive Data Handling:**
- Passwords are never stored in plain text (bcrypt hash only)
- Session tokens are hashed before storage
- Reset tokens are hashed before storage
- Email enumeration is prevented (generic responses)

**GDPR Considerations:**
- Users can request account deletion (Customer Accounts system)
- Email address is PII - encrypt at rest (Convex handles this)
- Login history may be retained for security audits
- Session data is automatically cleaned up on expiry

**Rate Limiting:**
- Login attempts: 5 per 15 minutes per IP
- Password reset requests: 3 per hour per email
- Registration: 3 per hour per IP

---

## 12. Testing Strategy

### 12.1 Unit Tests

- `hashPassword` / `verifyPassword` - Password hashing
- `generateSecureToken` / `hashToken` - Token generation
- `validateEmail` / `validatePassword` - Input validation
- `sanitizeUser` - User object sanitization

### 12.2 Integration Tests

- Registration → Verification email sent
- Login → Session created → Event dispatched
- Password reset flow end-to-end
- Session expiry handling
- Role-based event differentiation (user vs admin login)

### 12.3 E2E Tests

- Complete registration flow
- Login with valid/invalid credentials
- Password reset flow
- Change password from account settings
- Logout clears session
- Protected route redirect to login
- Post-login redirect to intended destination

---

## 13. Implementation Checklist

### Phase 1: Foundation
- [ ] Define schema in `convex/schema.ts`
- [ ] Create helper functions (hash, token generation)
- [ ] Implement `register` mutation
- [ ] Implement `login` mutation
- [ ] Implement `logout` mutation
- [ ] Set up Convex Auth integration

### Phase 2: Core Features
- [ ] Create auth routes (sign-in, sign-up, forgot, reset)
- [ ] Build `SignInForm` component
- [ ] Build `SignUpForm` component
- [ ] Build `ForgotPasswordForm` component
- [ ] Build `ResetPasswordForm` component
- [ ] Implement `AuthLayout` and `AuthCard`

### Phase 3: Integration
- [ ] Wire up Event System (dispatch auth events)
- [ ] Connect Email Notifications (welcome, reset, changed)
- [ ] Connect Site Notifications (welcome, changed)
- [ ] Implement auth context provider
- [ ] Add protected route wrapper

### Phase 4: Polish
- [ ] Add rate limiting
- [ ] Implement password strength indicator
- [ ] Add "remember me" option
- [ ] Handle edge cases (suspended, inactive)
- [ ] Add session management UI
- [ ] Security audit and penetration testing

---

## 14. Future Considerations

### OAuth Integration (Phase 2+)
- Google Sign-In
- Apple Sign-In
- Account linking (OAuth + password)

### Multi-Factor Authentication (Phase 3+)
- TOTP (authenticator apps)
- SMS verification
- Email verification codes

### Advanced Security
- WebAuthn/Passkeys
- Login anomaly detection
- Trusted devices
- Security log viewer

### Enterprise Features
- SAML/SSO integration
- LDAP/Active Directory
- Organization management

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System (Authentication) | [redacted-airtable-record-id] |
| Routes | [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id] |
| Actions | [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id] |
| Events | [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id] |
| Email Notifications | [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id] |
| Site Notifications | [redacted-airtable-record-id], [redacted-airtable-record-id] |

### B. Related Documentation

- [Action Plan](./ACTION-PLAN.md)
- [Event System PRD](./PRD-EVENT-SYSTEM.md)
- [Tech Stack](../.claude/CLAUDE.md)

### C. Password Hashing Reference

```typescript
// Using bcrypt with cost factor 12
import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}
```

### D. Token Generation Reference

```typescript
import { randomBytes, createHash } from "crypto";

export function generateSecureToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
```

---

**PRD Version:** 1.0
**Created:** January 30, 2025
**Last Updated:** January 30, 2025
**Author:** Claude (AI Assistant)
