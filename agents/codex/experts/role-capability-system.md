You are a **BUILDER**. Your job is to implement the Role & Capability System to production quality, following the PRD and knowledge doc exactly.

---

## MISSION

Build and complete the **Role & Capability System** for ConvexPress. This is the **foundation authorization layer** -- 21 of 28 systems depend on it. It implements the WordPress `WP_Roles` / `current_user_can()` / `map_meta_cap()` pattern adapted for Convex. Five hierarchical roles (Administrator 100, Editor 80, Author 60, Contributor 40, Subscriber 20) each carry a defined set of 137 granular capability strings. The `requireCan(ctx, capability)` helper is called in every protected mutation.

---

## CURRENT STATUS

| Layer | Component | Status | Notes |
|-------|-----------|--------|-------|
| **Schema** | `convex/schema/roles.ts` | DONE | `roles` + `roleChanges` tables with all indexes |
| **Schema** | `convex/schema/capabilities.ts` | DONE | Airtable-synced capabilities reference table |
| **Schema** | Hub `convex/schema.ts` | DONE | Both `rolesTables` + `capabilitiesTables` spread in |
| **Types** | `convex/types/capabilities.ts` | DONE | All 137 Capability types, 10 MetaCapability, domain groupings, validation fns |
| **Seed** | `convex/seed/roles.ts` | DONE | BUILT_IN_ROLES array, all 5 roles with full capability + pageAccess arrays |
| **Helpers** | `convex/helpers/permissions.ts` | DONE | getCurrentUser, requireCan, currentUserCan, userCan, requireCanOnResource, mapMetaCap, getCurrentRoleLevel, hasMinimumRoleLevel, requireMinimumRoleLevel, requireAuth, resolveUserRole (with legacy migration path) |
| **Mutations** | `convex/roles/mutations.ts` | DONE | create, update, remove, assign, grantCapability, revokeCapability (all with validation + event emission fully wired) |
| **Queries** | `convex/roles/queries.ts` | DONE | listRoles (with user counts + legacy compat), getRole, getRoleBySlug, getDefaultRole, getRoleChanges (enriched) |
| **Internals** | `convex/roles/internals.ts` | DONE | seedRoles, reseedRoles, migrateLegacyRoles |
| **Validators** | `convex/roles/validators.ts` | DONE | createRoleArgs, updateRoleArgs, assignRoleArgs, grantCapabilityArgs, revokeCapabilityArgs |
| **Capabilities Queries** | `convex/capabilities/queries.ts` | DONE | list (with filter/search), get, counts |
| **Admin UI** | Auth context / AuthProvider | DONE | `src/lib/auth-context.tsx` with can(), canAccessRoute(), useAuth() hook, wired in _admin layout |
| **Admin UI** | `useCan` hook | DONE | `src/hooks/useCan.ts` with overloaded signature |
| **Admin UI** | Roles list page `/admin/roles` | DONE | Route with beforeLoad guard, RoleListTable component |
| **Admin UI** | Edit role page `/admin/roles/$roleId/edit` | DONE | Full edit page with metadata, CapabilityEditor, PageAccessEditor |
| **Admin UI** | Add new role page `/admin/roles/new` | DONE | Full creation form with auto-slug generation |
| **Admin UI** | Role components | DONE | role-list.tsx, capability-editor.tsx, role-selector.tsx in `src/components/roles/` |
| **Admin UI** | Users list page `/admin/users` | DONE | Route exists with `UserListTable` component |
| **Admin UI** | Add new user page `/admin/users/new` | DONE | InviteUserForm with role selection |
| **Admin UI** | Edit user page `/admin/users/$userId/edit` | DONE | Full edit page with RoleSelector, role assignment, password management, account actions |
| **Admin UI** | Nav guard component | DONE | `nav-guard.tsx` with path and capability props |
| **Admin UI** | Sidebar capability filtering | DONE | AdminSidebar uses filterNavSections() with role capabilities |
| **Website** | Auth utilities | DONE | `src/lib/auth/auth.ts` with userCan, userCanAll, userCanAny, userHasRoleLevel, userHasRole, userCanEditContent |
| **Website** | useCan hooks | DONE | `src/hooks/useCan.ts` with useCan, useCanFn, useCanAll, useCanAny, useRoleLevel, useHasRole, useCanEditContent |
| **Backend** | Event emission wiring | DONE | All 6 mutations emit events via emitEvent() (CREATED, UPDATED, DELETED, ASSIGNED, CAPABILITY_GRANTED, CAPABILITY_REVOKED) |

**Overall Status: COMPLETE (100%)** -- All backend, admin frontend, website frontend, and event wiring are fully implemented.

---

## PRD & KNOWLEDGE REFERENCES

- **Knowledge Doc:** `.claude/docs/ROLE-CAPABILITY-SYSTEM.md` -- READ THIS FULLY before any work
- **PRD:** `specs/ConvexPress/systems/role-capability-system/PRD.md` -- Complete PRD v2.0
- **Airtable Blueprint:** Base `[redacted-airtable-base-id]`, Systems table `[redacted-airtable-table-id]`, Actions table `[redacted-airtable-table-id]` (137 records)

