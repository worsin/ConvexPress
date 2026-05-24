# Page System - Expert Knowledge Document

**System:** Page System
**Status:** Implementation Ready
**Priority:** P0 - Critical
**WordPress Equivalent:** Pages (post_type = 'page') - wp_insert_post(), get_pages(), get_page_by_path(), Page Attributes metabox
**Last Analyzed:** 2026-02-08

---

## MANDATORY: Agent Self-Calibration (2026-02-17)

This agent's pretrained assumptions can be stale. I must self-audit against the Airtable stack-update source before I classify framework behavior as a bug.

### Self-Audit Inputs

- Agent: $(@{Name=Page System Expert; Path=.codex/docs/PAGE-SYSTEM.md}.Name)
- Source file: $(@{Name=Page System Expert; Path=.codex/docs/PAGE-SYSTEM.md}.Path)
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

The Page System manages static, hierarchical pages in ConvexPress. Pages are the second core content type alongside posts, providing persistent, non-chronological content such as "About Us", "Contact", "Privacy Policy", and "Services" pages. In WordPress, pages use the same `wp_posts` table with `post_type = 'page'`. ConvexPress follows this same pattern: pages are stored in the shared `posts` table with `type: "page"`, inheriting content infrastructure (editor, revisions, status workflow, featured images) while adding page-specific features: hierarchical parent-child relationships, manual ordering, page template assignment, and front page designation.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Page vs Post** | Pages are non-chronological, hierarchical, no categories/tags, no feeds. Posts are the opposite. |
| **Shared `posts` Table** | Pages use `type: "page"` in the same `posts` table as blog posts (mirrors WordPress `wp_posts`). |
| **Hierarchy** | Pages support parent-child relationships via `parentId`. Max depth: 5 levels. |
| **Menu Order** | Manual sort order via `menuOrder` field (integer). WordPress equivalent: `menu_order`. |
| **Page Templates** | Templates are defined in code, not the database. The `pageTemplate` field stores a string key (e.g., `"full-width"`). |
| **Front Page** | A page can be designated as the site's static front page via Reading Settings (`showOnFront`, `pageOnFront`). |
| **Path** | The `path` field stores the full URL path (e.g., `/services/web-design`), computed from parent chain. |
| **Depth** | Computed integer tracking nesting level (0 = top-level, 1 = child, etc.). |
| **Status Workflow** | Draft -> Pending -> Published / Private / Scheduled -> Trash. Same as posts. |
| **Capabilities** | 8 page-specific capabilities: `edit_pages`, `edit_others_pages`, `edit_published_pages`, `publish_pages`, `delete_pages`, `delete_others_pages`, `delete_published_pages`, `read_private_pages`. |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **Database** | MySQL `wp_posts` table with `post_type = 'page'` | Convex `posts` table with `type: "page"` |
| **Hierarchy Storage** | `post_parent` column (integer ID) | `parentId` field (`v.id("posts")`) |
| **Path Resolution** | `get_page_by_path()` walks slugs at query time | Pre-computed `path` field with `by_path` index |
| **Template Storage** | `_wp_page_template` in `wp_postmeta` | `pageTemplate` field directly on the post record |
| **Template Definition** | PHP files in theme with `Template Name:` header | TypeScript config array in `src/config/page-templates.ts` |
| **Front Page Config** | `show_on_front`, `page_on_front` options | `reading` key in `settings` table |
| **Reactivity** | None (page refresh needed) | Real-time via Convex subscriptions |
| **Auth** | WordPress cookies + nonces | Convex Auth tokens |
| **Depth Limit** | Unlimited | 5 levels maximum |
| **Slug Uniqueness** | Global across all post types | Per-type (pages and posts can share a slug) |
| **API** | REST API `/wp/v2/pages` | Convex queries/mutations (REST API planned for API System) |

---

## Architecture Overview

### Data Flow

```
User Action (Admin UI)
  -> TanStack Router route handler
  -> Convex mutation (e.g., createPage)
    -> Auth check (auth identity)
    -> Capability check (requireCapability)
    -> Validation (slug uniqueness, parent validation, depth limit)
    -> Database write (ctx.db.insert / ctx.db.patch)
    -> Computed field updates (path, depth)
    -> Event emission (emitEvent)
  -> Real-time subscription updates all connected clients
  -> Event consumers process (Audit Log, Sitemap, SEO, Menu, Search)
```

### Real-Time Behavior

Convex provides automatic real-time updates for all page queries:

| Subscription | What Updates Live |
|-------------|-------------------|
| `listPages` | Admin list table updates when any page is created, updated, trashed, or restored |
| `getPage` | Edit screen updates if another user edits the same page simultaneously |
| `getPageTree` | Parent dropdown updates when pages are added/removed/reparented |
| `getPageByPath` | Website page rendering updates when content is edited (if using Convex client-side) |
| `getFrontPage` | Home page updates when front page content changes or designation changes |

Key real-time considerations:
- The admin "All Pages" list is fully reactive: status changes, new pages, and deletions appear instantly for all admin users
- The page editor should handle concurrent editing gracefully (last write wins, but show "modified by X" warnings)
- Website SSR pages are rendered at request time from Convex; for client-side navigation, they benefit from real-time updates

### Authentication & Authorization

**Auth Provider:** Convex Auth

**Auth Flow for Page Operations:**
1. All admin page routes require Convex Auth authentication
2. Every mutation extracts `identity` via `ctx.auth.getUserIdentity()`
3. Capability checks use `requireCapability(ctx, identity, capabilityName)`
4. Ownership checks compare `page.authorId` with `identity.subject`

**Capability Check Matrix (per mutation):**

