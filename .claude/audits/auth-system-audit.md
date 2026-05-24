# Auth System - Full Code Review & Audit

**Auditor:** Auth System Expert
**Date:** 2026-02-13
**Knowledge Doc Version:** 2026-02-13
**Scope:** Complete auth system across ConvexPress-Admin, ConvexPress-Website, and Convex backend

---

## Executive Summary

The Auth System is **substantially implemented and well-architected**. The Convex Auth integration is properly configured across both apps, the Convex backend has comprehensive auth helpers with proper security guards, and the frontend auth pages follow the design system correctly. The system demonstrates strong security fundamentals: webhook idempotency, role field protection on user.updated, last-admin protection, self-role-change prevention, and proper JWT dual-issuer configuration.

**Overall PRD Compliance: ~85%**

The remaining 15% consists of Phase 2 headless auth (custom branded login replacing Convex Auth hosted UI), passkey support, session revocation, and end-to-end testing -- all documented as TODO items in the knowledge doc.

### Severity Summary

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 1 | Security concern requiring attention |
| HIGH | 3 | Significant issues affecting correctness or security posture |
| MEDIUM | 6 | Code quality, TypeScript, or minor security concerns |
| LOW | 5 | Minor improvements, documentation, or cleanup items |
| INFO | 3 | Observations and notes (not actionable issues) |

---

## 1. Security Findings

### CRITICAL-1: `recordFailedLogin` Mutation Is Unauthenticated and Unbounded

**File:** `ConvexPress-Admin/packages/backend/convex/authTracking/mutations.ts`, line 139
**Severity:** CRITICAL

The `recordFailedLogin` mutation is a public mutation that requires NO authentication. This is intentionally designed (the user failed to authenticate, so they have no token), but it creates a **denial-of-service and data pollution vector**:

- An attacker can call `recordFailedLogin` at high volume with arbitrary email addresses.
- Each call inserts a document into `failedLoginAttempts` with a 90-day TTL.
- Each call also invokes `emitEvent()` which inserts into the `events` table.
- This can flood the database with fake failed login records, polluting admin dashboards and potentially exhausting Convex write throughput.

**Current state:** There is NO rate limiting on this mutation. The mutation accepts any string as `email`, any valid `reason` enum value, and optional `ip`/`userAgent` strings.

**Recommendation:**
1. Add server-side rate limiting (e.g., track by IP or email within a sliding window, reject if > N attempts in M minutes). Since Convex mutations run server-side, this would need a counter table or scheduled cleanup.
2. Alternatively, move failed login recording to an internal mutation + action pair where the action validates the request context.
3. At minimum, add input sanitization: validate email format, cap string lengths for `description` and `userAgent`.

---

### HIGH-1: Role Slug Mismatch Between `bootstrapAdmin` and `seedRoles`

**File:** `ConvexPress-Admin/packages/backend/convex/users.ts`, lines 100-103 and 261-263
**Severity:** HIGH

The `bootstrapAdmin` mutation looks up the admin role by slug `"administrator"`:
```typescript
const adminRole = await ctx.db
  .query("roles")
  .withIndex("by_slug", (q) => q.eq("slug", "administrator"))
  .unique();
```

But the legacy `seedRoles` function (lines 261-263) seeds the admin role with slug `"administrator"`, while the `internalRole` field uses the string `"admin"`. Meanwhile, the auth helpers in `helpers/auth.ts` check `internalRole === "admin"` (not `"administrator"`).

**Impact:** This dual naming convention (`"admin"` in `internalRole` vs `"administrator"` in `roles.slug`) is acknowledged in the LEGACY_ROLE_MAP system in `helpers/permissions.ts`. However, if `bootstrapAdmin` fails to find the role by slug (returns null), it falls back gracefully (the spread `...(adminRole ? { roleId: adminRole._id } : {})` produces an empty object). The user gets `internalRole: "admin"` but no `roleId`.

**Recommendation:** Ensure the canonical `roles/internals:seedRoles` uses consistent slug naming and that `bootstrapAdmin` uses the same canonical slug. Document the `"admin"` -> `"administrator"` mapping clearly.

---

### HIGH-2: `getLoginHistory` and `getSecurityOverview` Queries Perform Full Table Scans