---

## FILES YOU OWN

### Backend (ConvexPress-Admin/packages/backend/convex/) -- ALL DONE

| # | File | Status | What It Does |
|---|------|--------|--------------|
| 1 | `schema/roles.ts` | DONE | `roles` + `roleChanges` table definitions with indexes |
| 2 | `schema/capabilities.ts` | DONE | Airtable-synced capabilities reference table |
| 3 | `types/capabilities.ts` | DONE | 137 Capability union type, 10 MetaCapability, ALL_CAPABILITIES array, CAPABILITY_DOMAINS grouping, META_TO_CONCRETE map, isValidCapability/isMetaCapability validators |
| 4 | `seed/roles.ts` | DONE | BUILT_IN_ROLES with 5 role seed data, LEGACY_ROLE_MAP, capability arrays, page access arrays |
| 5 | `helpers/permissions.ts` | DONE | getCurrentUser, requireCan, currentUserCan, userCan, requireCanOnResource, mapMetaCap, getCurrentRoleLevel, hasMinimumRoleLevel, requireMinimumRoleLevel, requireAuth, resolveUserRole |
| 6 | `roles/validators.ts` | DONE | Shared Convex argument validators for all role mutations |
| 7 | `roles/mutations.ts` | DONE | create, update, remove, assign, grantCapability, revokeCapability (all with event emission via emitEvent) |
| 8 | `roles/queries.ts` | DONE | listRoles, getRole, getRoleBySlug, getDefaultRole, getRoleChanges |
| 9 | `roles/internals.ts` | DONE | seedRoles, reseedRoles, migrateLegacyRoles |
| 10 | `capabilities/queries.ts` | DONE | list, get, counts |

### Admin Frontend (ConvexPress-Admin/apps/web/src/) -- ALL DONE

| # | File | Status | What It Does |
|---|------|--------|--------------|
| 11 | `lib/auth-context.tsx` | DONE | AuthProvider with `can()`, `canAccessRoute()`, `useAuth()` hook. Wired in `_admin.tsx` layout. |
| 12 | `hooks/useCan.ts` | DONE | `useCan()` hook -- overloaded: returns function or boolean |
| 13 | `routes/_authenticated/_admin/roles/index.tsx` | DONE | Roles & Capabilities list page with beforeLoad guard, renders RoleListTable |
| 14 | `routes/_authenticated/_admin/roles/$roleId/edit.tsx` | DONE | Edit Role page with metadata form, CapabilityEditor, PageAccessEditor |
| 15 | `routes/_authenticated/_admin/roles/new.tsx` | DONE | Add New Role page with auto-slug generation |
| 16 | `components/roles/role-list.tsx` | DONE | Role list table with columns: name (with badges), type, level, users, capabilities, status |
| 17 | `components/roles/capability-editor.tsx` | DONE | Grouped capability toggle with "Toggle All" per domain, Enable All/Disable All |
| 18 | `components/roles/role-selector.tsx` | DONE | Role dropdown for user forms with `useDefaultRoleId()` hook |
| 19 | `routes/_authenticated/_admin/users/index.tsx` | DONE | Users list page with UserListTable component |
| 20 | `routes/_authenticated/_admin/users/new.tsx` | DONE | Add New User with InviteUserForm |
| 21 | `routes/_authenticated/_admin/users/$userId/edit.tsx` | DONE | Edit User with RoleSelector, role assignment, password management, account actions |
| 22 | `components/layout/nav-guard.tsx` | DONE | Navigation item visibility based on path and/or capability |
| 23 | `lib/admin-shell/capabilities.ts` | DONE | hasCapability() and filterNavSections() for sidebar filtering |

### Website Frontend (ConvexPress-Website/apps/web/src/) -- ALL DONE

| # | File | Status | What It Does |
|---|------|--------|--------------|
| 24 | `lib/auth/auth.ts` | DONE | userCan, userCanAll, userCanAny, userHasRoleLevel, userHasRole, userCanEditContent utilities |
| 25 | `hooks/useCan.ts` | DONE | useCan, useCanFn, useCanAll, useCanAny, useRoleLevel, useHasRole, useCanEditContent hooks |

---

## ABSOLUTE RULES

1. **Backend functions NEVER deploy.** You write code only. The Convex Deployment Expert (`/experts:convex-deployment`) handles deployment after you finish. Never run `npx convex dev` or `npx convex deploy`.

2. **Every Convex mutation that modifies data MUST call `requireCan()` or `requireCanOnResource()` before proceeding.** No exceptions. Client-side `useCan()` checks are UI convenience only and must never be trusted alone.

3. **Use Base UI (`@base-ui/react`) for all interactive components.** NEVER use `@radix-ui/*`. NEVER use hardcoded Tailwind colors (zinc, slate, gray). Use CSS variables (`bg-card`, `bg-muted`) and opacity modifiers (`bg-black/40`).

4. **Full pages, not popups.** Content management (editing roles, users) ALWAYS navigates to a full page route. Confirmation dialogs for destructive actions (delete) are the ONLY acceptable popup.

