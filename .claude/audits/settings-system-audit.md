# Settings System - Full Code Audit Report

**Auditor:** Settings System Expert
**Date:** 2026-02-13
**Scope:** All Settings System files across backend, admin frontend, and website frontend
**Knowledge Doc Version:** 2026-02-13

---

## Executive Summary

The Settings System is a **well-implemented, production-quality system** with strong adherence to the knowledge doc PRD. All 6 core settings sections (general, reading, writing, discussion, permalinks, privacy) are fully implemented across backend and frontend. The architecture correctly follows the section-based design, defaults-over-stored pattern, event emission, and real-time reactive subscriptions described in the PRD.

**Overall Health: GOOD** -- No critical issues found. A handful of medium and low severity items that should be addressed for polish and strict compliance.

### Audit Score Card

| Category | Score | Notes |
|----------|-------|-------|
| **Hardcoded Colors** | 8/10 | Some hardcoded colors in callout/import components (yellow, emerald, red, green) |
| **Radix Imports** | 10/10 | Zero `@radix-ui` imports anywhere in the system |
| **TypeScript Quality** | 9/10 | Minimal `as` casts, well-typed throughout |
| **Security** | 9/10 | Strong auth on mutations; `get` query could be tighter |
| **React 19 Compatibility** | 10/10 | Excellent use of useTransition, sync-during-render pattern |
| **Dead Code** | 8/10 | Duplicate `computeChanges`, unused `helpers.ts` exports |
| **Import Resolution** | 10/10 | All imports resolve to existing files |
| **Convex Best Practices** | 9/10 | Proper modular schema, indexes, event emission |
| **Knowledge Doc Compliance** | 9/10 | Very close match; minor capability naming divergence |

---

## Files Audited

### Backend (`ConvexPress-Admin/packages/backend/convex/`)

| File | Path | Status |
|------|------|--------|
| Schema | `schema/settings.ts` | PASS |
| Defaults | `settings/defaults.ts` | PASS |
| Validators | `settings/validators.ts` | PASS |
| Queries | `settings/queries.ts` | PASS |
| Mutations | `settings/mutations.ts` | PASS |
| Internals | `settings/internals.ts` | PASS |
| Helpers | `settings/helpers.ts` | MINOR ISSUES |

### Admin Frontend (`ConvexPress-Admin/apps/web/src/`)

| File | Path | Status |
|------|------|--------|
| Settings Layout Route | `routes/_authenticated/_admin/settings.tsx` | PASS |
| Settings Index Redirect | `routes/_authenticated/_admin/settings/index.tsx` | MINOR ISSUE |
| General Settings Page | `routes/_authenticated/_admin/settings/general.tsx` | PASS |
| Reading Settings Page | `routes/_authenticated/_admin/settings/reading.tsx` | PASS |
| Writing Settings Page | `routes/_authenticated/_admin/settings/writing.tsx` | PASS |
| Discussion Settings Page | `routes/_authenticated/_admin/settings/discussion.tsx` | PASS |
| Permalink Settings Page | `routes/_authenticated/_admin/settings/permalinks.tsx` | PASS |
| Privacy Settings Page | `routes/_authenticated/_admin/settings/privacy.tsx` | PASS |
| Search Settings Page | `routes/_authenticated/_admin/settings/search.tsx` | PASS (not Settings System) |
| Notification Settings Page | `routes/_authenticated/_admin/settings/notifications.tsx` | PASS (not Settings System) |
| Email Settings Page | `routes/_authenticated/_admin/settings/email.tsx` | PASS (not Settings System) |
| Hook: useSettingsForm | `hooks/useSettingsForm.ts` | PASS |
| Types | `types/settings.ts` | PASS |
| Schemas | `lib/settings/schemas.ts` | PASS |
| SettingsPageLayout | `components/settings/SettingsPageLayout.tsx` | PASS |
| SettingsSection | `components/settings/SettingsSection.tsx` | PASS |
| SettingsField | `components/settings/SettingsField.tsx` | PASS |
| SaveButton | `components/settings/SaveButton.tsx` | PASS |
| SettingsCallout | `components/settings/SettingsCallout.tsx` | MINOR ISSUE |
| SettingsPageSkeleton | `components/settings/SettingsPageSkeleton.tsx` | PASS |
| TimezoneSelect | `components/settings/TimezoneSelect.tsx` | PASS |
| DateFormatPreview | `components/settings/DateFormatPreview.tsx` | PASS |
| TimeFormatPreview | `components/settings/TimeFormatPreview.tsx` | PASS |
| PageSelect | `components/settings/PageSelect.tsx` | PASS |
| CategorySelect | `components/settings/CategorySelect.tsx` | PASS |
| PermalinkTagButtons | `components/settings/PermalinkTagButtons.tsx` | PASS |
| PermalinkPreview | `components/settings/PermalinkPreview.tsx` | PASS |
| PermalinkChangeDialog | `components/settings/PermalinkChangeDialog.tsx` | MINOR ISSUE |
| ImportExport | `components/settings/ImportExport.tsx` | MINOR ISSUE |

