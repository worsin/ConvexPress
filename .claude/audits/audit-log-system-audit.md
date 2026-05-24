# Audit Log System - Full Code Review & Audit

**Date:** 2026-02-13
**Auditor:** Audit Log System Expert
**Status:** Complete
**PRD Completion:** ~92%

---

## Executive Summary

The Audit Log System is substantially implemented with excellent architecture and well-structured code. The backend (schema, queries, mutations, internals, actions, helpers, bootstrap, cron) is fully implemented. The admin frontend has all specified components, routes, hooks, types, constants, and formatters. There are **no Radix imports** (Base UI is correctly used for dialogs). There are a few hardcoded Tailwind color names that should use CSS variables instead. The most critical finding is a **missing authentication/authorization check in the export action**, which could allow unauthenticated users to export the entire audit log.

---

## PRD Compliance Checklist

### Backend (`ConvexPress-Admin/packages/backend/convex/`)

| Item | Status | File | Notes |
|------|--------|------|-------|
| `auditEntries` schema (1 table, 9 indexes) | DONE | `convex/schema/auditLogs.ts` | Actually has **10 indexes** (9 from PRD + `by_system`) + **1 search index** (`search_audit`). Extra field `action` and `system` added beyond PRD spec. |
| `auditLog/queries.ts` - `list` | DONE | `convex/auditLogs/queries.ts` | Fully implemented with index selection, post-filters, pagination |
| `auditLog/queries.ts` - `get` | DONE | `convex/auditLogs/queries.ts` | Full detail with event metadata, changes, related entries |
| `auditLog/queries.ts` - `getObjectHistory` | DONE | `convex/auditLogs/queries.ts` | By-object index query |
| `auditLog/queries.ts` - `getStats` | DONE | `convex/auditLogs/queries.ts` | Aggregation by severity, object type, top actors |
| `auditLog/queries.ts` - `getByEvent` | DONE (EXTRA) | `convex/auditLogs/queries.ts` | Not in PRD; useful utility |
| `auditLog/queries.ts` - `recentActivity` | DONE (EXTRA) | `convex/auditLogs/queries.ts` | Not in PRD; powers dashboard/activity widget |
| `auditLog/mutations.ts` - `clear` | DONE | `convex/auditLogs/mutations.ts` | All safety guards, dry run, batch + continuation |
| `auditLog/actions.ts` - `export` | DONE | `convex/auditLogs/actions.ts` | CSV/JSON generation, Convex storage upload |
| `auditLog/handlers.ts` - `onAnyEvent` | DONE | `convex/auditLogs/internals.ts` | Named `createEntry` (not `onAnyEvent`), function is correct |
| `auditLog/validators.ts` | DONE | `convex/auditLogs/validators.ts` | All validators defined |
| `helpers/auditClassification.ts` | DONE | `convex/helpers/auditClassification.ts` | SEVERITY_MAP, SYSTEM_TO_OBJECT_TYPE |
| `helpers/auditDescriptions.ts` | DONE | `convex/helpers/auditDescriptions.ts` | Full DESCRIPTION_MAP for all event codes |
| `helpers/auditObjectExtractors.ts` | DONE | `convex/helpers/auditObjectExtractors.ts` | Per-system extractors with overrides |
| `crons/auditLogCleanup.ts` | DONE | `convex/crons.ts` (line 95-99) | Registered as `audit-log-retention-cleanup` daily at 4:15 UTC |
| `bootstrap/registerListeners.ts` | DONE | `convex/bootstrap/registerListeners.ts` | Global wildcard `*` listener at priority 99 |

### Admin Frontend (`ConvexPress-Admin/apps/web/src/`)