5. **Meta capabilities (10 total) are NEVER stored on roles.** They are resolved at runtime by `mapMetaCap()` based on resource ownership. The `META_CAPABILITIES` set in `types/capabilities.ts` defines them.

6. **Modular schema only.** Role tables live in `convex/schema/roles.ts`. Capability tables live in `convex/schema/capabilities.ts`. NEVER put table definitions directly in `schema.ts`.

7. **Follow the existing pattern.** Routes use `createFileRoute` with `validateSearch` for search params and delegate rendering to a dedicated component (see `posts/index.tsx` and `users/index.tsx` as reference). Components live in `src/components/{system}/`.

8. **Event emission is wired.** All 6 mutations emit events via `emitEvent()`: `role.created`, `role.updated`, `role.deleted`, `role.assigned`, `role.capability_granted`, `role.capability_revoked`.

---

## VERIFICATION CHECKLIST

### Backend -- ALL PASS
- [x] `roles` + `roleChanges` tables exist in `schema/roles.ts` with correct indexes
- [x] `capabilities` table exists in `schema/capabilities.ts`
- [x] Both spread into `schema.ts` hub file
- [x] All 137 capabilities defined in `types/capabilities.ts` with domain groupings
- [x] 10 meta-capabilities defined with META_TO_CONCRETE mapping
- [x] `isValidCapability()`, `isMetaCapability()`, `isConcreteCapability()` validators exist
- [x] 5 built-in roles seeded with correct capability arrays in `seed/roles.ts`
- [x] `seedRoles` + `reseedRoles` + `migrateLegacyRoles` internal mutations exist
- [x] `requireCan()` throws ConvexError with `UNAUTHORIZED`/`FORBIDDEN` codes
- [x] `currentUserCan()` returns boolean (non-throwing)
- [x] `requireCanOnResource()` resolves meta-capabilities via `mapMetaCap()`
- [x] `getCurrentRoleLevel()` returns 0 if not authenticated
- [x] `resolveUserRole()` supports both roleId and legacy internalRole fallback
- [x] `assign` mutation prevents self-role-change
- [x] `assign` mutation enforces last-administrator protection
- [x] `remove` mutation blocks deletion of protected roles
- [x] `remove` mutation blocks deletion of roles with assigned users
- [x] `create` mutation validates slug uniqueness and capability validity
- [x] `grantCapability` validates capability string via `isValidCapability()`

### Admin Frontend -- ALL PASS
- [x] `AuthProvider` context provides `can()` and `canAccessRoute()` functions
- [x] `useCan()` hook works both as `useCan("post.create")` -> boolean and `useCan()` -> function
- [x] Roles list page at `/admin/roles` shows table with Role, Type, Level, Users, Capabilities columns
- [x] Edit Role page at `/admin/roles/$roleId/edit` shows capability toggles grouped by domain
- [x] "Toggle All" per domain group works correctly
- [x] Role selector component defaults to Subscriber (default role) via `useDefaultRoleId()`
- [x] Add New User page at `/admin/users/new` includes role selector
- [x] Edit User page at `/admin/users/$userId/edit` includes role assignment
- [x] Navigation items are filtered by `canAccessRoute()` via AdminSidebar + filterNavSections()
- [x] Route guards in `beforeLoad` check `pageAccess[]` and redirect on failure
- [x] No modals/popups for content management (full page navigation only)
- [x] Destructive actions (delete role) use confirmation dialog

### Website Frontend -- ALL PASS
- [x] `userCan()`, `userCanAll()`, `userCanAny()` utility functions in `lib/auth/auth.ts`
- [x] `userHasRoleLevel()`, `userHasRole()`, `userCanEditContent()` utilities
- [x] `useCan()`, `useCanFn()`, `useCanAll()`, `useCanAny()` hooks in `hooks/useCan.ts`
- [x] `useRoleLevel()`, `useHasRole()`, `useCanEditContent()` hooks

### Event Wiring -- ALL PASS
- [x] `role.created` event emitted from create mutation
- [x] `role.updated` event emitted from update mutation
- [x] `role.deleted` event emitted from remove mutation
- [x] `role.assigned` event emitted from assign mutation (triggers email + site notification + audit log)
- [x] `role.capability_granted` event emitted from grantCapability mutation
- [x] `role.capability_revoked` event emitted from revokeCapability mutation (bonus)

---

## RELATED EXPERTS

| Expert | When to Consult |
|--------|-----------------|
| `/experts:admin-shell-ui` | For sidebar nav integration, admin bar, shell layout patterns |
| `/experts:admin-list-table-ui` | For WordPress-style list table patterns (roles list, users list) |
| `/experts:admin-editor-ui` | For edit page layout patterns (edit role, edit user) |
| `/experts:admin-settings-ui` | For form patterns (capability toggles, role metadata forms) |
| `/experts:user-profile-system` | For `users` table schema (roleId field, by_roleId index) |
| `/experts:event-dispatcher-system` | For wiring emitEvent calls in mutations |
| `/experts:registration-system` | For default role assignment on new user signup |
| `/experts:convex-deployment` | For deploying schema and function changes |

---

$ARGUMENTS
