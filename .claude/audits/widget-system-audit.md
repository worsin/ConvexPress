# Widget System - Full Code Audit Report

**Auditor:** Widget System Expert
**Date:** 2026-02-13
**Scope:** Complete Widget System across backend, admin frontend, and website frontend
**Status:** AUDIT ONLY - No code modifications made

---

## Executive Summary

The Widget System is well-implemented with strong adherence to the knowledge document specification. All 3 backend tables, 6 queries, 10 mutations, 1 action, and 3+ internal functions are present and correctly structured. The admin UI includes all 14 specified components, and the website frontend includes all 16 widget type render components plus infrastructure. The system demonstrates good security practices, proper Convex patterns, and clean code organization.

**Key Metrics:**
- Total files audited: 53
- Critical issues: 1
- High issues: 4
- Medium issues: 10
- Low issues: 12

---

## Files Audited

### Backend (ConvexPress-Admin/packages/backend/convex/)

| File | Path | Status |
|------|------|--------|
| Schema | `schema/widgets.ts` | PASS |
| Validators | `widgets/validators.ts` | PASS |
| Queries | `widgets/queries.ts` | PASS |
| Mutations | `widgets/mutations.ts` | PASS |
| Internals | `widgets/internals.ts` | PASS |
| Actions | `widgets/actions.ts` | PASS |
| Schema Hub | `schema.ts` | PASS (imports widgetTables) |
| Event Constants | `events/constants.ts` | PASS (SYSTEM.WIDGET defined) |

### Admin Frontend (ConvexPress-Admin/apps/web/src/)

| File | Path | Status |
|------|------|--------|
| Layout Route | `routes/_authenticated/_admin/widgets.tsx` | PASS |
| Index Route | `routes/_authenticated/_admin/widgets/index.tsx` | PASS |
| Areas Route | `routes/_authenticated/_admin/widgets/areas.tsx` | PASS |
| Types | `features/widgets/types.ts` | PASS |
| Widget Utils | `features/widgets/lib/widget-utils.ts` | PASS |
| useWidgetAreas | `features/widgets/hooks/use-widget-areas.ts` | MINOR ISSUES |
| useWidgetInstances | `features/widgets/hooks/use-widget-instances.ts` | PASS |
| useWidgetDrag | `features/widgets/hooks/use-widget-drag.ts` | PASS |
| useWidgetConfig | `features/widgets/hooks/use-widget-config.ts` | PASS |
| WidgetManagementPage | `features/widgets/components/widget-management-page.tsx` | PASS |
| AvailableWidgetsPanel | `features/widgets/components/available-widgets-panel.tsx` | PASS |
| WidgetAreasPanel | `features/widgets/components/widget-areas-panel.tsx` | PASS |
| WidgetAreaSection | `features/widgets/components/widget-area-section.tsx` | MINOR ISSUES |
| WidgetInstanceCard | `features/widgets/components/widget-instance-card.tsx` | PASS |
| WidgetConfigForm | `features/widgets/components/widget-config-form.tsx` | PASS |
| WidgetField | `features/widgets/components/widget-field.tsx` | PASS |
| WidgetTypeCard | `features/widgets/components/widget-type-card.tsx` | PASS |
| InactiveWidgetsPanel | `features/widgets/components/inactive-widgets-panel.tsx` | PASS |
| WidgetAreaSettingsPage | `features/widgets/components/widget-area-settings-page.tsx` | PASS |
| WidgetAreaForm | `features/widgets/components/widget-area-form.tsx` | PASS |
| WidgetAreaList | `features/widgets/components/widget-area-list.tsx` | PASS |
| Dashboard Widget Registry | `lib/dashboard/widget-registry.ts` | N/A (different system) |

### Website Frontend (ConvexPress-Website/apps/web/src/)