| Mutation | Always Checks | Conditional Checks |
|----------|--------------|-------------------|
| `createPage` | `edit_pages` | `publish_pages` (if status = "publish") |
| `updatePage` | `edit_pages` OR `edit_others_pages` | `edit_published_pages` (if published), `publish_pages` (if changing to publish) |
| `deletePage` | `delete_pages` OR `delete_others_pages` | `delete_published_pages` (if published) |
| `publishPage` | `publish_pages` | - |
| `reorderPages` | `edit_others_pages` | - |
| `setPageParent` | `edit_others_pages` | - |

**Website Page Access:**
- Public pages: No auth required
- Private pages: Requires auth + `read_private_pages` capability
- Password-protected pages: No auth required, but content gated by password form

---

## Database Schema

### Posts Table (Shared with Post System)

Pages use the shared `posts` table with `type: "page"`. Every query and mutation MUST filter by `type` to avoid mixing posts and pages.

```typescript
// convex/schema.ts - posts table definition
// NOTE: This table is shared with the Post System.
// Page-specific fields: parentId, menuOrder, pageTemplate, path, depth

posts: defineTable({
  // === Identity ===
  type: v.union(v.literal("post"), v.literal("page")),
  title: v.string(),
  slug: v.string(),
  content: v.optional(v.string()),          // Editor JSON/HTML content
  excerpt: v.optional(v.string()),           // Manual excerpt (pages rarely use)

  // === Status & Visibility ===
  status: v.union(
    v.literal("draft"),
    v.literal("pending"),
    v.literal("publish"),
    v.literal("private"),
    v.literal("trash"),
    v.literal("future")
  ),
  visibility: v.union(
    v.literal("public"),
    v.literal("private"),
    v.literal("password")
  ),
  password: v.optional(v.string()),          // For password-protected pages

  // === Authorship ===
  authorId: v.string(),                      // user identifier

  // === Page-Specific Fields ===
  parentId: v.optional(v.id("posts")),       // Parent page reference (null = top-level)
  menuOrder: v.optional(v.number()),         // Manual sort order (default 0)
  pageTemplate: v.optional(v.string()),      // Template identifier (e.g., "full-width", "sidebar-left")

  // === Media ===
  featuredImageId: v.optional(v.id("media")), // Featured image reference

  // === SEO (managed by SEO System) ===
  seoTitle: v.optional(v.string()),
  seoDescription: v.optional(v.string()),
  seoCanonicalUrl: v.optional(v.string()),

  // === Timestamps ===
  publishedAt: v.optional(v.number()),       // Publish timestamp (null if draft)
  scheduledAt: v.optional(v.number()),       // Scheduled publish time
  createdAt: v.number(),
  updatedAt: v.number(),
  trashedAt: v.optional(v.number()),         // When moved to trash

  // === Computed/Cache ===
  path: v.optional(v.string()),              // Full URL path (e.g., "/services/web-design")
  depth: v.optional(v.number()),             // Hierarchy depth (0 = top-level, 1 = child, etc.)
  // NOTE: childCount is NOT stored. Child counts are derived at query time
  // using the by_type_parent index.
})
  // === Indexes ===
  .index("by_type", ["type"])
  .index("by_type_status", ["type", "status"])
  .index("by_slug", ["slug"])
  .index("by_type_slug", ["type", "slug"])
  .index("by_author", ["authorId"])
  .index("by_type_author", ["type", "authorId"])
  .index("by_parent", ["parentId"])
  .index("by_type_parent", ["type", "parentId"])
  .index("by_type_menu_order", ["type", "menuOrder"])
  .index("by_type_status_published", ["type", "status", "publishedAt"])
  .index("by_path", ["path"])
  .index("by_type_template", ["type", "pageTemplate"]),
```

### Indexes

| Index | Fields | Purpose |
|-------|--------|---------|
| `by_type` | `["type"]` | Filter all pages vs all posts |
| `by_type_status` | `["type", "status"]` | Admin list: pages by status (All Pages tab filter) |
| `by_slug` | `["slug"]` | General slug lookup |
| `by_type_slug` | `["type", "slug"]` | Slug uniqueness check per type |
| `by_author` | `["authorId"]` | General author lookup |
| `by_type_author` | `["type", "authorId"]` | Pages by a specific author |
| `by_parent` | `["parentId"]` | Find children of a page |
| `by_type_parent` | `["type", "parentId"]` | Find page children specifically |
| `by_type_menu_order` | `["type", "menuOrder"]` | Ordered page list |
| `by_type_status_published` | `["type", "status", "publishedAt"]` | Published pages ordered by date |
| `by_path` | `["path"]` | Website URL resolution (exact path match) |
| `by_type_template` | `["type", "pageTemplate"]` | Find pages using a specific template |

### Relationships

| Field | References | Notes |
|-------|-----------|-------|
| `parentId` | `posts._id` | Self-referencing. Must be a page (not a post). |
| `authorId` | user identifier | External reference to the auth system user pool. |
| `featuredImageId` | `media._id` | References the Media System's media table. |
| Reading settings `pageOnFront` | `posts._id` | Stored in the Settings System's `settings` table under key `"reading"`. |
| Reading settings `pageForPosts` | `posts._id` | Stored in the Settings System's `settings` table under key `"reading"`. |

### Page Templates Registry (Code-Defined)

