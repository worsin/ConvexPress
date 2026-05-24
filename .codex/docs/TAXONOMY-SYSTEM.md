# Taxonomy System - Expert Knowledge Document

**System:** Taxonomy System
**Status:** Implementation Ready
**Priority:** P1 - High
**Complexity:** Medium
**Category:** Content & Marketing
**Layer:** Full Stack
**WordPress Equivalent:** Taxonomy API -- `wp_terms`, `wp_term_taxonomy`, `wp_term_relationships` tables; Categories & Tags admin screens; category/tag archive pages
**Last Analyzed:** 2026-02-08

---

## MANDATORY: Agent Self-Calibration (2026-02-17)

This agent's pretrained assumptions can be stale. I must self-audit against the Airtable stack-update source before I classify framework behavior as a bug.

### Self-Audit Inputs

- Agent: $(@{Name=Taxonomy System Expert; Path=.codex/docs/TAXONOMY-SYSTEM.md}.Name)
- Source file: $(@{Name=Taxonomy System Expert; Path=.codex/docs/TAXONOMY-SYSTEM.md}.Path)
- Airtable base: pphc1Zda0HD51mla
- Airtable table: 	blls7sBy3NVr6vxb
- Airtable view: iwEsk5xdgAJH6Fwj
- Context7 Convex library: $context7Id (available)

### Updates I Marked As Applicable

- [Medium] **Codegen path unification requires deployment connectivity** (v1.28.0): Do not assume fully-offline codegen in CI without deployment/env availability.
- [Medium] **Components architecture available** (v1.28.0+): When evaluating architecture changes, consider official components/workflow/agent patterns.
- [High] **ConvexHttpClient mutations queue by default** (v1.25.0): Do not assume parallel mutation execution; use skipQueue: true only intentionally.
- [Critical] **ctx.db table name required for get/patch/replace/delete** (v1.31.0): Always call as ctx.db.get("table", id) and equivalent for patch/replace/delete.
- [Medium] **Deploy safety prompt for large index deletion** (v1.30.0): Expect explicit confirmation for large index deletes and adapt deploy automation.
- [High] **Direct function calls deprecated** (v1.18.0): Treat direct function calls as invalid going forward; enforce helper/run* patterns.
- [High] **Direct registered function calls no longer typecheck** (v1.20.0): Do not call registered functions directly; use extracted helpers or ctx.run* with internal.* references.
- [Medium] **File storage string IDs deprecated** (vpre-1.13+): Use Id<"_storage"> typed IDs for storage APIs instead of raw strings.
- [Medium] **New validator composition methods (nullable/pick/omit/partial/extend)** (v1.29.0): Prefer modern validator composition helpers over manual union/object cloning patterns.
- [High] **Node 18 dropped for Actions runtime** (v1.31.5): Target Node 20 or 22 for Convex Actions and convex.json runtime settings.

### Updates Deferred (Not Primary For This Agent)

- None.

### Non-Negotiable Workflow

1. Re-check Airtable stack updates before diagnosing API/framework bugs.
2. Query Context7 for the exact library/version docs before proposing changes.
3. Compare the repo's current patterns with docs before declaring code invalid.
4. If Context7 is unavailable, stop and report that explicitly before any API-level conclusions.
## Quick Reference

### What This System Does

The Taxonomy System is the classification and organization engine of ConvexPress. It implements WordPress's proven taxonomy model -- hierarchical categories and flat tags -- allowing content to be organized, filtered, browsed, and discovered. Every published post belongs to at least one category and may have zero or more tags. The system provides admin-side management screens (split-panel layouts with add form + list table), post editor metaboxes (category checklist and tag input), and public-facing archive pages (`/category/$slug` and `/tag/$slug`).

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Term** | A single taxonomy entry (a category or a tag) |
| **Taxonomy Type** | `"category"` (hierarchical) or `"post_tag"` (flat) |
| **Term Relationship** | Junction record linking a post to a term |
| **Default Category** | The "Uncategorized" category -- always present, cannot be deleted. Posts must have at least one category. |
| **Term Count** | Denormalized count of published posts assigned to a term, maintained automatically |
| **Category Hierarchy** | Parent-child relationships between categories, max 5 levels deep |
| **Term Slug** | URL-safe identifier, unique within a taxonomy type |
| **Term Merge** | Combining two same-type terms, reassigning all posts from source to target |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **Database** | 3 tables: `wp_terms`, `wp_term_taxonomy`, `wp_term_relationships` | 2 tables: `terms` + `termRelationships` (taxonomy type is a field on `terms`) |
| **Reactivity** | AJAX refresh after add/edit/delete | Real-time Convex subscriptions -- list updates instantly |
| **API** | `wp_insert_term()` / REST API | Convex mutations/queries (type-safe) |
| **Auth** | `current_user_can('manage_categories')` | Action code capabilities mapped to roles in Airtable |
| **Slug uniqueness** | Per taxonomy | Per taxonomy (same behavior) |
| **Custom taxonomies** | `register_taxonomy()` | Deferred to future version -- v1 supports `category` and `post_tag` only |
| **Term meta** | `wp_termmeta` table | Not in v1 |
| **Edit screen** | AJAX-powered split panel | Full-page split layout, real-time updates via Convex |
| **Term splitting** | Terms shared across taxonomies were split in WP 4.2 | Not applicable (terms are always per-taxonomy) |

---

## Architecture Overview

### Data Flow

1. **Admin creates/updates a term** via the Categories or Tags management page
2. Convex mutation validates input, checks capabilities, writes to `terms` table
3. Event Dispatcher emits the appropriate event (e.g., `taxonomy.category_created`)
4. Audit Log System records the operation
5. Dashboard System updates "At a Glance" counts
6. All admin clients see the change instantly via Convex reactive subscriptions

**Term assignment flow:**
1. User edits a post and checks/unchecks categories or adds/removes tags
2. On post save, `taxonomy.assign` and `taxonomy.unassign` mutations are called
3. `termRelationships` records are created/deleted
4. Term counts are updated (only counting published posts)
5. Event `taxonomy.term_assigned` is emitted

### Real-Time Behavior

- **Category/Tag management pages**: Use `useQuery(api.taxonomy.list)` -- the list updates live when any admin adds, edits, or deletes a term
- **Post editor metaboxes**: Use `useQuery(api.taxonomy.getCategoryTree)` and `useQuery(api.taxonomy.getByPost)` -- category tree and assigned terms update reactively
- **Dashboard counts**: Use `useQuery(api.taxonomy.counts)` -- category/tag totals update live
- **Archive pages (website)**: Use server-side queries; no real-time needed for public pages (SSR with TanStack Start)