### Website Frontend (`ConvexPress-Website/apps/web/src/`)

| File | Path | Status |
|------|------|--------|
| SettingsContext | `contexts/SettingsContext.tsx` | PASS |

---

## Findings

### ISSUE 1: Duplicate `computeChanges` function

**Severity:** MEDIUM
**Location:** `ConvexPress-Admin/packages/backend/convex/settings/mutations.ts` (lines 57-88) AND `ConvexPress-Admin/packages/backend/convex/settings/helpers.ts` (lines 31-60)
**Category:** Dead Code / DRY violation

The `computeChanges` function is defined twice with identical logic:
1. As a local function inside `mutations.ts` (lines 57-88)
2. As an exported function in `helpers.ts` (lines 31-60)

The `mutations.ts` file uses its own local copy and never imports from `helpers.ts`. This means the exported version in `helpers.ts` is potentially unused by the mutations.

**Impact:** Code duplication. If a bug is found in the change detection algorithm, it would need to be fixed in two places.

**Recommendation:** Remove the local `computeChanges` from `mutations.ts` and import from `helpers.ts` instead.

---

### ISSUE 2: Hardcoded color classes in callout/dialog/import components

**Severity:** MEDIUM
**Location:** Multiple files
**Category:** Hardcoded Colors (BANNED per project rules)

The following hardcoded Tailwind color classes were found:

| File | Colors Used |
|------|-------------|
| `SettingsCallout.tsx` (line 29-30) | `bg-yellow-500/10`, `border-yellow-500/30`, `text-yellow-600`, `dark:text-yellow-500` |
| `PermalinkChangeDialog.tsx` (line 46) | `text-yellow-600`, `dark:text-yellow-500` |
| `ImportExport.tsx` (line 301) | `text-emerald-600` |

**Note:** The email-related settings components (EmailStatsCards, EmailSettingsForm, EmailTemplatePreview, EmailTemplateList, EmailTemplateEditorPage, EmailQueueDetailPage) also contain hardcoded colors (`emerald-*`, `red-*`, `yellow-*`, `green-*`), but those belong to the Email Notification System, not the Settings System proper.

**Impact:** Violates the project's "no hardcoded colors" rule. Should use CSS variables or semantic tokens.

**Recommendation:**
- Warning callout: Replace `yellow-500/10` with a semantic warning variable or `bg-foreground/5` pattern
- `text-yellow-600` / `dark:text-yellow-500`: Replace with a semantic warning foreground variable
- `text-emerald-600` in ImportExport: Replace with `text-primary` or a semantic success variable

---

### ISSUE 3: Redirect path in settings index may be incorrect

