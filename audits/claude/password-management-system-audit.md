# Password Management System - Full Audit Report

**Auditor:** Password Management System Expert
**Date:** 2026-02-13
**Scope:** Full code review and audit of all Password Management System files
**Status:** AUDIT ONLY - No code modifications made

---

## Executive Summary

The Password Management System is **well-implemented** with a solid architecture that correctly delegates all cryptographic operations to the auth system. The codebase demonstrates strong security awareness, clean separation of concerns, and good adherence to the PRD. However, there are several findings that require attention, including **two CRITICAL security issues**, several MEDIUM-priority gaps, and a handful of LOW-priority improvements.

**Overall Assessment:** 78% PRD compliance. Core backend is strong; frontend has gaps.

### Severity Summary

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 2 | Security and data integrity issues |
| HIGH | 3 | Significant functional gaps |
| MEDIUM | 7 | Non-trivial gaps or code quality issues |
| LOW | 6 | Minor improvements and polish |

---

## Files Reviewed

### Backend (Convex Functions)

| File | Path | Status |
|------|------|--------|
| mutations.ts | `ConvexPress-Admin/packages/backend/convex/password/mutations.ts` | Implemented |
| actions.ts | `ConvexPress-Admin/packages/backend/convex/password/actions.ts` | Implemented |
| queries.ts | `ConvexPress-Admin/packages/backend/convex/password/queries.ts` | Implemented |
| internals.ts | `ConvexPress-Admin/packages/backend/convex/password/internals.ts` | Implemented |
| validators.ts | `ConvexPress-Admin/packages/backend/convex/password/validators.ts` | Implemented |
| helpers/password.ts | `ConvexPress-Admin/packages/backend/convex/helpers/password.ts` | Implemented |

### Schema

| File | Path | Status |
|------|------|--------|
| users.ts | `ConvexPress-Admin/packages/backend/convex/schema/users.ts` | All 3 password fields present |

### Event Integration

| File | Path | Status |
|------|------|--------|
| events/constants.ts | `ConvexPress-Admin/packages/backend/convex/events/constants.ts` | 3 password events defined |
| auth.ts (webhook) | `ConvexPress-Admin/packages/backend/convex/auth.ts` | Password detection integrated |
| bootstrap/registerListeners.ts | `ConvexPress-Admin/packages/backend/convex/bootstrap/registerListeners.ts` | 3 listeners registered |
| emails/internals.ts | `ConvexPress-Admin/packages/backend/convex/emails/internals.ts` | 2 email handlers implemented |
| emails/templateDefaults.ts | `ConvexPress-Admin/packages/backend/convex/emails/templateDefaults.ts` | 2 templates defined |
| helpers/auditDescriptions.ts | `ConvexPress-Admin/packages/backend/convex/helpers/auditDescriptions.ts` | 2 of 3 events covered |

### Admin Frontend

| File | Path | Status |
|------|------|--------|
| ResetPasswordButton.tsx | `ConvexPress-Admin/apps/web/src/components/password/ResetPasswordButton.tsx` | Implemented |
| User Edit page | `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/users/$userId/edit.tsx` | Integrated |

### Website Frontend

| File | Path | Status |
|------|------|--------|
| ForgotPasswordForm.tsx | `ConvexPress-Website/apps/web/src/components/auth/ForgotPasswordForm.tsx` | Implemented |
| ForgotPasswordSuccess.tsx | `ConvexPress-Website/apps/web/src/components/auth/ForgotPasswordSuccess.tsx` | Implemented |
| PasswordStrengthIndicator.tsx | `ConvexPress-Website/apps/web/src/components/auth/PasswordStrengthIndicator.tsx` | Implemented |
| usePasswordStrength.ts | `ConvexPress-Website/apps/web/src/hooks/usePasswordStrength.ts` | Implemented |
| PasswordLastChanged.tsx | `ConvexPress-Website/apps/web/src/components/password/PasswordLastChanged.tsx` | Implemented |
| PasswordSection.tsx | `ConvexPress-Website/apps/web/src/components/password/PasswordSection.tsx` | Thin re-export only |
| PasswordChangeSection.tsx | `ConvexPress-Website/apps/web/src/components/dashboard/settings/PasswordChangeSection.tsx` | Implemented |
| forgot-password.tsx (route) | `ConvexPress-Website/apps/web/src/routes/forgot-password.tsx` | Implemented |
| reset-password.tsx (route) | `ConvexPress-Website/apps/web/src/routes/reset-password.tsx` | PLACEHOLDER |