### Authentication & Authorization

- All mutations require Convex Auth authentication via `ctx.auth.getUserIdentity()`
- Capability checks use the action code (e.g., `taxonomy.create_category`) mapped to roles in Airtable
- The `currentUserCan(ctx, actionCode)` helper is called at the start of every mutation
- Queries for admin pages require authentication; website archive queries are public

---

## Database Schema

### `terms` Table

Stores all taxonomy terms (categories and tags) in a single table, with `taxonomy` field distinguishing the type.

```typescript
// convex/schema.ts

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const taxonomyType = v.union(
  v.literal("category"),
  v.literal("post_tag"),
);

terms: defineTable({
  // --- Identity ---
  name: v.string(),                          // Term name - "Technology", "react"
  slug: v.string(),                          // URL-safe slug - "technology", "react"
  taxonomy: taxonomyType,                    // "category" or "post_tag"

  // --- Hierarchy (categories only) ---
  parentId: v.optional(v.id("terms")),       // Parent term ID (undefined for root / tags)

  // --- Metadata ---
  description: v.optional(v.string()),       // Description (shown on archive pages)

  // --- Cached Counts ---
  count: v.number(),                         // Published post count (denormalized)

  // --- System Flags ---
  isDefault: v.boolean(),                    // True for the default category ("Uncategorized")

  // --- Timestamps ---
  createdAt: v.number(),                     // Creation timestamp (ms)
  updatedAt: v.number(),                     // Last modification timestamp (ms)
  createdBy: v.optional(v.string()),         // user identifier of creator
})
  // --- Indexes ---
  .index("by_taxonomy", ["taxonomy"])                          // All categories / all tags
  .index("by_slug_taxonomy", ["slug", "taxonomy"])             // Unique slug per taxonomy
  .index("by_parent", ["parentId"])                            // Children of a category
  .index("by_taxonomy_count", ["taxonomy", "count"])           // Most-used terms
  .index("by_taxonomy_name", ["taxonomy", "name"])             // Alphabetical listing
  .index("by_isDefault", ["isDefault"]),                       // Find the default category
```

#### Field Specifications

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `name` | `string` | Yes | - | 1-200 chars. Trimmed whitespace. No empty strings. |
| `slug` | `string` | Yes | Auto-generated from `name` | Lowercase, alphanumeric + hyphens only. Max 200 chars. Unique within same `taxonomy`. |
| `taxonomy` | `union("category", "post_tag")` | Yes | - | Must be `"category"` or `"post_tag"` |
| `parentId` | `Id<"terms">` | No | `undefined` | Only valid when `taxonomy = "category"`. Parent must exist and be a category. No circular refs. Max depth 5 levels. |
| `description` | `string` | No | `undefined` | Max 5000 chars. Plain text (no HTML). |
| `count` | `number` | Yes | `0` | Non-negative integer. Maintained automatically -- never set directly by users. |
| `isDefault` | `boolean` | Yes | `false` | Only one term may be default (and only for `taxonomy = "category"`). |
| `createdAt` | `number` | Yes | `Date.now()` | Immutable after creation. |
| `updatedAt` | `number` | Yes | `Date.now()` | Updated on every mutation. |
| `createdBy` | `string` | No | Current user's Convex Auth ID | user identifier. |

### `termRelationships` Table

Junction table linking posts to terms (WordPress `wp_term_relationships` equivalent).

```typescript
termRelationships: defineTable({
  postId: v.id("posts"),                     // The post being classified
  termId: v.id("terms"),                     // The term being assigned
  order: v.optional(v.number()),             // Display order (term_order in WP)
})
  // --- Indexes ---
  .index("by_post", ["postId"])                                // All terms for a post
  .index("by_term", ["termId"])                                // All posts with a term
  .index("by_post_term", ["postId", "termId"]),                // Unique pair (prevent duplicates)
```

#### Field Specifications

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `postId` | `Id<"posts">` | Yes | - | Must reference an existing post. |
| `termId` | `Id<"terms">` | Yes | - | Must reference an existing term. |
| `order` | `number` | No | `0` | Non-negative integer. |

**Uniqueness constraint:** The combination of `postId` + `termId` must be unique. Check with `by_post_term` index before inserting.

### Indexes

| Index | Table | Fields | Purpose |
|-------|-------|--------|---------|
| `by_taxonomy` | `terms` | `["taxonomy"]` | Query all categories or all tags |
| `by_slug_taxonomy` | `terms` | `["slug", "taxonomy"]` | Look up term by slug (unique per taxonomy type) |
| `by_parent` | `terms` | `["parentId"]` | Find children of a category |
| `by_taxonomy_count` | `terms` | `["taxonomy", "count"]` | Most-used terms (tag cloud, most used tab) |
| `by_taxonomy_name` | `terms` | `["taxonomy", "name"]` | Alphabetical listing |
| `by_isDefault` | `terms` | `["isDefault"]` | Find the default category quickly |
| `by_post` | `termRelationships` | `["postId"]` | All terms assigned to a post |
| `by_term` | `termRelationships` | `["termId"]` | All posts with a specific term |
| `by_post_term` | `termRelationships` | `["postId", "termId"]` | Deduplicate assignment, check existence |

### Relationships

| This System's Table | Related Table | Relationship | Notes |
|---------------------|---------------|-------------|-------|
| `terms.parentId` | `terms._id` | Self-referencing (categories only) | Parent-child hierarchy |
| `termRelationships.postId` | `posts._id` | Many-to-many via junction | Posts are from the Post System |
| `termRelationships.termId` | `terms._id` | Many-to-many via junction | Links posts to terms |
| `terms.createdBy` | user identifier | Soft reference | Not a Convex table reference |

---

## Actions & Functions

### Mutations

#### `taxonomy.create_category` - Create Category

- **Airtable Record:** `recEnhYVq8jYUckoQ`
- **Convex Function:** `mutations/taxonomy.createCategory`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor
- **Args:**
  ```typescript
  {
    name: v.string(),
    slug: v.optional(v.string()),
    parentId: v.optional(v.id("terms")),
    description: v.optional(v.string()),
  }
  ```
