# Revision System - Full Code Review & Audit

**Auditor:** Revision System Expert (Claude Opus 4.6)
**Date:** 2026-02-13
**System:** Revision System
**Status:** Complete (100%)
**Scope:** All backend functions, schema, helpers, frontend components, routes, and utility modules

---

## Executive Summary

The Revision System is well-implemented with solid architecture, clean code organization, and proper separation of concerns. The system follows PRD specifications closely with a few notable exceptions. The React 19 modernization of `restore-dialog.tsx` (using `useTransition`) and `revisions.tsx` (derived state pattern instead of useEffect) has been applied correctly.

**Overall Grade: B+**

### Key Metrics

| Metric | Count |
|--------|-------|
| **Files audited** | 14 |
| **Critical issues** | 1 |
| **High issues** | 3 |
| **Medium issues** | 5 |
| **Low issues** | 6 |
| **Info/nitpicks** | 4 |
| **Radix imports** | 0 (PASS) |
| **Hardcoded colors** | 0 (PASS) |
| **Security issues** | 1 (Medium) |

---

## Files Audited

### Backend (ConvexPress-Admin/packages/backend/convex/)

| # | File | Lines | Issues |
|---|------|-------|--------|
| 1 | `schema/revisions.ts` | 83 | 0 |
| 2 | `revisions/queries.ts` | 490 | 3 |
| 3 | `revisions/mutations.ts` | 280 | 3 |
| 4 | `revisions/internals.ts` | 345 | 3 |
| 5 | `revisions/validators.ts` | 146 | 0 |
| 6 | `helpers/revisions.ts` | 202 | 0 |
| 7 | `crons.ts` (revision portion) | 5 | 0 |
| 8 | `events/constants.ts` (revision portion) | 4 | 0 |

### Frontend (ConvexPress-Admin/apps/web/src/)

| # | File | Lines | Issues |
|---|------|-------|--------|
| 9 | `routes/_authenticated/_admin/posts/$postId/revisions.tsx` | 363 | 3 |
| 10 | `components/revisions/revision-slider.tsx` | 238 | 3 |
| 11 | `components/revisions/diff-viewer.tsx` | 111 | 1 |
| 12 | `components/revisions/diff-pane.tsx` | 117 | 0 |
| 13 | `components/revisions/revision-meta.tsx` | 90 | 0 |
| 14 | `components/revisions/restore-dialog.tsx` | 68 | 1 |
| 15 | `components/editor/RevisionsMetabox.tsx` | 53 | 1 |
| 16 | `lib/diff.ts` | 93 | 0 |
| 17 | `lib/blockDiff.ts` | 281 | 1 |

---

## Findings

### CRITICAL

#### [C-001] Settings System Integration Uses Wrong Schema Shape

**Files:**
- `ConvexPress-Admin/packages/backend/convex/revisions/internals.ts` (lines 62-75, 82-92)
- `ConvexPress-Admin/packages/backend/convex/revisions/mutations.ts` (lines 167-180)

**Issue:** The revision system queries the `settings` table using `.withIndex("by_key", (q) => q.eq("key", "max_revisions"))` and reads `setting.value` as a string. However, the actual settings schema (`schema/settings.ts`) uses a **section-based** design with a `by_section` index, `section` field, and `values: v.any()` field. There is no `by_key` index and no `key` or `value` fields.

**Current code (internals.ts:62-75):**
```typescript
const setting = await ctx.db
  .query("settings")
  .withIndex("by_key", (q) => q.eq("key", "max_revisions"))
  .unique();
if (setting) {
  const parsed = parseInt(setting.value, 10);
  if (!isNaN(parsed)) {
    maxRevisions = parsed;
  }
}
```

**What the schema actually is:**
```typescript
settings: defineTable({
  section: v.union(v.literal("general"), v.literal("writing"), ...),
  values: v.any(),
  updatedAt: v.number(),
  updatedBy: v.id("users"),
}).index("by_section", ["section"])
```

