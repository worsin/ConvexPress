# Registration System - Full Audit Report

**Audited by:** Registration System Expert
**Date:** 2026-02-13
**Status:** Implemented (Backend + Frontend)
**Overall Grade:** B+

---

## Files Audited

### Backend (ConvexPress-Admin/packages/backend/convex/)

| File | Path | Status |
|------|------|--------|
| Schema | `convex/schema/registration.ts` | Implemented |
| Users Schema | `convex/schema/users.ts` | Shared (owned by User Profile System) |
| Mutations | `convex/registration/mutations.ts` | Implemented |
| Queries | `convex/registration/queries.ts` | Implemented |
| Internals | `convex/registration/internals.ts` | Implemented |
| Validators | `convex/registration/validators.ts` | Implemented |
| Helpers | `convex/helpers/registration.ts` | Implemented |
| Auth/Webhook | `convex/auth.ts` | Implemented |
| Cron Jobs | `convex/crons.ts` | Implemented |
| Hub Schema | `convex/schema.ts` | Integrated |
| Event Listeners Bootstrap | `convex/bootstrap/registerListeners.ts` | Partially correct (BUG) |

### Admin Frontend (ConvexPress-Admin/apps/web/)

| File | Path | Status |
|------|------|--------|
| Add New User Route | `src/routes/_authenticated/_admin/users/new.tsx` | Implemented |
| Invite User Form | `src/components/registration/InviteUserForm.tsx` | Implemented |
| Invitations List | `src/components/registration/InvitationsList.tsx` | Implemented |

### Website Frontend (ConvexPress-Website/apps/web/)

| File | Path | Status |
|------|------|--------|
| Register Route | `src/routes/register.tsx` | Implemented |
| Registration Gate | `src/components/auth/RegistrationGate.tsx` | Implemented |
| Register Form | `src/components/auth/RegisterForm.tsx` | Implemented |
| Registration Closed Msg | `src/components/auth/RegistrationClosedMessage.tsx` | Implemented |
| Invitation Required Msg | `src/components/auth/InvitationRequiredMessage.tsx` | Implemented |
| Invitation Invalid Msg | `src/components/auth/InvitationInvalidMessage.tsx` | Implemented |
| OAuth Buttons | `src/components/auth/OAuthButtons.tsx` | Implemented |
| useRegistrationGate | `src/hooks/useRegistrationGate.ts` | Implemented |
| useInvitationValidation | `src/hooks/useInvitationValidation.ts` | Implemented |
| Auth Types | `src/lib/auth/types.ts` | Implemented |

### Not Implemented

| File | Path | Status |
|------|------|--------|
| Email: Welcome | `emails/welcome.tsx` | NOT IMPLEMENTED |
| Email: Verification | `emails/email-verification.tsx` | NOT IMPLEMENTED |
| Email: Invitation | `emails/user-invitation.tsx` | NOT IMPLEMENTED |
| Email: Admin New User | `emails/admin-new-user.tsx` | NOT IMPLEMENTED |
| PRD | `specs/ConvexPress/systems/registration/PRD.md` | NOT FOUND |

---

## PRD Compliance

### Implemented per PRD/Knowledge Doc