- **Returns:** `Id<"terms">` (the new term's ID)
- **Behavior:**
  1. Authenticate via auth identity
  2. Check capability: `taxonomy.create_category`
  3. Validate `name`: trim whitespace, ensure 1-200 chars, not empty
  4. If `slug` provided, validate format (lowercase, alphanumeric + hyphens). If not, generate via `generateTermSlug()`
  5. Check slug uniqueness within `taxonomy = "category"` using `by_slug_taxonomy`. Append `-2`, `-3` if duplicate
  6. If `parentId` provided: verify parent exists, is a category, is not the term itself, depth does not exceed 5 levels
  7. Check for duplicate name within same parent (no sibling terms with same name)
  8. Insert into `terms` with `taxonomy: "category"`, `count: 0`, `isDefault: false`
  9. Emit event: `taxonomy.category_created`
  10. Return the new term ID
- **Events:** `taxonomy.category_created`
- **Errors:**
  - `UNAUTHORIZED` -- not authenticated
  - `FORBIDDEN` -- lacks capability
  - `VALIDATION_ERROR` -- name empty/too long, slug format invalid, hierarchy exceeds 5 levels, parent is not a category
  - `CONFLICT` -- name duplicates sibling, slug taken
  - `NOT_FOUND` -- parent category does not exist

---

#### `taxonomy.update_category` - Update Category

- **Airtable Record:** `recRqp5pcGfZYhiJH`
- **Convex Function:** `mutations/taxonomy.updateCategory`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor
- **Args:**
  ```typescript
  {
    termId: v.id("terms"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    parentId: v.optional(v.union(v.id("terms"), v.null())),  // null = make root-level
    description: v.optional(v.string()),
  }
  ```
- **Returns:** Updated term object
- **Behavior:**
  1. Authenticate via Convex Auth
  2. Fetch existing term, verify it is a category
  3. Check capability: `taxonomy.update_category`
  4. If `name` changed: validate 1-200 chars, check duplicate name in same parent, regenerate slug if slug was auto-generated
  5. If `slug` changed: validate format, check uniqueness within categories
  6. If `parentId` changed: if `null`, move to root (set `parentId` to `undefined`); if ID, verify parent exists, is a category, not the term itself, not a descendant (circular ref), depth <= 5
  7. If `description` changed: validate max 5000 chars
  8. Track changed fields for event payload
  9. Update `updatedAt` to `Date.now()`, patch the term
  10. Emit event: `taxonomy.category_updated` with changes array
  11. Return the updated term
- **Events:** `taxonomy.category_updated`
- **Errors:**
  - `UNAUTHORIZED`, `NOT_FOUND`, `FORBIDDEN`
  - `VALIDATION_ERROR` -- not a category, circular parent, depth exceeded
  - `CONFLICT` -- slug or name collision

---

#### `taxonomy.delete_category` - Delete Category

- **Airtable Record:** `rec0jRtNh8FQoyzyN`
- **Convex Function:** `mutations/taxonomy.deleteCategory`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor
- **Args:**
  ```typescript
  {
    termId: v.id("terms"),
  }
  ```
- **Returns:** `{ reassignedPosts: number, reparentedChildren: number }`
- **Behavior:**
  1. Authenticate via Convex Auth
  2. Fetch term, verify it is a category
  3. Check capability: `taxonomy.delete_category`
  4. If `isDefault` is `true`, reject -- default category cannot be deleted
  5. **Reassign child categories:** Re-parent children to this category's parent (or make root if this was root)
  6. **Reassign posts:** For each post linked to this category:
     a. Remove the relationship
     b. If post has no remaining categories, assign the default category
     c. Update default category count if posts reassigned
  7. Delete all `termRelationships` rows for this `termId`
  8. Delete the term record
  9. Emit event: `taxonomy.category_deleted`
  10. Return success with counts
- **Events:** `taxonomy.category_deleted`
- **Errors:**
  - `UNAUTHORIZED`, `NOT_FOUND`, `FORBIDDEN`
  - `VALIDATION_ERROR` -- not a category
  - `FORBIDDEN` -- cannot delete default category

---

#### `taxonomy.create_tag` - Create Tag

- **Airtable Record:** `recMZMOlFaqJrVTcL`
- **Convex Function:** `mutations/taxonomy.createTag`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor, Author
- **Args:**
  ```typescript
  {
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
  }
  ```
- **Returns:** `Id<"terms">`
- **Behavior:**
  1. Authenticate via Convex Auth
  2. Check capability: `taxonomy.create_tag`
  3. Validate `name`: trim, 1-200 chars
  4. Generate or validate `slug`, check uniqueness within `post_tag`
  5. Check for duplicate name within tags
  6. Insert with `taxonomy: "post_tag"`, `count: 0`, `isDefault: false`, `parentId: undefined`
  7. Emit event: `taxonomy.tag_created`
  8. Return new term ID
- **Events:** `taxonomy.tag_created`
- **Errors:**
  - `UNAUTHORIZED`, `FORBIDDEN`
  - `VALIDATION_ERROR` -- name empty/too long
  - `CONFLICT` -- duplicate tag name

---

#### `taxonomy.update_tag` - Update Tag

- **Airtable Record:** `recb4rOPEXrZq0ii7`
- **Convex Function:** `mutations/taxonomy.updateTag`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor
- **Args:**
  ```typescript
  {
    termId: v.id("terms"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
  }
  ```
- **Returns:** Updated term object
- **Behavior:**
  1. Authenticate via Convex Auth
  2. Fetch term, verify it is a tag (`taxonomy = "post_tag"`)
  3. Check capability: `taxonomy.update_tag`
  4. Validate changes (name 1-200 chars, slug format, description max 5000 chars, uniqueness checks)
  5. Track changed fields
  6. Update `updatedAt`, patch term
  7. Return updated term
- **Events:** `taxonomy.tag_updated` (via `TAXONOMY_EVENTS.TAG_UPDATED`)
- **Errors:**
  - `UNAUTHORIZED`, `NOT_FOUND`, `FORBIDDEN`
  - `VALIDATION_ERROR` -- not a tag
  - `CONFLICT` -- slug or name taken

---

#### `taxonomy.delete_tag` - Delete Tag

- **Airtable Record:** `rec6DwgOOyOKloZzX`
- **Convex Function:** `mutations/taxonomy.deleteTag`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor
- **Args:**
  ```typescript
  {
    termId: v.id("terms"),
  }
  ```
- **Returns:** `{ removedFromPosts: number }`
- **Behavior:**
  1. Authenticate via Convex Auth
  2. Fetch term, verify it is a tag
  3. Check capability: `taxonomy.delete_tag`
  4. Delete all `termRelationships` where `termId` matches (no reassignment needed -- tags are optional)
  5. Delete the term record
  6. Emit event: `taxonomy.tag_deleted`
  7. Return success with count of removed relationships
- **Events:** `taxonomy.tag_deleted`
- **Errors:**
  - `UNAUTHORIZED`, `NOT_FOUND`, `FORBIDDEN`
  - `VALIDATION_ERROR` -- not a tag

---

#### `taxonomy.assign` - Assign Term to Post

- **Airtable Record:** `recO84J8czRRbpBP8`
- **Convex Function:** `mutations/taxonomy.assign`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor, Author, Contributor
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
    termId: v.id("terms"),
  }
  ```
- **Returns:** Success indicator
- **Behavior:**
  1. Authenticate via Convex Auth
  2. Check capability: `taxonomy.assign`
  3. Verify post exists
  4. Verify user can edit the post (ownership check: own post requires `edit_posts`, others' requires `edit_others_posts`)
  5. Verify term exists
  6. Check for existing relationship via `by_post_term` -- if exists, return idempotently (no error, no duplicate)
  7. Insert `termRelationships` record
  8. Increment term count by 1 ONLY if post status is `"publish"` (use `updateTermCount()` helper)
  9. Emit event: `taxonomy.term_assigned`
  10. Return success
- **Events:** `taxonomy.term_assigned`
- **Errors:**
  - `UNAUTHORIZED`, `FORBIDDEN` (capability or post ownership)
  - `NOT_FOUND` -- post or term does not exist

---

#### `taxonomy.unassign` - Remove Term from Post

- **Airtable Record:** `rec6ergDBNNTGcXkH`
- **Convex Function:** `mutations/taxonomy.unassign`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor, Author
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
    termId: v.id("terms"),
  }
  ```