**Impact:** All settings lookups silently fail (caught by try/catch blocks), causing the system to always use DEFAULT_MAX_REVISIONS (25) and always treat revisions as enabled. This means:
1. Admin cannot configure `max_revisions` to take effect on the revision system
2. Admin cannot disable revisions via settings
3. The system works because defaults are reasonable, masking the bug

**Correct integration pattern:**
```typescript
const writingSettings = await ctx.db
  .query("settings")
  .withIndex("by_section", (q) => q.eq("section", "writing"))
  .unique();
if (writingSettings?.values?.max_revisions !== undefined) {
  maxRevisions = writingSettings.values.max_revisions;
}
```

This same bug appears in 3 locations:
- `internals.ts` createOnSave: max_revisions lookup (line 62-75)
- `internals.ts` createOnSave: revisions_enabled lookup (line 82-92)
- `mutations.ts` restore: max_revisions lookup (line 167-180)
- `internals.ts` prune: max_revisions lookup (line 264-278)

---

### HIGH

#### [H-001] No Page Revisions Route

**Files:** Missing route

**Issue:** The PRD specifies revisions support for both posts AND pages (`parentType: "post" | "page"`). The backend fully supports pages via the `parentType` discriminator. However, there is no `/admin/pages/$pageId/revisions` route. Only `/admin/posts/$postId/revisions` exists.

The `RevisionsMetabox` component (line 37-40) constructs a link to `/pages/${postId}/revisions` for page content type, but this route does not exist in the file system.

**Impact:** Pages with revisions cannot be browsed/compared/restored through the UI. The metabox link would 404.

**Fix:** Create a page revisions route or make the existing route work for both content types.

---

#### [H-002] `auto-draft` Skip Not Enforced in createOnSave

**Files:** `ConvexPress-Admin/packages/backend/convex/revisions/internals.ts` (line 38, 47-57)

**Issue:** The knowledge doc explicitly lists "Post is in `auto-draft` status" as a skip condition for createOnSave. The inline comment on line 38 says "(checked by caller, but double-checked here)". However, createOnSave does NOT actually check for `auto-draft` status -- it only checks if `changedFields` includes content fields and if `max_revisions === 0`.

The Post System caller (`posts/mutations.ts` line 438) does check `post.status !== "auto-draft"` before calling createOnSave, so the skip works in practice. But the knowledge doc claims a "double-check" that does not exist.

**Impact:** Low in practice (caller handles it), but creates a documentation/code mismatch. If another system calls createOnSave without the auto-draft guard, revisions would be created for auto-drafts.

**Fix:** Add auto-draft check inside createOnSave, or update the knowledge doc to remove the "double-checked here" claim.

---

#### [H-003] Prune for All Posts Uses Unbounded `ctx.db.query("posts").collect()`

**Files:** `ConvexPress-Admin/packages/backend/convex/revisions/internals.ts` (line 317)

**Issue:** The `prune` function's global mode (when `parentId` is not provided, used by the daily cron) loads ALL posts into memory with `ctx.db.query("posts").collect()`. For a large site with thousands of posts, this could hit Convex's query size limits or cause excessive memory usage in a single mutation.

**Code:**
```typescript
const allPosts = await ctx.db.query("posts").collect();
for (const post of allPosts) {
  // Query each post's revisions...
}
```

**Impact:** Potential Convex mutation timeout or memory issues at scale. Each post then triggers an additional query for its revisions, creating O(N) database queries.

**Fix:** Use pagination or a chunked approach. Alternatively, query the `revisions` table directly (grouped by parentId) instead of iterating all posts. A more efficient approach would be to use `.take(100)` with cursor-based pagination in the cron, processing a batch per invocation.

---

### MEDIUM

#### [M-001] TypeScript Type Assertions Across Multiple Files

**Files:**
- `queries.ts` lines 88-93, 175, 261, 331, 405, 448 (repeated `as Record<string, unknown>` casts)
- `queries.ts` lines 123, 175, 261, 331, 405 (`as UserDoc`, `as unknown as PostDoc` casts)
- `mutations.ts` line 101 (`as UserDoc` cast)

**Issue:** The queries file has numerous unsafe type assertions: `(authorUser as Record<string, unknown>).displayName as string` and `post as unknown as PostDoc`. These bypass TypeScript's type safety. The double cast `as unknown as PostDoc` is a code smell indicating the actual type doesn't match the expected interface.