| Feature | Status | Notes |
|---------|--------|-------|
| Self-registration (when enabled) | DONE | `isRegistrationOpen` query + `RegistrationGate` |
| Invitation-based registration | DONE | Full lifecycle: create, resend, revoke, expire, accept |
| OAuth registration | DONE | OAuth provider detection in `auth.ts` webhook handler |
| Registration gate (`anyoneCanRegister`) | DONE | Setting read + reactive query |
| Default role assignment | DONE | `getDefaultRoleDoc()` helper with fallback to subscriber |
| Invitation token generation | DONE | Cryptographic 64-char tokens via `crypto.randomUUID()` |
| Invitation expiry (configurable) | DONE | Settings-driven, default 7 days |
| Cron: expire invitations daily | DONE | `crons.ts` daily at 03:00 UTC |
| Cron: cleanup old invitations | DONE | `crons.ts` weekly Sunday at 04:00 UTC (bonus, beyond PRD) |
| Webhook idempotency | DONE | `by_clerkUserId` index check |
| Username generation from email | DONE | Helper with sanitization, truncation, fallback |
| Unique username enforcement | DONE | Loop with suffix, safety limit of 100 |
| Event emission: `registration.user_registered` | DONE | In `handleConvex AuthUserCreated` |
| Event emission: `registration.user_invited` | DONE | In `inviteUser`, `resendInvitation` |
| Invitation matching during signup | DONE | By email in `handleConvex AuthUserCreated` |
| Revoke invitation (silent, no events) | DONE | Matches PRD exactly |
| Resend limit enforcement | DONE | Configurable max (default 5) |
| Expired invitation resend with re-extension | DONE | Status `"expired"` allowed, re-activated to `"pending"` |
| Admin UI: Add New User page | DONE | Full page at `/admin/users/new` |
| Admin UI: Invitations list with actions | DONE | Resend, revoke, status badges, enriched data |
| Website: Registration page | DONE | `/register` with token support |
| Website: Registration closed message | DONE | `RegistrationClosedMessage` component |
| Website: Invitation invalid message | DONE | `InvitationInvalidMessage` with reason codes |
| Website: Invitation required message | DONE | `InvitationRequiredMessage` component |
| Website: Auth redirect for logged-in users | DONE | Loader redirects to `/` if user exists |
| Website: noindex meta tag | DONE | `meta: [{ name: "robots", content: "noindex" }]` |
| Real-time: Invitations list updates | DONE | Convex reactive `useQuery` |
| Real-time: Registration open/closed | DONE | `isRegistrationOpen` reactive query |
| Bulk invite | DONE | `bulkInvite` mutation (bonus, beyond PRD) |
| Token grace period on resend | DONE | `previousToken` + 1-hour grace (bonus, beyond PRD) |
| Accept invitation mutation | DONE | Public mutation for manual linking (bonus, beyond PRD) |
| Invitation counts query | DONE | `counts` query for dashboard (bonus, beyond PRD) |
| Registration stats query | DONE | `getRegistrationStats` with time windows |

### Not Implemented

| Feature | Status | PRD Priority |
|---------|--------|-------------|
| Email templates (welcome, verification, invitation, admin) | NOT IMPLEMENTED | Soft dependency (expected via Email Notification System) |
| PRD document | MISSING | `specs/ConvexPress/systems/registration/PRD.md` does not exist |

---

## Bugs Found

### BUG-1: CRITICAL -- Event Listener for Invitation Email Wired to Wrong Event Code

**File:** `ConvexPress-Admin/packages/backend/convex/bootstrap/registerListeners.ts` (lines 288-300)
**Severity:** Critical
**Impact:** Invitation emails are NEVER sent

The event listener for invitation emails is subscribed to `"registration.email_verified"` instead of `"registration.user_invited"`:

```typescript
// CURRENT (WRONG):
{
  eventCode: "registration.email_verified",
  name: "Email: User Invitation",
  handlerModule: "emails/internals",
  handlerFunction: "onUserInvited",
  ...
}

// CORRECT:
{
  eventCode: "registration.user_invited",
  name: "Email: User Invitation",
  handlerModule: "emails/internals",
  handlerFunction: "onUserInvited",
  ...
}
```

The `inviteUser` mutation emits `"registration.user_invited"` but the listener is registered for `"registration.email_verified"`. As a result, the `onUserInvited` email handler is never triggered when an admin invites a user. This means invitation emails are silently lost.

Additionally, the wildcard listener `"registration.*"` on the site notification system (line 143) WOULD catch `registration.user_invited`, so site notifications for invitations should still work. But the dedicated email listener is broken.

**Fix:** Change eventCode from `"registration.email_verified"` to `"registration.user_invited"` in `registerListeners.ts`, then re-run the bootstrap.

---

### BUG-2: MEDIUM -- `registrationMethod` Value Mismatch Between Schema Comment and Code

**File:** `ConvexPress-Admin/packages/backend/convex/schema/users.ts` (line 97) vs `ConvexPress-Admin/packages/backend/convex/registration/internals.ts` (line 96)

The users schema comment says:
```typescript
registrationMethod: v.optional(v.string()), // "self" | "invitation" | "oauth" | "import"
```

But the registration internals actually write:
```typescript
let registrationMethod: "self" | "invite" | "oauth";
```

The value stored is `"invite"`, but the comment documents `"invitation"`. Since the field is `v.string()` there is no runtime error, but any code that checks for `"invitation"` (e.g., future reporting queries) would fail to match.

**Impact:** Misleading documentation; potential for future bugs if any system checks for `"invitation"`.
**Fix:** Update the schema comment to match actual values: `"self" | "invite" | "oauth" | "import"`.

---

### BUG-3: LOW -- `registrationMethod` Missing `"import"` in Internals Type

