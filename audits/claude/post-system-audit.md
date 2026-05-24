# Post System - Full Code Audit Report

**Date:** 2026-02-13
**Auditor:** Post System Expert (Automated)
**Scope:** Complete Post System code review across ConvexPress-Admin and ConvexPress-Website
**Reference:** Knowledge doc at `.claude/docs/POST-SYSTEM.md` (no PRD file exists)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Files Audited](#files-audited)
3. [Hardcoded Colors](#hardcoded-colors)
4. [Radix UI Imports](#radix-ui-imports)
5. [TypeScript Issues](#typescript-issues)
6. [Security Issues](#security-issues)
7. [Knowledge Doc Compliance](#knowledge-doc-compliance)
8. [Broken or Missing Imports](#broken-or-missing-imports)
9. [Dead Code](#dead-code)
10. [React 19 Compatibility](#react-19-compatibility)
11. [Convex Best Practices](#convex-best-practices)
12. [Performance Concerns](#performance-concerns)
13. [Missing Error Handling](#missing-error-handling)
14. [Missing Functionality](#missing-functionality)
15. [Website Frontend Assessment](#website-frontend-assessment)
16. [Findings Summary Table](#findings-summary-table)

---

## 1. Executive Summary

The Post System is **substantially complete** and well-architected. The shared `posts` table with a `type` discriminator mirrors WordPress's `wp_posts` pattern effectively. The backend mutations implement comprehensive capability checks with ownership-aware permissions. The admin frontend provides a full WordPress-style list table, inline quick edit, bulk actions, autosave, edit locking, and revision comparison.

**Overall health: GOOD with targeted fixes needed.**

### Key Strengths
- Comprehensive permission model with `checkPostCapability()` ownership-aware checks
- Full event emission on all state transitions
- Revision creation on every save
- Edit locking with 30-second heartbeat
- Autosave with debounce (60s interval + 2s after typing stops)
- Well-structured modular schema
- Website frontend has full blog index, single post, category/tag/author archives
- TipTap JSON-to-HTML rendering pipeline with security escaping

### Critical Issues (3)
- **Hardcoded Tailwind colors** in `constants.ts` (8 instances) -- violates project rules
- **`(q: any)` type assertions** in comment index queries (3 locations in post code)
- **`list` query loads all posts into memory** before sorting/paginating -- scalability risk

### Moderate Issues (7)
- Excessive `as any` type assertions across frontend hooks and components (15+ instances)
- PostMeta queries (`getMetaByPost`, `getMetaByKey`) have no auth checks
- PostMeta mutations (`setMeta`, `deleteMeta`, `bulkSetMeta`) lack post-level ownership checks
- Bulk edit calls `updatePost` individually per post (no dedicated bulk mutation)
- `duplicate` emits `POST_EVENTS.DUPLICATED` instead of `POST_EVENTS.CREATED` (knowledge doc says emit `.created`)
- Password-protected post content verification not implemented (backend TODO)
- No RSS/feed API routes exist in ConvexPress-Website despite `<link>` tags referencing them

### Minor Issues (5)
- Knowledge doc naming discrepancies (`scheduledFor` vs `scheduledAt`, capability names)
- Schema fields optional vs required mismatch with knowledge doc
- `SORT_FIELD_MAP` has comment/author sort fallback to `createdAt` (misleading)
- `usePostFilters` uses extensive `(search as any)` pattern
- No separate `schedule` mutation exists (handled via `create`/`update`)

---

## 2. Files Audited

### Backend (ConvexPress-Admin/packages/backend/convex/)

| File | Lines | Status |
|------|-------|--------|
| `schema/posts.ts` | ~92 | Reviewed |
| `posts/validators.ts` | ~180 | Reviewed |
| `posts/mutations.ts` | ~1515 | Reviewed |
| `posts/queries.ts` | ~806 | Reviewed |
| `posts/internals.ts` | ~180 | Reviewed |
| `helpers/slug.ts` | ~90 | Reviewed |
| `helpers/postAuth.ts` | ~130 | Reviewed |
| `helpers/permissions.ts` | ~250 | Reviewed |
| `helpers/auth.ts` | ~130 | Reviewed |
| `helpers/events.ts` | ~120 | Reviewed |
| `events/constants.ts` | ~437 | Reviewed |
| `schema.ts` (hub) | ~68 | Reviewed |

### Admin Frontend (ConvexPress-Admin/apps/web/src/)

| File | Lines | Status |
|------|-------|--------|
| `routes/_authenticated/_admin/posts/index.tsx` | ~80 | Reviewed |
| `routes/_authenticated/_admin/posts/new.tsx` | ~95 | Reviewed |
| `routes/_authenticated/_admin/posts/$postId/edit.tsx` | ~200 | Reviewed |
| `routes/_authenticated/_admin/posts/$postId/revisions.tsx` | ~363 | Reviewed |
| `components/posts/PostListTable.tsx` | ~450 | Reviewed |
| `components/posts/PostFilterBar.tsx` | ~130 | Reviewed |
| `components/posts/PostQuickEdit.tsx` | ~160 | Reviewed |
| `components/posts/PostBulkEdit.tsx` | ~130 | Reviewed |
| `hooks/posts/usePostMutations.ts` | ~250 | Reviewed |
| `hooks/posts/usePostList.ts` | ~50 | Reviewed |
| `hooks/posts/usePostCounts.ts` | ~40 | Reviewed |
| `hooks/posts/usePostFilters.ts` | ~90 | Reviewed |
| `hooks/posts/usePostAutosave.ts` | ~80 | Reviewed |
| `hooks/posts/usePostEditLock.ts` | ~70 | Reviewed |
| `lib/posts/types.ts` | ~50 | Reviewed |
| `lib/posts/constants.ts` | ~101 | Reviewed |
| `lib/posts/utils.ts` | ~80 | Reviewed |

### Website Frontend (ConvexPress-Website/apps/web/src/)

| File | Lines | Status |
|------|-------|--------|
| `routes/_marketing/blog/index.tsx` | ~135 | Reviewed |
| `routes/_marketing/blog/$slug.tsx` | ~281 | Reviewed |
| `routes/_marketing/category/$slug.tsx` | ~282 | Reviewed |
| `routes/_marketing/tag/$slug.tsx` | ~183 | Reviewed |
| `routes/_marketing/author/$slug.tsx` | ~174 | Reviewed |
| `lib/blog/types.ts` | ~471 | Reviewed |
| `lib/blog/renderContent.ts` | ~678 | Reviewed |

### Files Not Found (Expected but Missing)
- `specs/ConvexPress/systems/post/PRD.md` -- No PRD file exists for the Post System
- `ConvexPress-Website/apps/web/src/routes/api/**/feed*` -- No feed API routes exist
- `ConvexPress-Website/apps/web/src/components/posts/` -- No post-specific components (uses blog/ components)
- `ConvexPress-Website/apps/web/src/lib/posts/` -- No post-specific lib (uses blog/ lib)

---

## 3. Hardcoded Colors

**Severity: HIGH** -- Violates project rule: "Never use zinc, slate, gray, or any hardcoded Tailwind color names."

### Location: `ConvexPress-Admin/apps/web/src/lib/posts/constants.ts`

```typescript
// Lines 31-34 (STATUS_TEXT_CLASSES)
pending: "text-amber-500",      // VIOLATION
publish: "text-emerald-500",    // VIOLATION
future: "text-blue-500",        // VIOLATION
private: "text-purple-500",     // VIOLATION

// Lines 44-47 (STATUS_BG_CLASSES)
pending: "bg-amber-500/10",     // VIOLATION
publish: "bg-emerald-500/10",   // VIOLATION
future: "bg-blue-500/10",       // VIOLATION
private: "bg-purple-500/10",    // VIOLATION
```

**Total: 8 hardcoded color violations.**

**Recommendation:** Replace with CSS custom properties. These status colors should be defined as CSS variables in the theme (e.g., `--color-status-pending`, `--color-status-published`) and referenced via Tailwind's CSS variable pattern or as semantic class names.

Note: `text-destructive` and `bg-destructive/10` used for "trash" status are acceptable (CSS variable-based).

---

## 4. Radix UI Imports

**Status: PASS** -- No Radix UI imports found in any Post System file.

The only `@radix-ui` references in the repository exist within the legacy WordPress backup archive (`wordpress/user.admin.pamwerne.tar/`), which is not part of the active codebase.

---

## 5. TypeScript Issues

### 5.1 `(q: any)` Type Assertions in Index Queries (HIGH)

Three locations in post system code use `(q: any)` to bypass Convex's type-safe index query builder. This suppresses type checking on the index field names and values.

| File | Line | Context |
|------|------|---------|
| `posts/mutations.ts` | 916 | `permanentDelete` -- querying comments `by_post` index |
| `posts/mutations.ts` | 1314 | `bulkDelete` -- querying comments `by_post` index |
| `posts/internals.ts` | 115 | `purgeOldTrash` -- querying comments `by_post` index |

```typescript
// Example (mutations.ts:916)
.withIndex("by_post", (q: any) => q.eq("postId", args.postId))
```

**Root cause:** The comments schema index definition may not match what TypeScript expects. This is a cross-system type resolution issue.

**Recommendation:** Investigate the `comments` schema to ensure the `by_post` index is defined with the correct field. If the schema is correct, the `(q: any)` assertion may indicate a Convex codegen issue that should be resolved by regenerating types.

### 5.2 Excessive `as any` Usage in Frontend (MODERATE)

15+ instances of `as any` in frontend hooks and components:

| File | Count | Examples |
|------|-------|---------|
| `usePostFilters.ts` | 9 | `(search as any).status`, `(search as any).search`, etc. (lines 34-42) |
| `usePostMutations.ts` | 2 | `args as any` for create and update mutations (lines 56, 87) |
| `edit.tsx` | 3 | `post.status as any`, `post.visibility as any`, `post.commentStatus as any` (lines 119-122) |
| `usePostList.ts` | 1 | `SORT_FIELD_MAP[params.orderBy] as any` (line 38) |
| `PostQuickEdit.tsx` | 2 | `status as any` (line 40), `e.target.value as any` (line 91) |
| `PostListTable.tsx` | 1 | `row.status as any` (line 197) |

**Root cause for usePostFilters:** TanStack Router's `useSearch()` return type may not align with the expected search params shape. The hook should use proper generic typing with the Route's search validator.

**Root cause for usePostMutations:** The Convex mutation argument types from the API may not perfectly match the TypeScript types being passed. Proper typing of the args object should resolve this.

**Root cause for edit.tsx:** String values from Convex docs are being cast to union types. Proper type narrowing or validation would be cleaner.

### 5.3 `as never` in Website Frontend (LOW)

| File | Line | Context |
|------|------|---------|
| `category/$slug.tsx` | 72 | `termId: category._id as never` |
| `tag/$slug.tsx` | 72 | `termId: tag._id as never` |

These cast Convex IDs to `never` to satisfy a cross-system type mismatch between taxonomy queries and post system types.

### 5.4 Sort Variable Typing (LOW)

```typescript
// queries.ts lines 207-208
let aVal: any;
let bVal: any;
```

The sort comparison uses `any` for the comparison values. Should use `string | number` union type.

---

## 6. Security Issues

### 6.1 PostMeta Queries Have No Auth Checks (MODERATE)

**File:** `posts/queries.ts`

Both `getMetaByPost` and `getMetaByKey` queries have no authentication or authorization checks. Any client can read all post metadata.

```typescript
export const getMetaByPost = query({
  args: getMetaByPostArgs,
  handler: async (ctx, args) => {
    // NO auth check -- anyone can read any post's metadata
    return await ctx.db
      .query("postMeta")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();
  },
});
```

**Risk:** Post metadata may contain sensitive data (custom fields, SEO overrides, etc.) that should be restricted.

**Recommendation:** Add auth checks consistent with the parent post's visibility. If the post is public/published, meta should be readable. If draft/private, only authorized users should access the metadata.

### 6.2 PostMeta Mutations Lack Ownership Checks (MODERATE)

**File:** `posts/mutations.ts`

`setMeta`, `deleteMeta`, and `bulkSetMeta` only check `requireCan("post.update")` but do NOT verify the caller owns the post or has `post.update_others` capability.

```typescript
export const setMeta = mutation({
  args: { ... },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "post.update");
    // Missing: checkPostCapability(ctx, user, post, "post.update")
    // An Author could set meta on any post, not just their own
  },
});
```

**Risk:** An Author (role level 60) could modify metadata on posts they don't own, bypassing the ownership model enforced by the regular `update` mutation.

**Recommendation:** Fetch the post by `args.postId`, then call `checkPostCapability()` to enforce ownership-aware authorization.

### 6.3 Password-Protected Post Content Not Verified (LOW)

**File:** `ConvexPress-Website/apps/web/src/routes/_marketing/blog/$slug.tsx` (lines 98-111)

The single post page has a `PasswordGate` component but the backend `getPublished` query returns the full content for password-protected posts. There is no server-side password verification.

```typescript
// Line 105-108
onSubmit={() => {
  // TODO: When backend supports password verification, pass the
  // password to a Convex mutation/query to unlock the content.
}}
```

**Risk:** Password-protected post content is accessible via the Convex query directly, bypassing the password gate.

---

## 7. Knowledge Doc Compliance

The knowledge doc (`.claude/docs/POST-SYSTEM.md`) was used as the primary reference since no PRD exists.

### 7.1 Schema Deviations

| Field | Knowledge Doc | Actual Code | Assessment |
|-------|--------------|-------------|------------|
| `authorId` | `v.string()` (user identifier) | `v.id("users")` | **Improvement** -- type-safe Convex ID reference |
| `scheduledFor` | Named `scheduledFor` | Named `scheduledAt` | Naming mismatch -- code is consistent internally |
| `content` | `v.string()` (required) | `v.optional(v.string())` | Deviation -- allows content-less posts |
| `commentCount` | `v.number()` (required) | `v.optional(v.number())` | Deviation -- may cause null checks |
| `isSticky` | `v.boolean()` (required) | `v.optional(v.boolean())` | Deviation -- may cause null checks |
| `menuOrder` | `v.number()` (required) | `v.optional(v.number())` | Deviation -- may cause null checks |
| `featuredImageId` | `v.optional(v.string())` | `v.optional(v.id("media"))` | **Improvement** -- type-safe media reference |

**Assessment:** The `authorId` and `featuredImageId` changes are improvements (type-safe references). The `scheduledFor`->`scheduledAt` rename is cosmetic. Making `content`, `commentCount`, `isSticky`, and `menuOrder` optional is acceptable for progressive content creation (auto-drafts start empty). The knowledge doc should be updated to reflect reality.

### 7.2 Capability Naming

| Knowledge Doc | Actual Code | Notes |
|--------------|-------------|-------|
| `edit_posts`, `edit_others_posts` | `post.update` | Different naming convention |
| `publish_posts` | `post.publish` | Different naming convention |
| `delete_posts`, `delete_others_posts` | `post.delete` | Different naming convention |
| `read_private_posts` | `post.read` | Different naming convention |

The actual code uses a dot-notation capability system (`post.update`, `post.delete`, etc.) with the `checkPostCapability()` helper handling the ownership-aware logic internally. The knowledge doc uses WordPress-style naming. This is a documentation-vs-implementation gap -- the code's approach is cleaner and the knowledge doc should be updated.

### 7.3 Event Emission Discrepancy

The knowledge doc states `duplicate` should emit `post.created`. The actual code emits `post.duplicated`:

```typescript
// mutations.ts, duplicate mutation
await emitEvent(ctx, {
  code: POST_EVENTS.DUPLICATED, // "post.duplicated" -- not "post.created"
  ...
});
```

The event constants file explicitly defines `POST_EVENTS.DUPLICATED = "post.duplicated"`, which is a valid event code. This is intentional -- a duplicate is semantically different from a creation. The knowledge doc should be updated.

### 7.4 Missing Dedicated `schedule` Mutation

The knowledge doc describes a standalone `schedule` mutation. The actual implementation handles scheduling through the `create` and `update` mutations by setting `status: "future"` and providing a `scheduledAt` timestamp. This is simpler and avoids redundancy.

---

## 8. Broken or Missing Imports

**Status: No broken imports detected.**

All imports resolve to existing files:
- Backend: `../helpers/permissions`, `../helpers/postAuth`, `../helpers/slug`, `../helpers/events`, `../events/constants`, `../_generated/server`, `../_generated/dataModel` -- all exist
- Admin frontend: `@/components/posts/*`, `@/hooks/posts/*`, `@/lib/posts/*`, `@backend/convex/_generated/*` -- all exist
- Website frontend: `@convexpress-website/backend/convex/_generated/api`, `@/lib/blog/*`, `@/components/blog/*` -- all exist

### Missing Feed API Routes

The website frontend references feed URLs in `<link>` tags but no API routes exist:

```typescript
// blog/$slug.tsx head config
href: `/api/blog/${params.slug}/feed`
href: `/api/blog/${params.slug}/feed/atom`

// category/$slug.tsx head config
href: `/api/category/${params.slug}/feed`
href: `/api/category/${params.slug}/feed/atom`

// tag/$slug.tsx, author/$slug.tsx -- same pattern
```

A glob search for `**/api/**/feed*` in ConvexPress-Website returned **no results**. These `<link>` tags reference non-existent routes. This falls under the RSS/Feed System's responsibility, not the Post System, but is worth noting as a cross-system gap.

---

## 9. Dead Code

**No significant dead code found.** All mutations, queries, hooks, and components are actively used. The PostMeta operations (`setMeta`, `deleteMeta`, `bulkSetMeta`, `getMetaByPost`, `getMetaByKey`) are currently available but may have limited frontend usage -- they serve as the API for the Custom Field System to store per-post metadata.

### Minor Dead Code Notes

1. **`SORT_FIELD_MAP`** in `constants.ts` maps `author` and `comments` to `createdAt` as fallbacks. These fallback mappings are technically used but misleading -- sorting by "author" or "comments" doesn't actually sort by those fields.

2. **`resolveUserRole`** in `helpers/permissions.ts` has a legacy `internalRole` fallback path that may be dead code if all users have been migrated to the `roleId` system.

---

## 10. React 19 Compatibility

**Status: GOOD** -- No React 19 compatibility issues detected.

### Patterns Verified

| Pattern | Status | Notes |
|---------|--------|-------|
| No class components | PASS | All function components |
| No `defaultProps` | PASS | Uses default parameters |
| No `propTypes` | PASS | TypeScript types used |
| No `React.FC` | PASS | Plain function components |
| No `forwardRef` usage | PASS | Not needed in these components |
| No legacy context API | PASS | Uses hooks (`useAuth`, `useQuery`) |
| No `UNSAFE_` lifecycle methods | PASS | Not applicable (function components) |
| `useCallback`/`useMemo` usage | OK | Used appropriately in revisions.tsx |
| `useState` patterns | OK | All correct |
| `useEffect` cleanup | OK | `usePostEditLock` and `usePostAutosave` handle cleanup |

### StrictMode Handling

The `new.tsx` route correctly handles React StrictMode's double-mounting with a `createdRef`:

```typescript
const createdRef = useRef(false);
useEffect(() => {
  if (createdRef.current) return;
  createdRef.current = true;
  // ... create auto-draft
}, []);
```

This is the correct pattern for React 18/19 StrictMode compatibility.

---

## 11. Convex Best Practices

### 11.1 Proper Index Usage (GOOD)

The schema defines appropriate indexes:
- `by_type_status` -- primary listing index
- `by_author` -- author-filtered queries
- `by_slug` -- slug lookups
- `by_type_publishedAt` -- published post chronological ordering
- `search_posts` -- full-text search on title

### 11.2 Event Emission (GOOD)

All state-changing mutations properly emit events via `emitEvent()`:
- `create` -> `POST_EVENTS.CREATED`
- `update` -> `POST_EVENTS.UPDATED` (+ `STATUS_CHANGED` on transitions)
- `publish` -> `POST_EVENTS.PUBLISHED`
- `unpublish` -> `POST_EVENTS.UNPUBLISHED`
- `trash` -> `POST_EVENTS.TRASHED`
- `restore` -> `POST_EVENTS.RESTORED`
- `permanentDelete` -> `POST_EVENTS.DELETED`
- `duplicate` -> `POST_EVENTS.DUPLICATED`

### 11.3 Revision Creation (GOOD)

Both `update` and `autosave` mutations trigger revision creation via `internal.revisions.internals.createOnSave`, ensuring a complete history trail.

### 11.4 Cascade Deletion (GOOD)

`permanentDelete` and `purgeOldTrash` properly cascade:
1. Delete postMeta records
2. Delete termRelationships
3. Delete revisions
4. Delete comments
5. Delete the post itself

### 11.5 Taxonomy Assignment (ACCEPTABLE)

Taxonomy assignment is done inline within the `create` and `update` mutations rather than via the Taxonomy System's mutations. This is acceptable for performance (avoids extra mutation calls) but creates a coupling -- changes to termRelationships logic need to be updated in both the taxonomy system and the post system.

### 11.6 Issue: Full Table Scans in `list` Query (HIGH)

**File:** `posts/queries.ts`, lines 163-260

The `list` query uses `.collect()` to load **all** matching posts into memory, then sorts and paginates in JavaScript:

```typescript
allPosts = await ctx.db
  .query("posts")
  .withIndex("by_type_status", (q) => q.eq("type", type))
  .collect();  // Loads ALL posts into memory

// Then in-memory sort and slice
filtered.sort((a, b) => { ... });
const posts = filtered.slice(offset, offset + perPage);
```

**Risk:** At scale (thousands of posts), this loads the entire table into a single Convex function execution. Convex functions have memory limits and execution time limits.

**Recommendation:** Use Convex pagination (`.paginate()`) where possible, or add composite indexes that support the common sort orders (e.g., `by_type_createdAt`) to avoid full table scans. For the sort-then-paginate pattern, consider pre-sorted indexes.

---

## 12. Performance Concerns

### 12.1 Per-Row Taxonomy Queries in PostListTable (MODERATE)

**File:** `components/posts/PostListTable.tsx`

The taxonomy cells use per-row `useQuery` calls to fetch categories and tags for each post in the list:

```typescript
// Inside each row's category/tag cell
const taxonomies = useQuery(api.taxonomies.queries.getByPost, { postId: row._id });
```

For a page of 20 posts, this triggers 20 separate taxonomy queries. While Convex batches these, it adds latency and bandwidth.

**Recommendation:** Consider denormalizing category/tag names onto the post document, or have the `list` query resolve taxonomy data server-side for the paginated results.

### 12.2 Bulk Edit Uses Individual Mutations (LOW)

**File:** `components/posts/PostBulkEdit.tsx`

Bulk edit calls `updatePost` individually for each selected post rather than using a single bulk mutation:

```typescript
// Calls updatePost for each post
for (const postId of selectedPostIds) {
  await updatePost({ postId, ...changes });
}
```

This triggers N separate Convex mutations for N posts. While the existing `bulkTrash`, `bulkRestore`, `bulkDelete`, and `bulkPublish` mutations handle their operations in a single call, there is no `bulkUpdate` mutation.

**Recommendation:** Add a `bulkUpdate` mutation that accepts an array of post IDs and the shared changes to apply.

---

## 13. Missing Error Handling

### 13.1 Blog Index `generateExcerpt` (LOW)

**File:** `ConvexPress-Website/apps/web/src/routes/_marketing/blog/index.tsx`

The `generateExcerpt` function handles null/undefined content but doesn't handle the case where `extractPlainText` throws an error (e.g., malformed JSON content).

### 13.2 Single Post JSON Parsing (HANDLED)

**File:** `ConvexPress-Website/apps/web/src/routes/_marketing/blog/$slug.tsx` (lines 116-122)

The JSON parsing of block content is properly wrapped in try/catch:

```typescript
try {
  blockContent = typeof rawPost.content === "string"
    ? JSON.parse(rawPost.content)
    : rawPost.content;
} catch {
  blockContent = null;
}
```

This is correct.

### 13.3 `usePostMutations` Error Handling (GOOD)

All mutation wrappers in `usePostMutations.ts` have try/catch with toast error messages. This is the correct pattern.

---

## 14. Missing Functionality

### 14.1 No PRD File

There is no PRD at `specs/ConvexPress/systems/post/PRD.md`. The knowledge doc serves as the primary reference but a formal PRD would provide clearer acceptance criteria.

### 14.2 Password-Protected Content Backend

The `getPublished` query returns full content for password-protected posts. The `PasswordGate` component on the website frontend is UI-only with a TODO comment. Backend password verification is needed.

### 14.3 Previous/Next Post Navigation

The single post page sets `previousPost` and `nextPost` to `null`:

```typescript
// blog/$slug.tsx line 171-172
previousPost: null,
nextPost: null,
```

No query exists to fetch adjacent posts. The `PostFooter` component receives these but they're always null.

### 14.4 Related Posts

The `RelatedPosts` component is imported and rendered in `blog/$slug.tsx` but no query to fetch related posts was found in the post system queries. The component may handle its own data fetching or may render as empty.

### 14.5 No `postMeta` Separate Module

The knowledge doc describes postMeta as having its own query/mutation module. In reality, postMeta operations are embedded within the `posts/mutations.ts` and `posts/queries.ts` files. This is acceptable but differs from the documented structure.

---

## 15. Website Frontend Assessment

### 15.1 Blog Index (`/blog`) - GOOD

- Fetches published posts via `listPublished` query
- Proper loading skeleton
- Empty state handled
- Pagination implemented
- `PostGrid` component with featured post support on page 1
- Uses `estimateReadingTime` for reading time calculation
- Maps Convex response to typed `PostCard` interface

**Issue:** Uses `(post: any)` type assertion in the `.map()` call. Should type the Convex response properly.

### 15.2 Single Post (`/blog/$slug`) - GOOD

- Fetches post, taxonomies, author profile, and SEO data
- Loading skeleton, 404 handling, password gate
- Full SEO with `<SeoHead>` component and JSON-LD structured data
- Comment section integration
- Author box with bio
- Share buttons via `PostFooter`
- RSS feed `<link>` tags in head

**Issues:**
- `(post: any)` in taxonomy mapping
- `rawPost._id as any` for cross-system query args
- `seoSettings as unknown as SeoSettings` double cast
- `previousPost`/`nextPost` always null

### 15.3 Category Archive (`/category/$slug`) - GOOD

- Fetches category by slug, posts by term, category tree
- Breadcrumb navigation with ancestor chain
- Subcategory list
- Loading skeleton, 404 handling
- Pagination

**Issue:** Uses `category._id as never` for termId type mismatch.

### 15.4 Tag Archive (`/tag/$slug`) - GOOD

- Same pattern as category but without subcategories/breadcrumbs
- Properly handles `taxonomy: "post_tag"` naming

**Issue:** Uses `tag._id as never` for termId type mismatch.

### 15.5 Author Archive (`/author/$slug`) - GOOD

- Fetches author profile by slug
- Filters published posts by authorId
- Loading skeleton, 404 handling, empty state
- Pagination

**Issue:** Uses `author._id as any` for authorId type mismatch.

### 15.6 Content Rendering (`renderContent.ts`) - EXCELLENT

- Comprehensive TipTap JSON-to-HTML pipeline
- Handles all standard and custom block types
- Proper HTML escaping (`escapeHtml`, `escapeAttr`) for security
- Lazy loading for images
- Responsive embed containers
- Table of contents extraction
- Word count and reading time estimation
- Reusable block resolution support
- Code block language class support

This is one of the strongest files in the system.

---

## 16. Findings Summary Table

| # | Severity | Category | File | Description |
|---|----------|----------|------|-------------|
| 1 | HIGH | Hardcoded Colors | `lib/posts/constants.ts` | 8 hardcoded Tailwind color classes (amber, emerald, blue, purple) |
| 2 | HIGH | TypeScript | `posts/mutations.ts:916,1314` + `posts/internals.ts:115` | `(q: any)` on comments index queries |
| 3 | HIGH | Performance | `posts/queries.ts:163-260` | `list` query loads all posts into memory before sort/paginate |
| 4 | MODERATE | TypeScript | `usePostFilters.ts:34-42` | 9 instances of `(search as any)` |
| 5 | MODERATE | TypeScript | `usePostMutations.ts:56,87` | `args as any` for mutation calls |
| 6 | MODERATE | TypeScript | `edit.tsx:119-122` | `as any` casts for status/visibility/commentStatus |
| 7 | MODERATE | Security | `posts/queries.ts` | `getMetaByPost` and `getMetaByKey` have no auth checks |
| 8 | MODERATE | Security | `posts/mutations.ts` | `setMeta`/`deleteMeta`/`bulkSetMeta` lack ownership checks |
| 9 | MODERATE | Performance | `PostBulkEdit.tsx` | Bulk edit calls individual update mutations |
| 10 | MODERATE | Missing Feature | `blog/$slug.tsx` | Password-protected content not verified server-side |
| 11 | MODERATE | Missing Feature | Feed `<link>` tags | No feed API routes exist in ConvexPress-Website |
| 12 | LOW | Knowledge Doc | Schema fields | `content`, `commentCount`, `isSticky`, `menuOrder` optional vs required |
| 13 | LOW | Knowledge Doc | Naming | `scheduledFor` vs `scheduledAt`, capability naming differences |
| 14 | LOW | TypeScript | Website routes | `as any`, `as never` type assertions in archive pages |
| 15 | LOW | Missing Feature | `blog/$slug.tsx:171-172` | previousPost/nextPost always null |
| 16 | LOW | Dead Code | `constants.ts:97-98` | SORT_FIELD_MAP author/comments fallback misleading |
| 17 | LOW | Missing | PRD | No PRD file exists for Post System |

### Statistics

- **Total findings:** 17
- **HIGH:** 3
- **MODERATE:** 8
- **LOW:** 6
- **Radix imports:** 0 (PASS)
- **React 19 issues:** 0 (PASS)
- **Broken imports:** 0 (PASS)

---

## Recommended Priority Fix Order

1. **Hardcoded colors** (constants.ts) -- Quick fix, high visibility violation
2. **PostMeta auth/ownership checks** -- Security gap
3. **`(q: any)` type assertions** -- Investigate root cause in comments schema
4. **`list` query optimization** -- Add composite indexes, consider server-side pagination
5. **Frontend `as any` cleanup** -- Proper typing for TanStack Router search params and Convex API types
6. **Password-protected content backend** -- Implement server-side verification
7. **Previous/next post navigation** -- Add adjacent post query
8. **Bulk update mutation** -- Add dedicated `bulkUpdate` for bulk edit operations
9. **Feed API routes** -- RSS/Feed System responsibility, but link tags should be conditional
10. **Knowledge doc update** -- Sync documentation with actual implementation

---

*End of audit report.*