**Impact:** Potential runtime errors if the actual data shape changes. TypeScript loses its ability to catch errors at these boundaries.

**Fix:** Import the proper Doc types from Convex's generated types (`Doc<"users">`, `Doc<"posts">`) or create proper type guards. The `resolveRevisionAuthor` helper (lines 73-99) should use the generated `Doc<"users">` type instead of raw object access.

---

#### [M-002] Duplicated Permission Logic Between queries.ts and mutations.ts

**Files:**
- `queries.ts` lines 116-142 (requireRevisionAccess helper)
- `mutations.ts` lines 100-121 (inline permission check)

**Issue:** The permission checking logic is duplicated. `queries.ts` has a `requireRevisionAccess` helper function, but `mutations.ts` re-implements the same ownership + level check inline in the `restore` mutation. This creates a maintenance risk -- if the permission logic changes, both locations must be updated.

**Impact:** Potential permission drift if one location is updated and the other is not.

**Fix:** Extract the shared permission logic into `helpers/revisions.ts` or a dedicated `revisions/permissions.ts` helper, importable by both queries and mutations.

---

#### [M-003] `compare` Query Fetches All Revisions Just to Count Them

**Files:** `queries.ts` lines 334-338

**Issue:** The `compare` query fetches ALL revisions for the parent post and counts them to return `totalRevisions`:

```typescript
const allRevisions = await ctx.db
  .query("revisions")
  .withIndex("by_parent", (q) => q.eq("parentId", left.parentId))
  .collect();
const totalRevisions = allRevisions.length;
```

This loads every revision document into memory just to count them. For posts with many revisions, this is wasteful.

**Impact:** Unnecessary database read and memory usage, especially for posts with large content in many revisions.

**Fix:** Use a separate count query or the `getRevisionCount` helper from `helpers/revisions.ts`, which does the same thing but makes the pattern explicit. Ideally, Convex would support a `.count()` operation, but since it does not, at minimum use the helper to centralize the pattern.

---

#### [M-004] Security: deleteAllForPost Mutation Should Be Internal Only

**Files:** `mutations.ts` lines 260-279

**Issue:** `deleteAllForPost` is a public mutation (exported from `mutations.ts`). The knowledge doc states this operation should be triggered by the Post System via `internal.revisions.deleteByParent` (which already exists in `internals.ts`). Having a public mutation that deletes ALL revisions for a post creates a security surface -- any admin user could call it directly without the post deletion guard.

While it requires `revision.delete` capability (Admin-only), the function comment even acknowledges: "The Post System should preferably call the internal `deleteByParent` function instead of this public mutation."

**Impact:** Expanded attack surface. An authenticated admin could delete all revision history for any post without actually deleting the post.

**Fix:** Move `deleteAllForPost` to internals or add additional validation (e.g., verify the post is actually being deleted or is in trash).

---

#### [M-005] `parseBlocks` Operator Precedence Bug

**Files:** `lib/blockDiff.ts` line 79

**Issue:** The condition has an operator precedence issue:

```typescript
if (!content || !content.trim().startsWith("{") && !content.trim().startsWith("[")) {
```

This evaluates as: `(!content) || ((!content.trim().startsWith("{")) && (!content.trim().startsWith("[")))` due to `&&` binding tighter than `||`. While this happens to produce the correct result (returns null for non-JSON strings), the intent is ambiguous. The developer likely meant: "if content is falsy OR it doesn't start with { or [".

**Correct version:**
```typescript
if (!content || (!content.trim().startsWith("{") && !content.trim().startsWith("["))) {
```

**Impact:** Works correctly by coincidence due to operator precedence rules matching the intended logic, but confusing to read and a maintenance risk.

---

### LOW

#### [L-001] Missing Pagination/Cursor Support in listByPost

**Files:** `queries.ts` lines 154-224

**Issue:** The PRD specifies cursor-based pagination (`cursor: v.optional(v.string())` in args, `cursor: string | null` in return). The implementation uses simple offset-based pagination (slice with limit) and does not return or accept a cursor parameter. The `listByPostArgs` validator also omits the cursor field.