**File:** `ConvexPress-Admin/packages/backend/convex/authTracking/queries.ts`, lines 71-79 and 206-213
**Severity:** HIGH

Both `getLoginHistory` and `getSecurityOverview` query ALL `auth.login` events and then filter in JavaScript:
```typescript
const loginEvents = await ctx.db
  .query("events")
  .withIndex("by_code", (q) => q.eq("code", "auth.login"))
  .order("desc")
  .collect();    // <-- collects ALL matching events

const userEvents = loginEvents
  .filter((e) => e.actorId === user.clerkUserId)
  .slice(0, limit);
```

**Impact:** `.collect()` loads ALL `auth.login` events into memory, which will grow unbounded over time. In a production system with thousands of logins, this becomes a performance bottleneck and could hit Convex query execution limits.

**Recommendation:** Add a compound index on the events table: `by_code_and_actor` with fields `["code", "actorId"]`. Then query directly:
```typescript
const loginEvents = await ctx.db
  .query("events")
  .withIndex("by_code_and_actor", (q) =>
    q.eq("code", "auth.login").eq("actorId", user.clerkUserId)
  )
  .order("desc")
  .take(limit);
```

---

### HIGH-3: `recordLogin` Mutation Uses Loose Argument Types

**File:** `ConvexPress-Admin/packages/backend/convex/authTracking/mutations.ts`, lines 42-48
**Severity:** HIGH

The `recordLogin` mutation uses `v.optional(v.string())` for `method` and `app`, but the validators file (`validators.ts`) defines proper union validators (`authMethodValidator`, `appIdentifierValidator`). The mutation does not use these validators:

```typescript
// Current (loose):
args: {
  method: v.optional(v.string()),   // accepts any string
  app: v.optional(v.string()),      // accepts any string
  ip: v.optional(v.string()),
  userAgent: v.optional(v.string()),
}

// Should be (strict):
args: {
  method: v.optional(authMethodValidator),
  app: v.optional(appIdentifierValidator),
  ...
}
```

Similarly, `recordLogout` uses `v.optional(v.string())` for `app` instead of `appIdentifierValidator`.

**Impact:** Data quality issue. Invalid values for `method` and `app` can be stored in the events table, complicating analysis and admin dashboards.

**Recommendation:** Use the validators from `validators.ts` in the mutation argument definitions.

---

## 2. PRD Compliance

### Implemented (per Knowledge Doc)

| Feature | Status | Notes |
|---------|--------|-------|
| Convex Auth integration (both apps) | COMPLETE | Properly configured |
| JWT dual-issuer config (auth.config.ts) | COMPLETE | Both issuers present |
| Convex Auth component mount (convex.config.ts) | COMPLETE | |
| Users table with isInternal + internalRole | COMPLETE | Full schema in schema/users.ts |
| Webhook handlers (user.created/updated/deleted) | COMPLETE | With idempotency guard |
| Role field protection on user.updated | COMPLETE | Lines 107-132 of auth.ts |
| Auth helper functions (15+) | COMPLETE | helpers/auth.ts |
| Capability-based permissions (requireCan, etc.) | COMPLETE | helpers/permissions.ts |
| Admin auth gate (_authenticated.tsx) | COMPLETE | checkAdminAccess query |
| Admin callback route (/callback) | COMPLETE | |
| Website login page (/login) | COMPLETE | With error handling |
| Website register page (/register) | COMPLETE | With RegistrationGate |
| Website forgot-password page | COMPLETE | With React 19 useTransition |
| Website callback route (/api/auth/callback) | COMPLETE | |
| Bootstrap admin mutation | COMPLETE | With security guards |
| Update user role mutation | COMPLETE | Self-change prevention + last-admin protection |
| Login/logout event tracking | COMPLETE | Event Dispatcher wired |
| Failed login detection | COMPLETE | failedLoginAttempts table + queries |
| Security dashboard (website) | COMPLETE | /dashboard/security route |
| User impersonation action | COMPLETE | Auth API integration |
| Login error handling (redirect params) | COMPLETE | Convex Auth error detection |
| Auth component library (14 components) | COMPLETE | All present and correct |
| Client-side capability hooks | COMPLETE | useCan, useCanFn, useCanAll, etc. |
| Auth context provider (admin) | COMPLETE | With role resolution |
| Open redirect prevention (useAuthRedirect) | COMPLETE | Thorough validation |