| Item | Status | File | Notes |
|------|--------|------|-------|
| Activity Log page (`/admin/activity`) | DONE | `routes/_authenticated/_admin/tools/activity.tsx` | Route is at `/tools/activity` not `/admin/activity` (route nesting handles it) |
| Audit Log page (`/admin/audit-log`) | DONE | `routes/_authenticated/_admin/tools/audit-log/index.tsx` | Route at `/tools/audit-log/` |
| Entry Detail page | DONE | `routes/_authenticated/_admin/tools/audit-log/$entryId.tsx` | Full detail view |
| `ActivityTimeline.tsx` | DONE | `components/audit/ActivityTimeline.tsx` | Date grouping, category tabs, load more |
| `ActivityEntry.tsx` | DONE | `components/audit/ActivityEntry.tsx` | Expandable inline detail |
| `AuditTable.tsx` | DONE | `components/audit/AuditTable.tsx` | WordPress-style data table |
| `AuditFilterBar.tsx` | DONE | `components/audit/AuditFilterBar.tsx` | Search, dropdowns, date range, export/clear buttons |
| `AuditStatsBar.tsx` | DONE | `components/audit/AuditStatsBar.tsx` | Severity counts, period selector |
| `AuditEntryDetail.tsx` | DONE | `components/audit/AuditEntryDetail.tsx` | Full detail with actor, object, changes, payload, event, related |
| `AuditChangesTable.tsx` | DONE | `components/audit/AuditChangesTable.tsx` | Diff table with color coding |
| `AuditExportDialog.tsx` | DONE | `components/audit/AuditExportDialog.tsx` | Base UI Dialog, format/records/payload config |
| `AuditClearDialog.tsx` | DONE | `components/audit/AuditClearDialog.tsx` | Base UI Dialog, mode selection, dry run, confirm phrase |
| `AuditPayloadViewer.tsx` | DONE | `components/audit/AuditPayloadViewer.tsx` | Collapsible JSON viewer with copy |
| `SeverityBadge.tsx` | DONE | `components/audit/SeverityBadge.tsx` | Multiple variants (dot, label, badge, full) |
| `lib/audit/types.ts` | DONE | `lib/audit/types.ts` | All type interfaces |
| `lib/audit/constants.ts` | DONE | `lib/audit/constants.ts` | Severity config, object type labels, filter options |
| `lib/audit/formatters.ts` | DONE | `lib/audit/formatters.ts` | Date, relative time, severity, file size formatters |
| `hooks/audit/useAuditList.ts` | DONE | `hooks/audit/useAuditList.ts` | URL-synced filter state, pagination |
| `hooks/audit/useAuditStats.ts` | DONE | `hooks/audit/useAuditStats.ts` | Period state management |
| `hooks/audit/useAuditMutations.ts` | DONE | `hooks/audit/useAuditMutations.ts` | Clear and export hooks with toast feedback |

### Missing Items

| Item | Severity | Notes |
|------|----------|-------|
| "Pause live updates" toggle | Low | PRD specifies optional toggle for audit log page; not implemented |
| `prevCursor` in list response | Low | PRD specifies bidirectional pagination; only forward (`nextCursor`) is implemented |
| `totalEstimate` in list response | Low | PRD specifies estimated total count; not returned |
| `password.reset_completed` event in SEVERITY_MAP | Low | PRD lists this event; not in implementation's SEVERITY_MAP |
| `settings.permalinks_changed` event in SEVERITY_MAP | Low | PRD lists this event; not in implementation's SEVERITY_MAP |
| `api.key_revoked` event in SEVERITY_MAP | Low | PRD lists this event; not in implementation's SEVERITY_MAP |
| `auth.login_failed` event in SEVERITY_MAP | Medium | PRD lists this as Critical; implementation uses `auth.login` (different code naming) |
| `comment.replied` in SEVERITY_MAP | Low | PRD lists this; not in implementation |
| `comment.spammed` in SEVERITY_MAP | Low | PRD lists this; not in implementation |
| `menu.location_assigned` in SEVERITY_MAP | Low | PRD lists this; not in implementation |
| `taxonomy.category_updated` in SEVERITY_MAP | Low | PRD lists this; not in implementation |
| `notification.email_sent/failed/site_sent` in SEVERITY_MAP | Low | PRD lists these; implementation uses `email.sent`, `email.failed`, `notification.sent` (different code naming) |
| `registration.user_registered` in SEVERITY_MAP | Low | PRD lists this; implementation uses `registration.registered` (different code) |
| `auth.email_verified` in SEVERITY_MAP | Low | PRD lists this; implementation uses `registration.email_verified` (different code) |

**Note:** Many of the "missing" severity map entries are actually just naming differences between the PRD and actual event codes in the implementation. The PRD used hypothetical event code names, while the actual implementation uses the real event codes from the Event Dispatcher System. These are NOT bugs -- they are expected deviations. The implementation correctly covers the events that actually exist.