**Impact:** For posts with very many revisions (100+), there is no way to paginate beyond the first page. The hard limit of 200 (MAX_REVISION_LIMIT) mitigates this but does not match the PRD specification.

---

#### [L-002] Intl.DateTimeFormat Instantiated Per Render in RevisionTooltip and RevisionMeta

**Files:**
- `revision-slider.tsx` lines 200-203 (RevisionTooltip)
- `revision-meta.tsx` lines 40-43 (RevisionMeta)

**Issue:** Both components create a new `Intl.DateTimeFormat` instance on every render. While not expensive for single renders, the tooltip can re-render rapidly during mouse hover across the slider.

**Impact:** Minor performance waste, especially noticeable on the slider tooltip during drag operations.

**Fix:** Hoist the formatters to module-level constants:
```typescript
const tooltipDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "short",
  timeStyle: "short",
});
```

---

#### [L-003] RevisionSlider Uses `role="slider"` Incorrectly

**Files:** `revision-slider.tsx` lines 97-108

**Issue:** The track container div has `role="slider"` but functions as a custom composite widget with multiple clickable dots. The WAI-ARIA slider pattern expects a single thumb on a range, not multiple discrete points. This is more accurately a `role="listbox"` or custom `role="toolbar"` with discrete selectable items.

Additionally, `aria-valuemin=1` and `aria-valuemax={count}` are correct for a range slider, but the dots are rendered as individual `<button>` elements, creating an inconsistency between the ARIA role and the actual interaction model.

**Impact:** Accessibility -- screen readers may not correctly convey the interaction model.

**Fix:** Consider `role="group"` or `role="toolbar"` for the container, with each dot as a radio-like item, or implement a proper `<input type="range">` with custom styling.

---

#### [L-004] Compare Mode Left Handle Selection Not Working via Click

**Files:** `revision-slider.tsx` lines 145-153

**Issue:** The click handler in compare mode is commented with "In compare mode, clicking selects the right handle / Shift+click selects the left handle" but the actual code always calls `onSelectIndex(idx)` regardless of compare mode or Shift key state. There is no Shift+click handling.

**Code:**
```typescript
onClick={() => {
  if (compareMode && onSelectLeftIndex) {
    // In compare mode, clicking selects the right handle
    // Shift+click selects the left handle
    onSelectIndex(idx);
  } else {
    onSelectIndex(idx);
  }
}}
```

Both branches do the same thing -- `onSelectIndex(idx)`. The left handle can only be moved by the parent component via the `handleSelectLeftIndex` callback, which is not connected to any click interaction in the slider.

**Impact:** Users cannot select the left comparison handle by clicking dots in compare mode. They would need a separate control (not implemented).

---

#### [L-005] `computeWordDiff` Exported But Never Used

**Files:** `lib/diff.ts` lines 68-93

**Issue:** The `computeWordDiff` function is exported but never imported or used anywhere in the codebase. The knowledge doc mentions word-level diffs for modified blocks, but `computeBlockDiff` uses `computeDiff` (character-level with semantic cleanup), not `computeWordDiff`.

**Impact:** Dead code. Not harmful but adds to bundle size and maintenance surface.

---

#### [L-006] `DiffPane` Component Exported But Never Used

**Files:** `diff-pane.tsx` lines 14-58

**Issue:** The `DiffPane` component (single-pane diff renderer) is exported but never imported anywhere. Only `TwoColumnDiffPane` is used by `DiffViewer`. This appears to be a leftover from an earlier iteration.

**Impact:** Dead code.

---

### INFO / NITPICKS

#### [I-001] React 19 `useTransition` in RestoreDialog -- Verified Correct

**Files:** `restore-dialog.tsx` lines 38, 42

**Issue:** None -- this is a positive finding. The RestoreDialog correctly uses `useTransition` (React 19 pattern) instead of the old `useState(false)` for `isExecuting`:

```typescript
const [isPending, startTransition] = useTransition();
const handleConfirm = () => {
  startTransition(async () => {
    try {
      await restoreMutation({ revisionId });
      // ...
    } catch (error: any) { ... }
  });
};
```