- **Returns:** Success indicator
- **Behavior:**
  1. Authenticate via Convex Auth
  2. Check capability: `taxonomy.unassign`
  3. Verify post exists
  4. Verify user can edit the post
  5. Find relationship via `by_post_term` -- if none exists, return idempotently
  6. **Default category enforcement:** If removing a category, check if this is the post's last category. If so, assign the default category BEFORE removing.
  7. Delete the `termRelationships` record
  8. Update term count (decrement by 1 if post is published)
  9. Return success
- **Events:** None -- captured by Audit Log directly
- **Errors:**
  - `UNAUTHORIZED`, `FORBIDDEN` (capability or post ownership)
  - `NOT_FOUND` -- post does not exist

---

#### `taxonomy.merge` - Merge Terms

- **Airtable Record:** `rec4TSXc1SZPiuWKC`
- **Convex Function:** `mutations/taxonomy.merge`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** Administrator, Editor
- **Args:**
  ```typescript
  {
    sourceTermId: v.id("terms"),              // Term to merge FROM (will be deleted)
    targetTermId: v.id("terms"),              // Term to merge INTO (will absorb posts)
  }
  ```
- **Returns:** `{ mergedPosts: number, reparentedChildren: number }`
- **Behavior:**
  1. Authenticate via Convex Auth
  2. Check capability: `taxonomy.merge`
  3. Fetch both terms, verify both exist
  4. Verify both are the same taxonomy type (cannot merge category into tag or vice versa)
  5. Verify source is not the default category
  6. Verify source and target are different terms
  7. Reassign all posts from source to target (check for existing target relationships to avoid duplicates)
  8. Reassign child categories if merging categories (re-parent to target)
  9. Recalculate count on target via `updateTermCount()`
  10. Delete the source term record
  11. Return success with counts
- **Events:** None -- captured by Audit Log
- **Errors:**
  - `UNAUTHORIZED`, `FORBIDDEN`
  - `NOT_FOUND` -- source or target not found
  - `VALIDATION_ERROR` -- same term, different taxonomy types
  - `FORBIDDEN` -- cannot merge default category as source

---

### Queries

#### `taxonomy.list` - List Terms

- **Convex Function:** `queries/taxonomy.list`
- **Type:** Query
- **Auth:** All authenticated (admin); Public (website)
- **Args:**
  ```typescript
  {
    taxonomy: v.optional(v.union(v.literal("category"), v.literal("post_tag"))),
    parentId: v.optional(v.id("terms")),
    search: v.optional(v.string()),
    orderBy: v.optional(v.union(
      v.literal("name"),
      v.literal("count"),
      v.literal("slug"),
      v.literal("createdAt"),
    )),
    orderDir: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),           // Default: 20
    hideEmpty: v.optional(v.boolean()),
  }
  ```
- **Returns:**
  ```typescript
  {
    terms: Array<{
      _id: Id<"terms">,
      name: string,
      slug: string,
      taxonomy: "category" | "post_tag",
      parentId?: Id<"terms">,
      description?: string,
      count: number,
      isDefault: boolean,
      createdAt: number,
      updatedAt: number,
      depth: number,              // 0 for root, 1 for child, etc.
      children?: Id<"terms">[],   // Direct child IDs (categories)
    }>,
    total: number,
    page: number,
    perPage: number,
    totalPages: number,
  }
  ```
- **Behavior:** Filter by taxonomy, parent, search (case-insensitive substring on name), hideEmpty. Sort by requested field. Paginate.
- **Pagination:** Offset-based (page + perPage)
- **Filters:** taxonomy, parentId, search, hideEmpty

---

#### `taxonomy.get` - Get Single Term

- **Convex Function:** `queries/taxonomy.get`
- **Type:** Query
- **Auth:** Public
- **Args:**
  ```typescript
  {
    termId: v.optional(v.id("terms")),
    slug: v.optional(v.string()),
    taxonomy: v.optional(v.union(v.literal("category"), v.literal("post_tag"))),
  }
  ```
- **Returns:** Term object with computed `depth` and `children`, or `null`
- **Behavior:** Look up by `termId` OR by `slug` + `taxonomy` (using `by_slug_taxonomy` index). If category, compute depth and fetch direct children.

---

#### `taxonomy.getByPost` - Get Terms for a Post

- **Convex Function:** `queries/taxonomy.getByPost`
- **Type:** Query
- **Auth:** Public
- **Args:**
  ```typescript
  {
    postId: v.id("posts"),
    taxonomy: v.optional(v.union(v.literal("category"), v.literal("post_tag"))),
  }
  ```
- **Returns:** `{ categories: Term[], tags: Term[] }` (or filtered subset)
- **Behavior:** Query `termRelationships` by `by_post` index, fetch corresponding terms, filter by taxonomy if provided.

---

#### `taxonomy.getPostsByTerm` - Get Posts for a Term (Archive)

- **Convex Function:** `queries/taxonomy.getPostsByTerm`
- **Type:** Query
- **Auth:** Public
- **Args:**
  ```typescript
  {
    termId: v.id("terms"),
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
  }
  ```