```typescript
// src/config/page-templates.ts
// Templates are NOT stored in the database. They are React components registered here.

export interface PageTemplate {
  id: string;
  name: string;
  description: string;
  screenshot?: string;
  supports?: {
    featuredImage?: boolean;
    excerpt?: boolean;
    customFields?: boolean;
    comments?: boolean;
  };
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "default",
    name: "Default Template",
    description: "Standard page layout with sidebar",
    supports: { featuredImage: true, excerpt: true, customFields: true },
  },
  {
    id: "full-width",
    name: "Full Width",
    description: "Full-width layout without sidebar",
    supports: { featuredImage: true, excerpt: true, customFields: true },
  },
  {
    id: "sidebar-left",
    name: "Sidebar Left",
    description: "Content with left sidebar",
    supports: { featuredImage: true, excerpt: true, customFields: true },
  },
  {
    id: "landing",
    name: "Landing Page",
    description: "Clean layout for landing pages, no header/footer nav",
    supports: { featuredImage: true, customFields: true },
  },
  {
    id: "blank",
    name: "Blank Canvas",
    description: "Completely blank - only renders the content",
    supports: { customFields: true },
  },
];
```

### Reading Settings (Stored in Settings System)

```typescript
// Stored in the `settings` table under key: "reading"
// Managed by the Settings System, consumed by the Page System
{
  showOnFront: "posts" | "page",           // "posts" = blog index, "page" = static page
  pageOnFront: v.optional(v.id("posts")),  // Page ID for static front page
  pageForPosts: v.optional(v.id("posts")), // Page ID for blog index
  postsPerPage: v.number(),                // Posts per page (default 10)
}
```

---

## Actions & Functions

### Mutations

#### `page.create` - Create Page

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `edit_pages` (always), `publish_pages` (if status = "publish")
- **Args:**
  ```typescript
  {
    title: v.string(),
    slug: v.optional(v.string()),
    content: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("draft"), v.literal("pending"), v.literal("publish"),
      v.literal("private"), v.literal("future")
    )),
    visibility: v.optional(v.union(
      v.literal("public"), v.literal("private"), v.literal("password")
    )),
    password: v.optional(v.string()),
    parentId: v.optional(v.id("posts")),
    menuOrder: v.optional(v.number()),
    pageTemplate: v.optional(v.string()),
    featuredImageId: v.optional(v.id("media")),
    publishedAt: v.optional(v.number()),
    scheduledAt: v.optional(v.number()),
  }
  ```