| File | Path | Status |
|------|------|--------|
| WidgetArea (features/) | `features/widgets/components/widget-area.tsx` | DEPRECATED DUPLICATE |
| WidgetArea (layout/) | `components/layout/WidgetArea.tsx` | ACTIVE VERSION |
| WidgetRenderer | `features/widgets/components/widget-renderer.tsx` | PASS |
| WidgetErrorBoundary | `features/widgets/components/widget-error-boundary.tsx` | PASS |
| WidgetSkeleton | `features/widgets/components/widget-skeleton.tsx` | PASS |
| Widget Render Map | `features/widgets/lib/widget-render-map.ts` | MINOR ISSUES |
| Visibility Logic | `features/widgets/lib/visibility.ts` | PASS |
| useWidgetArea | `features/widgets/hooks/use-widget-area.ts` | PASS |
| useWidgetVisibility | `features/widgets/hooks/use-widget-visibility.ts` | PASS |
| SearchWidget | `features/widgets/components/types/search-widget.tsx` | PASS |
| RecentPostsWidget | `features/widgets/components/types/recent-posts-widget.tsx` | PASS |
| RecentCommentsWidget | `features/widgets/components/types/recent-comments-widget.tsx` | MINOR ISSUES |
| CategoriesWidget | `features/widgets/components/types/categories-widget.tsx` | MINOR ISSUES |
| TagCloudWidget | `features/widgets/components/types/tag-cloud-widget.tsx` | MINOR ISSUES |
| ArchivesWidget | `features/widgets/components/types/archives-widget.tsx` | MINOR ISSUES |
| PagesWidget | `features/widgets/components/types/pages-widget.tsx` | MINOR ISSUES |
| NavMenuWidget | `features/widgets/components/types/nav-menu-widget.tsx` | ISSUES |
| CustomHtmlWidget | `features/widgets/components/types/custom-html-widget.tsx` | HIGH CONCERN |
| RichTextWidget | `features/widgets/components/types/rich-text-widget.tsx` | MEDIUM CONCERN |
| ImageWidget | `features/widgets/components/types/image-widget.tsx` | PASS |
| VideoWidget | `features/widgets/components/types/video-widget.tsx` | PASS |
| AudioWidget | `features/widgets/components/types/audio-widget.tsx` | PASS |
| CalendarWidget | `features/widgets/components/types/calendar-widget.tsx` | PASS |
| SocialLinksWidget | `features/widgets/components/types/social-links-widget.tsx` | PASS |
| RssFeedWidget | `features/widgets/components/types/rss-feed-widget.tsx` | PASS |

---

## Issue Details

### CRITICAL

#### C-1: Custom HTML Widget uses regex-based sanitization instead of DOMPurify

**File:** `ConvexPress-Website/apps/web/src/features/widgets/components/types/custom-html-widget.tsx`
**Lines:** 19-31

The knowledge doc explicitly states: "Content MUST be sanitized with DOMPurify to strip `<script>` tags, inline event handlers (`onclick`, `onerror`, etc.), and `javascript:` URLs while preserving layout HTML and CSS."

The current implementation uses a homegrown regex-based `sanitizeHtml()` function instead of DOMPurify. Regex-based HTML sanitization is fundamentally unreliable and can be bypassed with various encoding tricks, nested contexts, and edge cases. Examples of bypasses:

- `<img src=x onerror=alert(1)>` variants with character encoding
- `<svg/onload=alert(1)>` - SVG event handlers not covered
- `<body onload=alert(1)>` - body tag events
- `<a href="j&#x61;vascript:alert(1)">` - HTML entity encoding in javascript: URLs
- `<div style="background-image:url(javascript:alert(1))">` - CSS-based attacks (older browsers)

**Severity:** CRITICAL
**Impact:** XSS vulnerability. While administrators are trusted, the knowledge doc specifically calls out copy-paste mistakes and social engineering as attack vectors.
**Fix:** Replace the regex sanitizer with DOMPurify. The dependency `dompurify` is listed in the knowledge doc's external dependencies section. Note: DOMPurify requires a DOM environment; for SSR in TanStack Start, use `isomorphic-dompurify` or conditionally import. The comment in the code itself acknowledges this: "In production, you should use DOMPurify for full sanitization."

---

### HIGH

#### H-1: Rich Text Widget also uses regex sanitization

**File:** `ConvexPress-Website/apps/web/src/features/widgets/components/types/rich-text-widget.tsx`
**Lines:** 13-19

Same issue as C-1. The `sanitizeRichText()` function is a subset of the custom-html sanitizer and uses the same vulnerable regex approach. Additionally, this widget converts plain text with double-newlines into `<p>` tags using string interpolation without escaping, which could allow HTML injection through the rich text content field.

**Severity:** HIGH
**Impact:** XSS vulnerability through the rich text widget.
**Fix:** Use DOMPurify for all HTML rendering, and escape plain text before wrapping in `<p>` tags.

#### H-2: NavMenuWidget conditionally calls useQuery (Rules of Hooks violation)