- **Returns:** `{ term: Term, posts: Post[], total: number, page: number, perPage: number, totalPages: number }`
- **Behavior:** Fetch the term, query `termRelationships` by `by_term`, fetch linked posts (only `status = "publish"`), sort by `publishedAt` descending, paginate.

---

#### `taxonomy.counts` - Term Counts

- **Convex Function:** `queries/taxonomy.counts`
- **Type:** Query
- **Auth:** All authenticated
- **Args:** `{}`
- **Returns:** `{ categories: number, tags: number }`
- **Behavior:** Count all terms of each taxonomy type. Used by Dashboard "At a Glance" widget.

---

#### `taxonomy.getCategoryTree` - Full Category Hierarchy

- **Convex Function:** `queries/taxonomy.getCategoryTree`
- **Type:** Query
- **Auth:** All authenticated (admin); Public (website)
- **Args:** `{}`
- **Returns:**
  ```typescript
  type CategoryTreeNode = {
    _id: Id<"terms">,
    name: string,
    slug: string,
    count: number,
    isDefault: boolean,
    depth: number,
    children: CategoryTreeNode[],
  }
  // Returns: CategoryTreeNode[] (root-level nodes)
  ```
- **Behavior:** Fetch all categories, build nested tree using `parentId`, sort siblings alphabetically. Used by category checklist metabox, parent dropdown, menu system, post list category filter.

---

### Helper Functions

All helpers live in `ConvexPress-Admin/packages/backend/convex/helpers/taxonomy.ts`.

#### `generateTermSlug(ctx, name, taxonomy, existingTermId?)`

Generates a URL-safe slug from a name, ensuring uniqueness within the taxonomy type. Appends `-2`, `-3`, etc. on conflict.

```typescript
export async function generateTermSlug(
  ctx: MutationCtx,
  name: string,
  taxonomy: "category" | "post_tag",
  existingTermId?: Id<"terms">,
): Promise<string>
```

#### `updateTermCount(ctx, termId)`

Recalculates the published post count for a term by counting all `termRelationships` where the linked post has `status = "publish"`.

```typescript
export async function updateTermCount(
  ctx: MutationCtx,
  termId: Id<"terms">,
): Promise<void>
```

**When to call:**
- After `taxonomy.assign` (if post is published)
- After `taxonomy.unassign` (if post is published)
- After `taxonomy.delete_category` (on default category if posts reassigned)
- After `taxonomy.merge` (on target term)
- After `post.publish` (on all terms assigned to the post)
- After `post.unpublish` (on all terms)
- After `post.trash` (on all terms)
- After `post.restore` (on all terms, if restored to published)
- After `post.delete` (on all terms that were assigned)

#### `ensureDefaultCategory(ctx)`

Finds or creates the default "Uncategorized" category. Returns its ID.

```typescript
export async function ensureDefaultCategory(
  ctx: MutationCtx,
): Promise<Id<"terms">>
```

#### `validateCategoryHierarchy(ctx, termId, proposedParentId, maxDepth?)`

Validates that setting a parent for a category does not create circular references and does not exceed max depth.

```typescript
export async function validateCategoryHierarchy(
  ctx: QueryCtx,
  termId: Id<"terms">,
  proposedParentId: Id<"terms">,
  maxDepth?: number,  // default: 5
): Promise<{ valid: boolean; error?: string }>
```

---

## Events

### `taxonomy.category_created`

- **Airtable Record:** `recq2FwWalnQo7pB3`
- **Type:** Content
- **Triggered By:** `taxonomy.create_category` action
- **Payload:**
  ```typescript
  {
    termId: Id<"terms">,
    name: string,
    parentId?: Id<"terms">,
  }
  ```
- **Subscribers:**
  - Audit Log: Yes -- records category creation
  - Dashboard System: Updates "At a Glance" category count
  - Email: None
  - Site: None

---

### `taxonomy.category_updated`

- **Airtable Record:** `recb7JkLsTeMp0Gla`
- **Type:** Content
- **Triggered By:** `taxonomy.update_category` action
- **Payload:**
  ```typescript
  {
    termId: Id<"terms">,
    name: string,
    changes: Array<{
      field: string,
      oldValue: any,
      newValue: any,
    }>,
  }
  ```
- **Subscribers:**
  - Audit Log: Yes -- records what changed
  - Sitemap System: Regenerates sitemap if slug changed
  - Menu System: Updates menu items referencing this category (if name or slug changed)
  - Email: None
  - Site: None

---

### `taxonomy.category_deleted`

- **Airtable Record:** `recOQZhtxZbK7xUHG`
- **Type:** Content
- **Triggered By:** `taxonomy.delete_category` action
- **Payload:**
  ```typescript
  {
    termId: Id<"terms">,
    name: string,
  }
  ```
- **Subscribers:**
  - Audit Log: Yes -- records deletion
  - Dashboard System: Updates "At a Glance" category count
  - Sitemap System: Removes category archive URL
  - Menu System: Removes/disables menu items referencing this category
  - Email: None
  - Site: None

---

### `taxonomy.tag_created`

- **Airtable Record:** `recCRbFFKM17OZn6f`
- **Type:** Content
- **Triggered By:** `taxonomy.create_tag` action
- **Payload:**
  ```typescript
  {
    termId: Id<"terms">,
    name: string,
  }
  ```
- **Subscribers:**
  - Audit Log: Yes
  - Dashboard System: Updates "At a Glance" tag count
  - Email: None
  - Site: None

---

### `taxonomy.tag_deleted`

- **Airtable Record:** `recG29xZY5bqj17qw`
- **Type:** Content
- **Triggered By:** `taxonomy.delete_tag` action
- **Payload:**
  ```typescript
  {
    termId: Id<"terms">,
    name: string,
  }
  ```
- **Subscribers:**
  - Audit Log: Yes
  - Dashboard System: Updates "At a Glance" tag count
  - Sitemap System: Removes tag archive URL
  - Email: None
  - Site: None

---

### `taxonomy.term_assigned`

- **Airtable Record:** `recCs2JEFRQL1J4fQ`
- **Type:** Content
- **Triggered By:** `taxonomy.assign` action
- **Payload:**
  ```typescript
  {
    postId: Id<"posts">,
    termId: Id<"terms">,
    taxonomyType: "category" | "post_tag",
  }
  ```
- **Subscribers:**
  - Audit Log: Yes
  - Dashboard System: Updates activity feed
  - Email: None
  - Site: None

---

## Admin Routes & UI

### Post Categories (`/admin/posts/categories`)

