# Role & Capability System - Full Code Audit

**Auditor:** Role & Capability System Expert
**Date:** 2026-02-13
**Scope:** Complete system audit - backend, frontend, security, PRD compliance
**Status:** AUDIT ONLY - No code modifications

---

## Executive Summary

The Role & Capability System is **well-implemented and fundamentally sound**. The core security architecture (permission helpers, capability checks, meta-capability resolution) is correctly designed and follows Convex best practices. The system covers all 137 capabilities across 23 domains, has proper seed data, and supports both the new `roleId`-based system and legacy `internalRole` migration.

**Overall Assessment: 85/100 - Strong foundation with addressable gaps.**

### Critical Issues: 1
### High Priority: 4
### Medium Priority: 8
### Low Priority: 7
### Informational: 5

---

## Files Audited

### Backend (ConvexPress-Admin/packages/backend/convex/)

| File | Path | Status |
|------|------|--------|
| Schema | `schema/roles.ts` | Reviewed |
| Hub Schema | `schema.ts` | Reviewed |
| Users Schema | `schema/users.ts` | Reviewed |
| Mutations | `roles/mutations.ts` | Reviewed |
| Queries | `roles/queries.ts` | Reviewed |
| Internals | `roles/internals.ts` | Reviewed |
| Validators | `roles/validators.ts` | Reviewed |
| Permissions Helper | `helpers/permissions.ts` | Reviewed |
| Auth Helper (Legacy) | `helpers/auth.ts` | Reviewed |
| Capabilities Types | `types/capabilities.ts` | Reviewed |
| Seed Data | `seed/roles.ts` | Reviewed |
| Events Constants | `events/constants.ts` | Reviewed (grep) |

### Frontend (ConvexPress-Admin/apps/web/src/)

| File | Path | Status |
|------|------|--------|
| Auth Context | `lib/auth-context.tsx` | Reviewed |
| useCan Hook | `hooks/useCan.ts` | Reviewed |
| Role List Table | `components/roles/role-list.tsx` | Reviewed |
| Capability Editor | `components/roles/capability-editor.tsx` | Reviewed |
| Role Selector | `components/roles/role-selector.tsx` | Reviewed |
| Nav Guard | `components/layout/nav-guard.tsx` | Reviewed |
| Roles Index Route | `routes/_authenticated/_admin/roles/index.tsx` | Reviewed |
| Edit Role Route | `routes/_authenticated/_admin/roles/$roleId/edit.tsx` | Reviewed |
| New Role Route | `routes/_authenticated/_admin/roles/new.tsx` | Reviewed |
| Tools Roles Route | `routes/_authenticated/_admin/tools/roles.tsx` | Reviewed |
| Users Index Route | `routes/_authenticated/_admin/users/index.tsx` | Reviewed |
| Users New Route | `routes/_authenticated/_admin/users/new.tsx` | Reviewed |
| Users Edit Route | `routes/_authenticated/_admin/users/$userId/edit.tsx` | Reviewed |
| Admin Layout | `routes/_authenticated/_admin.tsx` | Reviewed |
| Authenticated Layout | `routes/_authenticated.tsx` | Reviewed |

### Website (ConvexPress-Website/apps/web/src/)

| File | Path | Status |
|------|------|--------|
| useCan Hook | `hooks/useCan.ts` | Reviewed |

---

## CRITICAL Issues (Security Impact)

### C-1: Dual `getCurrentUser` / `requireAuth` Functions Create Confusion Risk

**Files:**
- `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\helpers\permissions.ts`
- `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\helpers\auth.ts`

**Description:** Two separate files export `getCurrentUser` and `requireAuth` functions with **different behavior**:

| Function | `helpers/permissions.ts` | `helpers/auth.ts` |
|----------|--------------------------|---------------------|
| `getCurrentUser` | Returns typed `UserDoc` with status check | Returns raw DB document |
| `requireAuth` | Throws `ConvexError` with structured `code`, checks `user.status !== "active"` | Throws bare `Error("Authentication required")`, no status check |
| `isAdmin` | N/A | Checks `isInternal === true && internalRole === "admin"` (LEGACY) |
| `requireAdmin` | N/A | Checks legacy fields (LEGACY) |