### NOT Implemented (Documented TODO)

| Feature | Knowledge Doc Status | Notes |
|---------|---------------------|-------|
| Custom branded login UI (Phase 2) | TODO | Forms render fields but redirect to the auth system |
| Passkey support | TODO | Depends on Phase 2 |
| Session revocation UI | TODO | Convex Auth Admin SDK endpoint available |
| End-to-end testing | TODO | No test files found |
| auth.logged_in event via Event Dispatcher | Partial | Event codes defined, login tracking works, but "Login from New Device" email/notification not wired |
| auth.logged_out event via Event Dispatcher | Partial | Logout events emitted, but no downstream listeners configured |
| auth.oauth_completed event | NOT WIRED | Event code exists in constants, not emitted |
| auth.session_refreshed event | NOT WIRED | Event code exists in constants, not emitted |

---

## 3. Radix UI Imports

**Result: CLEAN -- No Radix imports found.**

Searched all auth-related files in both `ConvexPress-Website/apps/web/src/components/auth/` and `ConvexPress-Admin/apps/web/src/`. Zero instances of `@radix-ui` imports anywhere in the auth domain.

The auth components use `@/components/ui/button`, `@/components/ui/input`, `@/components/ui/checkbox`, `@/components/ui/card`, and `@/components/ui/label` -- which are local UI components. The UI component directory (`ConvexPress-Website/apps/web/src/components/ui/`) also has no Radix imports.

---

## 4. Hardcoded Colors

**Result: CLEAN -- No hardcoded colors found.**

Searched for `zinc`, `slate`, `gray`, `stone`, `neutral` followed by numeric values across all auth files. Zero instances found.

All auth components properly use:
- CSS variables: `bg-background`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `text-primary`, `text-destructive`, `bg-destructive/10`, `border-destructive/20`, `bg-primary/5`, `bg-primary/10`, `bg-primary/30`, `bg-primary/50`
- Opacity modifiers: `bg-black/40` pattern where needed
- Semantic tokens: `border`, `bg-card`, `bg-muted`

---

## 5. TypeScript Issues

### MEDIUM-1: Multiple `as any` Casts in auth.ts Webhook Handler

**File:** `ConvexPress-Admin/packages/backend/convex/auth.ts`, lines 151-157
**Severity:** MEDIUM

The password change detection in `user.updated` handler uses `as any` casts:
```typescript
password_enabled: (event.data as any).passwordEnabled,
password_changed_at: (event.data as any).passwordChangedAt,
passwordEnabled: (existing as any).passwordEnabled,
passwordChangedAt: (existing as any).lastPasswordChangedAt
```

**Impact:** Type safety gap. These fields may not exist on the types, making it easy to introduce silent bugs if field names change.

**Recommendation:** Create a typed interface for the Convex Auth event data extensions and the user document password fields. Use proper type guards or optional chaining.

---

### MEDIUM-2: `as any` Casts in auth-context.tsx

**File:** `ConvexPress-Admin/apps/web/src/lib/auth-context.tsx`, lines 92-95, 108, 126
**Severity:** MEDIUM

The auth context provider casts query results to `any`:
```typescript
const userRoleId = (currentUser as UserData | null | undefined)?.roleId;
const role = useQuery(
  api.roles.queries.getRole,
  userRoleId ? { roleId: userRoleId as any } : "skip",
);
// ...
const u = currentUser as any;
const r = role as any;
```

**Impact:** Loss of type safety. If the Convex query return types change, these casts will silently allow incorrect data access.

**Recommendation:** Import proper types from the backend package or define shared type interfaces. Use `typeof api.users.getCurrentUser._returnType` or similar Convex-generated types.

---

### MEDIUM-3: `as any` Casts in useCan.ts Website Hook

**File:** `ConvexPress-Website/apps/web/src/hooks/useCan.ts`, lines 58, 66
**Severity:** MEDIUM

```typescript
const role = useQuery(
  api.roles.queries.getRole,
  user?.roleId ? { roleId: user.roleId as any } : "skip",
);
const roleData = role as any;
```

Same issue as MEDIUM-2, duplicated in the website app.

---