### Email Templates

| File | Path | Status |
|------|------|--------|
| emails/password-reset-request.tsx | Not created | MISSING (inline HTML in templateDefaults.ts) |
| emails/password-changed.tsx | Not created | MISSING (inline HTML in templateDefaults.ts) |

---

## CRITICAL Findings

### CRIT-1: Password Change Detection Fires for ALL user.updated Webhooks (FALSE POSITIVES)

**File:** `ConvexPress-Admin/packages/backend/convex/auth.ts` (lines 134-172)
**Severity:** CRITICAL - Security / Data Integrity

The `user.updated` webhook handler calls `detectPasswordChange()` to determine if a password change occurred. However, the `detectPasswordChange` helper in `helpers/password.ts` returns `false` when it cannot confirm a password change from the payload alone. When it returns `false`, the webhook handler **does nothing** -- there is no fallback to the timestamp heuristic.

This means **password changes that do not include `password_changed_at` or `password_enabled` in the webhook payload will go completely undetected**. No `password.changed` event, no `password.reset_completed` event, no audit trail, no confirmation email.

The PRD explicitly specifies a two-tier approach:
1. Payload inspection (the current `detectPasswordChange` helper)
2. Timestamp-based heuristic fallback (`detectAndHandlePasswordChange` internal mutation)

But the webhook handler only calls `detectAndHandlePasswordChange` when `payloadIndicatesPasswordChange` is `true` -- which defeats the purpose of having a fallback. When payload detection is uncertain (returns `false`), the handler should ALSO call `detectAndHandlePasswordChange` as the fallback tier.

**Current code (auth.ts lines 162-172):**
```typescript
if (payloadIndicatesPasswordChange) {
  await ctx.scheduler.runAfter(
    0,
    internal.password.internals.detectAndHandlePasswordChange,
    { userId: existing._id, externalAuthId: event.data.id },
  );
}
// BUG: No else branch -- silent failure for undetectable password changes
```

**Expected behavior per PRD:** The `detectAndHandlePasswordChange` should ALWAYS be called as a fallback when payload detection is uncertain. Alternatively, the handler should always call it and let the heuristic sort it out.

**Impact:** Password changes via Convex Auth may go completely unrecorded, resulting in:
- Missing audit log entries (security gap)
- No "Password Changed Confirmation" email sent
- `lastPasswordChangedAt` field not updated
- Incorrect data shown in admin dashboard

---

### CRIT-2: Auth API Key Exposed in Environment Without Validation

**File:** `ConvexPress-Admin/packages/backend/convex/password/actions.ts` (line 48)
**Severity:** CRITICAL - Security

In the `requestPasswordReset` action (the **public, unauthenticated** forgot-password flow), the Auth API key is accessed via `process.env.AUTH_API_KEY`. If this key is missing:

```typescript
const authApiKey = process.env.AUTH_API_KEY;
if (authApiKey) {
  // ... call Convex Auth
}
// If no API key, silently skip Convex Auth call
```

The action silently skips the Convex Auth call and only records the request internally. This means:
- In production with a misconfigured environment, **no password reset email is ever sent** but the system appears to work fine (user sees success message, audit event is logged).
- There is **no alerting or logging** when the API key is missing.
- The `adminResetUserPassword` action correctly throws `ConvexError("Auth API key is not configured")` when the key is missing, but the public action does not.

While the silent behavior in `requestPasswordReset` is partially justified by email enumeration prevention, the system should at minimum **log a warning** so operators know the integration is broken.

---

## HIGH Findings

### HIGH-1: `password.reset_completed` Event Missing from Audit Descriptions

**File:** `ConvexPress-Admin/packages/backend/convex/helpers/auditDescriptions.ts`
**Severity:** HIGH - Audit Trail Gap