**Risk:** If a developer imports `requireAuth` from `helpers/auth.ts` instead of `helpers/permissions.ts`, they get a function that:
1. Does NOT check `user.status !== "active"` (banned/inactive users pass)
2. Throws a bare `Error` instead of a structured `ConvexError` (breaks client-side error handling)

**Impact:** A banned or inactive user could potentially call mutations that use `auth.ts`'s `requireAuth` or `requireAdmin`. The legacy `isAdmin()` check bypasses the entire capability system.

**Recommendation:** Deprecate `helpers/auth.ts` functions or make them thin wrappers that delegate to `helpers/permissions.ts`. At minimum, add a `user.status !== "active"` check to `auth.ts:requireAuth`. Mark all legacy auth functions with `@deprecated` JSDoc tags pointing to the correct imports from `permissions.ts`.

---

## HIGH Priority Issues

### H-1: Schema Mismatch - `createdAt`/`updatedAt` Optional in Schema, Required in Knowledge Doc

**File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\schema\roles.ts` (lines 36-37)

**Description:** The `roles` schema defines `createdAt` and `updatedAt` as `v.optional(v.number())`, but the knowledge doc specifies them as `v.number()` (required). The seed function and mutations always provide these values, so the `optional` wrapper is unnecessary and weakens the type contract. If a role somehow gets inserted without these fields (e.g., via a bug or manual Convex dashboard edit), downstream code that assumes they exist could break silently.

**Recommendation:** Change to `v.number()` (required) to match the PRD specification and all existing usage. This would require ensuring all existing rows have values (they do, since seedRoles and all mutations always set them).

### H-2: Admin Slug Mismatch in Last Admin Protection

**File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\roles\mutations.ts` (line 343)

**Description:** The `assign` mutation checks `oldRole.slug === "administrator"` for last-admin protection. However, the knowledge doc references slug `"admin"` in several places. The seed data uses `"administrator"`. If ANYONE references the admin slug inconsistently, the last-admin protection could fail.

Current seed data confirms `"administrator"` is correct (`seed/roles.ts` line 400). But the legacy system used `"admin"` (see `LEGACY_ROLE_MAP` on line 465 of `seed/roles.ts`). The check on line 343 is correct for the NEW system, but the legacy fallback on line 357 (`targetUser.internalRole === "admin"`) correctly uses the legacy slug. This is properly handled but fragile.

**Recommendation:** Extract a constant like `ADMIN_ROLE_SLUG = "administrator"` and use it everywhere to prevent future slug drift. Add a code comment explaining the distinction between legacy `"admin"` and new `"administrator"`.

### H-3: `mapMetaCap` Uses `Id<any>` Type Assertion and Bare `catch`

**File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\helpers\permissions.ts` (lines 305, 329)

**Description:** Two issues in `mapMetaCap`:

1. **`ctx.db.get(resourceId as Id<any>)`** (line 305): Using `Id<any>` defeats type safety. The function accepts `resourceId?: string` but coerces it to a Convex ID. If someone passes a non-ID string, `ctx.db.get` will throw, which is caught by the bare catch block.

2. **Bare `catch` block** (line 329): `catch { return concreteCap; }` silently swallows ALL errors and falls back to allowing the action with just the concrete capability check. This means if `ctx.db.get` throws for any reason (invalid ID format, transient error, etc.), the user is granted access as if they own the resource.

**Security Impact:** A transient Convex error could cause `mapMetaCap` to incorrectly return the concrete capability, allowing a non-owner to pass the capability check (though they still need the concrete capability on their role). The ownership check is effectively skipped on error.

**Recommendation:**
1. Type `resourceId` as `Id<"posts"> | Id<"pages"> | Id<"media"> | Id<"comments">` per the PRD.
2. In the catch block, return `null` (deny access) rather than `concreteCap` (allow access) for unrecognized errors. Only fall back to `concreteCap` for genuinely missing resources.

### H-4: `_authenticated.tsx` Route Guard Uses `checkAdminAccess` Instead of Capability System

**File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated.tsx` (line 16)

**Description:** The top-level authenticated layout calls `api.users.checkAdminAccess` to determine if the user can access the admin panel. This is a separate query from the Role & Capability System. If `checkAdminAccess` uses the legacy `isInternal` field rather than role-based capabilities, it creates a parallel authorization path that bypasses the capability system entirely.