---

## Issue Findings

### CRITICAL

#### 1. Missing Auth Check in Export Action
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\auditLogs\actions.ts`
- **Lines:** 58-167
- **Description:** The `exportAuditLog` action has **no authentication or authorization check**. It validates args but never calls `requireCan(ctx, "audit.export")` or checks the user identity. Any unauthenticated caller could potentially trigger an export via the Convex client.
- **Impact:** An unauthenticated user could export the entire audit log including sensitive data (actor emails, IP addresses, role changes, security events).
- **Fix:** Add auth check at the top of the handler. Since this is an `action` (not a mutation/query), `requireCan` may need to be adapted for action context, or use `ctx.auth.getUserIdentity()` directly plus a separate capability check via `ctx.runQuery`.

### HIGH

#### 2. `as any` Type Assertions in Backend
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\auditLogs\mutations.ts`
- **Line:** 132 - `q.eq("severity", args.severity as any)`
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\auditLogs\internals.ts`
- **Line:** 257 - `q.eq("severity", args.severity as any)`
- **Description:** The severity validator in the mutation clear args uses `v.optional(severityValidator)`, but when used in the index query the type isn't narrowed, requiring `as any`. This is a type-safety gap.
- **Fix:** Either narrow the type with a type guard before querying, or cast to the specific union type instead of `any`.

#### 3. `any` Types in Queries Helper Function
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\auditLogs\queries.ts`
- **Lines:** 608, 610
- **Description:** `applyPostFilters` parameter types use `_id: any` and `[key: string]: any`. These should use proper Convex document types.
- **Fix:** Import `Doc` from `../_generated/dataModel` and type the parameter as `Array<Doc<"auditEntries">>`.

#### 4. `any` Type in Export Action
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\auditLogs\actions.ts`
- **Line:** 82 - `const result: any = await ctx.runQuery(...)`
- **Description:** The result from `ctx.runQuery` is typed as `any` instead of the proper return type.
- **Fix:** Define the return type interface and cast properly.

### MEDIUM

#### 5. Hardcoded Tailwind Color Names
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\lib\audit\constants.ts`
- **Lines:** 36-38 (orange-500), 43-45 (yellow-500)
- **Description:** `bg-orange-500`, `text-orange-500`, `bg-yellow-500`, `text-yellow-500` are hardcoded Tailwind color names. The project rules specify using CSS variables or opacity modifiers only.
- **Impact:** These colors won't adapt to theme changes and violate the design system rules.
- **Recommendation:** Replace with CSS variable-based alternatives. For severity indicators, consider creating `--severity-high` and `--severity-medium` CSS variables or use `hsl()` variables from the theme.

- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\audit\AuditChangesTable.tsx`
- **Line:** 116 - `text-yellow-500`
- **Description:** Same issue -- hardcoded `yellow-500` for the "changed" indicator.

#### 6. `as any` Type Assertions in Frontend
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\hooks\audit\useAuditMutations.ts`
- **Line:** 78 - `(await exportAction(options as any))`
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\audit\ActivityTimeline.tsx`
- **Line:** 55 - `types.has(e.objectType as any)`
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\audit\AuditStatsBar.tsx`
- **Line:** 91 - `(undefined as any)`
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\audit\AuditExportDialog.tsx`
- **Lines:** 56-57 - `currentFilters?.severity as any`, `currentFilters?.objectType as any`
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated\_admin\tools\audit-log\$entryId.tsx`
- **Line:** 28 - `entryId: entryId as any`
- **Description:** Multiple `as any` casts throughout the frontend. These reduce type safety and can mask real type errors.
- **Fix:** Use proper type narrowing or create helper functions that handle the type conversion.

#### 7. Missing `useEffect` Dependency
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\audit\AuditFilterBar.tsx`
- **Line:** 57 - `useEffect(() => { onFilterChange("search", debouncedSearch || undefined); }, [debouncedSearch]);`
- **Description:** `onFilterChange` is not listed in the dependency array of `useEffect`. This could cause stale closure issues if `onFilterChange` changes identity.
- **Fix:** Add `onFilterChange` to the dependency array, or wrap it in `useCallback` at the call site.

#### 8. Schema Deviation from PRD: Extra Fields
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\schema\auditLogs.ts`
- **Lines:** 36, 51
- **Description:** The schema has two fields not specified in the PRD:
  - `action: v.string()` (line 36) - A human-readable action label (e.g., "Published Post")
  - `system: v.string()` (line 51) - Source system slug (e.g., "post", "role", "auth")