The audit descriptions map covers `password.changed` and `password.reset_requested` but **does NOT include `password.reset_completed`**. This means when a user completes a password reset, the audit log either:
- Shows a generic/fallback description instead of the specific "Password reset completed by {user}" message
- Or fails to render properly in the audit log UI

The PRD specifies all three events should have audit log entries with specific messages.

**Missing entry:**
```typescript
"password.reset_completed": {
  action: "Completed Password Reset",
  template: (p) => `completed a password reset`,
},
```

---

### HIGH-2: `password.reset_completed` Missing Dedicated Event Listener Registration

**File:** `ConvexPress-Admin/packages/backend/convex/bootstrap/registerListeners.ts`
**Severity:** HIGH - Event Processing Gap

The listener registration includes:
- `password.*` wildcard for site notifications (catches all three events)
- `password.reset_requested` for email (password reset link)
- `password.changed` for email (password changed confirmation)

But there is **no listener for `password.reset_completed`**. Per PRD Edge Case #9:

> "The 'Password Changed Confirmation' email (triggered by `password.changed`) should also be sent when a password is reset (triggered by `password.reset_completed`). The event handler for `password.reset_completed` should consider also emitting `password.changed` or the email notification handler should listen to both events."

Without a dedicated listener or a dual-emit pattern, users who reset their password via the forgot-password flow will NOT receive the "Password Changed Confirmation" email.

---

### HIGH-3: Reset Password Route is a Non-Functional Placeholder

**File:** `ConvexPress-Website/apps/web/src/routes/reset-password.tsx`
**Severity:** HIGH - Functional Gap

The `/reset-password` route is a placeholder that displays:
> "Convex Auth is handling your password reset. Please check your email for a reset link."

This is incorrect. The reset-password page is where users land AFTER clicking the link in their email. Convex Auth should either:
1. Handle the entire flow via its hosted pages (in which case this route is unnecessary)
2. Provide a headless component that this page renders (the intended future state per the comment in the code)

Currently, if a user clicks a reset link that routes to `/reset-password`, they see a useless message instead of a password reset form. This works correctly ONLY if Convex Auth is configured to use its own hosted pages and never redirects to this route.

**Risk:** If Convex Auth is configured with `redirect_uri` pointing to `/reset-password`, the password reset flow is broken.

---

## MEDIUM Findings

### MED-1: Excessive `as any` Type Assertions in Backend Code

**Files:** `queries.ts`, `mutations.ts`, `internals.ts`
**Severity:** MEDIUM - TypeScript Safety

There are **8 instances** of `(user as any)` or `(role as any)` across the password backend files:

1. `internals.ts:58` - `(user as any).passwordResetRequestedAt`
2. `mutations.ts:128` - `(user as any).passwordResetCount`
3. `queries.ts:63` - `(currentUser as any).internalRole`
4. `queries.ts:85` - `(targetUser as any).lastPasswordChangedAt`
5. `queries.ts:86` - `(targetUser as any).passwordResetRequestedAt`
6. `queries.ts:87` - `(targetUser as any).passwordResetCount`
7. `queries.ts:137` - `(role as any).status`
8. `queries.ts:138` - `(role as any).level`

These fields are ALL defined in the schema (`schema/users.ts` lines 106-108). The `as any` casts indicate that either:
- The Convex type generation (`_generated/dataModel.ts`) is out of date
- Or the code was written before the schema was updated

These casts bypass TypeScript's type safety and mask potential bugs (e.g., accessing `user.passwordResetCount` on a user object that actually does not have this field because the schema has drifted).

**Fix:** Run `npx convex codegen` to regenerate types, then remove all `as any` casts. If the fields are truly optional in the schema (which they are -- `v.optional()`), the correct approach is optional chaining: `user.passwordResetCount ?? 0`.

---

### MED-2: Forgot Password Route Redirects to `/` Instead of `/dashboard/settings`

**File:** `ConvexPress-Website/apps/web/src/routes/forgot-password.tsx` (line 27)
**Severity:** MEDIUM - PRD Non-Compliance

The PRD states:
> "Redirects authenticated users to `/dashboard/settings`."