**Risk:** The admin access gate could allow or deny users inconsistently with their role's `pageAccess` array.

**Recommendation:** Verify that `checkAdminAccess` uses the capability system (checks role level or a specific capability). If not, it should be updated to delegate to `getCurrentRoleLevel(ctx)` or check a specific admin capability.

---

## MEDIUM Priority Issues

### M-1: `PageAccessEditor` Component Duplicated in Two Route Files

**Files:**
- `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated\_admin\roles\$roleId\edit.tsx` (lines 407-494)
- `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated\_admin\roles\new.tsx` (lines 296-380)

**Description:** The `PageAccessEditor` component and its `ADMIN_ROUTES` constant are copy-pasted identically in both files. Any future update to one risks the other becoming stale.

**Recommendation:** Extract `PageAccessEditor` into `components/roles/page-access-editor.tsx` and share it between both route files.

### M-2: ADMIN_ROUTES in PageAccessEditor Is Incomplete vs. Seed Data

**Files:**
- `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated\_admin\roles\$roleId\edit.tsx` (lines 409-431)
- `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\seed\roles.ts` (lines 32-82)

**Description:** The frontend `ADMIN_ROUTES` array has 21 entries. The backend `ALL_ADMIN_PAGES` constant has 45 entries. Missing from the frontend:
- `/admin/dashboard`, `/admin/posts/edit`, `/admin/pages/edit`, `/admin/media/new`
- `/admin/users/edit`, `/admin/users/profile`, `/admin/categories`, `/admin/tags`
- `/admin/settings/email`, `/admin/widgets`, `/admin/menus`, `/admin/themes`
- `/admin/seo`, `/admin/api`, `/admin/audit-log`, `/admin/email-notifications`
- `/admin/site-notifications`, `/admin/search`, `/admin/routing`, `/admin/revisions`
- `/admin/custom-fields`, `/admin/tools/import`, `/admin/tools/export`
- `/admin/updates`, `/admin/rss`, `/admin/sitemap`, `/admin/registration`
- `/admin/events`, `/admin/password-management`, `/admin/roles/new`, `/admin/roles/edit`

**Impact:** When editing a role's page access in the UI, admins cannot see or toggle 24 of the 45 routes. They can only manage 21 routes visually. The backend still respects all 45 routes, but the UI does not expose them.

**Recommendation:** Sync `ADMIN_ROUTES` with the backend's `ALL_ADMIN_PAGES` or better yet, import the constant from a shared package.

### M-3: Hardcoded Color `text-emerald-500` in Role List

**File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\roles\role-list.tsx` (line 145)

**Description:** The status column uses `text-emerald-500` for active roles. Per CLAUDE.md rules: "Never use zinc, slate, gray, or any hardcoded Tailwind color names." While emerald is not in the explicit ban list, it violates the spirit of the rule which requires CSS variables.

**Recommendation:** Replace with a CSS variable like `text-success` or use the existing pattern `text-foreground` with conditional opacity.

### M-4: Hardcoded Color `text-amber-500` in Edit Role Page

**File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated\_admin\roles\$roleId\edit.tsx` (lines 178, 339, 383)

**Description:** Three instances of `text-amber-500` for "unsaved changes" and "inactive role warning" indicators.

**Recommendation:** Use a CSS variable like `text-warning` or `text-destructive` depending on context.

### M-5: Capability Domain Data Duplicated Between Backend and Frontend

**Files:**
- `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\types\capabilities.ts` (lines 525-691, `CAPABILITY_DOMAINS`)
- `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\roles\capability-editor.tsx` (lines 23-102, local `CAPABILITY_DOMAINS`)

**Description:** The `CAPABILITY_DOMAINS` mapping is defined in both the backend and frontend with identical content. The frontend has a comment: "These are mirrored here to avoid backend import issues in the frontend." While understandable, this duplication means any new capability added to the backend but not the frontend will be invisible in the capability editor.

**Recommendation:** Explore importing from the backend package (the ConvexPress-Admin monorepo should support this via `@backend/` alias) or create a shared `capabilities-constants.ts` in the shared config package. If neither is possible, add a code comment with a "SYNC WARNING" linking to the canonical source.

### M-6: `grantCapability` Throws on Duplicate Instead of No-Op