This is correct React 19 usage. `startTransition` wraps the async mutation call, and `isPending` replaces manual `isExecuting` state management. The pattern properly handles:
- Pending state tracking (automatic via `isPending`)
- Error handling (via try/catch inside transition)
- Toast feedback (success and error cases)
- Dialog close after success

**Verification:** PASS.

---

#### [I-002] Derived State Pattern in revisions.tsx -- Verified Correct

**Files:** `revisions.tsx` lines 57-86

**Issue:** None -- positive finding. The route component uses a derived state pattern instead of the previous `useEffect` anti-pattern:

```typescript
const [userSelectedIndex, setUserSelectedIndex] = useState<number | null>(null);
const [userLeftIndex, setUserLeftIndex] = useState<number | null>(null);

// Derive effective indices
const selectedIndex = userSelectedIndex !== null
  ? Math.min(userSelectedIndex, sortedRevisions.length - 1)
  : Math.max(0, sortedRevisions.length - 1);
const leftIndex = userLeftIndex !== null
  ? Math.min(userLeftIndex, sortedRevisions.length - 1)
  : Math.max(0, sortedRevisions.length - 2);
```

This correctly:
- Defaults to the latest revision when no user selection has been made (null state)
- Clamps indices to valid bounds when the revision list changes
- Tracks user intent separately from derived display state
- Avoids the useEffect sync anti-pattern identified in the React 19 audit

**Verification:** PASS.

---

#### [I-003] Knowledge Doc PRD Location Mismatch

**Files:** `.claude/docs/REVISION-SYSTEM.md` line 11

**Issue:** The knowledge doc references PRD at `specs/ConvexPress/systems/revision-system/PRD.md` but no file exists at that path. The specs directory structure may use `revision/` instead of `revision-system/`, or the PRD may not have been created yet.

**Impact:** Documentation only -- does not affect functionality.

---

#### [I-004] `error: any` Type in RestoreDialog Catch Block

**Files:** `restore-dialog.tsx` line 48

**Issue:** Uses `catch (error: any)` which bypasses TypeScript's strict checking. While this is common in practice and harmless here, the preferred pattern is `catch (error: unknown)` with type narrowing.

**Impact:** Cosmetic TypeScript strictness issue.

---

## PRD Compliance Checklist

| PRD Requirement | Status | Notes |
|----------------|--------|-------|
| **Schema: `revisions` table** | PASS | All fields match PRD exactly |
| **Schema: 5 indexes** | PASS | by_parent, by_parent_type, by_parent_number, by_author, by_createdAt |
| **Query: listByParent** | PARTIAL | Implemented as `listByPost`. Missing cursor-based pagination (L-001) |
| **Query: compare** | PASS | Validates same parent, includes author data, returns full content |
| **Query: countByParent** | PASS | Implemented as `count`. Returns number, used by metabox |
| **Query: getLatest** | PASS | Not in PRD but useful addition |
| **Mutation: restore** | PASS | Safety-net revision, content copy, autosave clear, pruning, event emission |
| **Mutation: delete** | PASS | Admin-only capability check |
| **Internal: createOnSave** | PARTIAL | Missing auto-draft check inside function (H-002), wrong settings integration (C-001) |
| **Internal: createAutosave** | PASS | One-per-user-per-post, updates in place |
| **Internal: deleteByParent** | PASS | Cascading deletion on parent delete |
| **Internal: prune** | PARTIAL | Scalability concern for global prune (H-003), wrong settings integration (C-001) |
| **Helper: getRevisionCount** | PASS | |
| **Helper: getLatestRevision** | PASS | |
| **Helper: getNextRevisionNumber** | PASS | |
| **Daily cron job** | PASS | Registered in crons.ts at 3:30 UTC |
| **Events: revision.created** | PASS | Emitted in createOnSave |
| **Events: revision.restored** | PASS | Emitted in restore mutation |
| **Route: /admin/posts/$postId/revisions** | PASS | Full page with slider, diff, restore |
| **Route: Page revisions** | FAIL | No page revisions route exists (H-001) |
| **Component: RevisionSlider** | PARTIAL | Works but left handle selection missing (L-004) |
| **Component: DiffViewer** | PASS | Block-level + text-level diff, fallback pattern |
| **Component: DiffPane** | PASS | CSS variable styling, no hardcoded colors |
| **Component: RevisionMeta** | PASS | Author, date, revision number, type badge, changed fields |
| **Component: RestoreDialog** | PASS | Uses ConfirmDialog (Base UI), React 19 useTransition |
| **Component: RevisionsMetabox** | PASS | Count + browse link, conditional rendering |
| **Library: diff-match-patch** | PASS | Installed, typed, properly wrapped |
| **Block-level diff** | PASS | JSON parsing, ID-based + positional alignment |
| **No Radix imports** | PASS | Zero Radix imports across all files |
| **No hardcoded colors** | PASS | All styling uses CSS variables/opacity |
| **Capabilities: revision.view** | PASS | Checked in all queries |
| **Capabilities: revision.compare** | PASS | Checked in compare query |
| **Capabilities: revision.restore** | PASS | Checked in restore mutation + UI |
| **Capabilities: revision.delete** | PASS | Checked in delete mutations |
| **Ownership-based access** | PASS | Authors own-posts-only, Editors+ any post |
| **Settings: max_revisions** | FAIL | Wrong integration pattern (C-001) |
| **Settings: revisions_enabled** | FAIL | Wrong integration pattern (C-001) |
| **Post System integration** | PASS | createOnSave called before update, deleteByParent on permanent delete |
| **React 19 compatibility** | PASS | useTransition in RestoreDialog, derived state in revisions.tsx |