- **Impact:** These are actually **improvements** over the PRD (the `system` field enables the `by_system` index and search index filter). Not a bug, but worth noting the deviation.

#### 9. Route Path Deviation
- **Description:** The PRD specifies routes at `/admin/activity` and `/admin/audit-log`. The implementation routes are at `/_authenticated/_admin/tools/activity` and `/_authenticated/_admin/tools/audit-log/`. The `/tools/` prefix is a deviation from the PRD.
- **Impact:** Low -- this is likely a deliberate organizational choice to group admin tools together. The URLs resolve correctly through TanStack Router's nested layout.

### LOW

#### 10. `getStats` Performance Concern
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\auditLogs\queries.ts`
- **Lines:** 474-478
- **Description:** The `getStats` query fetches up to 10,000 entries and aggregates in-memory. The comment on line 472-473 acknowledges this: "For large datasets, this query may be slow. In production, consider a materialized view or separate stats table."
- **Impact:** On a busy CMS with high event volume (500+/day), the "month" period could approach the 10k cap and miss entries. The "week" and "today" periods should be fine.
- **Recommendation:** Consider adding a `statsCache` table or using a dedicated aggregation pattern.

#### 11. No "Previous Page" Navigation
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\audit\AuditTable.tsx`
- **Lines:** 168-183
- **Description:** Only "Next Page" button is rendered. The `hasCursor` prop is passed but unused for a "Previous" button. The hook only tracks forward pagination.
- **Impact:** Users cannot go back to previous pages of results.

#### 12. Dead Import in `$entryId.tsx`
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated\_admin\tools\audit-log\$entryId.tsx`
- **Line:** 16 - `import { Button } from "@/components/ui/button";`
- **Description:** The `Button` component is imported but only used in the "not found" state (line 52). While technically used, the component renders via `window.history.back()` which is not a TanStack Router navigation pattern.

#### 13. Retention Cleanup Routes to `clearBatch` Instead of Self
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\auditLogs\internals.ts`
- **Lines:** 324-332
- **Description:** `retentionCleanup` schedules continuation via `internal.auditLogs.internals.clearBatch` rather than scheduling itself. The `clearBatch` function includes the `mode` and `severity` args pattern from the user-initiated clear, while `retentionCleanup` only needs the `expired` mode. This works correctly since `clearBatch` handles mode `"expired"`, but it's a minor coupling concern.

#### 14. `actorUserAgent` Always Undefined in createEntry
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\auditLogs\internals.ts`
- **Line:** 215 - `actorUserAgent: undefined`
- **Description:** The `actorUserAgent` field is always set to `undefined`. The schema supports it, but no event source currently provides user agent data. The `actorIp` field is populated from `event.actorIp`, but there's no equivalent `event.actorUserAgent` field being read.
- **Impact:** Low -- the field exists in the schema but is never populated. The PRD notes this is "when available."

#### 15. `sessionId` Always Undefined in createEntry
- **File:** `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\auditLogs\internals.ts`
- **Line:** 222 - `sessionId: undefined`
- **Description:** Similar to actorUserAgent -- the field exists but is never populated.

---

## Banned Pattern Checks

### Radix Imports
**Status: CLEAN - No Radix imports found.**

All dialog components correctly use `@base-ui/react/dialog`:
- `AuditExportDialog.tsx` (line 15): `import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"`
- `AuditClearDialog.tsx` (line 15): `import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"`

### Hardcoded Colors
**Status: 3 VIOLATIONS FOUND**

| File | Line | Violation | Suggested Fix |
|------|------|-----------|---------------|
| `lib/audit/constants.ts` | 36-38 | `bg-orange-500`, `text-orange-500`, `bg-orange-500/10 text-orange-500` | Use CSS variable (e.g., `--color-warning`) |
| `lib/audit/constants.ts` | 43-45 | `bg-yellow-500`, `text-yellow-500`, `bg-yellow-500/10 text-yellow-500` | Use CSS variable (e.g., `--color-caution`) |
| `AuditChangesTable.tsx` | 116 | `text-yellow-500` | Use CSS variable |