**File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\roles\mutations.ts` (lines 458-463)

**Description:** The PRD specifies that `role.grant_capability` should be a no-op if the capability is already assigned: "Check for duplicates: if already in `capabilities[]`, return early (no-op)." The implementation throws a `CONFLICT` error instead.

**PRD says:** "Check for duplicates: if already in `capabilities[]`, return early (no-op)"
**Code does:** Throws `ConvexError({ code: "CONFLICT", message: ... })`

**Impact:** Not a security issue, but a PRD deviation that could cause confusing UX if the admin tries to re-grant a capability.

**Recommendation:** Change to return early (no-op) per PRD, or update the PRD/knowledge doc if the throw behavior is preferred.

### M-7: `revokeCapability` Emits `CAPABILITY_REVOKED` Event Despite PRD Saying "None"

**File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\roles\mutations.ts` (lines 527-533)

**Description:** The knowledge doc states under `role.revoke_capability`: "Events: None (no event defined for revocation in the PRD)." However, the implementation emits `ROLE_EVENTS.CAPABILITY_REVOKED`. This is not a bug per se (more events = better audit trail), but it's a deviation from the spec.

**Recommendation:** Update the knowledge doc to reflect the implementation, since emitting the event is actually better behavior than not emitting it.

### M-8: Users Index Route Missing `beforeLoad` Route Guard

**File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated\_admin\users\index.tsx`

**Description:** The `/admin/users` route has no `beforeLoad` guard checking `canAccessRoute("/admin/users")`. While the parent `_authenticated` route ensures the user is authenticated, it does not check role-specific page access. Compare with the roles index which does have a `beforeLoad` guard.

Similarly, `/admin/users/new` (line 6-8) has no guard, and `/admin/users/$userId/edit` has no guard.

**Risk:** A Contributor or Subscriber user who somehow navigates to `/admin/users` would see the page (though the backend queries would likely return limited/empty data).

**Recommendation:** Add `beforeLoad` guards to user management routes checking `canAccessRoute("/admin/users")`.

---

## LOW Priority Issues

### L-1: `as never` Type Assertions in Frontend

**Files:**
- `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\roles\role-list.tsx` (line 278)
- `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated\_admin\roles\$roleId\edit.tsx` (line 49, 134)

**Description:** Multiple uses of `as never` to cast role IDs when passing to Convex mutations/queries. This is a type-safety workaround that suppresses TypeScript errors rather than fixing them.

**Recommendation:** Use proper Convex ID types or create a utility helper to safely cast string IDs to `Id<"roles">`.

### L-2: `useEffect` for Role Selector Initialization Instead of React 19 Pattern

**File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated\_admin\users\$userId\edit.tsx` (lines 105-110)

**Description:** The edit user page uses `useEffect` to sync `selectedRoleId` state from `userData.roleId`. The edit role page uses the `key={}` remounting pattern (React 19 best practice). This inconsistency is noted in the task description: "we modernized edit.tsx, new.tsx, role-list.tsx with useTransition."

The edit user page still uses the older `useEffect` sync pattern for role selection, while the role edit pages have been modernized.

**Recommendation:** Refactor to use the `key={}` remounting pattern or `useSyncExternalStore` for consistency.

### L-3: `AuthProvider` Missing from `_authenticated.tsx`

**File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated.tsx`

**Description:** The `AuthProvider` is mounted in `_authenticated/_admin.tsx` (line 31), not in the top-level `_authenticated.tsx`. This means the `useAuth()` hook is only available within the admin layout, not at the authentication boundary where `beforeLoad` guards would ideally access it.

The `beforeLoad` guards in role routes access `context.auth` via `(context as any).auth` (line 24 of roles/index.tsx), which suggests the auth context is being passed through TanStack Router's context mechanism separately from the React context.

**Impact:** Not a functional issue since the guards work, but the `(context as any).auth` pattern is fragile and lacks type safety.

**Recommendation:** Type the router context properly to include `auth` with `can` and `canAccessRoute` methods.

### L-4: `tools/roles.tsx` Duplicates Roles Route Without Guard

**File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated\_admin\tools\roles.tsx`

**Description:** The same `RoleListTable` component is accessible at both `/admin/roles` (with a `beforeLoad` guard) and `/admin/tools/roles` (without a guard). Users who cannot access `/admin/roles` could potentially access the same data via `/admin/tools/roles`.