**File:** `ConvexPress-Website/apps/web/src/features/widgets/components/types/nav-menu-widget.tsx`
**Lines:** 24-36

```typescript
try {
    if (config.menuId) {
      menu = useQuery(api.menus?.queries?.getMenu as any, { ... });
      menuItems = useQuery(api.menus?.queries?.getMenuItems as any, { ... });
    }
} catch { ... }
```

The `useQuery` calls are inside a conditional `if (config.menuId)` block AND inside a try/catch. This violates the Rules of Hooks -- hooks must be called unconditionally in the same order on every render. This will cause React to throw errors if `config.menuId` changes between renders (e.g., from undefined to a value).

**Severity:** HIGH
**Impact:** Runtime React errors, broken rendering when menu selection changes.
**Fix:** Call `useQuery` unconditionally using Convex's `"skip"` pattern: `useQuery(api.menus.queries.getMenu, config.menuId ? { menuId: config.menuId } : "skip")`. Remove the try/catch wrapper around hook calls.

#### H-3: CategoriesWidget wraps useQuery in try/catch (anti-pattern)

**File:** `ConvexPress-Website/apps/web/src/features/widgets/components/types/categories-widget.tsx`
**Lines:** 21-26

```typescript
try {
    categories = useQuery(api.taxonomies.queries.getCategoryTree, {});
} catch {
    categories = [];
}
```