But the actual implementation redirects to `/`:
```typescript
if (user) {
  throw redirect({ to: "/" });
}
```

This means authenticated users who navigate to `/forgot-password` land on the homepage instead of the settings page where they can change their password.

---

### MED-3: `getPasswordStatus` Query Uses Wrong Index Name

**File:** `ConvexPress-Admin/packages/backend/convex/password/queries.ts` (line 76)
**Severity:** MEDIUM - Potential Query Failure

The query uses `by_clerkUserId` index:
```typescript
targetUser = await ctx.db
  .query("users")
  .withIndex("by_clerkUserId", (q) =>
    q.eq("clerkUserId", identity.subject),
  )
  .unique();
```

The schema (`schema/users.ts` line 118) defines this index as `by_clerkUserId` and the field as `clerkUserId`. This appears correct. However, the Knowledge Doc section "Indexes" (line 161) references a `by_externalAuthId` index on a `externalAuthId` field, which is a naming discrepancy. The code matches the actual schema, but future maintenance could be confused by the knowledge doc discrepancy.

No actual bug here, but the knowledge doc should be updated for consistency.

---

### MED-4: `requestPasswordReset` Action Has No Input Sanitization Beyond trim/toLowerCase

**File:** `ConvexPress-Admin/packages/backend/convex/password/actions.ts` (lines 41-77)
**Severity:** MEDIUM - Security Hardening

The action accepts an email string and performs `trim().toLowerCase()`. There is no:
- Length limit on the email string (could be abused with extremely long strings)
- Format validation (the action sends any string to the auth system)
- Rate limiting at the ConvexPress level (Convex Auth handles its own rate limiting, but there is no protection against a caller flooding the Convex action itself)

While Convex Auth provides its own rate limiting, an attacker could flood the ConvexPress action to create excessive audit log entries and events in the Convex database.

---

### MED-5: PasswordChangeSection Uses Incorrect OAuth Detection Heuristic

**File:** `ConvexPress-Website/apps/web/src/components/dashboard/settings/PasswordChangeSection.tsx` (lines 41-44)
**Severity:** MEDIUM - UX Bug

```typescript
const isOAuthOnly =
  passwordStatus &&
  passwordStatus.lastPasswordChangedAt === null &&
  passwordStatus.passwordResetCount === 0;
```

This incorrectly identifies ANY user who has never changed their password as "OAuth-only". A user who registered with email/password but never changed their password will see the "You signed in with an external provider" message and an "Add Password" button instead of "Change Password."

The PRD acknowledges this limitation and suggests using the auth system's `password_enabled` field. The current heuristic is too aggressive.

---

### MED-6: `handlePasswordChanged` Does Not Verify User Exists Before Emitting Event

**File:** `ConvexPress-Admin/packages/backend/convex/password/mutations.ts` (lines 88-106)
**Severity:** MEDIUM - Code Quality