---

## Banned Pattern Checks

| Check | Result | Details |
|-------|--------|--------|
| **Radix UI imports** | PASS | No `@radix-ui` imports in any revision system file |
| **Hardcoded colors (zinc/slate/gray)** | PASS | All styling uses CSS variables (bg-card, bg-muted, text-foreground, bg-destructive/15, bg-success/15) |
| **Content management in modals** | PASS | RestoreDialog is the ONLY dialog, and it's a destructive action confirmation (the one acceptable dialog type) |
| **Schema in wrong location** | PASS | Schema in `convex/schema/revisions.ts`, imported into `schema.ts` |
| **Consumer app deployments** | N/A | Revision system is admin-only |

---

## Security Assessment

| Area | Status | Notes |
|------|--------|-------|
| **Authentication** | PASS | All queries/mutations require Convex Auth auth via `getCurrentUser` or `requireCan` |
| **Authorization (queries)** | PASS | `requireRevisionAccess` enforces capability + ownership checks |
| **Authorization (mutations)** | PASS | `requireCan` + ownership checks in restore; `requireCan` for delete |
| **Trashed post guard** | PASS | Restore mutation checks `post.status === "trash"` and blocks |
| **Cross-parent validation** | PASS | Compare query validates both revisions belong to same parent |
| **Public mutation exposure** | MEDIUM | `deleteAllForPost` is public but should be internal-only (M-004) |
| **Input validation** | PASS | All args use Convex validators (typed IDs, enums) |
| **Data integrity** | PASS | Safety-net revision created before restore; revision numbers never reused |

---

## React 19 Modernization Verification

The React 19 audit (file `audits/react-19-modernization/08-revision-system.md`) identified 10 findings. Here is the verification status of the applied changes:

| Finding | Status | Verification |
|---------|--------|-------------|
| F-001: useEffect init anti-pattern | FIXED | Replaced with derived state pattern using null sentinel. Correct. |
| F-002: useCallback on compare toggle | NOT YET | Still using useCallback. React Compiler will handle this. Low priority. |
| F-003: useCallback on left index handler | NOT YET | Still using useCallback. Low priority. |
| F-004: useCallback on restore handler | NOT YET | Still using useCallback. Low priority. |
| F-005: useMemo for sorting | KEPT | Still using useMemo. Acceptable for 200-item sort. |
| F-006: useCallback in slider | NOT YET | Still using useCallback. Low priority. |
| F-007: DateTimeFormat per render | NOT YET | Still creating new instance per render. Low priority. |
| F-008: Manual isExecuting state | FIXED | Replaced with `useTransition`. Correct usage verified. |
| F-009: isExecuting prop drilling | PARTIAL | `isPending` from useTransition passed as `isExecuting` to ConfirmDialog. Pattern improved but prop still drilled. |
| F-010: useMemo for diff computation | KEPT | Correctly preserved -- expensive computation. |

