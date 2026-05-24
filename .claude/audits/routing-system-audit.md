# Routing System - Full Code Review & Audit

**Auditor:** Routing System Expert
**Date:** 2026-02-13
**Scope:** All backend, admin UI, and ConvexPress-Website files for the Routing System
**Status:** AUDIT ONLY -- no modifications made

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Files Reviewed](#files-reviewed)
3. [PRD Compliance Assessment](#prd-compliance-assessment)
4. [Critical Issues](#critical-issues)
5. [High-Priority Issues](#high-priority-issues)
6. [Medium-Priority Issues](#medium-priority-issues)
7. [Low-Priority Issues](#low-priority-issues)
8. [Code Quality Assessment](#code-quality-assessment)
9. [Security Review](#security-review)
10. [Implementation Checklist Status](#implementation-checklist-status)

---

## Executive Summary

The Routing System is **substantially implemented** across backend (Convex functions, schema, helpers) and admin UI (redirect management, 404 log, permalink settings). The implementation quality is high overall, with clean code organization, proper authorization checks, and good separation of concerns.

However, there is one **critical bug** in the event handling pipeline that would prevent the slug-change auto-redirect feature from ever working in production. Several medium-priority gaps exist in the ConvexPress-Website (no middleware, no 404 page, no content resolution routes). The knowledge doc is also outdated in places relative to the actual implementation.

**Overall Health: 72% complete** -- Backend and admin UI are solid; ConvexPress-Website layer is entirely missing.

### Key Findings

| Severity | Count | Summary |
|----------|-------|---------|
| Critical | 1 | Event handler payload mismatch -- slug change redirects will never fire |
| High | 5 | Missing website middleware, no 404 page, chain flatten full-table scan, missing crons.ts for routing patterns, knowledge doc/code drift |
| Medium | 6 | Hardcoded colors, unused function, query read all for stats, missing `view_404_log` capability, no tests, knowledge doc stale |
| Low | 5 | formatDateTime duplication, `PermalinkChangeDialog` not using Base UI Dialog, navigation sidebar missing items, TypeScript `any` casts |

---

## Files Reviewed

### Backend (ConvexPress-Admin/packages/backend/)

| File | Path | Status |
|------|------|--------|
| Schema | `convex/schema/routing.ts` | Implemented |
| Schema Hub | `convex/schema.ts` (routing import) | Integrated |
| Mutations | `convex/routing/mutations.ts` | Implemented |
| Queries | `convex/routing/queries.ts` | Implemented |
| Internals | `convex/routing/internals.ts` | Implemented |
| Event Handlers | `convex/routing/eventHandlers.ts` | Implemented (with critical bug) |
| Validators | `convex/routing/validators.ts` | Implemented |
| Helpers | `convex/helpers/routing.ts` | Implemented |
| Crons | `convex/crons.ts` (routing section) | Implemented |
| Bootstrap | `convex/bootstrap/registerListeners.ts` (routing section) | Implemented |

### Admin Frontend (ConvexPress-Admin/apps/web/)

| File | Path | Status |
|------|------|--------|
| Permalink Settings Page | `src/routes/_authenticated/_admin/settings/permalinks.tsx` | Implemented |
| Redirects List Page | `src/routes/_authenticated/_admin/tools/redirects/index.tsx` | Implemented |
| New Redirect Page | `src/routes/_authenticated/_admin/tools/redirects/new.tsx` | Implemented |
| Edit Redirect Page | `src/routes/_authenticated/_admin/tools/redirects/$redirectId/edit.tsx` | Implemented |
| 404 Log Page | `src/routes/_authenticated/_admin/tools/404-log.tsx` | Implemented |
| RedirectForm Component | `src/components/routing/RedirectForm.tsx` | Implemented |
| RedirectListTable Component | `src/components/routing/RedirectListTable.tsx` | Implemented |
| NotFoundLogTable Component | `src/components/routing/NotFoundLogTable.tsx` | Implemented |
| PermalinkTagButtons | `src/components/settings/PermalinkTagButtons.tsx` | Implemented |
| PermalinkPreview | `src/components/settings/PermalinkPreview.tsx` | Implemented |
| PermalinkChangeDialog | `src/components/settings/PermalinkChangeDialog.tsx` | Implemented |

### Website Frontend (ConvexPress-Website/apps/web/)

| File | Path | Status |
|------|------|--------|
| Canonical Middleware | `app/middleware/canonical.ts` | **NOT IMPLEMENTED** |
| Redirect Middleware | `app/middleware/redirects.ts` | **NOT IMPLEMENTED** |
| 404 Page | `app/routes/404.tsx` | **NOT IMPLEMENTED** |
| Content Routes | `app/routes/$slug.tsx`, etc. | **NOT IMPLEMENTED** |
| RoutingProvider | `app/contexts/routing.tsx` | **NOT IMPLEMENTED** |
| NotFoundPage Component | `app/components/NotFoundPage.tsx` | **NOT IMPLEMENTED** |

---

## PRD Compliance Assessment

The PRD file does not exist at the expected location (`specs/ConvexPress/systems/routing/PRD.md`). Assessment is based against the knowledge document (`.claude/docs/ROUTING-SYSTEM.md`), which serves as the authoritative specification.

### Backend Functions

| Function (Knowledge Doc) | Implementation | Match |
|--------------------------|---------------|-------|
| `routing.createRedirect` | `convex/routing/mutations.ts` | MATCH -- All validation, loop detection, chain flattening implemented |
| `routing.updateRedirect` | `convex/routing/mutations.ts` | MATCH -- Partial update, re-validation on change |
| `routing.deleteRedirect` | `convex/routing/mutations.ts` | MATCH |
| `routing.resolve404` | `convex/routing/mutations.ts` | EXTRA -- Not in knowledge doc, good addition |
| `routing.dismiss404` | `convex/routing/mutations.ts` | EXTRA -- Not in knowledge doc, good addition |
| `routing.bulkDismiss404` | `convex/routing/mutations.ts` | EXTRA -- Not in knowledge doc, good addition |
| `routing.resolveRedirect` | `convex/routing/internals.ts` | MATCH -- 3-tier matching (exact -> prefix -> regex) |
| `routing.generateSlugRedirect` | `convex/routing/internals.ts` | MATCH -- With chain flattening + 404 clearing |
| `routing.batchCreateRedirects` | `convex/routing/internals.ts` | MATCH -- Batch processing with skip/dedup |
| `routing.recordRedirectHit` | `convex/routing/internals.ts` | MATCH |
| `routing.log404` | `convex/routing/internals.ts` | MATCH -- Aggregation on existing entries |
| `routing.cleanup404Log` | `convex/routing/internals.ts` | MATCH -- 3-rule cleanup |
| `routing.clearNotFoundForUrl` | `convex/routing/internals.ts` | EXTRA -- Not in knowledge doc, good utility |
| `routing.generatePermalinkRedirects` | `convex/routing/eventHandlers.ts` (onPermalinksChanged) | PARTIAL -- Category/tag base redirects work, but **post redirect batch is a TODO stub** |
| `routing.regeneratePatterns` | NOT IMPLEMENTED | **MISSING** |
| `routing.getRedirects` | `convex/routing/queries.ts` | MATCH -- Paginated, filterable, sortable |
| `routing.getRedirectById` | `convex/routing/queries.ts` | MATCH |
| `routing.get404Log` | `convex/routing/queries.ts` | MATCH |
| `routing.getRedirectStats` | `convex/routing/queries.ts` | MATCH -- Extended with 404 stats |

### Event Handlers

| Event | Handler | Status |
|-------|---------|--------|
| `post.slug_changed` | `onSlugChanged` via `post.updated` | **CRITICAL BUG** -- Payload mismatch (see Critical Issues) |
| `page.slug_changed` | `onSlugChanged` via `page.updated` | **CRITICAL BUG** -- Payload mismatch (see Critical Issues) |
| `post.published` | `onContentPublished` | Implemented |
| `page.published` | `onContentPublished` | Implemented |
| `settings.permalinks_changed` | `onPermalinksChanged` | Partially implemented (post batch is TODO) |

### Admin Routes

| Route (Knowledge Doc) | Implementation | Status |
|-----------------------|---------------|--------|
| `/admin/settings/permalinks` | Implemented | COMPLETE |
| `/admin/tools/redirects` | Implemented | COMPLETE |
| `/admin/tools/redirects/new` | Implemented | COMPLETE |
| `/admin/tools/redirects/$id/edit` | Implemented | COMPLETE |
| `/admin/tools/404-log` | Implemented | COMPLETE |

### Website Routes

| Route (Knowledge Doc) | Implementation | Status |
|-----------------------|---------------|--------|
| 404 Page | NOT IMPLEMENTED | MISSING |
| Canonical Middleware | NOT IMPLEMENTED | MISSING |
| Redirect Middleware | NOT IMPLEMENTED | MISSING |
| Content Resolution Routes | NOT IMPLEMENTED | MISSING |

---

## Critical Issues

### C1: Event Handler Payload Mismatch -- Slug Change Redirects Will Never Fire

**Files:**
- `ConvexPress-Admin/packages/backend/convex/routing/eventHandlers.ts` (lines 31-56)
- `ConvexPress-Admin/packages/backend/convex/posts/mutations.ts` (lines 519-527)
- `ConvexPress-Admin/packages/backend/convex/bootstrap/registerListeners.ts` (lines 757-768)

**Problem:**
The `onSlugChanged` event handler expects the event payload to contain `payload.oldSlug` and `payload.newSlug`:
```typescript
const oldSlug = payload.oldSlug;
const newSlug = payload.newSlug;
if (!oldSlug || !newSlug || oldSlug === newSlug) return;
```

However, the event listener is registered on `post.updated` events (not `post.slug_changed`), and the actual `post.updated` event payload emitted by the Post System is:
```typescript
{
  postId: args.postId,
  title: ...,
  authorId: ...,
  changes: [{ field: "slug", oldValue: "old-slug", newValue: "new-slug" }, ...]
}
```

The payload uses a `changes` array with `{ field, oldValue, newValue }` objects -- NOT top-level `oldSlug`/`newSlug` properties. Since `payload.oldSlug` will always be `undefined`, the handler no-ops on every invocation.

**Impact:** Auto-redirect creation on slug changes is completely broken. When a user changes a post or page slug, no redirect is created, and the old URL will 404. This is a core feature of the routing system.

**Root Cause:** The knowledge doc specifies `post.slug_changed` and `page.slug_changed` as dedicated events, but these events do not exist in the event constants (`convex/events/constants.ts`). The implementation pragmatically listens to `post.updated` and `page.updated` instead, but the handler was written expecting the knowledge doc's payload format rather than the actual `post.updated` payload format.

**Fix:** The `onSlugChanged` handler must parse the `changes` array from the `post.updated`/`page.updated` payload to extract slug changes:
```typescript
const changes = payload.changes || [];
const slugChange = changes.find((c: any) => c.field === "slug");
if (!slugChange) return;
const oldSlug = slugChange.oldValue;
const newSlug = slugChange.newValue;
```

---

## High-Priority Issues

### H1: Website-App Has No Routing Infrastructure

**Missing Files:**
- `ConvexPress-Website/apps/web/app/middleware/canonical.ts`
- `ConvexPress-Website/apps/web/app/middleware/redirects.ts`
- `ConvexPress-Website/apps/web/app/routes/404.tsx`
- `ConvexPress-Website/apps/web/app/routes/$slug.tsx`
- `ConvexPress-Website/apps/web/app/routes/blog/$year/$month/$slug.tsx`
- `ConvexPress-Website/apps/web/app/routes/blog/$year/$month/$day/$slug.tsx`
- `ConvexPress-Website/apps/web/app/routes/archives/$id.tsx`
- `ConvexPress-Website/apps/web/app/contexts/routing.tsx`

**Impact:** The entire ConvexPress-Website has no TypeScript application source files. There are no route files, no middleware, no 404 page, and no content resolution. This means:
- No canonical URL enforcement
- No redirect resolution
- No 404 logging
- No content URL resolution
- Redirect hit counting never fires
- 404 logging never fires

The backend infrastructure (redirect table, 404 log, URL generation helpers) is in place, but the ConvexPress-Website consumer layer does not exist. This is expected for the current project phase (backend-first development), but should be prioritized once the ConvexPress-Website scaffolding begins.

### H2: Chain Flattening Performs Full Table Scan

**File:** `ConvexPress-Admin/packages/backend/convex/routing/mutations.ts` (lines 244-258)

```typescript
const chainingRedirects = await ctx.db
  .query("redirects")
  .collect();

for (const redirect of chainingRedirects) {
  if (redirect.targetUrl === args.sourceUrl && redirect.enabled) {
    await ctx.db.patch(redirect._id, { ... });
  }
}
```

**Problem:** The chain flattening logic in `createRedirect` loads ALL redirect records from the database just to find redirects whose `targetUrl` matches the new redirect's `sourceUrl`. There is no index on `targetUrl`.

**Impact:** For sites with thousands of redirects (common after many permalink changes), this full-table scan could be slow and consume significant read bandwidth. The same pattern exists in `generateSlugRedirect` (internals.ts line 187).

**Fix:** Add a `by_target_url` index to the `redirects` table in `schema/routing.ts`, then use `.withIndex("by_target_url", q => q.eq("targetUrl", args.sourceUrl))` for chain flattening lookups.

### H3: `onPermalinksChanged` Post Batch Redirect Generation is Entirely a TODO

**File:** `ConvexPress-Admin/packages/backend/convex/routing/eventHandlers.ts` (lines 130-157)

The core feature of batch-generating redirects when the permalink structure changes is not implemented -- it is a TODO comment block. Only category base and tag base redirects are functional.

```typescript
// TODO: Batch redirect generation for published posts on permalink change.
//
// Required: An internalQuery in posts/internals.ts that returns all
// published posts (status === "publish", type === "post") with at
// minimum { _id, slug } fields.
```

**Impact:** When an admin changes the permalink structure (e.g., from `post_name` to `day_and_name`), no post-level redirects are created. All existing post URLs will 404 until they are manually redirected.

### H4: Knowledge Doc Event Names vs Actual Event Names Drift

**Knowledge Doc States:**
- Listens to: `post.slug_changed`, `page.slug_changed`

**Actual Implementation:**
- Listens to: `post.updated`, `page.updated`

The knowledge doc's event names (`post.slug_changed`, `page.slug_changed`) do not exist as actual events. The event constants file (`convex/events/constants.ts`) has no `SLUG_CHANGED` constant. The bootstrap listener registrations correctly use `post.updated` and `page.updated`, but the knowledge doc should be updated to reflect this.

### H5: `regeneratePatterns` Internal Mutation is Missing

**Knowledge Doc:** Lists `routing.regeneratePatterns` as an internal mutation triggered by `settings.permalinks_changed`.

**Implementation:** This function does not exist anywhere in the codebase. It is listed in the implementation checklist as unchecked.

**Impact:** Low immediate impact since ConvexPress uses JavaScript middleware rather than `.htaccess` rules, but the knowledge doc should either be updated to remove this function or the function should be implemented if it serves a purpose in the TanStack Start middleware configuration.

---

## Medium-Priority Issues

### M1: Hardcoded Colors in Routing UI Components

**Files:**
- `ConvexPress-Admin/apps/web/src/components/routing/RedirectListTable.tsx` (line 131): `bg-emerald-500`
- `ConvexPress-Admin/apps/web/src/components/routing/NotFoundLogTable.tsx` (line 107): `bg-amber-500`
- `ConvexPress-Admin/apps/web/src/components/routing/NotFoundLogTable.tsx` (line 131): `text-amber-500`
- `ConvexPress-Admin/apps/web/src/components/settings/PermalinkChangeDialog.tsx` (line 46): `text-yellow-600 dark:text-yellow-500`

**Rule Violation:** CLAUDE.md and MEMORY.md explicitly state: "Never use zinc, slate, gray, or any hardcoded Tailwind color names." While `emerald`, `amber`, and `yellow` are not in the explicitly banned list (which mentions zinc/slate/gray), the spirit of the rule is to use CSS variables and opacity modifiers instead of hardcoded color names.

**Fix:** Replace with CSS variable-based alternatives:
- `bg-emerald-500` -> Use a `bg-success` CSS variable or `bg-primary`
- `bg-amber-500` -> Use `text-warning` CSS variable or `bg-destructive/60`
- `text-yellow-600` -> Use `text-warning` CSS variable

### M2: Capability Mismatch Between Knowledge Doc and Implementation

**Knowledge Doc Capabilities:**
- `manage_redirects` -- Create, update, delete redirect rules
- `view_404_log` -- View and resolve 404 log entries
- `manage_options` -- View and modify permalink settings

**Actual Implementation Capabilities:**
- `routing.create_redirect` -- Used for create, read, resolve, dismiss
- `routing.update_redirect` -- Used for update
- `routing.delete_redirect` -- Used for delete

The knowledge doc defines `manage_redirects` and `view_404_log` as capabilities, but the implementation uses `routing.create_redirect`, `routing.update_redirect`, and `routing.delete_redirect` instead. There is no separate `view_404_log` capability -- all 404 log access uses `routing.create_redirect`.

Additionally, read-only queries (`getRedirects`, `getRedirectById`, `get404Log`, `getRedirectStats`) all require `routing.create_redirect` capability. This means you need CREATE permission just to VIEW the redirect list, which is overly restrictive. A separate `routing.view_redirects` or `routing.manage_redirects` (read+write) capability would be more appropriate.

### M3: `getRedirectStats` Full Table Scans (Performance)

**File:** `ConvexPress-Admin/packages/backend/convex/routing/queries.ts` (lines 249-280)

```typescript
const allRedirects = await ctx.db.query("redirects").collect();
...
const allNotFound = await ctx.db.query("notFound").collect();
```

This query loads ALL records from both tables into memory to compute statistics. For a site with many redirects/404s, this will become slow. Consider:
- Adding a `routingStats` denormalized document that is updated incrementally
- Or at minimum, caching the computation

### M4: No Tests Exist

The knowledge doc implementation checklist includes 9 test file entries. Zero tests exist. This is a significant gap for a system that handles URL resolution (high-impact if broken).

### M5: `formatDateTime` Utility Function Duplicated

**Files:**
- `ConvexPress-Admin/apps/web/src/components/routing/RedirectListTable.tsx` (lines 79-88)
- `ConvexPress-Admin/apps/web/src/components/routing/NotFoundLogTable.tsx` (lines 68-77)

Both files define identical `formatDate` and `formatDateTime` helper functions. These should be extracted to a shared utility.

### M6: `getRedirects` Query Uses In-Memory Cross-Filtering

**File:** `ConvexPress-Admin/packages/backend/convex/routing/queries.ts` (lines 54-85)

When both `source` and `enabled` filters are applied, the query uses the `source` index first, then filters `enabled` in memory. When search is applied, it loads all results and filters in JS. For large redirect tables, a compound index `by_source_enabled` would be more efficient.

---

## Low-Priority Issues

### L1: `PermalinkChangeDialog` Uses Custom Dialog Instead of Base UI Dialog

**File:** `ConvexPress-Admin/apps/web/src/components/settings/PermalinkChangeDialog.tsx`

The dialog is implemented as a custom `div` with `role="alertdialog"` and manual backdrop handling. While this is technically correct and accessible, the project mandates using `@base-ui/react` for interactive components. The dialog should use `@base-ui/react`'s Dialog component (or equivalent) for consistency.

Note: This is an acceptable use of a dialog per CLAUDE.md rules (destructive confirmation), so the popup usage itself is correct.

### L2: TypeScript `any` Casts in UI Components

**Files:**
- `ConvexPress-Admin/apps/web/src/components/routing/RedirectListTable.tsx` (line 312): `as any` for sourceFilter
- `ConvexPress-Admin/apps/web/src/components/routing/RedirectForm.tsx` (line 122): `error: any`

These should use proper typed alternatives.

### L3: Navigation Sidebar Does Not List Redirects/404 Log

The admin sidebar navigation does not appear to include "Redirects" or "404 Log" as sub-items under "Tools". While the routes exist and are accessible by direct URL, users cannot discover them through the sidebar. This should be added to the Tools section navigation.

### L4: `RedirectForm` Navigation Uses Relative-Looking Paths

**File:** `ConvexPress-Admin/apps/web/src/components/routing/RedirectForm.tsx` (line 109, 120, 257)

```typescript
navigate({ to: "/tools/redirects" });
```

These should include the full TanStack Router path prefix to be robust against route restructuring. Since the authenticated admin layout prefixes all routes, this works currently but is fragile.

### L5: Missing `import` Source Type in `batchCreateRedirectsArgs`

**File:** `ConvexPress-Admin/packages/backend/convex/routing/validators.ts` (line 242)

```typescript
source: v.union(v.literal("slug_change"), v.literal("permalink_change")),
```

The `batchCreateRedirects` source validator only accepts `slug_change` and `permalink_change`, but the schema also supports `import`. If bulk import functionality is added later, this validator would need updating.

---

## Code Quality Assessment

### Strengths

1. **Excellent documentation:** Every file has thorough JSDoc comments explaining purpose, flow, and behavior. The schema file is particularly well-documented with WordPress equivalents and design decisions.

2. **Clean separation of concerns:** Schema, mutations, queries, internals, event handlers, and validators are properly separated into dedicated files following project conventions.

3. **Proper authorization:** All public mutations and queries use `requireCan()` with appropriate capability checks. Internal functions correctly skip auth (they are not client-callable).

4. **Robust validation:** Source URL, target URL, regex patterns, and note lengths are all validated with clear error messages using `ConvexError` with structured error codes.

5. **Chain flattening:** The redirect chain prevention logic is correctly implemented in both `createRedirect` and `generateSlugRedirect`, ensuring no multi-hop chains can form.

6. **Scheduled cleanup:** The 404 log cleanup cron is properly registered with 3 clear rules (resolved > 90 days, unresolved low-hit > 30 days, max 10k records).

7. **Real Convex wiring:** All admin UI components use actual Convex queries and mutations -- no mock/demo data. The `useQuery` subscriptions provide real-time updates.

8. **WordPress-style list tables:** Both `RedirectListTable` and `NotFoundLogTable` follow the project's shared list table patterns with bulk actions, status tabs, pagination, and row actions.

### Weaknesses

1. **Full table scans:** Chain flattening and stats computation load all records. Need targeted indexes.

2. **No tests:** Zero test coverage for a critical URL resolution system.

3. **Knowledge doc drift:** Event names, capability names, and checklist items don't match implementation.

4. **Missing website layer:** The backend is well-built but the consumer (ConvexPress-Website) doesn't exist yet.

---

## Security Review

### Passed

- **Authorization:** All mutations require authentication + capability checks via `requireCan()`
- **No Radix imports:** Zero `@radix-ui/*` imports found in any routing-related file
- **URL validation:** Source URLs must start with `/`, cannot contain query strings or fragments, cannot redirect reserved paths (`/admin`, `/api`, `/login`, `/register`, `/logout`, `/auth`, `/_convex`)
- **Regex safety:** Catastrophic backtracking patterns are rejected, regex length is limited to 500 chars, max 50 regex redirects per site
- **No open redirect vulnerability:** Target URLs must be relative (`/`) or absolute HTTPS -- HTTP targets are rejected
- **Input sanitization:** Notes are trimmed, URLs are length-limited

### Potential Concerns

1. **Regex DoS surface area:** While basic catastrophic backtracking is detected (`(a+)+` patterns), more sophisticated ReDoS patterns could slip through. The regex check at line 132 of `mutations.ts` only tests for simple nested quantifiers. Consider using a more robust ReDoS detection library or setting a regex execution timeout.

2. **No rate limiting on 404 logging:** The `log404` internal mutation has no rate limiting. A malicious actor could flood the site with unique 404 URLs to grow the `notFound` table rapidly. The 10k max cap in cleanup helps, but the cleanup runs daily, allowing interim growth.

3. **Bulk delete serial execution:** `handleDeleteConfirm` in `RedirectListTable.tsx` deletes redirects one-by-one in a loop. For large selections, this could be slow and each failure would stop the loop. Consider a batch delete internal mutation.

---

## Implementation Checklist Status

Based on the knowledge doc's implementation checklist:

### Shared Package (packages/shared/)

| Item | Status | Notes |
|------|--------|-------|
| `src/routing/url-generator.ts` | ALTERNATIVE | Implemented as `convex/helpers/routing.ts` instead (in backend package, not shared) |
| `src/routing/permalink-tags.ts` | ALTERNATIVE | Implemented in `convex/helpers/routing.ts` and `convex/routing/validators.ts` |
| `src/routing/types.ts` | ALTERNATIVE | Types defined inline in `convex/helpers/routing.ts` |
| `src/routing/validators.ts` | ALTERNATIVE | Implemented as `convex/routing/validators.ts` |
| `src/routing/index.ts` | NOT IMPLEMENTED | No barrel export (not needed since helpers are in backend) |

### Backend (ConvexPress-Admin/packages/backend/)

| Item | Status | Notes |
|------|--------|-------|
| Schema (`redirects` + `notFound`) | DONE | `convex/schema/routing.ts` |
| Queries (4) | DONE | `convex/routing/queries.ts` |
| Mutations (3 + extras) | DONE | `convex/routing/mutations.ts` (6 mutations total) |
| Internals (7) | DONE | `convex/routing/internals.ts` (7 functions) |
| Event Handlers | DONE (with bug) | `convex/routing/eventHandlers.ts` |
| Helpers | DONE | `convex/helpers/routing.ts` |
| Crons | DONE | `convex/crons.ts` |

### Admin Frontend (ConvexPress-Admin/apps/web/)

| Item | Status | Notes |
|------|--------|-------|
| Permalink settings page | DONE | `/settings/permalinks` |
| Redirect list page | DONE | `/tools/redirects/` |
| Create redirect page | DONE | `/tools/redirects/new` |
| Edit redirect page | DONE | `/tools/redirects/$redirectId/edit` |
| 404 log page | DONE | `/tools/404-log` |
| RedirectForm | DONE | |
| RedirectTable | DONE | Named `RedirectListTable` |
| NotFoundLogTable | DONE | |

### Website Frontend (ConvexPress-Website/apps/web/)

| Item | Status |
|------|--------|
| Canonical middleware | NOT IMPLEMENTED |
| Redirect middleware | NOT IMPLEMENTED |
| 404 page route | NOT IMPLEMENTED |
| `$slug.tsx` route | NOT IMPLEMENTED |
| Blog date routes | NOT IMPLEMENTED |
| Archives numeric route | NOT IMPLEMENTED |
| RoutingProvider context | NOT IMPLEMENTED |
| NotFoundPage component | NOT IMPLEMENTED |
| SearchForm component | NOT IMPLEMENTED |
| RecentPostLinks component | NOT IMPLEMENTED |

### Tests

| Item | Status |
|------|--------|
| URL generation unit tests | NOT IMPLEMENTED |
| Permalink tag unit tests | NOT IMPLEMENTED |
| URL validation unit tests | NOT IMPLEMENTED |
| Query integration tests | NOT IMPLEMENTED |
| Mutation integration tests | NOT IMPLEMENTED |
| Event handler integration tests | NOT IMPLEMENTED |
| Redirect E2E tests | NOT IMPLEMENTED |
| Canonical URL E2E tests | NOT IMPLEMENTED |
| 404 page E2E tests | NOT IMPLEMENTED |

---

## Recommendations (Priority Order)

1. **FIX C1 immediately** -- The `onSlugChanged` event handler must parse the `changes` array from `post.updated`/`page.updated` payloads instead of looking for `payload.oldSlug`/`payload.newSlug`. This is the single most impactful bug.

2. **Add `by_target_url` index** to enable efficient chain flattening without full table scans (H2).

3. **Implement the post batch redirect TODO** in `onPermalinksChanged` (H3) -- this requires coordination with the Post System to expose an `internal.posts.internals.getAllPublished` query.

4. **Update the knowledge doc** to reflect actual event names (`post.updated` not `post.slug_changed`), actual capability names, and current implementation status.

5. **Replace hardcoded colors** with CSS variables in the three routing UI components.

6. **Add navigation sidebar items** for Redirects and 404 Log under the Tools section.

7. **Begin ConvexPress-Website implementation** when the ConvexPress-Website scaffolding is ready -- the backend is ready to support it.