**Note:** `bg-destructive`, `text-destructive`, `bg-primary`, `text-primary`, `bg-muted`, `text-muted-foreground`, `bg-card`, `text-foreground`, `border-border` are all correctly used CSS variables throughout the codebase.

---

## Import Resolution Check

All imports have been verified as resolving correctly:

| Import | Used By | Resolves To |
|--------|---------|-------------|
| `../helpers/permissions` | queries.ts, mutations.ts | `convex/helpers/permissions.ts` (exists) |
| `../helpers/events` | mutations.ts, internals.ts | `convex/helpers/events.ts` (exists) |
| `../events/constants` | mutations.ts, internals.ts | `convex/events/constants.ts` (exists, exports `SYSTEM.AUDIT`) |
| `../helpers/auditClassification` | internals.ts | `convex/helpers/auditClassification.ts` (exists) |
| `../helpers/auditDescriptions` | internals.ts | `convex/helpers/auditDescriptions.ts` (exists) |
| `../helpers/auditObjectExtractors` | internals.ts | `convex/helpers/auditObjectExtractors.ts` (exists) |
| `@backend/convex/_generated/api` | hooks, routes | Generated file (exists) |
| `@/components/ui/button` | multiple components | Shared UI component (exists) |
| `@/components/shared/EmptyState` | AuditTable, ActivityTimeline | Shared component (exists) |
| `@/hooks/useDebounce` | AuditFilterBar | `hooks/useDebounce.ts` (exists) |
| `@base-ui/react/dialog` | AuditExportDialog, AuditClearDialog | Package dependency |
| `sonner` | useAuditMutations | Package dependency |

---

## Security Audit

| Check | Status | Notes |
|-------|--------|-------|
| Auth on `list` query | PASS | `requireCan(ctx, "audit.view")` at line 56 |
| Auth on `get` query | PASS | `requireCan(ctx, "audit.view")` at line 267 |
| Auth on `getByEvent` query | PASS | `requireCan(ctx, "audit.view")` at line 367 |
| Auth on `getObjectHistory` query | PASS | `requireCan(ctx, "audit.view")` at line 406 |
| Auth on `getStats` query | PASS | `requireCan(ctx, "audit.view")` at line 447 |
| Auth on `recentActivity` query | PASS | `requireCan(ctx, "audit.view")` at line 570 |
| Auth on `clear` mutation | PASS | `requireCan(ctx, "audit.clear")` at line 78 |
| Auth on `export` action | **FAIL** | **No auth check at all** (lines 58-167) |
| Immutability (no update mutation) | PASS | Only clear deletes; no update mutation exists |
| Clear safety guards | PASS | 30-day minimum, severity restriction, confirm phrase |
| Dedup check in createEntry | PASS | `by_event` index lookup at lines 113-121 |
| Self-auditing (clear emits event) | PASS | `emitEvent` at line 170 |
| Self-auditing (export emits event) | PASS | Via `emitExportEvent` internal mutation at line 141 |

---

## Convex Best Practices

| Practice | Status | Notes |
|----------|--------|-------|
| Indexes for filtered queries | PASS | 10 indexes covering all filter patterns |
| Search index for free-text | PASS | `search_audit` on `description` with filter fields |
| Modular schema file | PASS | `convex/schema/auditLogs.ts` properly exported and spread in `schema.ts` |
| Batch processing for deletes | PASS | 100-entry batches with scheduler continuation |
| Cursor-based pagination | PASS | `occurredAt` timestamp cursors |
| Internal functions for system ops | PASS | `createEntry`, `clearBatch`, `retentionCleanup`, `emitExportEvent`, `listInternal` |
| No direct client mutations for entry creation | PASS | Only internal `createEntry` can create entries |
| Retention with `expiresAt` | PASS | Per-event-type retention policies |
| Cron registration | PASS | Daily at 4:15 UTC |
| Listener registration | PASS | Global `*` at priority 99 |

---

## React 19 Compatibility

No React 19-specific issues detected. The codebase uses:
- Standard `useState`, `useCallback`, `useMemo`, `useEffect` hooks
- `useQuery` and `useMutation` from `convex/react`
- `useNavigate`, `useSearch`, `createFileRoute` from `@tanstack/react-router`
- No class components, no legacy lifecycle methods
- No deprecated patterns