React hooks cannot be wrapped in try/catch. If the hook itself throws during render (not during the async operation), the error boundary should catch it. The try/catch here will not catch query errors from Convex (those are handled by the hook's loading/error states), and wrapping a hook in try/catch is a React anti-pattern.

**Severity:** HIGH
**Impact:** This same pattern appears in TagCloudWidget, ArchivesWidget, and PagesWidget as well. While it may work in practice because the `useQuery` call itself doesn't throw synchronously, it masks the real intent and could break with React strict mode or future React versions.
**Fix:** Remove try/catch wrappers around useQuery calls across all 5 affected widget components. Use Convex's error boundary patterns or optional chaining on the API path.

#### H-4: Duplicate WidgetArea component (active + deprecated copy)

**Files:**
- `ConvexPress-Website/apps/web/src/features/widgets/components/widget-area.tsx` (DEPRECATED)
- `ConvexPress-Website/apps/web/src/components/layout/WidgetArea.tsx` (ACTIVE)

Two `WidgetArea` components exist. The features/ version has a `// DEPRECATED` comment but is still a fully functional component with visibility condition logic. The layout/ version is simpler but uses `(area as any)` type assertions for area properties.

**Severity:** HIGH
**Impact:** Confusion about which component is canonical. The deprecated version has more complete visibility logic. Import resolution could vary depending on which path is used.
**Fix:** Delete the deprecated `features/widgets/components/widget-area.tsx` file. Port any missing visibility condition logic to the layout version. The layout version should also lose the `as any` casts.

---

### MEDIUM

#### M-1: All `requireCan()` calls use `as any` cast for capability string

**Files:** `widgets/queries.ts` (3 instances), `widgets/mutations.ts` (12 instances)
**Pattern:** `requireCan(ctx, "manage_widgets" as any)`

Every single call to `requireCan` casts the capability string `"manage_widgets"` to `any`. This indicates the `requireCan` function's type definition does not include `"manage_widgets"` in its union of valid capability strings. The capability was likely added after the type was defined.

**Severity:** MEDIUM
**Impact:** Loss of type safety. If the capability name were misspelled, TypeScript would not catch it. All 15 instances could silently reference a non-existent capability.
**Fix:** Add `"manage_widgets"` to the capability union type in `helpers/permissions.ts`.

#### M-2: Widget render map imports `lazy` but never uses it

**File:** `ConvexPress-Website/apps/web/src/features/widgets/lib/widget-render-map.ts`
**Line:** 9

```typescript
import { lazy, type ComponentType } from "react";
```

The `lazy` import is unused. All 16 widget components are eagerly imported. The knowledge doc does not specify lazy loading for widget render components (and it would be complex since they need to work with SSR).

**Severity:** MEDIUM (dead code)
**Impact:** Unused import; minor bundle impact. No functional issue.
**Fix:** Remove the `lazy` import.

#### M-3: CalendarWidget cast to `as any` in render map

**File:** `ConvexPress-Website/apps/web/src/features/widgets/lib/widget-render-map.ts`
**Line:** 50

```typescript
calendar: CalendarWidget as any,
```

The `CalendarWidget` does not accept a `config` prop (it has no configurable settings and its function signature is `CalendarWidget()` with no props). However, the render map type requires `ComponentType<{ config: any }>`. The `as any` masks a genuine interface mismatch.

**Severity:** MEDIUM
**Impact:** The WidgetRenderer passes `config` to CalendarWidget, which silently ignores it. If CalendarWidget were ever changed to accept props, this could cause confusion.
**Fix:** Update `CalendarWidget` to accept `{ config: any }` prop (even if unused) to match the render map interface, then remove the `as any` cast.

#### M-4: `useWidgetArea` hook casts areaId parameter to `as any`

**File:** `ConvexPress-Admin/apps/web/src/features/widgets/hooks/use-widget-areas.ts`
**Line:** 33

```typescript
areaId: areaId as any,
```

The `areaId` parameter is typed as `string | undefined` but the query expects `Id<"widgetAreas"> | undefined`. The `as any` cast bypasses this type mismatch.

**Severity:** MEDIUM
**Impact:** Could pass an invalid string as a Convex ID, resulting in a runtime error.
**Fix:** Accept the parameter as `Id<"widgetAreas"> | undefined` and cast properly at the call site, or use a type assertion to `Id<"widgetAreas">`.

#### M-5: Multiple widget type components use optional chaining on API paths (`api.comments?.queries?.recent`)

**Files:**
- `recent-comments-widget.tsx` (`api.comments?.queries?.recent as any`)
- `archives-widget.tsx` (`api.posts?.queries?.listPublished as any`)
- `pages-widget.tsx` (`api.pages?.queries?.listPublished as any`)
- `nav-menu-widget.tsx` (`api.menus?.queries?.getMenu as any`, `api.menus?.queries?.getMenuItems as any`)

**Severity:** MEDIUM
**Impact:** The optional chaining suggests these API paths may not exist in the ConvexPress-Website's generated types. The `as any` casts confirm this. If these systems are not yet deployed or the ConvexPress-Website's Convex codegen is stale, the queries will silently resolve to `undefined` or error.
**Fix:** Ensure the ConvexPress-Website's Convex codegen (`npx convex codegen`) is up to date with the admin backend. The optional chaining on API paths is a sign of stale type generation. Once types are correct, remove the optional chaining and `as any` casts.

#### M-6: WidgetAreaSection has unused `handleMoveUp` and `handleMoveDown` callbacks

**File:** `ConvexPress-Admin/apps/web/src/features/widgets/components/widget-area-section.tsx`
**Lines:** 57-75

The `handleMoveUp` and `handleMoveDown` functions are defined but never referenced in the JSX. They appear to be keyboard accessibility helpers for reordering, but they are not wired to any event handlers.

**Severity:** MEDIUM (dead code / incomplete feature)
**Impact:** The keyboard-based reorder accessibility described in the knowledge doc ("Up/Down arrow keys to change order within the area") is not implemented.
**Fix:** Wire these handlers to keyboard events on widget instance cards, or remove if drag-and-drop is the only intended reorder mechanism.

#### M-7: Layout WidgetArea uses `(area as any)` for area property access

**File:** `ConvexPress-Website/apps/web/src/components/layout/WidgetArea.tsx`
**Lines:** 32-35

```typescript
const widgetTag = (area as any)?.widgetTag || "section";
const titleTag = (area as any)?.titleTag || "h3";
const widgetClass = (area as any)?.widgetClass || "";
const titleClass = (area as any)?.titleClass || "";
```

Four `as any` casts to access properties that should be on the area document type.

**Severity:** MEDIUM
**Impact:** No type safety for area configuration properties.
**Fix:** Ensure the `getWidgetArea` query's return type includes these fields. The schema defines them, so they should be in the generated types. This is likely a codegen staleness issue.

#### M-8: `useWidgetConfig` hook does not sync with external savedConfig changes

**File:** `ConvexPress-Admin/apps/web/src/features/widgets/hooks/use-widget-config.ts`
**Lines:** 21-23

```typescript
const [localConfig, setLocalConfig] = useState<Record<string, any>>(
    () => ({ ...savedConfig }),
);
```

The `useState` initializer only runs once. If `savedConfig` changes (e.g., from another admin editing the widget simultaneously via Convex subscription), the local state will not update to reflect the new saved config. The `handleReset` function does use `savedConfig`, but the user must manually click Reset.

**Severity:** MEDIUM
**Impact:** Stale data display when another admin edits the same widget. Not a data loss issue (save still works), but confusing UX.
**Fix:** Add a `useEffect` that updates `localConfig` when `savedConfig` changes AND `isDirty` is false (i.e., don't overwrite unsaved local changes).

#### M-9: RSS XML parser does not handle all XML encoding edge cases

**File:** `ConvexPress-Admin/packages/backend/convex/widgets/actions.ts`
**Lines:** 112-228

The custom XML parser uses regex to extract content from RSS/Atom feeds. While functional for well-formed feeds, it can fail on:
- Self-closing tags (`<link href="..." />` inside `<item>` where there's also `<link>content</link>`)
- Namespaced tags with attributes that contain `>` characters
- Feeds with XML comments or processing instructions
- Content with CDATA containing nested CDATA-like patterns

The knowledge doc lists `rss-parser` as an external dependency but the implementation uses a custom parser instead.

**Severity:** MEDIUM
**Impact:** Some RSS feeds may not parse correctly. The graceful degradation (serving cached data on failure) mitigates the severity.
**Fix:** Consider using a proper XML parsing library like `fast-xml-parser` (which works in Convex's runtime since it's pure JS). The custom parser works for most standard feeds but is fragile.

#### M-10: ArchivesWidget fetches ALL published posts (limit: 500) to build archive data

**File:** `ConvexPress-Website/apps/web/src/features/widgets/components/types/archives-widget.tsx`
**Line:** 24

```typescript
posts = useQuery(api.posts?.queries?.listPublished as any, { limit: 500 });
```

Fetching up to 500 posts just to count posts per month/year is extremely wasteful. This should be a dedicated backend query that returns archive counts directly.

**Severity:** MEDIUM
**Impact:** Performance. On a site with many posts, this query transfers significant data just for the widget to count and discard most of it.
**Fix:** Create a dedicated `widgets/queries.getArchiveCounts` query that groups posts by month/year and returns only the aggregate data.

---

### LOW

#### L-1: Unused `WidgetInstance` type import in `useWidgetInstances` hook

**File:** `ConvexPress-Admin/apps/web/src/features/widgets/hooks/use-widget-instances.ts`
**Line:** 10

```typescript
import type { WidgetInstance } from "../types";
```

This import is used only for the `as WidgetInstance[]` cast in `useInactiveWidgets`. The cast itself is questionable since Convex's `useQuery` already returns properly typed data.

**Severity:** LOW
**Impact:** Minor type noise.

#### L-2: Dynamic icon lookup via `(Icons as any)[typeDef.icon]`

**Files:**
- `ConvexPress-Admin/apps/web/src/features/widgets/components/widget-instance-card.tsx` (line 57)
- `ConvexPress-Admin/apps/web/src/features/widgets/components/widget-type-card.tsx` (line 24)
- `ConvexPress-Admin/apps/web/src/features/widgets/components/inactive-widgets-panel.tsx` (line 109)

Pattern: `(Icons as any)[typeDef.icon] || Icons.Puzzle`

**Severity:** LOW
**Impact:** The `as any` is necessary here because Lucide's export type doesn't support dynamic string indexing. The fallback to `Icons.Puzzle` is correct. This is an accepted pattern but could be improved with a utility function that maps icon names to components with proper typing.

#### L-3: Duplicated type definitions between backend validators and admin frontend types

**Files:**
- `ConvexPress-Admin/packages/backend/convex/widgets/validators.ts` (lines 100-122) -- `WidgetFieldDef`, `WidgetTypeDefinition`
- `ConvexPress-Admin/apps/web/src/features/widgets/types.ts` (lines 26-48) -- identical interfaces

**Severity:** LOW
**Impact:** Maintenance burden. If one is updated without the other, types diverge.
**Fix:** Import the types from the backend validators into the frontend types file, or create a shared types package.

#### L-4: `InactiveWidgetItem` uses `confirm()` for deletion

**File:** `ConvexPress-Admin/apps/web/src/features/widgets/components/inactive-widgets-panel.tsx`
**Line:** 129

```typescript
if (!confirm("Permanently delete this widget?")) return;
```

Uses the native `confirm()` dialog instead of a styled UI component. While the knowledge doc allows confirmation dialogs for destructive actions, the native dialog is inconsistent with the admin UI's design system.

**Severity:** LOW
**Impact:** UX inconsistency only. The `WidgetInstanceCard` component properly uses an inline confirmation pattern (show/hide buttons). The `InactiveWidgetItem` should match that pattern.

#### L-5: `WidgetAreaSettingsPage` also uses `confirm()` for area deletion

**File:** `ConvexPress-Admin/apps/web/src/features/widgets/components/widget-area-settings-page.tsx`
**Lines:** 101, 114

Same issue as L-4. Uses native `confirm()` for delete confirmations.

**Severity:** LOW
**Impact:** UX inconsistency.

#### L-6: Missing `shared/widget-registry.ts` and `shared/widget-types.ts` files

The knowledge doc specifies shared code files at `shared/widget-registry.ts` and `shared/widget-types.ts`. These do not exist. Instead, the widget type registry lives in `ConvexPress-Admin/packages/backend/convex/widgets/validators.ts`, and type definitions are duplicated between backend and frontend.

**Severity:** LOW
**Impact:** No functional impact. The current placement works but deviates from the specified architecture. The knowledge doc's "shared" approach would reduce duplication.

#### L-7: `WidgetSkeleton` component is never used

**File:** `ConvexPress-Website/apps/web/src/features/widgets/components/widget-skeleton.tsx`

The `WidgetSkeleton` component is defined but not imported or used anywhere. The `WidgetArea` component returns `null` during loading rather than showing a skeleton. The knowledge doc mentions this is intentional ("Don't show skeleton to avoid layout shift").

**Severity:** LOW
**Impact:** Dead code. The component is well-written and could be useful if the loading UX strategy changes.

#### L-8: `useWidgetDrag` hook's `handleDragEnd` references `onReorderWidgets` in deps but doesn't use it in the function body for same-area reorder

**File:** `ConvexPress-Admin/apps/web/src/features/widgets/hooks/use-widget-drag.ts`
**Lines:** 95-98, 110-117

The same-area reorder case (line 95-98) has a comment saying "handled by the area section component", but `onReorderWidgets` is still in the dependency array of `handleDragEnd`. This doesn't cause bugs but is misleading.

**Severity:** LOW
**Impact:** Unnecessary re-creation of the callback when `onReorderWidgets` changes.

#### L-9: `useEffect` in `WidgetAreaForm` missing dependency

**File:** `ConvexPress-Admin/apps/web/src/features/widgets/components/widget-area-form.tsx`
**Lines:** 62-66

```typescript
useEffect(() => {
    if (autoSlug && !isEditing) {
      setSlug(generateSlug(name));
    }
}, [name, autoSlug, isEditing]);
```

This is technically correct but the `generateSlug` function is stable (imported), so no issue. However, the linting rule `react-hooks/exhaustive-deps` may flag it depending on configuration.

**Severity:** LOW
**Impact:** No functional issue.

#### L-10: `WidgetArea` (deprecated features/ version) has a typo in DEPRECATED comment referencing wrong path

**File:** `ConvexPress-Website/apps/web/src/features/widgets/components/widget-area.tsx`
**Line:** 1

```typescript
// DEPRECATED: This file is unused. The real WidgetArea is at components/layout/WidgetArea.tsx
```

The comment says "unused" but the file is still importable. If any code imports from this path instead of the layout path, they'd get the deprecated version with different behavior.

**Severity:** LOW
**Impact:** Potential confusion.

#### L-11: Some widget render components use hardcoded `text-black/XX` opacity values

**Files:** Multiple website widget components use `text-black/50`, `text-black/40`, `text-black/70`, `bg-black/5` etc.

Examples:
- `search-widget.tsx`: `border-black/10`, `text-black/40`, `hover:text-black/70`
- `recent-posts-widget.tsx`: `text-black/50`, `text-black/40`
- `calendar-widget.tsx`: `text-black/40`, `bg-black/5`
- Most other widget type components

**Severity:** LOW
**Impact:** The project rules say "Never use zinc, slate, gray, or any hardcoded Tailwind color names" but `black/XX` with opacity modifiers IS explicitly allowed ("Use opacity modifiers (`bg-black/40`)"). These usages are COMPLIANT with the design system rules. However, they could be problematic in a light theme context where `text-black/50` may not match the design token system's `text-muted-foreground`.

#### L-12: `widget-area.tsx` (deprecated version) runs two parallel queries unnecessarily

**File:** `ConvexPress-Website/apps/web/src/features/widgets/components/widget-area.tsx`

The deprecated `WidgetArea` component runs both `getAreaWidgets` and `getWidgetArea` queries. The active version in `components/layout/WidgetArea.tsx` also runs both. The `getWidgetArea` query is needed for area configuration (tags, classes, visibility), so this is actually correct and necessary.

**Severity:** LOW
**Impact:** No issue - this is architecturally correct.

---

## Compliance Checks

### 1. Hardcoded Colors

**PASS.** No instances of hardcoded zinc, slate, or gray color names found in any widget system file. All color references use:
- CSS variables (`text-muted-foreground`, `bg-card`, `bg-muted`, `border-border`, `text-destructive`)
- Black opacity modifiers (`text-black/50`, `bg-black/5`) -- which are explicitly allowed

### 2. Radix Imports

**PASS.** Zero `@radix-ui/*` imports found across all widget system files. The Checkbox and Label components used are from `@/components/ui/` which uses Base UI.

### 3. TypeScript Issues

**15 `as any` casts identified:**
- 12x `requireCan(ctx, "manage_widgets" as any)` in backend -- capability type gap (M-1)
- 1x `CalendarWidget as any` in render map (M-3)
- 1x `areaId as any` in useWidgetArea hook (M-4)
- 5x `api.XXX?.queries?.YYY as any` in website widget components (M-5)
- 4x `(area as any)?.widgetTag` etc. in layout WidgetArea (M-7)
- 3x `(Icons as any)[typeDef.icon]` for dynamic icon lookup (L-2)

**No `as never` casts found.**

### 4. Security

**Backend mutations: PASS.** All 10 mutations properly call `requireCan(ctx, "manage_widgets" as any)` before any data operations.

**Backend queries:** Properly segmented:
- Public queries (getAreaWidgets, getWidgetArea, getWidgetTypeRegistry): No auth required -- CORRECT per knowledge doc
- Admin queries (getWidgetAreas with includeInactive, getInactiveWidgets, getWidgetInstance): Require `manage_widgets` -- CORRECT

**HTML sanitization: CRITICAL ISSUE.** See C-1 and H-1. Regex-based sanitization is insufficient.

**Input validation: PASS.** Slug format validation, name/title length limits, config schema validation are all properly implemented.

### 5. React 19 Compatibility

**No deprecated patterns found.** The codebase uses:
- `useState`, `useCallback`, `useMemo` properly
- `useEffect` with proper cleanup (RSS feed widget)
- Class component `WidgetErrorBoundary` -- this is correct for error boundaries (the only place class components are still required)
- No string refs, legacy context, or deprecated lifecycle methods

**Hooks Rules violation: H-2 and H-3** (conditional hook calls in NavMenuWidget and try/catch around hooks in multiple widgets)

### 6. Dead Code

- `lazy` import in `widget-render-map.ts` (M-2)
- `handleMoveUp`/`handleMoveDown` in `widget-area-section.tsx` (M-6)
- `WidgetSkeleton` component (L-7)
- Deprecated `widget-area.tsx` in features/ (H-4)

### 7. Import Resolution

All imports resolve to existing files. The admin frontend imports from `@backend/convex/_generated/api` and `@/components/ui/*` which are standard path aliases. Website frontend imports from `@convexpress-website/backend/convex/_generated/api`.

**Note:** The `api.comments?.queries?.recent`, `api.menus?.queries?.getMenu`, etc. use optional chaining suggesting the generated types may not include these paths (M-5).

### 8. Convex Best Practices

**Schema: PASS.**
- Modular schema in `schema/widgets.ts` with proper export name `widgetTables`
- Correctly imported and spread in `schema.ts`
- All 7 indexes match the knowledge doc specification exactly
- `v.any()` for config field is documented and validated per-type in mutations

**Queries: PASS.**
- All queries use proper indexes
- Public queries have no auth requirement
- Admin queries properly gate on `manage_widgets`

**Mutations: PASS.**
- All mutations validate input, check auth, and emit events
- ConvexError used for structured errors with codes
- `reorderAreaWidgets` helper properly re-sequences order values
- Event emission uses `SYSTEM.WIDGET` constant from events/constants.ts

**Actions: PASS.**
- RSS feed action uses internal queries/mutations for cache access
- Proper error handling with cache fallback
- 10-second timeout on external HTTP requests

### 9. Knowledge Doc Compliance

| Feature | Knowledge Doc | Implementation | Match |
|---------|--------------|----------------|-------|
| 3 DB tables | widgetAreas, widgetInstances, widgetRssCache | All 3 present | YES |
| 7 indexes | by_slug, by_sort_order, by_area, by_area_active, by_type, by_active, by_url | All 7 present | YES |
| 6 queries | getWidgetAreas, getAreaWidgets, getInactiveWidgets, getWidgetArea, getWidgetInstance, getWidgetTypeRegistry | All 6 present | YES |
| 10 mutations | create/update/delete area, add/update/delete instance, deactivate, reactivate, reorder, move | All 10 present | YES |
| 1 action | fetchRssFeed | Present | YES |
| 3 internal functions | seedDefaultAreas, getCachedFeed, cacheFeed | All 3 present + reorderAreaWidgets helper | YES |
| 16 widget types | search through social-links | All 16 in registry | YES |
| 6 default areas | sidebar-1, sidebar-2, footer-1/2/3, header-1 | All 6 in seed data | YES |
| 16 website render components | One per widget type | All 16 present | YES |
| DOMPurify for Custom HTML | Required | Not used (regex instead) | **NO** |
| @dnd-kit/core for drag-drop | Required | Hook exists but not wired to actual @dnd-kit | **PARTIAL** |
| rss-parser dependency | Listed | Custom parser used instead | **NO** |
| Shared widget-registry.ts | Required | Types in backend validators instead | **PARTIAL** |

---

## Prioritized Fix List

### Priority 1 (CRITICAL -- Fix Immediately)

1. **C-1:** Replace regex-based HTML sanitizer with DOMPurify in CustomHtmlWidget
2. **H-1:** Replace regex-based sanitizer with DOMPurify in RichTextWidget

### Priority 2 (HIGH -- Fix Before Production)

3. **H-2:** Fix NavMenuWidget conditional useQuery calls (Rules of Hooks violation)
4. **H-3:** Remove try/catch wrappers around useQuery in CategoriesWidget, TagCloudWidget, ArchivesWidget, PagesWidget
5. **H-4:** Delete deprecated `features/widgets/components/widget-area.tsx`, consolidate to layout version

### Priority 3 (MEDIUM -- Fix Soon)

6. **M-1:** Add `manage_widgets` to the capability type union in `helpers/permissions.ts`
7. **M-5:** Run Convex codegen for ConvexPress-Website to fix stale types; remove `as any` casts on API paths
8. **M-6:** Wire up or remove unused `handleMoveUp`/`handleMoveDown` in WidgetAreaSection
9. **M-7:** Fix `(area as any)` casts in layout WidgetArea by ensuring proper types
10. **M-8:** Add `useEffect` to sync `useWidgetConfig` local state with external changes
11. **M-10:** Create a dedicated `getArchiveCounts` query for ArchivesWidget instead of fetching all posts
12. **M-3:** Update CalendarWidget to accept `{ config }` prop; remove `as any` cast
13. **M-4:** Fix `useWidgetArea` hook's areaId type
14. **M-9:** Consider replacing custom RSS parser with `fast-xml-parser`
15. **M-2:** Remove unused `lazy` import from widget-render-map

### Priority 4 (LOW -- Nice to Have)

16. **L-4/L-5:** Replace native `confirm()` with styled inline confirmation pattern
17. **L-3:** Deduplicate type definitions between backend and frontend
18. **L-6:** Consider creating shared widget-registry module per knowledge doc architecture
19. **L-7:** Delete or conditionally use WidgetSkeleton component
20. **L-2:** Create a typed icon lookup utility function

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Total files | 53 |
| Clean files (no issues) | 26 |
| Files with issues | 27 |
| CRITICAL issues | 1 |
| HIGH issues | 4 |
| MEDIUM issues | 10 |
| LOW issues | 12 |
| Total `as any` casts | ~27 |
| `@radix-ui` imports | 0 |
| Hardcoded color violations | 0 |
| Missing files from checklist | 2 (shared registry/types -- but functionally covered elsewhere) |
| Dead code instances | 4 |

**Overall Assessment:** The Widget System is substantially complete and well-architected. The critical XSS vulnerability from regex-based HTML sanitization must be addressed before production deployment. The high-priority React Hooks violations in several website widget components should also be fixed promptly. The medium and low issues are quality improvements that strengthen type safety, reduce dead code, and improve UX consistency.