**File:** `ConvexPress-Admin/packages/backend/convex/registration/internals.ts` (line 96)

```typescript
let registrationMethod: "self" | "invite" | "oauth";
```

The knowledge doc specifies four values: `"self" | "invite" | "oauth" | "import"`. The `"import"` variant is documented as "v2 / out of scope for v1", but the type should still include it for forward compatibility, or a comment should note the omission.

**Impact:** Cosmetic/forward-compatibility only. No runtime issue.

---

### BUG-4: MEDIUM -- User Status Union Mismatch Between Knowledge Doc and Schema

**Knowledge doc specifies:**
```typescript
status: v.union(v.literal("active"), v.literal("pending"), v.literal("suspended"), v.literal("deactivated"))
```

**Users schema actually has:**
```typescript
status: v.union(v.literal("active"), v.literal("inactive"), v.literal("banned"))
```

The internals write `status: "active"` which is fine, but the schema does not include `"pending"`, `"suspended"`, or `"deactivated"` as described in the knowledge doc. This means:
- No user can have status `"pending"` (which the knowledge doc says is for "invited but hasn't completed signup")
- No user can be `"suspended"` or `"deactivated"`

The schema was likely authored by the User Profile System expert with different status values than what the Registration System knowledge doc anticipated. The code works correctly (new users get `"active"` status), but the knowledge doc is out of sync.

**Impact:** Knowledge doc is inaccurate about available user statuses. Could cause confusion for developers.
**Fix:** Update knowledge doc to match actual schema, OR update schema to include the PRD-specified statuses. The User Profile System expert should coordinate this.

---

### BUG-5: LOW -- Missing `by_registeredAt` Index

**Knowledge doc specifies:** `users` table should have `by_registeredAt` index on `["registeredAt"]`.

**Actual schema:** Has `by_createdAt` index on `["createdAt"]` but no `by_registeredAt` index.

The `getRegistrationStats` query uses `by_createdAt` which works correctly for the time-windowed queries. The `registeredAt` field is set to the same value as `createdAt` in `handleConvex AuthUserCreated`, so this is functionally equivalent.

**Impact:** None functional. Knowledge doc is slightly out of date.

---

## Security Review

### Strengths

1. **Webhook idempotency**: Double-checked in both `auth.ts` (pre-check) and `handleConvex AuthUserCreated` (idempotency guard). This correctly prevents duplicate user creation from webhook retries.

2. **Token generation**: Uses `crypto.randomUUID()` x2 concatenated, producing 64 hex characters. This is cryptographically secure and URL-safe.

3. **Public query data minimization**: `getByToken` returns only `{ email, role, message, expiresAt }` -- never internal IDs, tokens, or admin details. This is correct.

4. **Self-registration gate enforcement**: The `handleConvex AuthUserCreated` mutation throws if `anyoneCanRegister` is false and no invitation exists. This server-side check is the safety net even if Convex Auth allows the signup.

5. **Authorization on admin mutations**: All invitation management mutations use `requireCan(ctx, "registration.invite")` consistently.

6. **Invitation acceptance self-check**: `acceptInvitation` verifies `args.userId === authenticatedUser._id` to prevent accepting invitations on behalf of other users.

7. **Resend limit enforcement**: Properly checks `resentCount >= maxResendsPerInvitation` before allowing resend.

8. **Token grace period**: On resend, the old token remains valid for 1 hour via `previousToken`/`previousTokenExpiresAt`. This prevents link breakage when a user clicks an old email right after an admin resends.

### Concerns

1. **MEDIUM -- acceptInvitation previousToken scan is O(n)**: When looking up a previous token, `acceptInvitation` loads ALL pending invitations and scans linearly:

   ```typescript
   const pendingInvitations = await ctx.db
     .query("invitations")
     .withIndex("by_status", (q) => q.eq("status", "pending"))
     .collect();
   invitation = pendingInvitations.find(...)
   ```

   This is acceptable while the invitation count is small, but could become a performance concern at scale. The same pattern exists in `getByToken`. Consider adding a `by_previousToken` index if the pending invitation count grows significantly.

2. **LOW -- No rate limiting on `inviteUser` mutation**: An admin (or compromised admin session) could create thousands of invitations rapidly. There is no per-admin rate limit. However, since the mutation requires Administrator capability, the blast radius is limited to compromised admin accounts.