---

## Dead/Stale Code

| Item | File | Line | Description |
|------|------|------|-------------|
| Unused `ChevronLeftIcon` import | `AuditTable.tsx` | 13 | Imported but never used (only `ChevronRightIcon` is used) |
| Unused `isFiltered` prop on EmptyState | Multiple | - | Passed but may not be consumed by EmptyState (depends on EmptyState implementation) |

No TODO/FIXME comments found in any audit log system files.

---

## File Inventory

### Backend (11 files)

1. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\schema\auditLogs.ts` - Schema definition
2. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\auditLogs\validators.ts` - Shared validators
3. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\auditLogs\queries.ts` - 6 public queries
4. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\auditLogs\mutations.ts` - 1 public mutation (clear)
5. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\auditLogs\actions.ts` - 1 action (export)
6. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\auditLogs\internals.ts` - 5 internal functions
7. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\helpers\auditClassification.ts` - Severity & object type maps
8. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\helpers\auditDescriptions.ts` - Description templates
9. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\helpers\auditObjectExtractors.ts` - Object extractors
10. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\bootstrap\registerListeners.ts` - Listener registration (includes audit wildcard)
11. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\packages\backend\convex\crons.ts` - Cron registration (lines 90-99)

### Frontend (20 files)

12. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated\_admin\tools\activity.tsx` - Activity Log page
13. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated\_admin\tools\audit-log\index.tsx` - Audit Log page
14. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\routes\_authenticated\_admin\tools\audit-log\$entryId.tsx` - Entry detail page
15. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\audit\ActivityTimeline.tsx` - Timeline component
16. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\audit\ActivityEntry.tsx` - Single timeline entry
17. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\audit\AuditTable.tsx` - Data table
18. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\audit\AuditFilterBar.tsx` - Filter controls
19. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\audit\AuditStatsBar.tsx` - Stats bar
20. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\audit\AuditEntryDetail.tsx` - Detail view
21. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\audit\AuditChangesTable.tsx` - Changes diff table
22. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\audit\AuditPayloadViewer.tsx` - JSON viewer
23. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\audit\AuditExportDialog.tsx` - Export dialog
24. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\audit\AuditClearDialog.tsx` - Clear confirmation dialog
25. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\components\audit\SeverityBadge.tsx` - Severity indicator
26. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\lib\audit\types.ts` - TypeScript types
27. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\lib\audit\constants.ts` - Constants & config
28. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\lib\audit\formatters.ts` - Formatting utilities
29. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\hooks\audit\useAuditList.ts` - List hook
30. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\hooks\audit\useAuditStats.ts` - Stats hook
31. `F:\Websites\Hybrid5Studio\websites\ConvexPress\ConvexPress-Admin\apps\web\src\hooks\audit\useAuditMutations.ts` - Clear & export hooks

---

## Priority Fix List

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| **P0** | Missing auth check in export action | 15 min | Security vulnerability -- any user could export audit data |
| **P1** | Hardcoded orange/yellow colors | 30 min | Design system violation, theming won't work |
| **P2** | `as any` type assertions (backend) | 30 min | Type safety, potential runtime errors |
| **P2** | `as any` type assertions (frontend) | 45 min | Type safety, potential runtime errors |
| **P3** | Missing `useEffect` dependency | 5 min | Potential stale closure bug |
| **P3** | Unused `ChevronLeftIcon` import | 2 min | Dead code cleanup |
| **P4** | No "Previous Page" navigation | 1 hour | UX improvement |
| **P4** | Pause live updates toggle | 2 hours | PRD feature gap |
| **P4** | `getStats` performance at scale | 4 hours | Performance optimization |
| **P5** | `actorUserAgent` / `sessionId` always undefined | N/A | Data not available from event source; future enhancement |

---

## Summary

The Audit Log System is a well-implemented, comprehensive system with strong architecture. The 31-file implementation covers the full PRD scope with only minor gaps (pause toggle, bidirectional pagination, total estimate). The single critical issue -- **missing auth on the export action** -- must be fixed immediately. The hardcoded colors are a design system compliance issue but not functionally broken. The `as any` type assertions are quality concerns that should be cleaned up in a maintenance pass. Overall, this is one of the more complete system implementations in the ConvexPress.