## 6. Security Review

### Positive Security Findings

1. **Webhook idempotency** (auth.ts:17-30): The `user.created` handler checks for existing user before delegating to registration. This prevents duplicate user creation on webhook retry.

2. **Role field protection** (auth.ts:107-132): The `user.updated` handler explicitly lists allowed fields and NEVER touches `isInternal` or `internalRole`. This is correctly implemented.

3. **Last-admin protection** (users.ts:172-187): The `updateUserRole` mutation counts remaining admins before allowing demotion. Properly prevents complete admin lockout.

4. **Self-role-change prevention** (users.ts:156-159): Admins cannot change their own role, preventing accidental self-lockout.

5. **Bootstrap admin one-time guard** (users.ts:80-90): The bootstrap mutation checks for existing admin and throws if one exists. Convex serialized mutations prevent race conditions.

6. **Open redirect prevention** (useAuthRedirect.ts:13-43): Comprehensive validation blocks `javascript:`, `data:`, `vbscript:` URIs, protocol-relative URLs, absolute URLs, and encoded bypass attempts.

7. **Email enumeration prevention** (ForgotPasswordForm.tsx:57-63): Always shows success regardless of whether email exists. Even on error, calls `onSuccess()` to prevent timing-based enumeration.

8. **Admin impersonation guards** (authTracking/actions.ts:37-64): Verifies admin status, checks target user exists and is active. All Auth API errors are handled (403, 404, 422).

9. **CSRF protection**: Convex mutations validate JWT on every call. No nonces needed.

10. **SSR session cookie**: Website uses `authMiddleware()` with `AUTH_COOKIE_PASSWORD` for encrypted server-side sessions.

### Security Concerns

#### MEDIUM-4: No Input Length Validation on `recordFailedLogin`

**File:** `ConvexPress-Admin/packages/backend/convex/authTracking/mutations.ts`, line 139
**Severity:** MEDIUM