3. **LOW -- Email validation is basic**: The `isValidEmail` regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` accepts strings like `a@b.c`. This is intentionally permissive (Convex Auth does the real validation), but could be tightened if desired.

4. **LOW -- ConvexError vs Error inconsistency**: The `handleConvex AuthUserCreated` mutation throws `new Error("User registration is currently not allowed.")` instead of `new ConvexError(...)`. This is an internal mutation (not client-facing), so it's not a security issue, but it breaks the pattern used in public mutations.

---

## Code Quality Review

### Radix Imports

**CLEAN** -- No `@radix-ui` imports found in any registration system file.

### Hardcoded Colors

**ISSUE in InvitationsList.tsx** -- Status badge colors use Tailwind named colors:

```typescript
pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
accepted: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
```

Per CLAUDE.md rules: "Never use zinc, slate, gray, or any hardcoded Tailwind color names." While `amber` and `emerald` are not in the explicitly banned list (zinc/slate/gray), the spirit of the rule is to use CSS variables and opacity modifiers. The `destructive` status uses the correct pattern (`bg-destructive/10 text-destructive`), while `expired` also uses the correct pattern (`bg-muted text-muted-foreground`).

**Recommendation:** Replace `amber` with `bg-warning/10 text-warning` and `emerald` with `bg-success/10 text-success` if those CSS variables exist in the design system, or use opacity-based alternatives like `bg-foreground/5 text-foreground/70`.

### TypeScript Quality

1. **`as any` casts in InvitationsList.tsx**: Lines 123 and 145 cast `invitationId` as `any`:
   ```typescript
   await resendInvitation({ invitationId: invitationId as any });
   await revokeInvitation({ invitationId: revokeTarget.id as any });
   ```
   This is because `invitationId` is typed as `string` in component state but the mutation expects `Id<"invitations">`. The proper fix is to type the state as `Id<"invitations">` or use the generated type.

2. **`err: any` pattern**: Both `InviteUserForm.tsx` and `InvitationsList.tsx` use `catch (err: any)`. This is acceptable for error handling but could use a more specific type like `ConvexError`.

3. **Unused import**: `getCurrentUser` is imported in `queries.ts` but only `requireCan` is used from the permissions helper. The `getCurrentUser` import is unused.

### Convex Best Practices

1. **Modular schema**: Correctly uses `convex/schema/registration.ts` with `registrationTables` export, spread into the hub schema. Follows the convention perfectly.

2. **Function organization**: Clean separation into `mutations.ts`, `queries.ts`, `internals.ts`, `validators.ts`. Matches the project convention.

3. **Validator extraction**: All argument validators are in `validators.ts` and shared across files. Clean.

4. **Index usage**: Queries properly use indexes (`by_email`, `by_token`, `by_status`, `by_invitedBy`, `by_expiresAt`, `by_clerkUserId`, `by_username`). No full table scans for primary lookups.

5. **Event emission pattern**: Uses `emitEvent()` helper consistently with `SYSTEM.REGISTRATION` constant.

6. **NOTE comments about event code mismatch**: Both `mutations.ts` (line 126-129) and `internals.ts` (line 194-196) note that event constants may need updating. The constants file has since been updated to include both `REGISTRATION_EVENTS.USER_REGISTERED` and `REGISTRATION_EVENTS.USER_INVITED`, but the code uses inline strings (`"registration.user_registered"`, `"registration.user_invited"`) instead of the constants. This works but is inconsistent with the stated best practice.

   **Recommendation:** Replace inline strings with:
   ```typescript
   import { REGISTRATION_EVENTS } from "../events/constants";
   await emitEvent(ctx, REGISTRATION_EVENTS.USER_REGISTERED, ...);
   await emitEvent(ctx, REGISTRATION_EVENTS.USER_INVITED, ...);
   ```

### React 19 Compatibility

No issues found. Components use standard React patterns:
- `useState`, `useCallback`, `useMemo` -- all stable
- No class components
- No deprecated lifecycle methods
- Proper use of `useQuery` and `useMutation` from `convex/react`
- The `"skip"` sentinel in `useQuery` is the correct Convex pattern for conditional queries

### UI Standardization

1. **Admin InviteUserForm**: Uses `<select>` element directly instead of a Base UI select component. This may be intentional (Base UI may not have a select component), but should be verified against the design system.

2. **Admin InviteUserForm**: Uses `<textarea>` directly with manually applied Tailwind classes. Same consideration as above.

3. **Admin InvitationsList**: Uses a custom `StatusBadge` component. If the admin design system has a standardized badge component, it should be used instead.

4. **Website RegisterForm**: The form collects password fields but in Phase 1 just redirects to the auth system. The password fields are rendered but never actually submitted. This is documented as "Phase 1 (current)" with a TODO for Phase 2 headless API integration. This is fine but the form could be confusing to users -- they fill in a password, then get redirected to the auth system where they set a different password.

5. **Checkbox htmlFor mismatch**: In `InviteUserForm.tsx`, the `<Label>` has `htmlFor="invite-send-notification"` but the `<Checkbox>` does not have an `id` prop. The `onCheckedChange` callback works, but the `<Label>` click may not toggle the checkbox via the `htmlFor` mechanism.

### Error Handling

1. **Structured ConvexErrors**: Public mutations consistently throw `ConvexError` with `{ code, message }` shape. This is clean and allows the frontend to extract error messages.

2. **Frontend error extraction**: Both forms use `err?.data?.message ?? err?.message ?? "..."` pattern, which correctly handles ConvexError data extraction.

3. **Graceful loading states**: Both admin and website components handle `undefined` (loading) states with skeletons.

4. **Empty states**: InvitationsList has a proper empty state with icon and helpful message.

---

## Architecture Assessment

### Strengths

1. **Clean separation of concerns**: Backend functions, helpers, validators, and schema are each in their own files. The registration system only touches its own domain.

2. **Convex Auth integration is correct**: The `auth.ts` event handler properly delegates to `handleConvex AuthUserCreated` via `ctx.scheduler.runAfter(0, ...)`. The idempotency double-check (once in auth.ts, once in the internal mutation) is defense-in-depth.

3. **Settings fallback pattern**: `getRegistrationSettings()` gracefully handles missing settings with defaults. The try/catch in `getSettingValue()` handles the case where the settings table doesn't exist yet.

4. **Token grace period on resend**: The `previousToken` mechanism is a thoughtful UX enhancement not in the original PRD.

5. **Effective expiry check at query time**: `getByToken` and `listInvitations` both check `expiresAt` at read time, so expired invitations are correctly handled even if the daily cron hasn't run yet.

6. **Bulk invite with partial failure handling**: Each email in a bulk invite is processed independently, with per-email success/error results. This is the correct pattern.

### Concerns

1. **Settings section mismatch**: The knowledge doc says `invitationExpiryDays`, `maxResendsPerInvitation`, and `requireEmailVerification` should be in a `"registration"` settings section. The code reads all of them from `"general"`:
   ```typescript
   const invitationExpiryDays = await getSettingValue(ctx, "general", "invitationExpiryDays");
   ```
   This works if the settings were stored under "general", but diverges from the knowledge doc's specification of a separate "registration" settings group.

2. **Role stored as string slug in invitations, but as `Id<"roles">` in users**: The invitation stores `role: v.string()` (a slug like `"subscriber"`), while the user record stores `roleId: v.optional(v.id("roles"))`. The `handleConvex AuthUserCreated` mutation correctly resolves the slug to an ID via the `by_slug` index. This works but adds a lookup step.

3. **Display name / slug / username generation split across helpers**: Username generation is in `helpers/registration.ts` while display name and slug generation are in `helpers/profile.ts`. This is actually correct (each helper owns its domain), but it means the registration internals import from two helper files.

---

## Summary of Issues

### Critical (Must Fix)

| # | Issue | File | Description |
|---|-------|------|-------------|
| BUG-1 | Wrong event code for invitation email listener | `bootstrap/registerListeners.ts:289` | `"registration.email_verified"` should be `"registration.user_invited"`. Invitation emails never sent. |

### Medium (Should Fix)

| # | Issue | File | Description |
|---|-------|------|-------------|
| BUG-2 | `registrationMethod` comment mismatch | `schema/users.ts:97` | Comment says `"invitation"` but code writes `"invite"` |
| BUG-4 | User status union mismatch | `schema/users.ts` vs Knowledge doc | Schema has `active|inactive|banned`, doc says `active|pending|suspended|deactivated` |
| SEC-1 | O(n) pending invitation scan for previousToken | `mutations.ts`, `queries.ts` | Loads all pending invitations to find previousToken match |
| UI-1 | Hardcoded `amber`/`emerald` colors | `InvitationsList.tsx:52-53` | Should use CSS variables per design system rules |
| TS-1 | `as any` casts for invitation IDs | `InvitationsList.tsx:123,145` | Should properly type state |
| TS-2 | Unused `getCurrentUser` import | `queries.ts:18` | Imported but never used |
| CODE-1 | Inline event code strings instead of constants | `mutations.ts`, `internals.ts` | Should use `REGISTRATION_EVENTS.*` constants |

### Low (Nice to Fix)

| # | Issue | File | Description |
|---|-------|------|-------------|
| BUG-3 | Missing `"import"` in type union | `internals.ts:96` | Forward-compatibility |
| BUG-5 | Missing `by_registeredAt` index | `schema/users.ts` | Knowledge doc specifies it; not needed since `by_createdAt` is used |
| SEC-2 | No rate limiting on `inviteUser` | `mutations.ts` | Admin-only, low risk |
| SEC-3 | Basic email regex | `helpers/registration.ts` | Convex Auth validates, this is a pre-filter |
| SEC-4 | `new Error()` vs `new ConvexError()` | `internals.ts:124` | Inconsistent with other mutations |
| UI-2 | Checkbox `htmlFor` mismatch | `InviteUserForm.tsx:194` | Label htmlFor doesn't match checkbox id |
| UI-3 | Raw `<select>` and `<textarea>` | `InviteUserForm.tsx` | Should use design system components if available |
| UI-4 | Password fields in Phase 1 form | `RegisterForm.tsx` | Renders password fields but redirects to the auth system |
| DOC-1 | Settings section mismatch | `helpers/registration.ts` | Reads from "general" but knowledge doc says "registration" section |

---

## PRD Completion Score

| Category | Implemented | Total | Percentage |
|----------|-------------|-------|------------|
| Backend Mutations | 6 (inviteUser, resendInvitation, revokeInvitation, bulkInvite, acceptInvitation, handleConvex AuthUserCreated) | 5 specified | 120% (extras: bulkInvite, acceptInvitation) |
| Backend Queries | 5 (listInvitations, getInvitation, getByToken, counts, isRegistrationOpen, getRegistrationStats) | 4 specified | 150% (extras: getInvitation, counts) |
| Backend Internals | 3 (handleConvex AuthUserCreated, expireOldInvitations, cleanupExpiredInvitations) + 1 internalQuery | 3 specified | 133% (extra: cleanupExpiredInvitations, getPendingByEmail) |
| Backend Helpers | 6 (generateInvitationToken, isValidEmail, findUserByEmail, findPendingInvitation, generateUsernameFromEmail, ensureUniqueUsername, getRegistrationSettings, getDefaultRoleDoc) | 3 specified | 200%+ |
| Schema | 1 table (invitations) | 1 table | 100% |
| Cron Jobs | 2 (expire + cleanup) | 1 specified | 200% |
| Admin UI | 3 files (route, form, list) | 3 specified | 100% |
| Website UI | 8 files (route, gate, form, 3 messages, 2 hooks) | 5 specified | 160% |
| Email Templates | 0 | 4 specified | 0% (owned by Email Notification System) |
| Webhook Handler | 1 (auth.ts) | 1 specified | 100% |

**Overall Backend:** ~95% (all core features, one critical listener bug)
**Overall Frontend:** ~95% (all features, minor UI issues)
**Overall System:** ~90% (missing email templates are owned by another system; critical listener bug)

---

## Recommendations

1. **FIX BUG-1 immediately** -- Change `"registration.email_verified"` to `"registration.user_invited"` in `bootstrap/registerListeners.ts` and re-run the bootstrap. Without this fix, invitation emails are never sent.

2. **Use event constants** -- Replace inline string `"registration.user_registered"` and `"registration.user_invited"` with `REGISTRATION_EVENTS.USER_REGISTERED` and `REGISTRATION_EVENTS.USER_INVITED` from `events/constants.ts`.

3. **Fix the `as any` casts** -- Type invitation ID state as `Id<"invitations">` in the InvitationsList component, or import the generated type.

4. **Replace hardcoded colors** -- Swap `amber-*` and `emerald-*` classes for CSS variable-based alternatives consistent with the design system.

5. **Coordinate with User Profile System** on user status values -- The knowledge doc and actual schema disagree on valid statuses. One must be updated.

6. **Consider the RegisterForm Phase 1/Phase 2 UX** -- Users currently fill out a password form that does nothing (redirects to the auth system). Consider either hiding the password fields in Phase 1 or showing a note explaining the redirect.

7. **Remove unused import** -- `getCurrentUser` is imported but not used in `queries.ts`.

8. **Add `by_previousToken` index** -- If the invitation volume grows, the O(n) scan for previousToken lookup could be a bottleneck. Adding a dedicated index would make this O(1).