- **Airtable Record:** `rec35MheyWyoDbdbo`
- **Purpose:** WordPress-style split-panel page for managing categories
- **WordPress Equivalent:** `edit-tags.php?taxonomy=category`
- **Layout:** `_admin` (sidebar + topbar). Split panel: left = add form, right = list table.
- **Auth:** Required
- **Roles:** Administrator, Editor

**Key Components:**

1. **Page Header** -- Title "Categories", no separate "Add New" button (form is inline)
2. **Add New Category Form (left panel)**
   - Name input (required, 1-200 chars), helper text
   - Slug input (optional, auto-generated), helper text
   - Parent Category dropdown (populated from `getCategoryTree`, indented with `-- ` prefixes, first option "None")
   - Description textarea (optional, max 5000 chars)
   - [Add New Category] button
   - On success: clear form, toast "Category created", list updates via Convex
   - On error: inline validation errors
3. **Category List Table (right panel)**
   - Search box above table, debounced 300ms
   - Columns: Checkbox, Name (hierarchy-indented), Description (truncated 100 chars), Slug, Count (links to filtered posts)
   - Row actions (on hover): Edit, Quick Edit, Delete, View
   - Default category shows "(default)" suffix, delete disabled
   - Inline Edit: replaces row with name/slug inputs + Update/Cancel buttons
   - Sorting by Name, Description, Slug, Count
   - Pagination: 20 per page default
4. **Bulk Actions Bar** -- Delete action, [Apply] button

**Data Requirements:**
- `taxonomy.list` with `taxonomy: "category"`
- `taxonomy.getCategoryTree` for parent dropdown
- `taxonomy.counts` for header count

**Real-Time:** List updates live when any admin creates/edits/deletes a category.

---

### Post Tags (`/admin/posts/tags`)

- **Airtable Record:** `recbKmfPiJSYzgQYp`
- **Purpose:** WordPress-style split-panel page for managing tags
- **WordPress Equivalent:** `edit-tags.php?taxonomy=post_tag`
- **Layout:** Same as Categories but no Parent dropdown, no hierarchy indentation
- **Auth:** Required
- **Roles:** Administrator, Editor

**Key Components:**

1. **Add New Tag Form (left panel)** -- Name, Slug, Description. No parent dropdown.
2. **Tag List Table (right panel)** -- Flat list (no indentation). Columns: Checkbox, Name, Description, Slug, Count.
3. **Popular Tags Section** -- "Most Used" tag cloud showing top 20 tags by count. Tag size proportional to count. Clicking scrolls/highlights in list.
4. **Bulk Actions Bar** -- Delete action

**Data Requirements:**
- `taxonomy.list` with `taxonomy: "post_tag"`
- `taxonomy.counts` for header count

---

### Categories Metabox (on Post Editor)