- **Returns:** `Id<"posts">` (the new page's ID)
- **Behavior:**
  1. Auth check: require logged-in user via `ctx.auth.getUserIdentity()`
  2. Capability check: require `edit_pages`
  3. If publishing, additionally require `publish_pages`
  4. Generate slug from title if not provided (via `generateSlug()`)
  5. Validate slug uniqueness among pages using `by_type_slug` index
  6. If `parentId` provided: validate parent exists, is a page, is not trashed, compute depth and path
  7. Enforce depth limit (max 5 levels)
  8. Insert page record with computed fields (`path`, `depth`)
  9. Emit `page.created` event
- **Events:** `page.created`
- **Errors:**
  - `"Unauthorized"` - No auth identity
  - `"Page slug "{slug}" already exists"` - Duplicate slug among pages
  - `"Invalid parent page"` - Parent ID doesn't exist or isn't a page
  - `"Cannot set trashed page as parent"` - Parent is in trash
  - `"Maximum page nesting depth is 5 levels"` - Depth limit exceeded

#### `page.update` - Update Page

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `edit_pages` (own) OR `edit_others_pages` (others'), `edit_published_pages` (if published), `publish_pages` (if changing to publish)
- **Args:**
  ```typescript
  {
    pageId: v.id("posts"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    content: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("draft"), v.literal("pending"), v.literal("publish"),
      v.literal("private"), v.literal("trash"), v.literal("future")
    )),
    visibility: v.optional(v.union(
      v.literal("public"), v.literal("private"), v.literal("password")
    )),
    password: v.optional(v.string()),
    menuOrder: v.optional(v.number()),
    pageTemplate: v.optional(v.string()),
    featuredImageId: v.optional(v.id("media")),
    scheduledAt: v.optional(v.number()),
  }
  ```
- **Returns:** `Id<"posts">`
- **Behavior:**
  1. Auth check
  2. Fetch existing page, verify type = "page"
  3. Ownership-based capability check (own vs others)
  4. Published-page capability check
  5. Publish capability check if changing status to "publish"
  6. Validate slug uniqueness if slug is changing
  7. Track changed fields for event payload
  8. Recalculate path if slug changed; cascade path updates to all descendants via `updateDescendantPaths()`
  9. Build partial patch object (only changed fields + `updatedAt`)
  10. Set `publishedAt` when first publishing; set `trashedAt` when trashing
  11. Apply patch to database
  12. Emit `page.updated` event (only if there are actual changes)
- **Events:** `page.updated`
- **Errors:**
  - `"Page not found"` - ID doesn't exist or type isn't "page"
  - `"Page slug "{slug}" already exists"` - Duplicate slug

#### `page.delete` - Delete Page (Trash or Permanent)

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `delete_pages` (own) OR `delete_others_pages` (others'), `delete_published_pages` (if published)
- **Args:**
  ```typescript
  {
    pageId: v.id("posts"),
    permanent: v.optional(v.boolean()),  // true = permanent delete, false = trash
  }
  ```
- **Returns:** `Id<"posts">`
- **Behavior:**
  1. Auth check, capability checks
  2. If `permanent === true` AND page is already in trash:
     - Re-parent children to this page's parent (or make top-level)
     - Recalculate children's paths and depths recursively
     - Clear front page references via `clearFrontPageReferences()`
     - Permanently delete the record via `ctx.db.delete()`
  3. If NOT permanent (soft delete):
     - Patch status to "trash", set `trashedAt`
     - Clear front page references
  4. Emit `page.deleted` event
- **Events:** `page.deleted`
- **Errors:**
  - `"Page not found"` - ID doesn't exist or type isn't "page"

#### `page.publish` - Publish Page

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `publish_pages`
- **Args:**
  ```typescript
  {
    pageId: v.id("posts"),
  }
  ```
- **Returns:** `Id<"posts">`
- **Behavior:**
  1. Auth check
  2. Fetch page, verify type = "page" and not already published
  3. Require `publish_pages` capability
  4. Patch: status = "publish", set `publishedAt` if not already set, update `updatedAt`
  5. Preserve visibility (keep "private" if it was private)
  6. Emit `page.published` event with the page's URL path
- **Events:** `page.published`
- **Errors:**
  - `"Page not found"` - Invalid page
  - `"Page is already published"` - Idempotency guard

#### `page.reorder` - Reorder Pages

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `edit_others_pages`
- **Args:**
  ```typescript
  {
    orders: v.array(v.object({
      pageId: v.id("posts"),
      menuOrder: v.number(),
    })),
  }
  ```
- **Returns:** `boolean` (true on success)
- **Behavior:**
  1. Auth check, require `edit_others_pages`
  2. Iterate through orders array
  3. For each entry, fetch page, verify type = "page", patch `menuOrder` and `updatedAt`
  4. Skip invalid entries silently (no error thrown for individual invalid IDs)
- **Events:** None
- **Errors:**
  - `"Unauthorized"` - No auth or missing capability

#### `page.set_parent` - Set Page Parent

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `edit_others_pages`
- **Args:**
  ```typescript
  {
    pageId: v.id("posts"),
    parentId: v.optional(v.id("posts")),  // undefined = make top-level
  }
  ```
- **Returns:** `Id<"posts">`
- **Behavior:**
  1. Auth check, require `edit_others_pages`
  2. Fetch page, verify type = "page"
  3. Prevent self-parenting (`parentId !== pageId`)
  4. Prevent circular reference: walk ancestor chain from new parent to root, verify current page not encountered
  5. Validate new parent exists, is a page, is not trashed
  6. Calculate new depth and path from new parent
  7. Enforce depth limit (max 5)
  8. Patch page with new `parentId`, `depth`, `path`, `updatedAt`
  11. Recursively update all descendants' paths and depths via `updateDescendantPaths()`
- **Events:** None
- **Errors:**
  - `"A page cannot be its own parent"` - Self-parenting
  - `"Circular parent-child relationship detected"` - Circular reference
  - `"Invalid parent page"` - Parent doesn't exist or isn't a page
  - `"Cannot set trashed page as parent"` - Trashed parent
  - `"Maximum page nesting depth is 5 levels"` - Depth limit

### Queries

#### `listPages` - List Pages (Admin)

- **Type:** query
- **Auth:** Required (admin list view)
- **Args:**
  ```typescript
  {
    status: v.optional(v.union(...statusLiterals)),
    authorId: v.optional(v.string()),
    parentId: v.optional(v.id("posts")),
    search: v.optional(v.string()),
    page: v.optional(v.number()),        // 1-indexed
    perPage: v.optional(v.number()),     // default 20
  }
  ```
- **Returns:**
  ```typescript
  {
    pages: Doc<"posts">[],
    pagination: { page: number, perPage: number, total: number, totalPages: number },
    counts: { all: number, publish: number, draft: number, pending: number, private: number, trash: number, future: number },
  }
  ```
- **Behavior:**
  1. Query pages using `by_type_status` index
  2. Filter out trash unless specifically requested
  3. Apply author, parent, and search filters in-memory
  4. Sort by `menuOrder` then `title`
  5. Apply pagination (offset-based)
  6. Calculate status counts from a separate full query
- **Pagination:** Offset-based (page number + perPage)
- **Filters:** status, authorId, parentId, search (title + slug)

#### `getPageTree` - Hierarchical Page Tree

- **Type:** query
- **Auth:** Public (needed for parent dropdown and menu builder)
- **Args:** None
- **Returns:** `PageTreeNode[]` (nested tree structure)
- **Behavior:**
  1. Fetch all non-trash pages
  2. Sort by `menuOrder`
  3. Build tree via `buildPageTree()` helper (two-pass: create nodes, then link children)

#### `getPage` - Single Page (Admin Edit)

- **Type:** query
- **Auth:** Conditional (private pages require auth + `read_private_pages`)
- **Args:** `{ pageId: v.id("posts") }`
- **Returns:** Page document with parent info and children list, or `null`
- **Behavior:**
  1. Fetch page by ID, verify type = "page"
  2. If private, check auth and capability
  3. Fetch parent info (ID, title, slug)
  4. Fetch children (non-trash, sorted by menuOrder)
  5. Return enriched page object

#### `getPageByPath` - Page by URL Path (Website SSR)

- **Type:** query
- **Auth:** Conditional (private pages require auth)
- **Args:** `{ path: v.string() }`
- **Returns:** Page document, `null`, or password-protected stub
- **Behavior:**
  1. Normalize path (ensure leading slash)
  2. Query using `by_path` index for exact match
  3. Only return published or private pages
  4. If private: check auth
  5. If password-protected: return page without content (with `isPasswordProtected: true` flag)

#### `getPageBySlug` - Page by Slug (Simple Lookup)

- **Type:** query
- **Auth:** Public (only returns published/private)
- **Args:** `{ slug: v.string() }`
- **Returns:** Page document or `null`
- **Behavior:** Query using `by_type_slug` index, filter to published/private only

#### `getFrontPage` - Get Static Front Page

- **Type:** query
- **Auth:** Public
- **Args:** None
- **Returns:** Page document or `null`
- **Behavior:**
  1. Look up `reading` settings from `settings` table
  2. If `showOnFront !== "page"` or no `pageOnFront` set, return null
  3. Fetch the designated page, verify type = "page" and status = "publish"
  4. Return page or null

---

## Events

### `page.created`

- **Type:** Content
- **Triggered By:** `page.create` mutation
- **Payload:**
  ```typescript
  {
    pageId: Id<"posts">;
    title: string;
    authorId: string;
  }
  ```
- **Subscribers:**
  - Audit Log: Yes - Log page creation
  - Side Effects: None

### `page.updated`

- **Type:** Content
- **Triggered By:** `page.update` mutation
- **Payload:**
  ```typescript
  {
    pageId: Id<"posts">;
    title: string;
    authorId: string;
    changes: string[];  // Changed field names: ["title", "content", "status", "slug", "template"]
  }
  ```
- **Subscribers:**
  - Audit Log: Yes - Log page update with changed fields
  - Sitemap System: Regenerate XML sitemap if published page was updated
  - SEO System: Update meta tags, validate SEO
  - Search System: Update search index

### `page.published`

- **Type:** Content
- **Triggered By:** `page.publish` mutation
- **Payload:**
  ```typescript
  {
    pageId: Id<"posts">;
    title: string;
    authorId: string;
    url: string;  // Full URL path (e.g., "/about" or "/services/web-design")
  }
  ```
- **Subscribers:**
  - Audit Log: Yes - Log page publish
  - Sitemap System: Add page to XML sitemap
  - SEO System: Validate SEO meta tags
  - Dashboard System: Update "Recent Activity" widget
  - Search System: Add page to search index

### `page.deleted`

- **Type:** Content
- **Triggered By:** `page.delete` mutation
- **Payload:**
  ```typescript
  {
    pageId: Id<"posts">;
    title: string;
    authorId: string;
  }
  ```
- **Subscribers:**
  - Audit Log: Yes - Log page deletion (trash or permanent)
  - Sitemap System: Remove page from XML sitemap
  - Menu System: Remove deleted page from menus
  - Search System: Remove page from search index

---

## Admin Routes & UI

### All Pages (`/admin/pages`)

- **Purpose:** WordPress-style hierarchical list table showing all pages with status filtering, search, bulk actions, and inline quick edit.
- **WordPress Equivalent:** `edit.php?post_type=page`
- **Layout:** Full-page WordPress-style list table within the `_admin` layout.
- **Key Components:**
  - `PageListTable` - Main list table with columns, sorting, pagination
  - `PageListRow` - Individual row with hover action links
  - `PageQuickEdit` - Inline expansion for quick editing (title, slug, status, parent, template, order)
  - `PageStatusFilter` - Tab bar: All | Published | Draft | Pending | Private | Trash | Scheduled (with count badges)
  - `PageBulkActions` - Dropdown + Apply button for bulk operations
  - `PageHierarchyIndicator` - Renders "--- " prefix per depth level
- **Data Requirements:** `listPages` query with status/search/pagination params
- **User Interactions:**
  - Filter by status tab
  - Search by title/slug
  - Click title to edit (navigates to edit page)
  - Hover for row actions: Edit, Quick Edit, Trash, View
  - Select rows for bulk actions (Trash, Restore, Delete Permanently)
  - Change items per page (20 | 50 | 100)
  - Navigate pagination
- **Real-Time:** List updates live when pages are created, updated, or trashed by any admin user

**List Table Columns:**

| Column | Width | Sortable | Content |
|--------|-------|----------|---------|
| Checkbox | 40px | No | Bulk select |
| Title | flex | Yes | Page title with hierarchy indentation ("--- " per depth), link to edit, row actions on hover |
| Author | 150px | Yes | Author display name |
| Template | 120px | No | Page template name |
| Date | 150px | Yes | Published/scheduled date, or "Last Modified" for drafts |
| Status | 100px | No | Status badge |

**Hierarchy Indentation Pattern:**
```
About Us                          (depth 0)
--- Our Team                      (depth 1)
--- --- Jane Smith Bio            (depth 2)
--- --- John Doe Bio              (depth 2)
--- Our History                   (depth 1)
Contact                           (depth 0)
Services                          (depth 0)
--- Web Design                    (depth 1)
--- SEO Services                  (depth 1)
```

### Add New Page (`/admin/pages/new`)

- **Purpose:** Create a new page with the block editor, page attributes, and publish controls.
- **WordPress Equivalent:** `post-new.php?post_type=page`
- **Layout:** Two-column layout within `_admin` layout. Main content (~70%) + sidebar (~30%).
- **Key Components:**
  - `PageEditor` - Main two-column layout orchestrator
  - Content Editor (from Content Editor System) - Block-based rich text editing
  - `PagePublishMetabox` - Status, visibility, publish/schedule controls, Save Draft, Preview, Trash
  - `PageAttributesMetabox` - Parent dropdown, template dropdown, order input
  - `PageFeaturedImageMetabox` - Featured image picker (Media Library integration)
  - `PageParentSelect` - Hierarchical dropdown with indentation
  - `PageTemplateSelect` - Template dropdown from `PAGE_TEMPLATES` config
  - SEO Metabox (from SEO System) - SEO title, meta description, canonical URL, preview snippet
- **Data Requirements:** `getPageTree` (for parent dropdown), `PAGE_TEMPLATES` config
- **User Interactions:**
  - Enter title (large input, placeholder "Add title")
  - Edit content with block editor
  - Select parent page from hierarchical dropdown
  - Select page template
  - Set menu order
  - Set featured image via Media Library picker
  - Choose status (Draft, Pending Review)
  - Choose visibility (Public, Private, Password Protected)
  - Schedule publish date/time
  - Save Draft, Preview, Publish buttons
- **Real-Time:** Parent dropdown updates if pages are added/removed by other admins

**Main Column (left, ~70%):**
- Title field (large text input)
- Slug/Permalink (shows after first save, editable)
- Content Editor (block-based)

**Sidebar Column (right, ~30%):**
- Publish Metabox (status, visibility, publish/schedule, Save Draft, Preview, Move to Trash)
- Page Attributes Metabox (parent, template, order)
- Featured Image Metabox
- SEO Metabox

### Edit Page (`/admin/pages/$pageId/edit`)

- **Purpose:** Edit an existing page. Identical layout to Add New Page, pre-populated with data.
- **WordPress Equivalent:** `post.php?post=ID&action=edit`
- **Layout:** Same two-column layout as Add New Page.
- **Key Components:** Same as Add New Page, plus:
  - "View Page" link in header (opens published page on website in new tab)
  - Revisions link (if Revision System active, shows revision count)
  - Last modified timestamp display
- **Data Requirements:** `getPage` query (single page with parent + children), `getPageTree` (for parent dropdown)
- **User Interactions:** Same as Add New Page, plus:
  - View published page on website
  - Browse revisions
  - Publish button says "Update" instead of "Publish"
- **Real-Time:** Page data updates if another admin edits simultaneously

---

## Website Routes

### Home Page (`/`)

- **Purpose:** Render either the static front page (if configured) or the blog index (default).
- **SEO:** Title from page SEO fields or site title. Meta description from page or site defaults. OG tags for the front page.
- **Data Requirements:** `getFrontPage` query. If null, falls through to Post System's blog index.
- **Caching:** SSR at request time. Convex handles caching internally.
- **Implementation:**
  ```typescript
  // Route checks reading settings via getFrontPage
  // If a static front page exists: render it with its template
  // If not: render blog index (delegated to Post System)
  ```

### Single Page (`/$slug`)

- **Purpose:** Render a single page by its URL path. Supports nested paths (e.g., `/services/web-design`).
- **SEO:** Page-specific SEO title, meta description, canonical URL. OG tags with featured image. Structured data (WebPage schema).
- **Data Requirements:** `getPageByPath` query (resolves full path including nested slugs).
- **Caching:** SSR at request time.
- **Implementation:**
  1. Resolve page by full URL path
  2. If not found: 404
  3. If password-protected: show `PagePasswordForm`
  4. If private: check auth, show 404 if unauthorized
  5. Render using `PageRenderer` which selects the template component based on `pageTemplate`
- **Key Components:**
  - `PageRenderer` - Template selector/dispatcher
  - `PageContent` - Rendered page content
  - `PagePasswordForm` - Password gate for protected pages
  - `PageBreadcrumbs` - Breadcrumb trail for nested pages

---

## Notifications

### Email Notifications

The Page System has **no email notifications** defined. This matches WordPress behavior - page creation/updates do not trigger email notifications by default. Pages are structural content managed by admins/editors, not user-facing content that warrants email alerts.

### Site Notifications

The Page System has **no site notifications** defined. Page operations are admin-level activities captured by the Audit Log System for accountability.

### Future Notification Considerations

If notifications are needed later, they can be added by subscribing to page events in the Notification Systems without modifying the Page System:

| Event | Potential Notification | Recipients |
|-------|----------------------|------------|
| `page.published` | "New page published: {title}" | Site admins (site notification) |
| `page.updated` | "Page updated: {title}" | Page author if edited by someone else |
| `page.deleted` | "Page deleted: {title}" | Site admins (audit trail) |

---

## Role & Capability Matrix

### Action-Role Matrix

| Action | Administrator | Editor | Author | Contributor | Subscriber |
|--------|:---:|:---:|:---:|:---:|:---:|
| `page.create` | Yes | Yes | - | - | - |
| `page.read` | Yes | Yes | Yes | Yes | Yes |
| `page.update` | Yes | Yes | - | - | - |
| `page.delete` | Yes | Yes | - | - | - |
| `page.publish` | Yes | Yes | - | - | - |
| `page.reorder` | Yes | Yes | - | - | - |
| `page.set_parent` | Yes | Yes | - | - | - |

### Route Access Matrix

| Route | Administrator | Editor | Author | Contributor | Subscriber | Public |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|
| `/admin/pages` | Yes | Yes | - | - | - | - |
| `/admin/pages/new` | Yes | Yes | - | - | - | - |
| `/admin/pages/$pageId/edit` | Yes | Yes | - | - | - | - |
| `/` (front page) | Yes | Yes | Yes | Yes | Yes | Yes |
| `/$slug` (public page) | Yes | Yes | Yes | Yes | Yes | Yes |
| `/$slug` (private page) | Yes | Yes | - | - | - | - |

### WordPress Capability Mapping

| WordPress Capability | ConvexPress Equivalent | Administrator | Editor | Author | Contributor | Subscriber |
|---------------------|----------------------|:---:|:---:|:---:|:---:|:---:|
| `edit_pages` | `edit_pages` | Yes | Yes | - | - | - |
| `edit_others_pages` | `edit_others_pages` | Yes | Yes | - | - | - |
| `edit_published_pages` | `edit_published_pages` | Yes | Yes | - | - | - |
| `publish_pages` | `publish_pages` | Yes | Yes | - | - | - |
| `delete_pages` | `delete_pages` | Yes | Yes | - | - | - |
| `delete_others_pages` | `delete_others_pages` | Yes | Yes | - | - | - |
| `delete_published_pages` | `delete_published_pages` | Yes | Yes | - | - | - |
| `read_private_pages` | `read_private_pages` | Yes | Yes | - | - | - |

**Key difference from Posts:** Pages have NO per-author capabilities for lower roles. Authors, Contributors, and Subscribers cannot create, edit, or manage pages. Only Administrators and Editors have page management capabilities. This matches WordPress default behavior.

---

## Dependencies

### Depends On

| System | Type | What Is Needed |
|--------|------|----------------|
| **Auth System** | Hard | auth identity for `authorId`. `ctx.auth.getUserIdentity()` in every mutation. Session management for admin access. |
| **Role & Capability System** | Hard | `requireCapability()` helper. All 8 page capabilities must be defined and mapped to roles. Without this, no page mutation can execute. |

### Depended On By

| System | Type | What They Need |
|--------|------|----------------|
| **Menu System** | Hard | Pages are primary menu items. Menu builder references pages by ID. When a page is deleted, Menu System must remove it from menus (via `page.deleted` event). |
| **SEO System** | Soft | SEO meta tags for pages. SEO metabox embedded in the page editor. Consumes `page.published` and `page.updated` events to validate SEO. |
| **Sitemap System** | Soft | Published pages included in XML sitemap. Consumes `page.published`, `page.updated`, `page.deleted` events to regenerate sitemap. |
| **Content Editor System** | Integration | The block editor is embedded in the page editor (Add New / Edit screens). Same editor component used by Post System. |
| **Settings System** | Integration | Reading settings reference pages for front page (`pageOnFront`) and posts page (`pageForPosts`). Page System reads these settings in `getFrontPage` query. |
| **Routing System** | Integration | Page paths registered for website URL resolution. Catch-all route delegates to Page System for path matching. |
| **Search System** | Soft | Pages indexed for site search. Consumes `page.published`, `page.updated`, `page.deleted` events to maintain search index. |
| **Dashboard System** | Soft | Consumes `page.published` event for "Recent Activity" widget. |
| **Audit Log System** | Soft | Consumes all page events for audit trail. |
| **Media System** | Soft | Featured image picker on page editor references `media` table. |
| **Revision System** | Soft | Page revisions stored in the shared revisions table. Revision link shown on edit screen. |

### Shared Infrastructure

| Component | Shared With | Notes |
|-----------|------------|-------|
| `posts` table | Post System | Pages use `type: "page"` in the shared table. ALL queries must filter by type. |
| Content Editor | Post System | Same block editor component embedded in both page and post editors. |
| Media Library picker | Post System, Media System | Featured image selection component. |
| Revision System | Post System | Page revisions use the same revisions infrastructure. |
| Slug generation | Post System | Shared `generateSlug()` helper. |
| Status workflow | Post System | Same status values (draft, pending, publish, private, trash, future). |

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/)

- [ ] `convex/schema.ts` - Posts table definition (shared with Post System, 1 table)
- [ ] `convex/pages.ts` - All page mutations (createPage, updatePage, deletePage, publishPage, reorderPages, setPageParent) and queries (listPages, getPageTree, getPage, getPageByPath, getPageBySlug, getFrontPage)
- [ ] `convex/helpers/pages.ts` - Helper functions: buildPageTree, updateDescendantPaths, clearFrontPageReferences, generateSlug (shared with Post System)
- [ ] `convex/types/events.ts` - Page event payload types (PageCreatedEvent, PageUpdatedEvent, PagePublishedEvent, PageDeletedEvent)

### Admin Frontend (ConvexPress-Admin/apps/web/)

- [ ] `src/routes/admin/pages/index.tsx` - All Pages list view route
- [ ] `src/routes/admin/pages/new.tsx` - Add New Page route
- [ ] `src/routes/admin/pages/$pageId/edit.tsx` - Edit Page route
- [ ] `src/components/pages/PageListTable.tsx` - WordPress-style list table
- [ ] `src/components/pages/PageListRow.tsx` - Single row with hover actions
- [ ] `src/components/pages/PageQuickEdit.tsx` - Inline quick edit form
- [ ] `src/components/pages/PageEditor.tsx` - Main page edit layout (two-column)
- [ ] `src/components/pages/PagePublishMetabox.tsx` - Publish/status/visibility metabox
- [ ] `src/components/pages/PageAttributesMetabox.tsx` - Parent, template, order metabox
- [ ] `src/components/pages/PageFeaturedImageMetabox.tsx` - Featured image picker metabox
- [ ] `src/components/pages/PageParentSelect.tsx` - Hierarchical parent dropdown
- [ ] `src/components/pages/PageTemplateSelect.tsx` - Template dropdown
- [ ] `src/components/pages/PageStatusFilter.tsx` - Status tab filter bar
- [ ] `src/components/pages/PageBulkActions.tsx` - Bulk action dropdown + apply
- [ ] `src/components/pages/PageHierarchyIndicator.tsx` - "--- " depth prefix component
- [ ] `src/hooks/pages/usePages.ts` - Page list query hook
- [ ] `src/hooks/pages/usePage.ts` - Single page query hook
- [ ] `src/hooks/pages/usePageTree.ts` - Hierarchical tree query hook
- [ ] `src/hooks/pages/useCreatePage.ts` - Create mutation hook
- [ ] `src/hooks/pages/useUpdatePage.ts` - Update mutation hook
- [ ] `src/hooks/pages/useDeletePage.ts` - Delete mutation hook
- [ ] `src/hooks/pages/usePublishPage.ts` - Publish mutation hook
- [ ] `src/hooks/pages/useReorderPages.ts` - Reorder mutation hook
- [ ] `src/hooks/pages/useSetPageParent.ts` - Set parent mutation hook

### Website Frontend (ConvexPress-Website/apps/web/)

- [ ] `src/routes/index.tsx` - Home page (front page or blog index)
- [ ] `src/routes/$slug.tsx` - Single page (catch-all path resolver)
- [ ] `src/components/pages/PageRenderer.tsx` - Template selector/renderer
- [ ] `src/components/pages/PageContent.tsx` - Rendered page content
- [ ] `src/components/pages/PagePasswordForm.tsx` - Password-protected page form
- [ ] `src/components/pages/PageBreadcrumbs.tsx` - Breadcrumb trail for nested pages
- [ ] `src/templates/DefaultTemplate.tsx` - Standard page layout
- [ ] `src/templates/FullWidthTemplate.tsx` - Full-width, no sidebar
- [ ] `src/templates/SidebarLeftTemplate.tsx` - Content + left sidebar
- [ ] `src/templates/LandingTemplate.tsx` - Minimal header/footer
- [ ] `src/templates/BlankTemplate.tsx` - Content only, no chrome

### Shared Configuration

- [ ] `shared/config/page-templates.ts` - PAGE_TEMPLATES registry

---

## Edge Cases & Gotchas

1. **Slug uniqueness is per-type, not global.** A page with slug "about" and a post with slug "about" can coexist. This is intentional - they have different URL patterns (`/about` vs `/blog/about`). Always use the `by_type_slug` index, never `by_slug` alone for uniqueness checks.

2. **Path cascading on slug change.** When a parent page's slug changes, ALL descendant pages' `path` fields must be updated recursively. The `updateDescendantPaths()` helper handles this, but be aware this can be an expensive operation for deep hierarchies. Convex mutations have execution time limits.

3. **Circular reference detection.** When setting a page's parent, walk the entire ancestor chain from the proposed new parent up to root. If the current page appears anywhere in that chain, reject with an error. This prevents infinite loops in tree traversal.

4. **Front page deletion safety.** When deleting or trashing the page designated as the static front page (`pageOnFront` in reading settings), `clearFrontPageReferences()` must reset `showOnFront` to `"posts"` and clear `pageOnFront`. Otherwise, the home page would be broken.

5. **Parent dropdown must exclude self and descendants.** When rendering the parent page dropdown in the Page Attributes metabox, exclude the current page AND all of its descendants. Otherwise, a user could create a circular reference via the UI.

6. **Children survive parent deletion.** When a page is permanently deleted, its children are re-parented to the deleted page's parent (or become top-level). They are NOT cascaded-deleted. This matches WordPress behavior.

7. **Trash does not cascade.** When a parent page is trashed, its children remain accessible. Children of trashed pages are still visible and functional. Only the trashed page itself is hidden.

8. **Password-protected pages return no content.** The `getPageByPath` query returns the page document WITHOUT `content` when `visibility === "password"`, plus an `isPasswordProtected: true` flag. The client must submit the password and re-request content.

9. **Auto-save interval.** The page editor should auto-save drafts every 60 seconds, but only if content has changed since the last save. Show "Draft saved at [time]" indicator. Auto-save creates revisions separate from manual saves (if Revision System is active).

10. **Bulk restore slug conflicts.** When restoring pages from trash, a slug conflict may exist if a new page was created with the same slug while the old page was in trash. The restore operation must detect and handle this (e.g., append "-2" to the restored page's slug).

11. **Bulk restore parent validation.** When restoring from trash, the page's parent may have been permanently deleted. The restore operation must detect this and re-parent to top-level if the parent no longer exists.

12. **Template validation is soft.** The `pageTemplate` field stores a string key. If a template is removed from the `PAGE_TEMPLATES` config but existing pages reference it, the website should fall back to the default template gracefully rather than erroring.

13. **Depth limit applies to move operations too.** When moving a page (via setPageParent), the depth check must consider the entire subtree. If a page at depth 3 has children at depth 4 and 5, moving it to a depth-2 parent would push descendants to depth 5, 6, and 7 - exceeding the limit.

14. **Scheduled pages need a cron/scheduled function.** Pages with `status: "future"` and `scheduledAt` in the past need to be automatically published. This requires a Convex scheduled function (cron job) that checks for overdue scheduled pages and publishes them.

15. **The `$slug` catch-all route must not conflict with other routes.** The website's `/$slug` route is a catch-all. It must be lower priority than explicitly defined routes (e.g., `/blog`, `/contact-form`, `/login`). TanStack Start handles this via route specificity, but be careful with route ordering.

---

## WordPress Functions Reference

| WordPress Function | ConvexPress Equivalent | Notes |
|-----------|-------------|-------|
| `wp_insert_post()` (with `post_type => 'page'`) | `createPage` mutation | Auto-generates slug, computes path/depth |
| `wp_update_post()` | `updatePage` mutation | Partial patch, cascades path changes |
| `wp_delete_post()` / `wp_trash_post()` | `deletePage` mutation | `permanent` flag controls trash vs delete |
| `wp_publish_post()` | `publishPage` mutation | Dedicated publish action with capability check |
| `get_pages()` | `listPages` query | Returns flat list with pagination and counts |
| `get_page_children()` | `getPage` query (returns children) | Included in single page response |
| `get_page_by_path()` | `getPageByPath` query | Uses pre-computed `path` field instead of runtime resolution |
| `get_page_by_title()` | N/A | Not needed - use search filter in `listPages` |
| `wp_list_pages()` | `getPageTree` query | Returns hierarchical tree structure |
| `get_page_templates()` | `PAGE_TEMPLATES` constant | Code-defined, not theme file scanning |
| `is_page()` | Check `type === "page"` | Simple field check on the post record |
| `is_front_page()` | `getFrontPage` query result | Returns the front page or null |
| `get_option('show_on_front')` | Settings System `reading.showOnFront` | Part of reading settings |
| `get_option('page_on_front')` | Settings System `reading.pageOnFront` | Part of reading settings |
| `get_option('page_for_posts')` | Settings System `reading.pageForPosts` | Part of reading settings |
| `sanitize_title()` | `generateSlug()` helper | Lowercase, alphanumeric + hyphens, max 200 chars |
| `current_user_can('edit_pages')` | `requireCapability(ctx, identity, "edit_pages")` | Throws error on failure |