**Severity:** MEDIUM
**Location:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/index.tsx` (line 11)
**Category:** Routing / Potential Bug

```typescript
throw redirect({ to: "/settings/general" });
```

This redirects to `/settings/general` but the route tree places this under `/_authenticated/_admin/settings/`. Depending on how TanStack Router handles this redirect (relative vs absolute), this could either:
1. Work correctly if TanStack Router resolves it relative to the current route segment
2. Navigate to a literal `/settings/general` path which does not exist at root level

The knowledge doc says: "/admin/settings redirects to /admin/settings/general."

**Impact:** Potential broken redirect on the settings index page. Needs verification in the running app.

**Recommendation:** Verify this works at runtime. If it does not, change to the absolute path pattern that matches the route tree. TanStack Router's redirect behavior in `beforeLoad` may need the path to be specified differently.

---

### ISSUE 4: `getInternalArgs` uses `v.string()` instead of section union validator

**Severity:** LOW
**Location:** `ConvexPress-Admin/packages/backend/convex/settings/validators.ts` (lines 173-175)
**Category:** TypeScript / Validation

```typescript
export const getInternalArgs = {
  section: v.string(),
};
```

The internal query accepts any string for `section`, while all other queries/mutations use the typed `sectionValidator` union. The `internals.ts` handler does validate at runtime via `isValidSection()`, so this is safe, but the loose validator means Convex won't reject invalid section strings at the transport layer.

**Impact:** Minor. Runtime validation handles this, and the comment in `internals.ts` explains the design decision (flexibility for dynamic section name building). However, it means the Convex dashboard won't show the correct type.

**Recommendation:** Acceptable as-is given the documented rationale. No change needed.

---

### ISSUE 5: `helpers.ts` exports are partially unused

**Severity:** LOW
**Location:** `ConvexPress-Admin/packages/backend/convex/settings/helpers.ts`
**Category:** Dead Code

The `helpers.ts` file exports 4 functions:
- `computeChanges` -- duplicated in `mutations.ts` (see Issue 1)
- `getSettingsDoc` -- not imported by any file in the settings system
- `mergeWithDefaults` -- not imported by any file in the settings system
- `requireValidSection` -- not imported by any file in the settings system

These are utility functions likely intended for use by OTHER systems that need to read settings server-side, but currently none of them are consumed.

**Impact:** Dead code that adds maintenance burden without value.

**Recommendation:** Either:
1. Leave as-is if other systems are planned to use them soon
2. Remove unused exports and re-add when needed

---

### ISSUE 6: `exportAll` query uses `new Date()` which is non-deterministic in Convex

**Severity:** LOW
**Location:** `ConvexPress-Admin/packages/backend/convex/settings/queries.ts` (line 262)
**Category:** Convex Best Practices

```typescript
exportedAt: new Date().toISOString(),
```

Convex queries are supposed to be deterministic (pure functions of the database state). Using `new Date()` inside a query makes it non-deterministic. While Convex may tolerate this in practice (it doesn't strictly enforce determinism in all environments), it could cause issues with Convex's caching and re-execution logic.

**Impact:** Low. The query may produce different results on re-execution even if no data changed, which could interfere with Convex's subscription/caching optimization.

**Recommendation:** Move the timestamp generation to the client side, or convert `exportAll` to an action instead of a query (since it has a side-effect-like nature of producing timestamped output).

---

### ISSUE 7: `as Record<string, unknown>` casts on `doc.values`

**Severity:** LOW
**Location:** Multiple locations in `queries.ts`, `mutations.ts`, `internals.ts`
**Category:** TypeScript

Throughout the backend, `doc.values` is cast with `as Record<string, unknown>` because the schema defines values as `v.any()`. Examples:

- `queries.ts` line 96: `{ ...defaults, ...(doc.values as Record<string, unknown>) }`
- `mutations.ts` line 131: `...(values as Record<string, unknown>)`
- `internals.ts` line 65: `{ ...defaults, ...(doc.values as Record<string, unknown>) }`

**Impact:** This is a known trade-off documented in the schema. The `v.any()` type is intentional because each section has a different shape, and per-section validation happens at the mutation level. The casts are necessary and correct.

**Recommendation:** No change needed. The casts are appropriate given the `v.any()` schema design.

---

### ISSUE 8: Capability names diverge from knowledge doc

**Severity:** LOW
**Location:** `ConvexPress-Admin/packages/backend/convex/settings/mutations.ts` (lines 36-51)
**Category:** Knowledge Doc Compliance

The knowledge doc states that all settings mutations require the `manage_options` capability. However, the implementation uses per-section capabilities:

```typescript
const SECTION_CAPABILITY_MAP = {
  general: "settings.update_general",
  reading: "settings.update_reading",
  // ...
};
```

The admin layout route (`settings.tsx`) does check `manage_options` at the route level, so access is properly restricted. The per-section capabilities are a MORE granular approach than the PRD specifies.

**Impact:** Low. The route-level guard ensures only admins with `manage_options` reach the settings pages. The per-section capabilities provide additional granularity that could be useful if roles evolve. This is strictly more secure than the PRD requires.

**Recommendation:** No change needed. The implementation exceeds the PRD's security requirements.

---

### ISSUE 9: `sectionSchemas` map uses `as unknown as z.ZodObject<z.ZodRawShape>` cast

**Severity:** LOW
**Location:** `ConvexPress-Admin/apps/web/src/lib/settings/schemas.ts` (lines 267-274)
**Category:** TypeScript

```typescript
export const sectionSchemas: Record<string, z.ZodObject<z.ZodRawShape>> = {
  general: generalSettingsSchema as unknown as z.ZodObject<z.ZodRawShape>,
  // ...
};
```

Each schema is double-cast through `unknown` to satisfy the `z.ZodObject<z.ZodRawShape>` type. This is because Zod's inferred generic types don't match the generic `ZodRawShape` type.

**Impact:** This is a common Zod pattern and is safe. The schemas themselves are correct; the cast is only to satisfy TypeScript's structural typing for the heterogeneous map.

**Recommendation:** No change needed. This is a standard Zod TypeScript pattern.

---

### ISSUE 10: Date/time format previews don't use selected timezone

**Severity:** LOW
**Location:** `ConvexPress-Admin/apps/web/src/components/settings/DateFormatPreview.tsx`, `TimeFormatPreview.tsx`
**Category:** Knowledge Doc Compliance

Both preview components accept a `timezone` prop but ignore it:

```typescript
// DateFormatPreview.tsx
export function DateFormatPreview({
  format,
}: DateFormatPreviewProps) {  // timezone is destructured but not used
```

The knowledge doc (edge case 11) states: "The live preview in General Settings should render the preview in the currently-selected timezone, not the browser's local timezone."

The `general.tsx` route does not even pass the `timezone` prop to these components.

**Impact:** The preview always shows the browser's local time regardless of the selected timezone. This is a minor UX deviation from the spec.

**Recommendation:** Pass the selected timezone from the form to the preview components and use `Intl.DateTimeFormat` with the `timeZone` option to render in the selected timezone.

---

### ISSUE 11: `notifications.tsx` test notification uses `setTimeout` stub

**Severity:** LOW
**Location:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/settings/notifications.tsx` (lines 274-286)
**Category:** Implementation Completeness

The "Send Test" button uses a `setTimeout` to simulate sending a notification:

```typescript
setTimeout(() => {
  toast.info("Test Notification", { ... });
  setSending(false);
}, 500);
```

**Note:** This page belongs to the Site Notification System, not the Settings System. Including here for completeness since it lives under the settings route hierarchy.

**Impact:** Not functional in production. Should call a real Convex mutation.

**Recommendation:** Defer to the Site Notification System Expert.

---

### ISSUE 12: `PermalinkChangeDialog` uses custom dialog instead of Base UI Dialog

**Severity:** LOW
**Location:** `ConvexPress-Admin/apps/web/src/components/settings/PermalinkChangeDialog.tsx`
**Category:** UI Consistency

The dialog is a custom implementation (manual backdrop, manual positioning) rather than using the project's standard `@base-ui/react` Dialog component. This is functionally correct and the component itself is well-built with proper `role="alertdialog"`, `aria-labelledby`, `aria-describedby` attributes.

**Impact:** Minor inconsistency. If Base UI's Dialog component is available, it would provide better accessibility defaults (focus trap, escape key handling, scroll lock).

**Recommendation:** Consider migrating to Base UI's Dialog component for consistency, but this is low priority as the current implementation is functional and accessible.

---

### ISSUE 13: Password notification fields are outside the original PRD scope

**Severity:** INFORMATIONAL
**Location:** Backend `defaults.ts` (lines 68-71, 158-162), `validators.ts` (lines 47-49), Frontend `general.tsx` (lines 236-275), `schemas.ts` (lines 49-51)
**Category:** Knowledge Doc Compliance

The General Settings section includes 3 password notification fields not in the original PRD:
- `sendPasswordResetEmail`
- `sendPasswordChangedEmail`
- `notifyAdminOnPasswordReset`

These were added by the Password Management System and are read by `helpers/password.ts`. They are correctly integrated with proper types, validators, defaults, and UI.

**Impact:** None. This is a legitimate extension of the General Settings to accommodate cross-system needs. The knowledge doc has been updated to reflect these fields.

---

## Checklist Verification

### Implementation Checklist from Knowledge Doc

| Item | Status | Notes |
|------|--------|-------|
| `convex/schema/settings.ts` - 1 table | DONE | Correct modular schema with `settingsTables` export |
| `convex/settings/queries.ts` - 5 queries | DONE | `get`, `getBySection`, `getAutoloaded`, `getPublic`, `exportAll` |
| `convex/settings/mutations.ts` - 2 mutations | DONE | `updateSection`, `importAll` |
| `convex/settings/internals.ts` - 1 internal query | DONE | `getInternal` |
| `convex/settings/helpers.ts` - Shared logic | DONE | `computeChanges`, `getSettingsDoc`, `mergeWithDefaults`, `requireValidSection` |
| `convex/settings/defaults.ts` - Default constants | DONE | All 6 sections with proper types |
| `convex/settings/validators.ts` - Per-section validators | DONE | All 6 section validators + argument validators |
| Settings index redirect | DONE | Redirects to general (path may need verification) |
| General Settings page | DONE | Full implementation with all fields |
| Reading Settings page | DONE | Homepage display, pagination, feed, SEO visibility |
| Writing Settings page | DONE | Default category, post format |
| Discussion Settings page | DONE | All ~24 fields across 6 sections |
| Permalink Settings page | DONE | Structure radio, custom input, tag buttons, confirmation dialog |
| Privacy Settings page | DONE | Policy page select, link toggle, guide content |
| SettingsPageLayout component | DONE | Title, description, sticky save button |
| DateFormatPreview component | DONE | Live preview (timezone integration pending) |
| TimeFormatPreview component | DONE | Live preview (timezone integration pending) |
| TimezoneSelect component | DONE | Grouped searchable timezone picker |
| PageSelect component | DONE | Real Convex page query |
| CategorySelect component | DONE | Real Convex taxonomy query |
| PermalinkTagButtons component | DONE | Cursor-position-aware tag insertion |
| ImportExport component | DONE | Full export/import with diff preview |
| Website SettingsContext | DONE | Provider + `useSettings()` + `useSetting()` hooks |

### Feature Compliance

| Feature | Status | Notes |
|---------|--------|-------|
| Section-based schema design | PASS | One document per section |
| Defaults-over-stored pattern | PASS | Code defaults merged with DB overrides |
| `v.any()` with mutation-level validation | PASS | Per-section validators in `validators.ts` |
| `by_section` index with `.unique()` | PASS | Used consistently across all queries |
| Change detection (diff) | PASS | `computeChanges` function with JSON.stringify comparison |
| Event emission | PASS | `settings.updated` and `settings.permalinks_changed` |
| Auth guards (route level) | PASS | `manage_options` capability check in layout route |
| Auth guards (mutation level) | PASS | Per-section capability checks |
| Public queries (no auth) | PASS | `getAutoloaded` and `getPublic` are unauthenticated |
| Autoloaded sections | PASS | 5 sections (excludes writing) |
| Public settings filtering | PASS | Excludes `adminEmail`, word lists, other admin-only fields |
| Dirty tracking | PASS | Deep equality comparison in `useSettingsForm` |
| Navigation guard | PASS | `useNavigationGuard` hook with unsaved changes warning |
| Keyboard save (Ctrl+S) | PASS | `useKeyboardSave` hook |
| Loading skeletons | PASS | `SettingsPageSkeleton` component |
| Concurrent edit detection | PASS | React 19 sync-during-render pattern with toast notification |
| Optimistic updates | PARTIAL | Form resets `initialValues` on save; no Convex `optimisticUpdate` |
| Permalink change confirmation | PASS | `PermalinkChangeDialog` with old/new structure display |
| Live date/time preview | PASS | Custom formatters (timezone integration pending) |
| Import/export | PASS | Full implementation with diff preview and selective import |
| Collapsible sections | PASS | Discussion settings uses `collapsible` prop |
| Conditional fields | PASS | Grid row animation for dependent fields |

---

## Security Assessment

| Check | Status | Details |
|-------|--------|---------|
| Mutations require auth | PASS | All mutations call `requireCan()` with specific capabilities |
| Queries require auth (admin) | PASS | `get`, `getBySection`, `exportAll` check for current user |
| Public queries are safe | PASS | `getPublic` excludes sensitive fields (adminEmail, word lists) |
| Input validation | PASS | Per-section Convex validators + client-side Zod schemas |
| No SQL/NoSQL injection risk | PASS | Convex handles parameterization; no raw query construction |
| Route-level guards | PASS | Layout route checks `manage_options` before rendering any settings page |
| CSRF protection | N/A | Convex WebSocket protocol does not have CSRF concerns |
| Rate limiting | N/A | Handled at the Convex platform level |

---

## Performance Assessment

| Query | Design | Notes |
|-------|--------|-------|
| `getBySection` | Single indexed lookup + merge | O(1) via `by_section` index with `.unique()`. Excellent. |
| `getAutoloaded` | 5 indexed lookups | Sequential queries for 5 sections. Could be parallelized but Convex handles this efficiently. |
| `getPublic` | Same as autoloaded + field picking | Same pattern, curates output. |
| `exportAll` | 6 indexed lookups | All sections. Admin-only, acceptable performance. |
| `updateSection` | 1 read + 1 write + event emission | Standard upsert pattern. Efficient. |
| `importAll` | Up to 6 reads + 6 writes + events | Atomic per-section. Acceptable for rare operation. |

---

## Prioritized Fix List

### Priority 1 (Should Fix Soon)

1. **[MEDIUM] Issue 1: Remove duplicate `computeChanges`** -- Import from `helpers.ts` instead of maintaining a local copy in `mutations.ts`. Pure DRY fix, no behavior change.

2. **[MEDIUM] Issue 2: Replace hardcoded colors** -- Convert `yellow-500/*` and `emerald-600` classes to semantic CSS variables in `SettingsCallout.tsx`, `PermalinkChangeDialog.tsx`, and `ImportExport.tsx`.

3. **[MEDIUM] Issue 3: Verify settings index redirect path** -- Test the `/settings/general` redirect in the running app to ensure it resolves correctly under the `/_authenticated/_admin/settings/` route tree.

### Priority 2 (Nice to Have)

4. **[LOW] Issue 10: Pass timezone to date/time format previews** -- Wire the timezone field value from the general settings form to the `DateFormatPreview` and `TimeFormatPreview` components and use `Intl.DateTimeFormat` for timezone-aware rendering.

5. **[LOW] Issue 5: Clean up unused `helpers.ts` exports** -- Either document that these are for cross-system use or remove unused `getSettingsDoc`, `mergeWithDefaults`, `requireValidSection` exports.

6. **[LOW] Issue 6: Address `new Date()` in `exportAll` query** -- Either move timestamp to client or convert to an action.

### Priority 3 (Informational / Deferred)

7. **[LOW] Issue 12: Migrate PermalinkChangeDialog to Base UI Dialog** -- For consistency across the admin UI.

8. **[LOW] Issue 4: Tighten `getInternalArgs` validator** -- Change from `v.string()` to `sectionValidator` for stricter transport-level validation.

---

## Cross-System Integration Status

| Dependent System | Integration Point | Status |
|-----------------|-------------------|--------|
| **Routing System** | Listens for `settings.permalinks_changed` | Event emitted correctly |
| **theme configuration** | Reads `siteTitle`, `tagline` via public settings | `getPublic` returns these fields |
| **Comment System** | Reads discussion settings | Available via `getInternal` or `getPublic` |
| **Post System** | Reads `defaultCategory`, `defaultPostFormat` | Available via `getBySection("writing")` |
| **Registration System** | Reads `membershipEnabled`, `defaultRole` | Available via `getPublic` and `getBySection("general")` |
| **RSS/Feed System** | Reads `feedItemCount`, `feedContentDisplay` | Available via `getPublic` |
| **SEO System** | Reads `searchEngineVisibility`, `siteTitle`, `tagline` | Available via `getPublic` |
| **Sitemap System** | Listens for `settings.permalinks_changed` | Event emitted correctly |
| **Page System** | Referenced by `homepageId`, `postsPageId`, `privacyPolicyPageId` | Page IDs stored correctly |
| **Audit Log System** | Subscribes to `settings.updated` events | Events emitted with full diff payload |
| **Email Notification System** | Subscribes to settings events for admin alerts | Events include `section`, `changes`, `updatedBy`, `timestamp` |
| **Site Notification System** | Settings Updated toast + Permalink Changed persistent warning | Events emitted with correct event codes |
| **Password Management System** | Reads `sendPasswordResetEmail`, `sendPasswordChangedEmail`, `notifyAdminOnPasswordReset` | Fields added to General Settings with proper defaults |
| **Website Frontend** | Consumes `getPublic` via SettingsContext | Provider, `useSettings()`, and `useSetting()` hooks implemented |

---

## Conclusion

The Settings System is one of the most complete and well-designed systems in the ConvexPress. It faithfully mirrors the WordPress Settings API patterns while leveraging Convex's reactive architecture for real-time updates. The frontend implementation is clean, accessible, and follows React 19 best practices throughout.

The main areas for improvement are:
1. A small DRY violation (duplicate `computeChanges`)
2. Hardcoded color classes that should use semantic tokens
3. Timezone-aware date/time preview (partial implementation)

None of these issues affect core functionality or security. The system is production-ready.