---

## Recommendations (Priority Order)

### Must Fix (Before Next Deploy)

1. **[C-001] Fix settings integration** -- Update all 4 settings lookup locations to use `by_section` index with `section: "writing"` and read from `values.max_revisions` / `values.revisions_enabled`. This is the only critical bug.

### Should Fix (Next Sprint)

2. **[H-001] Add page revisions route** -- Either create a parallel route at `/admin/pages/$pageId/revisions` or make the existing route content-type-aware via a query parameter.

3. **[H-003] Paginate global prune** -- Replace `ctx.db.query("posts").collect()` with batched processing (e.g., process 100 posts per cron invocation with cursor tracking).

4. **[M-004] Make deleteAllForPost internal** -- Move to `internals.ts` or add post-deletion guard.

### Nice to Have

5. **[M-001] Fix type assertions** -- Use generated `Doc<"users">` and `Doc<"posts">` types instead of manual interfaces with unsafe casts.

6. **[M-002] Extract shared permission logic** -- Move the duplicated ownership + level check into a shared helper.

7. **[L-004] Implement left handle click in compare mode** -- Add Shift+click or separate handle interaction.

8. **[L-005, L-006] Remove dead code** -- Delete unused `computeWordDiff` and `DiffPane` exports.

---

## File Inventory (Complete)

### Backend Files

| File | Path | Status |
|------|------|--------|
| Schema | `ConvexPress-Admin/packages/backend/convex/schema/revisions.ts` | Complete |
| Queries | `ConvexPress-Admin/packages/backend/convex/revisions/queries.ts` | Complete |
| Mutations | `ConvexPress-Admin/packages/backend/convex/revisions/mutations.ts` | Complete |
| Internals | `ConvexPress-Admin/packages/backend/convex/revisions/internals.ts` | Complete |
| Validators | `ConvexPress-Admin/packages/backend/convex/revisions/validators.ts` | Complete |
| Helpers | `ConvexPress-Admin/packages/backend/convex/helpers/revisions.ts` | Complete |
| Crons | `ConvexPress-Admin/packages/backend/convex/crons.ts` (lines 23-32) | Complete |
| Events | `ConvexPress-Admin/packages/backend/convex/events/constants.ts` (REVISION_EVENTS) | Complete |

### Frontend Files

| File | Path | Status |
|------|------|--------|
| Route | `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/posts/$postId/revisions.tsx` | Complete |
| Slider | `ConvexPress-Admin/apps/web/src/components/revisions/revision-slider.tsx` | Complete |
| Diff Viewer | `ConvexPress-Admin/apps/web/src/components/revisions/diff-viewer.tsx` | Complete |
| Diff Pane | `ConvexPress-Admin/apps/web/src/components/revisions/diff-pane.tsx` | Complete |
| Revision Meta | `ConvexPress-Admin/apps/web/src/components/revisions/revision-meta.tsx` | Complete |
| Restore Dialog | `ConvexPress-Admin/apps/web/src/components/revisions/restore-dialog.tsx` | Complete |
| Metabox | `ConvexPress-Admin/apps/web/src/components/editor/RevisionsMetabox.tsx` | Complete |
| Diff Utility | `ConvexPress-Admin/apps/web/src/lib/diff.ts` | Complete |
| Block Diff | `ConvexPress-Admin/apps/web/src/lib/blockDiff.ts` | Complete |

### Missing Files (Per PRD)

| File | Path (Expected) | Status |
|------|-----------------|--------|
| Page Revisions Route | `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/pages/$pageId/revisions.tsx` | MISSING |

---

*Audit complete. 14 source files reviewed. 1 critical, 3 high, 5 medium, 6 low, 4 info findings.*