While the mutation does check `if (!user) return;` at line 92, it then proceeds to `ctx.db.patch(args.userId, ...)` at line 95. If the patch succeeds but the user was deleted between the `get` and `patch` calls (extremely unlikely race condition in Convex's transactional model, but still a defensive programming gap), the event would be emitted with `userId` referencing a non-existent document.

In practice, Convex transactions prevent this scenario. This is a minor code quality note, not a functional bug.

---

### MED-7: Email Template for Password Reset Sends `payload.resetUrl` But Mutations Don't Include It

**File:** `ConvexPress-Admin/packages/backend/convex/emails/internals.ts` (line 841)
**Severity:** MEDIUM - Email Functionality Gap

The `onPasswordResetRequested` email handler passes `reset_url: payload.resetUrl ?? ""` as a template variable. But the `recordResetRequest` mutation (which creates the event) only includes `{ email, userId }` in the event payload -- there is no `resetUrl` field.

This means the password reset email template will have an empty `{reset_url}` placeholder, rendering the "Reset Password" button non-functional. Convex Auth sends its own reset email, so this is a secondary email, but if `sendPasswordResetEmail` is enabled, users would receive a broken email.

---

## LOW Findings

### LOW-1: Missing `nofollow` in Robot Meta Tags

**File:** `ConvexPress-Website/apps/web/src/routes/forgot-password.tsx` (line 13)
**Severity:** LOW - SEO

The PRD specifies `noindex, nofollow`, but the route only sets `noindex`:
```typescript
meta: [{ name: "robots", content: "noindex" }]
```

Same issue in `reset-password.tsx` (line 10). Should be `content: "noindex, nofollow"`.

---

### LOW-2: PasswordSection.tsx Is a Thin Re-Export, Not a Self-Contained Component

**File:** `ConvexPress-Website/apps/web/src/components/password/PasswordSection.tsx`
**Severity:** LOW - Architecture

The PRD checklist calls for a `PasswordSection.tsx` component that wraps password management UI. The actual file is just:
```typescript
export { PasswordLastChanged } from "./PasswordLastChanged";
```

The real implementation lives in `PasswordChangeSection.tsx` (under `dashboard/settings/`). This is not a bug but a structural deviation from the PRD's file manifest.

---

### LOW-3: Forgot Password Page Has Duplicate "Back to Sign In" Link

**File:** `ConvexPress-Website/apps/web/src/routes/forgot-password.tsx` (lines 46-54)
**Severity:** LOW - UX Polish

When the form is showing (before submission), there are two elements that link back to login:
1. The `<AuthLink to="/login">Back to Sign In</AuthLink>` on line 51 (inside the route component)
2. The `ForgotPasswordSuccess` component's own "Back to Sign In" link (line 41 of `ForgotPasswordSuccess.tsx`)

After submission, only the success component's link shows. Before submission, only the route's link shows. This is correct behavior. No actual duplication.

**Revised assessment:** False positive. Deleting this finding.

---

### LOW-3 (revised): Email Template Uses Inline Styles with Hardcoded Hex Colors

**File:** `ConvexPress-Admin/packages/backend/convex/emails/templateDefaults.ts` (lines 255-302)
**Severity:** LOW - Consistency

The email HTML templates for password reset and password changed use hardcoded hex colors (`#18181b`, `#374151`, `#6b7280`, `#dc2626`). This is standard practice for HTML emails (CSS variables don't work in email clients) and is NOT a violation of the "no hardcoded colors" rule, which applies to Tailwind CSS in the UI components.

No action needed. Noting for completeness.

---

### LOW-4: `formatRelativeDate` Function Has No Server/Client Timezone Consideration

**File:** `ConvexPress-Website/apps/web/src/components/password/PasswordLastChanged.tsx` (lines 47-66)
**Severity:** LOW - UX

The `formatRelativeDate` function uses `Date.now()` on the client side, which is correct for relative time ("5 minutes ago"). However, for absolute dates (`toLocaleDateString`), it uses the browser's locale. This is standard behavior, but if the user's browser timezone differs from their expectation, the date might appear off by a day.

No fix needed -- this is standard web behavior. Noting for completeness.

---

### LOW-5: `CLEANUP_THRESHOLD_MS` and `CLEANUP_BATCH_SIZE` Constants Are Unused

**File:** `ConvexPress-Admin/packages/backend/convex/password/validators.ts` (lines 19-22)
**Severity:** LOW - Dead Code

```typescript
export const CLEANUP_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;
export const CLEANUP_BATCH_SIZE = 100;
```

These constants are defined but never imported or used anywhere. The knowledge doc acknowledges that no cleanup cron is needed because the password system doesn't have its own table. These should be removed to avoid confusion.

---

### LOW-6: `PASSWORD_SETTINGS_DEFAULTS` Is Defined But Not Used in Any Runtime Path

**File:** `ConvexPress-Admin/packages/backend/convex/password/validators.ts` (lines 27-34)
**Severity:** LOW - Dead Code (Partial)

The `PASSWORD_SETTINGS_DEFAULTS` object is imported and used by `helpers/password.ts` (`getPasswordResetSettings` function). However, `getPasswordResetSettings` itself is never called from any mutation, action, or query. The email handlers in `emails/internals.ts` send emails unconditionally without checking the settings. This means the `sendPasswordResetEmail` and `sendPasswordChangedEmail` toggles have no effect.

**Impact:** Email settings are defined in the knowledge doc but not enforced. Password emails are always sent regardless of settings.

---

## Compliance Check Results

### Radix UI Imports
**Result: PASS** - Zero `@radix-ui` imports found in any password system file.

### Hardcoded Colors
**Result: PASS** - All UI components use CSS variable-based colors (`text-foreground`, `text-muted-foreground`, `bg-card`, `bg-muted/50`, `bg-primary`, `bg-destructive`, etc.). No zinc, slate, gray, or hardcoded Tailwind color names.

### TypeScript Issues
**Result: PARTIAL PASS** - 8 `as any` type assertions found in backend code (see MED-1). No other TypeScript errors detected.

### Broken Imports
**Result: PASS** - All imports resolve to existing files and modules. The `@convexpress-admin/backend/convex/_generated/api` and `@convexpress-website/backend/convex/_generated/api` import paths are correct for the monorepo structure.

### React 19 Compatibility
**Result: PASS** - No deprecated patterns found. Uses `useState`, `useTransition`, `useMemo` correctly. No class components. No `forwardRef` (which is still valid in React 19 but discouraged for new code).

### Convex Best Practices
**Result: MOSTLY PASS** - Proper use of `internalMutation` for non-client-callable functions, correct index usage, events emitted via the canonical `emitEvent` helper, scheduler used appropriately. The `as any` casts are the main deviation.

### Security Assessment
**Result: PARTIAL PASS** - See CRIT-1 and CRIT-2 above. The core security design (Convex Auth handles all cryptography, ConvexPress never stores/hashes passwords) is sound. Email enumeration prevention is correctly implemented. Admin password reset correctly limits to triggering reset emails only (cannot view/set passwords).

---

## PRD Compliance Matrix

### Backend Implementation Checklist

| PRD Item | Status | Notes |
|----------|--------|-------|
| `convex/password/mutations.ts` - 4 internal mutations | COMPLETE | All 4 implemented correctly |
| `convex/password/actions.ts` - `adminResetUserPassword` | COMPLETE | Plus `requestPasswordReset` (bonus) |
| `convex/password/queries.ts` - `getPasswordStatus` | COMPLETE | Plus 3 internal queries |
| `convex/schema.ts` - 3 password fields on users | COMPLETE | All in `schema/users.ts` |
| `convex/http.ts` - Password change detection in webhook | PARTIAL | Integrated in `auth.ts` but fallback heuristic not triggered (CRIT-1) |

### Admin Frontend Checklist

| PRD Item | Status | Notes |
|----------|--------|-------|
| `ResetPasswordButton.tsx` | COMPLETE | Well-implemented with status display |
| Integration into user edit page | COMPLETE | Proper section with description text |

### Website Frontend Checklist

| PRD Item | Status | Notes |
|----------|--------|-------|
| `forgot-password.tsx` route | COMPLETE | Proper redirect for auth users (wrong target - MED-2) |
| `reset-password.tsx` route | PLACEHOLDER | Non-functional placeholder (HIGH-3) |
| `ForgotPasswordForm.tsx` | COMPLETE | Email enumeration prevention correct |
| `ResetPasswordForm.tsx` | MISSING | Not implemented (tied to HIGH-3) |
| `PasswordSection.tsx` | THIN RE-EXPORT | Real impl in PasswordChangeSection.tsx |
| `PasswordLastChanged.tsx` | COMPLETE | Good relative date formatting |
| `PasswordChangeSection.tsx` (dashboard) | COMPLETE | OAuth detection heuristic needs work (MED-5) |

### Email Templates Checklist

| PRD Item | Status | Notes |
|----------|--------|-------|
| `emails/password-reset-request.tsx` | MISSING as React Email | Inline HTML in templateDefaults.ts instead |
| `emails/password-changed.tsx` | MISSING as React Email | Inline HTML in templateDefaults.ts instead |

### Event & Notification Integration

| PRD Item | Status | Notes |
|----------|--------|-------|
| `password.reset_requested` event | COMPLETE | Properly emitted |
| `password.changed` event | COMPLETE | Properly emitted |
| `password.reset_completed` event | COMPLETE | Properly emitted |
| Audit log entries for all 3 events | PARTIAL | Missing `password.reset_completed` description (HIGH-1) |
| Email: Password Reset Request | IMPLEMENTED | But `reset_url` is empty (MED-7) |
| Email: Password Changed Confirmation | IMPLEMENTED | But not sent for reset completions (HIGH-2) |
| Site Notification: Password Changed toast | COVERED | Via `password.*` wildcard listener |

---

## Prioritized Action Items

### Immediate (Security-Critical)

1. **[CRIT-1] Fix webhook password detection fallback** - The `user.updated` webhook handler in `auth.ts` must call `detectAndHandlePasswordChange` as a fallback when payload inspection is inconclusive, not only when it confirms a change. This is the most impactful bug.

2. **[CRIT-2] Add logging when Auth API key is missing** - In `requestPasswordReset` action, add `console.error("AUTH_API_KEY is not configured -- password reset emails will not be sent")` when the key is missing.

### Next Sprint (Functional Gaps)

3. **[HIGH-1] Add `password.reset_completed` audit description** - Add the missing entry to `helpers/auditDescriptions.ts`.

4. **[HIGH-2] Add listener for `password.reset_completed` email** - Either register a `password.reset_completed` listener that sends the "Password Changed Confirmation" email, or have `handlePasswordResetCompleted` also emit a `password.changed` event.

5. **[HIGH-3] Implement or remove `/reset-password` route** - Either implement a proper headless Convex Auth reset form or redirect this URL to the auth system's hosted page.

### Short-Term (Code Quality)

6. **[MED-1] Remove `as any` type assertions** - Regenerate Convex types and use proper type access.

7. **[MED-2] Fix forgot-password redirect** - Change from `redirect({ to: "/" })` to `redirect({ to: "/dashboard/settings" })`.

8. **[MED-4] Add email validation in `requestPasswordReset`** - Add a max-length check and basic format validation.

9. **[MED-5] Improve OAuth detection** - Use Convex Auth `password_enabled` field instead of the zero-reset-count heuristic.

10. **[MED-7] Include `resetUrl` in event payload** - The `recordResetRequest` mutation should include the reset URL from the auth system in the event payload for the supplementary email template.

### When Convenient (Low Priority)

11. **[LOW-1] Add `nofollow` to robot meta tags** on forgot-password and reset-password routes.

12. **[LOW-5] Remove unused constants** (`CLEANUP_THRESHOLD_MS`, `CLEANUP_BATCH_SIZE`).

13. **[LOW-6] Wire up password email settings** - Make the email handlers check `sendPasswordResetEmail` and `sendPasswordChangedEmail` settings before sending.

---

## Positive Observations

1. **Excellent security design**: The system correctly delegates ALL cryptographic operations to the auth system. ConvexPress never touches passwords, hashes, or tokens. This is a best-practice architecture.

2. **Email enumeration prevention**: Both the `requestPasswordReset` action and the `recordResetRequest` mutation correctly prevent email enumeration by always returning success regardless of whether the email exists.

3. **Clean event integration**: Events are emitted using the canonical `emitEvent` helper with proper constants from `events/constants.ts`. No inline strings.

4. **Good documentation**: Every function has JSDoc comments explaining purpose, auth requirements, and WordPress equivalents. The code is highly readable.

5. **Proper separation of concerns**: Internal mutations for system-to-system calls, public actions for external API calls, validators centralized in a dedicated file.

6. **Admin password reset is more secure than WordPress**: Admins can only trigger reset emails, never view or set passwords directly. This is explicitly better than WordPress's model.

7. **No Radix imports**: All components use Base UI patterns and the project's own UI components. Full compliance.

8. **No hardcoded colors**: All CSS uses proper variables and opacity modifiers. Full compliance.

9. **Reactive real-time updates**: Password status uses Convex's reactive `useQuery` hook, providing immediate UI updates when password status changes.

10. **Legacy compatibility**: The `getUserRoleLevel` query handles both the new role system (`roleId`) and legacy `internalRole` field gracefully.

---

*Report generated: 2026-02-13*
*Auditor: Password Management System Expert*
*Next audit recommended: After CRIT-1 and HIGH findings are resolved*