The `email`, `description`, and `userAgent` fields accept unbounded strings. An attacker could send very large strings (up to Convex's document size limit) to waste storage.

**Recommendation:** Add explicit length limits:
- `email`: max 320 characters (RFC 5321)
- `userAgent`: max 1000 characters
- `description`: max 500 characters

---

#### MEDIUM-5: `getUnreviewedFailedLoginCount` Uses .collect() Instead of .count()

**File:** `ConvexPress-Admin/packages/backend/convex/authTracking/queries.ts`, lines 175-178
**Severity:** MEDIUM

```typescript
const unreviewed = await ctx.db
  .query("failedLoginAttempts")
  .withIndex("by_reviewed", (q) => q.eq("reviewed", false))
  .collect();
return { count: unreviewed.length };
```

This loads ALL unreviewed records into memory just to count them. As failed login records accumulate (90-day retention), this could become expensive.

**Recommendation:** Use Convex's aggregation patterns or add a `.take(1000)` limit with a flag indicating "1000+" when truncated.

---

## 7. React 19 Compatibility

### Positive Finding

The `ForgotPasswordForm` component correctly uses React 19's `useTransition` pattern:
```typescript
const [isPending, startTransition] = useTransition();
// ...
startTransition(async () => {
  await requestPasswordReset({ email: trimmedEmail });
  onSuccess(trimmedEmail);
});
```

This is properly implemented -- the async callback inside `startTransition` is a React 19 feature.

### Concern

#### LOW-1: LoginForm and RegisterForm Still Use `useState` for Loading State

**File:** `ConvexPress-Website/apps/web/src/components/auth/LoginForm.tsx`, lines 34, 41
**File:** `ConvexPress-Website/apps/web/src/components/auth/RegisterForm.tsx`, lines 44, 72
**Severity:** LOW

These forms use `const [isSubmitting, setIsSubmitting] = useState(false)` instead of React 19's `useTransition`. This is fine for Phase 1 (redirect-based auth), but when Phase 2 headless auth is implemented, these should be migrated to `useTransition` for consistent loading state management and automatic batching.

---

## 8. UI Pattern Review

### Positive Findings

1. **AuthPageLayout** is properly structured as a centered card layout with dynamic site branding (fetches site title from settings).

2. **All auth pages use `noindex` meta tags** -- correct for login/register/forgot-password.

3. **Auth routes redirect authenticated users** -- both login and register pages check `getAuth()` in their loaders and redirect to `/` if already authenticated.

4. **RegistrationGate** properly handles all states: loading, open registration, invite-only with valid/invalid tokens, and closed registration. Real-time reactive updates via Convex subscriptions.

5. **Password strength indicator** uses CSS variables for colors, not hardcoded values.

6. **Error messages use semantic components** (AuthError with role="alert" for accessibility).

### Concern

#### LOW-2: Terms of Service and Privacy Policy Links Are Placeholder

**File:** `ConvexPress-Website/apps/web/src/components/auth/RegisterForm.tsx`, lines 229, 236
**Severity:** LOW

Both links use `href="#"`:
```html
<a href="#" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
  Terms of Service
</a>
```

These should eventually link to actual pages.

---

## 9. Convex Best Practices Review

### Positive Findings

1. **Modular schema**: Auth-related tables are properly separated into `schema/users.ts`, `schema/roles.ts`, and `schema/authTracking.ts`.

2. **Index usage**: All auth queries use proper indexes (`by_clerkUserId`, `by_email`, `by_internal_role`, `by_is_internal`, `by_status`, `by_slug`).

3. **Idempotent operations**: Bootstrap admin, webhook handlers, and login tracking all handle re-execution gracefully.

4. **Event Dispatcher integration**: Login, logout, failed login, and role changes all emit events via `emitEvent()`.

5. **Internal mutations for CLI use**: `setAdminByEmail` and `setCustomerByEmail` are properly `internalMutation` -- not callable from clients.

6. **Function organization**: Auth tracking has its own directory (`authTracking/`) with mutations, queries, actions, internals, and validators files.

### Concerns

#### MEDIUM-6: Duplicate `getCurrentUser` and `requireAuth` Functions

**Files:**
- `ConvexPress-Admin/packages/backend/convex/helpers/auth.ts` (lines 14-23, 30-34)
- `ConvexPress-Admin/packages/backend/convex/helpers/permissions.ts` (lines 93-107, 455-472)

**Severity:** MEDIUM

Both `helpers/auth.ts` and `helpers/permissions.ts` export their own versions of `getCurrentUser` and `requireAuth`. They have slightly different implementations:

- `auth.ts` `requireAuth`: Throws plain `Error("Authentication required")`, does NOT check user status.
- `permissions.ts` `requireAuth`: Throws `ConvexError({ code: "UNAUTHORIZED" })`, DOES check `user.status !== "active"`.

This is a correctness concern: callers importing from `helpers/auth.ts` will NOT get the active status check. If a user is banned or inactive, `auth.ts` `requireAuth` will still let them through.

**Recommendation:** Consolidate to a single `requireAuth` implementation in one file, preferably the `permissions.ts` version (which includes the status check). Have `helpers/auth.ts` re-export from `permissions.ts`.

---

#### LOW-3: `users.ts` Imports `getCurrentUser` from `helpers/auth.ts`

**File:** `ConvexPress-Admin/packages/backend/convex/users.ts`, line 4

```typescript
import {
  getCurrentUser as getUser,
  requireAdmin,
  requireAuth,
} from "./helpers/auth";
```

This imports from `helpers/auth.ts` which has the version WITHOUT status checking. The `checkAdminAccess` query (line 42) and other functions in this file get the non-status-checking version.

**Impact:** A user with `status: "banned"` could potentially still pass `checkAdminAccess` if their `isInternal` flag is still `true`. The query would return their admin data.

**Recommendation:** Import from `helpers/permissions.ts` or add explicit status checking in `checkAdminAccess`.

---

#### LOW-4: Validators Defined But Not Used in Mutations

**File:** `ConvexPress-Admin/packages/backend/convex/authTracking/validators.ts`
**Severity:** LOW

The validators file defines `recordLoginArgs`, `recordLogoutArgs`, and `recordFailedLoginArgs`, but the actual mutations in `mutations.ts` define their own inline arg schemas instead of using these validators. The validators are dead code.

**Recommendation:** Either use the validators in the mutation definitions or remove the duplicated definitions.

---

## 10. Import Verification

### All Critical Imports Resolve

| Import | File | Status |
|--------|------|--------|
| `@convex-dev/auth-authkit` | auth.ts | OK |
| `@convex-dev/auth` | admin main.tsx | OK |
| `@auth-inc/authkit-react` | admin main.tsx, callback.tsx, _authenticated.tsx, header.tsx | OK |
| `@auth/authkit-tanstack-react-start` | website start.ts, __root.tsx, login.tsx, register.tsx, forgot-password.tsx, callback.tsx | OK |
| `@auth/authkit-tanstack-react-start/client` | website header.tsx, useLoginTracker.ts | OK |
| `./helpers/auth` | users.ts, authTracking/mutations.ts, authTracking/queries.ts | OK |
| `./helpers/permissions` | (used by other systems) | OK |
| `./helpers/password` | auth.ts | OK (file exists at helpers/password.ts) |
| `./helpers/events` | users.ts, authTracking/mutations.ts | OK |
| `./events/constants` | users.ts, authTracking/mutations.ts | OK |
| `../registration/internals` | auth.ts (user.created handler) | OK (delegated via scheduler) |
| `../password/internals` | auth.ts (user.updated handler) | OK (delegated via scheduler) |
| `@convexpress-admin/backend/convex/_generated/api` | admin _authenticated.tsx, header.tsx | OK |
| `@convexpress-website/backend/convex/_generated/api` | website login.tsx, LoginTracker.tsx, useCan.ts, etc. | OK |
| `@/lib/auth-context` | Multiple admin files | OK |
| `@/lib/auth/types` | Website hooks and components | OK |
| `@/lib/auth/auth` | Website useCan.ts | OK |

---

## 11. Event Wiring Status

| Event Code | Defined in Constants | Emitted in Code | Listeners Configured |
|------------|---------------------|-----------------|---------------------|
| `auth.login` | YES | YES (recordLogin) | Partial (no email/site notification) |
| `auth.logout` | YES | YES (recordLogout) | No listeners |
| `auth.session_refreshed` | YES | NO | N/A |
| `auth.oauth_completed` | YES | NO | N/A |
| `auth.email_verified` | YES | Implicit (webhook) | N/A |
| `auth.login_failed` | YES | YES (recordFailedLogin) | Partial (no email/site notification) |
| `role.assigned` | YES | YES (updateUserRole) | No listeners |

---

## 12. Naming Collision Note (INFO)

### INFO-1: Two `useAuth()` Hooks in Admin App

The admin app has two different `useAuth()` hooks:
1. `@auth-inc/authkit-react` `useAuth()` -- for Convex Auth auth state (signIn, signOut, user, isLoading)
2. `@/lib/auth-context` `useAuth()` -- for capability checking (can, canAccessRoute, role)

This is by design and not a bug. Import paths differentiate them. However, developers must be careful to import from the correct source. Consider renaming the auth-context hook to `useAuthContext()` or `usePermissions()` for clarity.

### INFO-2: `seedRoles` in `users.ts` Is Legacy

The `seedRoles` function in `users.ts` (line 254) is documented as legacy and preserved for backward compatibility. The canonical seed function is `roles/internals:seedRoles`. The legacy version seeds only 5 roles (missing "Support") and uses empty `capabilities[]` and `pageAccess[]` arrays.

### INFO-3: Event Codes Use Different Formats

The Airtable blueprint defines event codes like `auth.logged_in` (past tense), but the `events/constants.ts` file uses `auth.login` (present tense). The knowledge doc acknowledges this -- the constants file is the canonical source for the implementation, and the Airtable codes are the design reference.

---

## 13. Files Audited

### Convex Backend (ConvexPress-Admin/packages/backend/convex/)
- `auth.config.ts` -- JWT issuer configuration
- `auth.ts` -- Convex Auth event handlers (user.created/updated/deleted)
- `convex.config.ts` -- Convex Auth component mount
- `http.ts` -- Webhook HTTP routes + REST API
- `users.ts` -- User queries and mutations (getCurrentUser, checkAdminAccess, bootstrapAdmin, updateUserRole, seedRoles, setAdminByEmail, setCustomerByEmail)
- `helpers/auth.ts` -- Auth helper functions (15+)
- `helpers/permissions.ts` -- Capability-based permission system
- `schema/users.ts` -- Users table schema
- `schema/roles.ts` -- Roles table schema
- `schema/authTracking.ts` -- Failed login attempts schema
- `authTracking/mutations.ts` -- recordLogin, recordLogout, recordFailedLogin, markFailedLoginReviewed
- `authTracking/queries.ts` -- getAuthInfo, getLoginHistory, getFailedLoginAttempts, getUnreviewedFailedLoginCount, getSecurityOverview
- `authTracking/actions.ts` -- getImpersonationUrl
- `authTracking/internals.ts` -- getAdminAndTargetUser
- `authTracking/validators.ts` -- Shared argument validators
- `events/constants.ts` -- Auth event code definitions

### Admin App Frontend (ConvexPress-Admin/apps/web/src/)
- `main.tsx` -- AuthKitProvider + ConvexProviderWithAuthKit setup
- `routes/_authenticated.tsx` -- Admin auth gate + login tracking
- `routes/callback.tsx` -- OAuth callback route
- `components/header.tsx` -- Sign In/Out controls
- `lib/auth-context.tsx` -- Full auth context provider with capability checking

### Website App Frontend (ConvexPress-Website/apps/web/src/)
- `start.ts` -- authMiddleware configuration
- `routes/__root.tsx` -- AuthKitProvider + LoginTracker
- `routes/login.tsx` -- Login page with error handling
- `routes/register.tsx` -- Registration page with gate
- `routes/forgot-password.tsx` -- Forgot password with useTransition
- `routes/api/auth/callback.tsx` -- Server callback handler
- `routes/dashboard/security.tsx` -- Security overview page
- `components/header.tsx` -- Auth controls with logout tracking
- `components/auth/AuthPageLayout.tsx`
- `components/auth/OAuthButtons.tsx`
- `components/auth/AuthDivider.tsx`
- `components/auth/LoginForm.tsx`
- `components/auth/RegisterForm.tsx`
- `components/auth/ForgotPasswordForm.tsx`
- `components/auth/ForgotPasswordSuccess.tsx`
- `components/auth/PasswordStrengthIndicator.tsx`
- `components/auth/RegistrationGate.tsx`
- `components/auth/RegistrationClosedMessage.tsx`
- `components/auth/InvitationRequiredMessage.tsx`
- `components/auth/InvitationInvalidMessage.tsx`
- `components/auth/AuthError.tsx`
- `components/auth/AuthLink.tsx`
- `components/auth/LoginTracker.tsx`
- `hooks/useLoginTracker.ts`
- `hooks/useAuthRedirect.ts`
- `hooks/usePasswordStrength.ts`
- `hooks/useRegistrationGate.ts`
- `hooks/useInvitationValidation.ts`
- `hooks/useCan.ts`
- `lib/auth/types.ts`
- `lib/auth/auth.ts`

**Total files audited: 50**

---

## 14. Prioritized Recommendations

### Must Fix (Security)

1. **CRITICAL-1**: Add rate limiting or input validation to `recordFailedLogin` mutation to prevent DoS via unauthenticated database writes.

### Should Fix (Correctness)

2. **MEDIUM-6 + LOW-3**: Consolidate `getCurrentUser`/`requireAuth` to use the `permissions.ts` version that includes status checking. Ensure `checkAdminAccess` rejects banned/inactive users.

3. **HIGH-2**: Add a compound index for `events` table to enable efficient login history queries per user. Replace `.collect()` with `.take(limit)` using indexed queries.

4. **HIGH-3**: Use the existing validators from `validators.ts` in `recordLogin` and `recordLogout` mutation args.

### Nice to Have (Quality)

5. **MEDIUM-1/2/3**: Reduce `as any` casts by creating proper type interfaces for Convex Auth event data and Convex query results.

6. **HIGH-1**: Verify and document the `"admin"` vs `"administrator"` slug mapping is consistently handled.

7. **MEDIUM-4**: Add string length limits on `recordFailedLogin` inputs.

8. **MEDIUM-5**: Optimize `getUnreviewedFailedLoginCount` to avoid `.collect()`.

9. **LOW-4**: Either use or remove the dead validators in `validators.ts`.

10. **INFO-1**: Consider renaming `useAuth()` in `auth-context.tsx` to `usePermissions()` to avoid confusion with the auth system `useAuth()`.