**Recommendation:** Add a `beforeLoad` guard to `tools/roles.tsx` that checks `canAccessRoute("/admin/roles")`.

### L-5: Seed Data Counts Slightly Off from PRD

**File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\seed\roles.ts`

**Description:** The knowledge doc states Author has 49 capabilities, but the seed data has 50 (`AUTHOR_CAPABILITIES` array has 50 entries when counted manually). Contributor is stated as 35 but has 35 entries. These minor discrepancies are due to evolving capability additions.

**Recommendation:** Update the knowledge doc's capability counts to match actual seed data.

### L-6: `RoleSelector` Uses Native `<select>` Instead of Base UI Component

**File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\roles\role-selector.tsx`

**Description:** The component uses a native HTML `<select>` element. The knowledge doc says "WordPress equivalent: `wp_dropdown_roles()` -- `<RoleSelector />` component, Base UI dropdown, not `<select>`." While native `<select>` works fine functionally, the PRD specifies Base UI.

**Recommendation:** Replace with a Base UI Select component for consistency, or update the PRD to accept native selects as acceptable for simple dropdowns.

### L-7: `airtableRecordId` Field in Schema Not in PRD

**File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\schema\roles.ts` (line 40)

**Description:** The roles schema includes `airtableRecordId: v.optional(v.string())` and an `by_airtable_id` index. This field is not in the PRD or knowledge doc but exists for Airtable sync tracking. Not a bug, just undocumented.

**Recommendation:** Document in the knowledge doc's schema section.

---

## Informational Notes

### I-1: No Radix Imports Found (PASS)

All UI components use `@base-ui/react` exclusively. The `Checkbox` component in `components/ui/checkbox.tsx` imports from `@base-ui/react/checkbox`. No `@radix-ui` imports were found in any Role & Capability System file.

### I-2: React 19 Compatibility (PASS)

The role management pages (`edit.tsx`, `new.tsx`, `role-list.tsx`) all use `useTransition` for async operations (save, create, delete), which is the React 19 pattern. The `key={}` remounting pattern is used in `edit.tsx` to avoid `useEffect` sync.

### I-3: Convex Best Practices (MOSTLY PASS)

- Mutations use `requireCan()` consistently for authorization
- Queries use `getCurrentUser()` for authentication
- Events are emitted via `emitEvent()` for audit trail
- Schema uses proper indexes (`by_slug`, `by_level`, `by_status`, `by_isDefault`)
- The `listRoles` query correctly avoids exposing capabilities/pageAccess to non-admin users

### I-4: Legacy Migration Support Is Well-Designed

The `resolveUserRole()` function in `permissions.ts` handles both new (`roleId`) and legacy (`internalRole`) systems gracefully. The `migrateLegacyRoles` internal mutation provides a clean migration path. The `LEGACY_ROLE_MAP` correctly maps old slugs to new ones (e.g., `"customer"` -> `"subscriber"`).

### I-5: Event System Integration Is Complete

All 5 role events are emitted correctly:
- `role.created` from `create` mutation
- `role.updated` from `update` mutation
- `role.deleted` from `remove` mutation
- `role.assigned` from `assign` mutation
- `role.capability_granted` from `grantCapability` mutation
- `role.capability_revoked` from `revokeCapability` mutation (bonus, not in PRD)

---

## PRD Compliance Checklist

### Backend

| Requirement | Status | Notes |
|-------------|--------|-------|
| `roles` table with all fields | PASS | All fields present; `createdAt`/`updatedAt` are optional vs. required (H-1) |
| `roleChanges` audit table | PASS | Correctly structured with indexes |
| `role.create` mutation | PASS | Validates slug, capabilities, level range |
| `role.update` mutation | PASS | Partial update support, slug uniqueness check |
| `role.delete` mutation | PASS | Protected role check, assigned user check |
| `role.assign` mutation | PASS | Self-change prevention, last admin protection |
| `role.grant_capability` mutation | PARTIAL | Throws on duplicate instead of no-op (M-6) |
| `role.revoke_capability` mutation | PASS | Correctly filters and emits event (bonus) |
| `listRoles` query | PASS | Sorted by level desc, includes user counts |
| `getRole` query | PASS | Direct document lookup |
| `getRoleBySlug` query | PASS | Index-based lookup |
| `getDefaultRole` query | PASS | Index-based lookup |
| `getRoleChanges` query | PASS | Enriched with user/role names |
| `currentUserCan()` helper | PASS | Non-throwing, handles inactive roles |
| `userCan()` helper | PASS | Checks specific user by ID |
| `requireCan()` helper | PASS | Throwing, structured ConvexError |
| `requireCanOnResource()` helper | PASS | Meta-cap resolution with ownership |
| `mapMetaCap()` helper | PARTIAL | Error handling falls back to allow (H-3) |
| `getCurrentUser()` helper | PASS | auth identity lookup |
| `getCurrentRoleLevel()` helper | PASS | Returns 0 for unauthenticated |
| Capability type definitions | PASS | 137 capabilities, 10 meta-capabilities |
| Seed data for 5 built-in roles | PASS | All roles with correct capabilities |
| Legacy migration | PASS | `migrateLegacyRoles` internal mutation |
| Idempotent seeding | PASS | Checks by slug before insert |

### Frontend

| Requirement | Status | Notes |
|-------------|--------|-------|
| AuthProvider with can/canAccessRoute | PASS | Properly wired with reactive queries |
| useCan hook (overloaded) | PASS | Returns boolean or function |
| Roles list page (/admin/roles) | PASS | WordPress-style list table |
| Edit role page (/admin/roles/$roleId/edit) | PASS | Metadata + capabilities + page access |
| New role page (/admin/roles/new) | PASS | Full creation form |
| Role selector component | PASS | Used in user edit page |
| Capability editor component | PASS | Grouped toggles with "Toggle All" |
| Nav guard component | PASS | Route-based visibility control |
| Route guards (beforeLoad) | PARTIAL | Missing on some routes (M-8, L-4) |
| Website-side useCan hook | PASS | Full implementation with role level checks |

---

## Security Assessment

### Authorization Boundary

The backend `requireCan()` in Convex mutations is the **true** security boundary. Client-side checks (`useCan`, `canAccessRoute`) are correctly documented as "UI convenience only." This is the correct architecture.

### Potential Attack Vectors

| Vector | Risk | Mitigation |
|--------|------|-----------|
| Direct API call bypassing UI guards | LOW | Backend `requireCan()` enforces all mutations |
| Capability string typo allowing bypass | LOW | `Capability` type union catches compile-time errors; `isValidCapability()` validates at runtime |
| Privilege escalation via self-role-change | NONE | `assign` mutation prevents self-modification |
| Last admin removal | NONE | `assign` mutation counts admins atomically |
| Legacy auth bypass | MEDIUM | `helpers/auth.ts` functions don't check status (C-1) |
| Protected role deletion | NONE | `isProtected` flag enforced in `remove` mutation |
| mapMetaCap error fallback | LOW-MEDIUM | Errors fall back to allowing (H-3) |

### Recommendations for Hardening

1. **Fix C-1** - Ensure all auth helper functions check user status
2. **Fix H-3** - Make `mapMetaCap` deny on error, not allow
3. Add rate limiting to role mutation endpoints (future consideration)
4. Add logging/alerting for capability-denied events (for intrusion detection)

---

## Summary of Required Actions

### Must Fix (Before Production)

| ID | Issue | Effort |
|----|-------|--------|
| C-1 | Dual auth helpers with inconsistent behavior | Medium |
| H-3 | mapMetaCap error fallback allows access | Small |

### Should Fix (Next Sprint)

| ID | Issue | Effort |
|----|-------|--------|
| H-1 | Schema optional timestamps | Small |
| H-2 | Admin slug constant extraction | Small |
| H-4 | Verify checkAdminAccess uses capability system | Small |
| M-1 | Extract PageAccessEditor component | Small |
| M-2 | Sync ADMIN_ROUTES with backend | Small |
| M-8 | Add missing route guards | Small |

### Nice to Have (Backlog)

| ID | Issue | Effort |
|----|-------|--------|
| M-3, M-4 | Replace hardcoded colors | Small |
| M-5 | Shared capability constants | Medium |
| M-6 | Grant no-op vs. throw | Small |
| M-7 | Update knowledge doc for revoke event | Small |
| L-1 through L-7 | Various cleanup items | Small each |

---

*Audit completed 2026-02-13. No code was modified during this audit.*