- **Location:** Right sidebar on Add New Post / Edit Post, below Publish metabox
- **Owned by:** Taxonomy System (rendered on Post System's editor page)

**Components:**
1. **Tab Bar:** "All Categories" (full tree) / "Most Used" (top 10 flat list)
2. **Checkbox Tree:** Hierarchical, indented, pre-checked for current assignments, default category pre-checked for new posts
3. **Inline Add New Category:** Toggle via "+ Add New Category" link. Name input + Parent dropdown + Add button. Auto-checks the new category.

**Data Flow:** `taxonomy.getByPost` + `taxonomy.getCategoryTree` on load. Assign/unassign batched on post save.

---

### Tags Metabox (on Post Editor)

- **Location:** Right sidebar, below Categories metabox

**Components:**
1. **Tag Input:** Comma-separated with autocomplete dropdown (matching existing tags). Enter or comma to add. If tag does not exist, create on-the-fly via `taxonomy.createTag`.
2. **Tag Chips:** Assigned tags shown as removable chips. Click [x] to unassign.
3. **Most Used Tags:** "Choose from the most used tags" link. Expands to show top 20 as clickable links.

**Data Flow:** `taxonomy.getByPost` + `taxonomy.list` (ordered by count) on load. Assign/unassign batched on post save.

---

## Website Routes

### Category Archive (`/category/$slug`)

- **Airtable Record:** `recsqq6vjPnMKtUCp`
- **Purpose:** Paginated list of published posts in a specific category
- **App:** Website (TanStack Start, SSR)
- **Layout:** `_marketing`
- **Auth:** No (public)
- **SEO:**
  - Title: `[Category Name] | [Site Name]`
  - Description: Category description or "Browse all posts in [Category Name]"
  - Canonical: `/category/[slug]` (paginated: `?page=2`)
  - `og:type`: `website`
  - JSON-LD: `CollectionPage` schema
- **Data Requirements:**
  - `taxonomy.get` by slug + `"category"`
  - `taxonomy.getPostsByTerm` for paginated posts
  - `taxonomy.getCategoryTree` for breadcrumbs (optional)
- **Components:**
  1. Breadcrumbs (Home > Parent Category > Category Name)
  2. Archive Header (H1, description, post count)
  3. Post Grid (2-3 columns, same card format as Blog Index)
  4. Subcategory List (if category has children)
  5. Pagination (previous/next + page numbers)
- **404:** If slug does not exist, render 404 page

---

### Tag Archive (`/tag/$slug`)

- **Airtable Record:** `rec0xFGyI4s9zsBhz`
- **Purpose:** Paginated list of published posts with a specific tag
- **App:** Website (TanStack Start, SSR)
- **Layout:** `_marketing`
- **Auth:** No (public)
- **SEO:**
  - Title: `[Tag Name] | [Site Name]`
  - Description: Tag description or "Browse all posts tagged with [Tag Name]"
  - Canonical: `/tag/[slug]`
  - `og:type`: `website`
- **Data Requirements:**
  - `taxonomy.get` by slug + `"post_tag"`
  - `taxonomy.getPostsByTerm` for paginated posts
- **Components:**
  1. Breadcrumbs (Home > Tag: [Name])
  2. Archive Header (H1, description, post count)
  3. Post Grid (same format)
  4. Related Tags section (optional -- frequently co-occurring tags)
  5. Pagination
- **404:** If slug does not exist, render 404 page

---

## Notifications

### Email Notifications

The Taxonomy System does **not** generate email notifications. All taxonomy operations are administrative and tracked through the Audit Log System only.

### Site Notifications

The Taxonomy System does **not** generate site notifications. Taxonomy events are consumed only by Audit Log, Dashboard, Sitemap, and Menu systems.

### Audit Log Entries

| Event | Audit Log Entry Format |
|-------|----------------------|
| `taxonomy.category_created` | "Category [Name] created by [User]" |
| `taxonomy.category_updated` | "Category [Name] updated by [User]: [changes]" |
| `taxonomy.category_deleted` | "Category [Name] deleted by [User]" |
| `taxonomy.tag_created` | "Tag [Name] created by [User]" |
| `taxonomy.tag_deleted` | "Tag [Name] deleted by [User]" |
| `taxonomy.term_assigned` | "Term [Name] assigned to post [Title] by [User]" |
| Term merge | "Terms merged: [Source] into [Target] by [User] ([N] posts reassigned)" |

---

## Role & Capability Matrix

| Action | Admin | Editor | Author | Contributor | Subscriber |
|--------|-------|--------|--------|-------------|-----------|
| `taxonomy.create_category` | Yes | Yes | No | No | No |
| `taxonomy.update_category` | Yes | Yes | No | No | No |
| `taxonomy.delete_category` | Yes | Yes | No | No | No |
| `taxonomy.create_tag` | Yes | Yes | Yes | No | No |
| `taxonomy.update_tag` | Yes | Yes | No | No | No |
| `taxonomy.delete_tag` | Yes | Yes | No | No | No |
| `taxonomy.assign` | Yes | Yes | Yes | Yes | No |
| `taxonomy.unassign` | Yes | Yes | Yes | No | No |
| `taxonomy.merge` | Yes | Yes | No | No | No |
| Access Categories page | Yes | Yes | No | No | No |
| Access Tags page | Yes | Yes | No | No | No |

**Note:** Authors can create tags (WordPress behavior: authors can manage tags for their own posts) and assign terms. Contributors can assign terms to their own draft posts but cannot unassign or create/delete terms.

---

## Dependencies

### Depends On

| System | Type | What It Provides |
|--------|------|-----------------|
| **Post System** | Hard | `posts` table, post status field, post ownership checks, post CRUD triggers term count updates |
| **Auth System** | Hard | Convex Auth authentication -- `ctx.auth.getUserIdentity()` for all mutations |
| **Role & Capability System** | Hard | `currentUserCan(ctx, actionCode)` permission checks in every mutation |
| **Event Dispatcher System** | Hard | `emitEvent()` function for emitting taxonomy events |
| **Settings System** | Soft | `default_category` setting (ID of default category), `posts_per_page` for archive pagination |

### Depended On By

| System | Type | What It Uses |
|--------|------|-------------|
| **Post System** | Hard | Category/tag assignment, metaboxes on post editor, post list filtering by category, term count updates on post status changes, term relationships deleted on post delete |
| **Menu System** | Soft | Categories as menu items via `getCategoryTree`; responds to `category_updated`/`category_deleted` events |
| **SEO System** | Soft | Archive page meta tags, breadcrumbs with category hierarchy |
| **Sitemap System** | Soft | Category/tag archive URLs in XML sitemap; responds to create/delete/slug-change events |
| **RSS Feed System** | Soft | Per-taxonomy feeds (`/feed/category/$slug`) -- deferred to v2 |
| **Search System** | Soft | Taxonomy-based filtering in search results |
| **Dashboard System** | Soft | Category/tag counts for "At a Glance" widget, activity feed |
| **Audit Log System** | Soft | Logging all taxonomy operations |

---

## Implementation Checklist

### Backend (`ConvexPress-Admin/packages/backend/`)

- [ ] `convex/taxonomy/schema.ts` -- 2 tables (`terms`, `termRelationships`)
- [ ] `convex/taxonomy/queries.ts` -- 6 queries (`list`, `get`, `getByPost`, `getPostsByTerm`, `counts`, `getCategoryTree`)
- [ ] `convex/taxonomy/mutations.ts` -- 9 mutations (`createCategory`, `updateCategory`, `deleteCategory`, `createTag`, `updateTag`, `deleteTag`, `assign`, `unassign`, `merge`)
- [ ] `convex/helpers/taxonomy.ts` -- 4 helpers (`generateTermSlug`, `updateTermCount`, `ensureDefaultCategory`, `validateCategoryHierarchy`)
- [ ] Seed function for default "Uncategorized" category (lives in `convex/taxonomies/internals.ts` as `seedDefaultCategory`)

### Admin Frontend (`ConvexPress-Admin/apps/web/`)

- [ ] `src/routes/_admin/posts/categories.tsx` -- Categories management page (split-panel)
- [ ] `src/routes/_admin/posts/tags.tsx` -- Tags management page (split-panel)
- [ ] `src/components/taxonomy/AddCategoryForm.tsx` -- Left-panel add form
- [ ] `src/components/taxonomy/AddTagForm.tsx` -- Left-panel add form
- [ ] `src/components/taxonomy/TermListTable.tsx` -- Right-panel list table (shared between categories/tags)
- [ ] `src/components/taxonomy/TermInlineEdit.tsx` -- Inline edit row component
- [ ] `src/components/taxonomy/CategoryTree.tsx` -- Hierarchical checkbox tree (for metabox)
- [ ] `src/components/taxonomy/TagInput.tsx` -- Tag input with autocomplete + chips (for metabox)
- [ ] `src/components/taxonomy/CategoriesMetabox.tsx` -- Post editor categories metabox
- [ ] `src/components/taxonomy/TagsMetabox.tsx` -- Post editor tags metabox
- [ ] `src/components/taxonomy/PopularTags.tsx` -- Tag cloud component
- [ ] `src/components/taxonomy/ParentCategorySelect.tsx` -- Indented parent dropdown

### Website Frontend (`ConvexPress-Website/apps/web/`)

- [ ] `src/routes/category/$slug.tsx` -- Category archive page (SSR)
- [ ] `src/routes/tag/$slug.tsx` -- Tag archive page (SSR)
- [ ] `src/components/taxonomy/ArchiveHeader.tsx` -- Archive page header (title, description, count)
- [ ] `src/components/taxonomy/Breadcrumbs.tsx` -- Hierarchical breadcrumbs
- [ ] `src/components/taxonomy/SubcategoryList.tsx` -- Child category listing
- [ ] `src/components/taxonomy/CategoryBadge.tsx` -- Category badge for post cards
- [ ] `src/components/taxonomy/TagChip.tsx` -- Tag link chip for post cards

---

## Edge Cases & Gotchas

1. **Default category cannot be deleted.** The "Uncategorized" category with `isDefault: true` must always exist. Attempting to delete it must return a `FORBIDDEN` error.

2. **Posts must always have at least one category.** When unassigning a category, check if it is the post's last category. If so, assign the default category before removing. When deleting a category, reassign affected posts to the default category.

3. **Circular parent references.** When updating a category's parent, validate that the proposed parent is not a descendant of the category being edited. Walk the parent chain upward from the proposed parent and verify the current term is not encountered.

4. **Max hierarchy depth of 5 levels.** When creating or re-parenting a category, calculate the depth by walking the parent chain. Also consider the subtree depth of the term being moved -- the deepest descendant plus the new depth must not exceed 5.

5. **Slug uniqueness is per taxonomy.** A category and a tag CAN share the same slug (e.g., both can have slug `"react"`). Uniqueness is only enforced within `"category"` or within `"post_tag"`.

6. **Term count only counts published posts.** Draft, pending, trashed, and private posts do NOT contribute to the term count. When a post changes status (publish/unpublish/trash/restore/delete), ALL terms assigned to that post must have their counts recalculated.

7. **Idempotent assign/unassign.** Assigning a term that is already assigned must succeed silently (no duplicate record, no error). Unassigning a term that is not assigned must succeed silently. Check via `by_post_term` index.

8. **Sibling name uniqueness.** WordPress prevents two categories with the same name under the same parent. Tags must have globally unique names within the `post_tag` taxonomy.

9. **Slug auto-generation on name change.** If a category was created with an auto-generated slug (not manually set), renaming the category should regenerate the slug. If the slug was manually set, renaming should NOT change the slug. The PRD specifies this behavior but implementation needs a way to track whether the slug was manually set (e.g., a `slugManuallySet` flag or comparing against the generated slug).

10. **Category deletion cascades.** When deleting a category: (a) re-parent children to the deleted category's parent, (b) delete all termRelationships, (c) for posts now lacking categories, assign default category, (d) update default category count.

11. **Tag deletion is simpler.** When deleting a tag: just delete all termRelationships and the term. No reassignment needed since tags are optional.

12. **Term merge deduplication.** When merging term A into term B, some posts may already have both terms assigned. For those posts, just delete the relationship to term A without creating a duplicate for term B.

13. **Real-time list updates.** The admin list tables use Convex subscriptions. When another admin creates/edits/deletes a term, the list should update immediately without manual refresh. This is automatic with `useQuery`.

14. **Post editor batching.** Category/tag changes in the post editor should be batched and applied on post save, not on each individual check/uncheck. This avoids unnecessary mutations and keeps the post save atomic.

15. **Tag autocomplete performance.** With 10,000+ tags, autocomplete must debounce at 200ms and return results within 100ms. Consider using the `by_taxonomy_name` index with a prefix search pattern.

16. **Unicode in slugs.** Slug generation must handle Unicode characters gracefully -- transliterate to ASCII or strip non-alphanumeric characters. The `generateTermSlug` helper handles this.

17. **Empty term name.** A term name that is all whitespace should be rejected after trimming. A term name of `"   "` is invalid.

18. **Category tree performance.** Building the full category tree should be efficient for up to 500 categories. Fetch all categories in one query and build the tree in memory, not via recursive queries.

---

## WordPress Functions Reference

| WordPress Function | ConvexPress Equivalent | Notes |
|---|---|---|
| `wp_insert_term($name, $taxonomy, $args)` | `taxonomy.createCategory` / `taxonomy.createTag` mutation | Separated by taxonomy type |
| `wp_update_term($term_id, $taxonomy, $args)` | `taxonomy.updateCategory` / `taxonomy.updateTag` mutation | Separated by taxonomy type |
| `wp_delete_term($term_id, $taxonomy)` | `taxonomy.deleteCategory` / `taxonomy.deleteTag` mutation | Handles reassignment automatically |
| `wp_set_post_terms($post_id, $terms, $taxonomy)` | `taxonomy.assign` mutation (called per term) | Assign one term at a time |
| `wp_remove_object_terms($post_id, $terms, $taxonomy)` | `taxonomy.unassign` mutation | Remove one term at a time |
| `wp_get_post_terms($post_id, $taxonomy)` | `taxonomy.getByPost` query | Returns categories and/or tags |
| `get_terms($args)` | `taxonomy.list` query | Supports filtering, sorting, pagination |
| `get_categories($args)` | `taxonomy.list` with `taxonomy: "category"` | Wrapper query |
| `get_tags($args)` | `taxonomy.list` with `taxonomy: "post_tag"` | Wrapper query |
| `term_exists($term, $taxonomy)` | Checked within create mutations | No standalone function needed |
| `wp_count_terms($taxonomy)` | `taxonomy.counts` query | Returns both category and tag counts |
| `wp_update_term_count($term_ids)` | `updateTermCount()` helper | Internal, called automatically |
| `get_term($term_id, $taxonomy)` | `taxonomy.get` query | Lookup by ID or slug |
| `get_term_by($field, $value, $taxonomy)` | `taxonomy.get` query with slug | Supports slug lookup |
| `get_term_children($term_id, $taxonomy)` | `taxonomy.getCategoryTree` or `by_parent` index | Part of tree building |
| `wp_get_term_taxonomy_parent_id($term_id)` | Direct field access: `term.parentId` | Stored directly on term |
| `is_category()` / `is_tag()` | Check `term.taxonomy` field | Simple field comparison |

---

## Seed Data

On first deployment, the system must seed the default "Uncategorized" category:

```typescript
// Actual location: convex/taxonomies/internals.ts (seedDefaultCategory)
// The seed function is an internalMutation that calls ensureDefaultCategory().
export async function seedTaxonomy(ctx: MutationCtx) {
  const existing = await ctx.db
    .query("terms")
    .withIndex("by_isDefault", (q) => q.eq("isDefault", true))
    .first();

  if (existing) return;

  await ctx.db.insert("terms", {
    name: "Uncategorized",
    slug: "uncategorized",
    taxonomy: "category",
    description: "Default category",
    count: 0,
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
```

---

## Settings Integration

| Setting Key | Purpose | Default |
|---|---|---|
| `default_category` | ID of the default category for posts | ID of "Uncategorized" |
| `posts_per_page` | Posts per page on archive pages | 10 |

---

## Out of Scope (v1)

- Custom taxonomies (`register_taxonomy()` equivalent)
- Term meta (`wp_termmeta` equivalent)
- Tag cloud widget (widgets later)
- Per-taxonomy RSS feeds
- Taxonomy REST API
- Term images (featured images for categories/tags)
- Term ordering (custom ordering beyond alphabetical)
- Post formats (`post_format` taxonomy)

---

## Open Questions

1. Should tag creation from the post editor be immediate (create on-the-fly) or batched with post save?
2. Should category/tag archive pages show a sidebar with related taxonomies?
3. Maximum number of tags per post -- should there be a limit?
4. Should term merging support merging across taxonomies (convert a tag to a category)?


