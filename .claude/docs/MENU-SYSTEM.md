# Menu System - Expert Knowledge Document

**System:** Menu System
**Status:** Complete (100%)
**Priority:** P1 - High
**Complexity:** Medium
**Category:** Content & Marketing
**Layer:** Full Stack
**WordPress Equivalent:** Navigation Menus (Appearance > Menus)
**Last Analyzed:** 2026-02-13
**PRD:** `specs/ConvexPress/systems/menu-system/PRD.md`
**Airtable System Record:** `rec0l38apHevOSX0b`
**Airtable Expert Record:** `recKd59KbkAytTf7P`

---

## Quick Reference

### What This System Does

The Menu System manages navigation menus in ConvexPress. It is the equivalent of WordPress's Navigation Menus feature (Appearance > Menus), introduced in WordPress 3.0. Menus are user-configured ordered lists of links assigned to theme-registered locations (header, footer, sidebar, mobile, social). Each menu contains items that can link to pages, posts, categories, tags, or arbitrary custom URLs, arranged in a hierarchical tree structure with drag-and-drop reordering in the admin interface.

Unlike WordPress, which overloads the taxonomy system to store menus (using `wp_terms` with taxonomy `nav_menu` and `wp_posts` with type `nav_menu_item`), ConvexPress uses three dedicated Convex tables: `menus`, `menuItems`, and `menuLocations`.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Menu** | A named, ordered collection of navigation items (e.g., "Main Navigation", "Footer Links") |
| **Menu Item** | A single link in a menu, can be a page, post, category, tag, or custom URL |
| **Menu Location** | A theme-registered slot where a menu can be displayed (e.g., "header", "footer") |
| **Item Type** | One of: `page`, `post`, `category`, `tag`, `custom` |
| **Nesting** | Items can be nested up to 5 levels via `parentItemId` for dropdown sub-menus |
| **Position** | Integer sort order within siblings (0-indexed) |
| **Depth** | Nesting level (0 = top-level, 1 = child, etc.) |
| **Orphaned Item** | A menu item whose linked content (page/post/category/tag) has been deleted |
| **Auto-Add Pages** | Per-menu setting that automatically adds new top-level pages |
| **`edit_theme_options`** | The WordPress capability required for all menu operations (Administrator only) |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **Storage** | Menus as taxonomy terms (`nav_menu`), items as posts (`nav_menu_item`) + postmeta | Dedicated `menus`, `menuItems`, `menuLocations` Convex tables |
| **Reactivity** | Page reload or AJAX after save | Real-time Convex subscriptions |
| **Rendering** | `Walker_Nav_Menu` PHP class generates HTML | React component tree with recursive rendering |
| **Location Registration** | `register_nav_menus()` in `functions.php` | `menuLocations` database table + config file |
| **Max Depth** | Unlimited (CSS breaks after ~10 levels) | 5 levels (enforced in schema validation) |
| **Auth** | `current_user_can('edit_theme_options')` | auth identity + `requireCapability(ctx, identity, "edit_theme_options")` |
| **Orphan Handling** | Items become "broken" but remain visible | Items marked `isOrphaned: true`, filtered from website rendering |
| **XFN Support** | Full XFN relationship checkboxes | Simplified to `linkRel` text field |

---

## Architecture Overview

### Data Flow

1. **Admin creates menu** -> `createMenu` mutation -> inserts into `menus` table -> emits `menu.created` event
2. **Admin adds items** -> `addMenuItem` mutation -> validates object exists -> resolves URL -> inserts into `menuItems` -> increments `menus.itemCount`
3. **Admin reorders items** -> `reorderMenuItems` mutation -> updates `position`, `depth`, `parentItemId` for all items
4. **Admin assigns to location** -> `assignMenuToLocation` mutation -> patches `menuLocations.menuId` -> emits `menu.location_assigned` event
5. **Website renders menu** -> `getMenuForLocation` query -> fetches location -> fetches menu -> fetches items -> resolves URLs -> builds tree -> returns to React component
6. **Content deleted** -> `page.deleted`/`post.deleted`/`taxonomy.category_deleted` event -> `orphanMenuItemsByObject` helper -> marks items as `isOrphaned: true`
7. **Page published** -> `page.published` event -> `autoAddPageToMenus` helper -> adds page item to menus with `autoAddPages: true`

### Real-Time Behavior

- **Admin menu list**: Convex subscription on `listMenus` - updates when any menu is created/updated/deleted
- **Admin menu editor**: Convex subscription on `getMenu` - updates when items are added/removed/reordered
- **Admin add-items panel**: Convex subscription on `getLinkableContent` - updates when new pages/posts/terms are created
- **Admin locations page**: Convex subscription on `getMenuLocations` - updates when assignments change
- **Website navigation**: Convex subscription on `getMenuForLocation` - navigation updates live when menus are edited in admin (no deploy or cache purge needed)

### Authentication & Authorization

All menu management operations require:
1. **Convex Auth authentication** - `ctx.auth.getUserIdentity()` must return a valid identity
2. **`edit_theme_options` capability** - Checked via `requireCapability(ctx, identity, "edit_theme_options")`
3. This capability is granted only to the **Administrator** role

Website menu rendering (`getMenuForLocation`) is **public** - no auth required. Menus are rendered for all visitors.

---

## Database Schema

### `menus` Table

Stores the menu containers. Each menu is a named collection of items.

```typescript
// ConvexPress-Admin/packages/backend/convex/schema.ts

menus: defineTable({
  // === Identity ===
  name: v.string(),                          // Menu name (e.g., "Main Navigation", "Footer Links")
  slug: v.string(),                          // URL-safe identifier, auto-generated from name
  description: v.optional(v.string()),       // Optional description for admin reference

  // === Settings ===
  autoAddPages: v.optional(v.boolean()),     // Auto-add new top-level pages (default false)

  // === Cache ===
  itemCount: v.optional(v.number()),         // Cached count of menu items (for admin list)

  // === Authorship ===
  createdBy: v.string(),                     // user identifier of creator

  // === Timestamps ===
  createdAt: v.number(),
  updatedAt: v.number(),
})
  // === Indexes ===
  .index("by_slug", ["slug"])
  .index("by_name", ["name"]),
```

**Field Validation:**

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | Yes | 1-200 chars. No whitespace-only. Unique across menus. |
| `slug` | Auto-generated | 1-200 chars. Lowercase alphanumeric + hyphens. Unique. |
| `description` | No | 0-500 chars. |
| `autoAddPages` | No | Default `false`. |
| `itemCount` | Auto-managed | Integer >= 0. Updated by add/delete item mutations. |
| `createdBy` | Auto-set | Convex Auth `identity.subject`. |

### `menuItems` Table

Stores individual navigation items within menus. Supports hierarchical nesting via self-referencing `parentItemId`.

```typescript
// ConvexPress-Admin/packages/backend/convex/schema.ts

menuItems: defineTable({
  // === Relationship ===
  menuId: v.id("menus"),                     // Parent menu

  // === Item Type ===
  itemType: v.union(
    v.literal("page"),                       // Links to a page (post with type=page)
    v.literal("post"),                       // Links to a post
    v.literal("category"),                   // Links to a category archive
    v.literal("tag"),                        // Links to a tag archive
    v.literal("custom")                      // Custom URL
  ),

  // === Object Reference (for content-linked items) ===
  objectId: v.optional(v.string()),          // ID of the linked object (post ID, term ID)
                                             // String because it could be Id<"posts"> or Id<"terms">
                                             // Null for custom links

  // === Display ===
  label: v.string(),                         // Navigation label (displayed text)
  title: v.optional(v.string()),             // Title attribute (hover tooltip)
  description: v.optional(v.string()),       // Optional description text
  url: v.optional(v.string()),              // Explicit URL (required for custom links, computed for content links)

  // === Hierarchy ===
  parentItemId: v.optional(v.id("menuItems")), // Parent menu item (null = top-level)
  position: v.number(),                      // Sort order within siblings (0-indexed)
  depth: v.optional(v.number()),             // Nesting depth (0 = top-level, 1 = child, etc.)

  // === Attributes ===
  target: v.optional(v.union(
    v.literal("_self"),                      // Same window (default)
    v.literal("_blank")                      // New tab
  )),
  cssClasses: v.optional(v.string()),        // Space-separated CSS class names
  linkRel: v.optional(v.string()),           // Link relationship (rel attribute, e.g., "nofollow")

  // === Status ===
  isOrphaned: v.optional(v.boolean()),       // True if the linked object has been deleted

  // === Timestamps ===
  createdAt: v.number(),
  updatedAt: v.number(),
})
  // === Indexes ===
  .index("by_menu", ["menuId"])
  .index("by_menu_position", ["menuId", "position"])
  .index("by_menu_parent", ["menuId", "parentItemId"])
  .index("by_object", ["itemType", "objectId"])
  .index("by_parent_item", ["parentItemId"]),
```

**Field Validation:**

| Field | Required | Constraints |
|-------|----------|-------------|
| `menuId` | Yes | Must reference existing menu. |
| `itemType` | Yes | One of: `page`, `post`, `category`, `tag`, `custom`. |
| `objectId` | Conditional | Required when itemType is NOT `custom`. Must reference existing content. |
| `label` | Yes | 1-200 chars. Cannot be empty. |
| `title` | No | 0-200 chars. |
| `description` | No | 0-500 chars. |
| `url` | Conditional | Required when itemType is `custom`. Valid URL format. Computed for content items. |
| `parentItemId` | No | Must reference existing item in the SAME menu. Cannot create circular references. |
| `position` | Yes | Integer >= 0. |
| `depth` | Auto-computed | Integer 0-5. Computed from parent chain. |
| `target` | No | `_self` (default) or `_blank`. |
| `cssClasses` | No | 0-500 chars. Space-separated CSS class names. |
| `linkRel` | No | 0-200 chars. Valid link relationship values. |

### `menuLocations` Table

Stores theme-registered menu locations and their assigned menus.

```typescript
// ConvexPress-Admin/packages/backend/convex/schema.ts

menuLocations: defineTable({
  // === Identity ===
  slug: v.string(),                          // Location identifier (e.g., "header", "footer", "sidebar")
  name: v.string(),                          // Human-readable name (e.g., "Primary Navigation")
  description: v.optional(v.string()),       // Description for admin reference

  // === Assignment ===
  menuId: v.optional(v.id("menus")),         // Currently assigned menu (null = no menu)

  // === Timestamps ===
  createdAt: v.number(),
  updatedAt: v.number(),
})
  // === Indexes ===
  .index("by_slug", ["slug"])
  .index("by_menu", ["menuId"]),
```

### Indexes

| Table | Index | Fields | Purpose |
|-------|-------|--------|---------|
| `menus` | `by_slug` | `["slug"]` | Look up menu by slug (uniqueness check) |
| `menus` | `by_name` | `["name"]` | Look up menu by name (uniqueness check) |
| `menuItems` | `by_menu` | `["menuId"]` | Get all items for a menu |
| `menuItems` | `by_menu_position` | `["menuId", "position"]` | Get items sorted by position |
| `menuItems` | `by_menu_parent` | `["menuId", "parentItemId"]` | Get siblings (items with same parent in same menu) |
| `menuItems` | `by_object` | `["itemType", "objectId"]` | Find menu items referencing a specific content object (for orphan marking) |
| `menuItems` | `by_parent_item` | `["parentItemId"]` | Find children of a specific menu item (for re-parenting on delete) |
| `menuLocations` | `by_slug` | `["slug"]` | Look up location by slug |
| `menuLocations` | `by_menu` | `["menuId"]` | Find all locations assigned to a specific menu |

### Relationships

```
menus (1) ──────< menuItems (many)
  |                   |
  |                   ├── objectId -> posts._id (when itemType = "page" or "post")
  |                   ├── objectId -> terms._id (when itemType = "category" or "tag")
  |                   ├── parentItemId -> menuItems._id (self-referencing hierarchy)
  |                   └── url (when itemType = "custom")
  |
  └──────< menuLocations (many-to-one: each location has at most one menu)
```

### Default Menu Locations

```typescript
// shared/config/menu-locations.ts

export interface MenuLocationConfig {
  slug: string;
  name: string;
  description: string;
}

export const DEFAULT_MENU_LOCATIONS: MenuLocationConfig[] = [
  {
    slug: "header",
    name: "Primary Navigation",
    description: "Main site navigation displayed in the header",
  },
  {
    slug: "footer",
    name: "Footer Navigation",
    description: "Navigation links in the site footer",
  },
  {
    slug: "sidebar",
    name: "Sidebar Navigation",
    description: "Navigation menu for sidebar widget areas",
  },
  {
    slug: "mobile",
    name: "Mobile Navigation",
    description: "Navigation menu for mobile hamburger menu (defaults to Primary if unset)",
  },
  {
    slug: "social",
    name: "Social Links Menu",
    description: "Social media icon links (detects URLs to render icons)",
  },
];
```

---

## Actions & Functions

### Action Registry

| Action | Code | Roles | Category | Triggers Event | Airtable ID |
|--------|------|-------|----------|----------------|-------------|
| Create Menu | `menu.create` | Administrator | Create | `menu.created` | `recArNKjwshl9VjmL` |
| Update Menu | `menu.update` | Administrator | Update | `menu.updated` | `recABW7Y252WwYvDZ` |
| Delete Menu | `menu.delete` | Administrator | Delete | `menu.deleted` | `recyFPkd33MddOYqG` |
| Add Menu Item | `menu.add_item` | Administrator | Create | - | `recJ9U2MqMoIxpzmY` |
| Update Menu Item | `menu.update_item` | Administrator | Update | - | `recTEnGxmg7yVlMLW` |
| Delete Menu Item | `menu.delete_item` | Administrator | Delete | - | `rech2L9KCnEwttBDw` |
| Reorder Menu Items | `menu.reorder` | Administrator | Bulk | - | `recqSJj7kWzYxhkPw` |
| Assign Menu to Location | `menu.assign_location` | Administrator | Config | `menu.location_assigned` | `recdZMHUOQWgFEy7L` |

### Mutations

#### `menu.create` - Create Menu

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `edit_theme_options` (Administrator only)
- **Args:**
  ```typescript
  {
    name: v.string(),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    autoAddPages: v.optional(v.boolean()),
  }
  ```
- **Returns:** `Id<"menus">`
- **Behavior:**
  1. Authenticate user via `ctx.auth.getUserIdentity()`
  2. Check `edit_theme_options` capability via `requireCapability()`
  3. Generate slug from name if not provided via `generateSlug()`
  4. Validate slug uniqueness via `by_slug` index
  5. Validate name is not empty (trim whitespace)
  6. Validate name uniqueness via `by_name` index
  7. Insert menu record with `itemCount: 0`, `autoAddPages: false` (default)
  8. Emit `menu.created` event with `{ menuId, name }`
- **Events:** `menu.created`
- **Errors:**
  - `"Unauthorized"` - No valid identity
  - `"Menu slug "{slug}" already exists"` - Duplicate slug
  - `"Menu name is required"` - Empty name
  - `"Menu "{name}" already exists"` - Duplicate name

#### `menu.update` - Update Menu

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `edit_theme_options` (Administrator only)
- **Args:**
  ```typescript
  {
    menuId: v.id("menus"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    description: v.optional(v.string()),
    autoAddPages: v.optional(v.boolean()),
  }
  ```
- **Returns:** `Id<"menus">`
- **Behavior:**
  1. Auth + capability check
  2. Fetch existing menu (error if not found)
  3. Validate name uniqueness if changing (exclude self)
  4. Validate slug uniqueness if changing (exclude self)
  5. Track which fields changed for event payload
  6. Build patch object with only changed fields + `updatedAt`
  7. Apply patch via `ctx.db.patch()`
  8. Emit `menu.updated` event with `{ menuId, changes[] }` (only if changes exist)
- **Events:** `menu.updated` (only when fields changed)
- **Errors:**
  - `"Menu not found"` - Invalid menuId
  - `"Menu "{name}" already exists"` - Duplicate name (other menu)
  - `"Menu slug "{slug}" already exists"` - Duplicate slug (other menu)

#### `menu.delete` - Delete Menu

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `edit_theme_options` (Administrator only)
- **Args:**
  ```typescript
  {
    menuId: v.id("menus"),
  }
  ```
- **Returns:** `Id<"menus">`
- **Behavior:**
  1. Auth + capability check
  2. Fetch menu (error if not found)
  3. **Delete all menu items** belonging to this menu (query `by_menu` index, loop delete)
  4. **Unassign from all locations** (query `menuLocations.by_menu` index, set `menuId: undefined`)
  5. Delete the menu record
  6. Emit `menu.deleted` event with `{ menuId, name }`
- **Events:** `menu.deleted`
- **Errors:**
  - `"Menu not found"` - Invalid menuId
- **Cascade:** This is a destructive operation - all items are permanently deleted, and all location assignments are cleared.

#### `menu.add_item` - Add Menu Item

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `edit_theme_options` (Administrator only)
- **Args:**
  ```typescript
  {
    menuId: v.id("menus"),
    itemType: v.union(
      v.literal("page"), v.literal("post"),
      v.literal("category"), v.literal("tag"),
      v.literal("custom")
    ),
    objectId: v.optional(v.string()),
    label: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    url: v.optional(v.string()),
    parentItemId: v.optional(v.id("menuItems")),
    position: v.optional(v.number()),
    target: v.optional(v.union(v.literal("_self"), v.literal("_blank"))),
    cssClasses: v.optional(v.string()),
    linkRel: v.optional(v.string()),
  }
  ```
- **Returns:** `Id<"menuItems">`
- **Behavior:**
  1. Auth + capability check
  2. Validate menu exists
  3. Validate item type + required fields:
     - Custom links: URL is required and non-empty
     - Content links: `objectId` is required; validate referenced object exists via `validateMenuItemObject()`
  4. Validate label is not empty
  5. Validate parent item belongs to same menu (if specified)
  6. Calculate position: if not provided, append to end of siblings
  7. Calculate depth from parent chain
  8. Enforce max depth of 5
  9. Resolve URL for content-linked items via `resolveMenuItemUrl()`
  10. Insert menu item
  11. Increment `menus.itemCount`
- **Events:** None (item-level operations do not emit events)
- **Errors:**
  - `"Menu not found"` - Invalid menuId
  - `"URL is required for custom links"` - Missing URL for custom type
  - `"Object ID is required for {itemType} menu items"` - Missing objectId for content type
  - `"Referenced {itemType} not found"` - Object does not exist
  - `"Navigation label is required"` - Empty label
  - `"Parent menu item not found"` - Invalid parentItemId
  - `"Parent menu item belongs to a different menu"` - Cross-menu parent
  - `"Maximum menu nesting depth is 5 levels"` - Depth > 5

#### `menu.update_item` - Update Menu Item

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `edit_theme_options` (Administrator only)
- **Args:**
  ```typescript
  {
    itemId: v.id("menuItems"),
    label: v.optional(v.string()),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    url: v.optional(v.string()),
    target: v.optional(v.union(v.literal("_self"), v.literal("_blank"))),
    cssClasses: v.optional(v.string()),
    linkRel: v.optional(v.string()),
  }
  ```
- **Returns:** `Id<"menuItems">`
- **Behavior:**
  1. Auth + capability check
  2. Fetch item (error if not found)
  3. Validate label not empty if provided
  4. Validate URL not empty for custom items if provided
  5. Build patch with only provided fields + `updatedAt`
  6. Apply patch
- **Events:** None
- **Note:** This mutation updates display attributes only. Position/hierarchy changes use `reorderMenuItems`.

#### `menu.delete_item` - Delete Menu Item

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `edit_theme_options` (Administrator only)
- **Args:**
  ```typescript
  {
    itemId: v.id("menuItems"),
  }
  ```
- **Returns:** `Id<"menuItems">`
- **Behavior:**
  1. Auth + capability check
  2. Fetch item (error if not found)
  3. **Re-parent children**: Find all items with `parentItemId === itemId`, set their `parentItemId` to the deleted item's `parentItemId` (or `undefined` for top-level). Recalculate `depth`.
  4. Delete the item
  5. **Re-sequence siblings**: Query siblings via `by_menu_parent`, sort by position, reassign positions 0..N to close the gap
  6. Decrement `menus.itemCount`
- **Events:** None
- **Important:** Children are re-parented, not deleted. This preserves the menu structure below the deleted item.

#### `menu.reorder` - Reorder Menu Items

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `edit_theme_options` (Administrator only)
- **Args:**
  ```typescript
  {
    menuId: v.id("menus"),
    items: v.array(
      v.object({
        itemId: v.id("menuItems"),
        parentItemId: v.optional(v.id("menuItems")),
        position: v.number(),
        depth: v.number(),
      })
    ),
  }
  ```
- **Returns:** `true`
- **Behavior:**
  1. Auth + capability check
  2. Validate menu exists
  3. Validate all items belong to this menu
  4. Validate max depth (none > 5)
  5. Apply new `parentItemId`, `position`, `depth` to every item
- **Events:** None
- **Usage:** Called after drag-and-drop operations. The client sends the complete new tree structure. Only send the final state on `dragEnd` (debounce during drag).

#### `menu.assign_location` - Assign Menu to Location

- **Type:** mutation
- **Auth:** Required
- **Capabilities:** `edit_theme_options` (Administrator only)
- **Args:**
  ```typescript
  {
    locationSlug: v.string(),
    menuId: v.optional(v.id("menus")),  // undefined = unassign
  }
  ```
- **Returns:** `Id<"menuLocations">`
- **Behavior:**
  1. Auth + capability check
  2. Find location by slug via `by_slug` index (error if not found)
  3. Validate menu exists (if assigning, not unassigning)
  4. Update location's `menuId`
  5. Emit `menu.location_assigned` event with `{ menuId, location }`
- **Events:** `menu.location_assigned`
- **Note:** A single menu can be assigned to multiple locations. Each location can have at most one menu.

### Queries

#### `listMenus` - List All Menus (Admin)

- **Type:** query
- **Auth:** Required
- **Args:** `{}`
- **Returns:** Array of menus with `assignedLocations: string[]`
- **Behavior:**
  1. Auth check
  2. Query all menus, sort by name alphabetically
  3. Query all menuLocations, build a map of menuId -> location names
  4. Return menus with their assigned location names
- **Used by:** Admin menu list page (`/admin/menus`)

#### `getMenu` - Get Menu with Items (Admin Edit)

- **Type:** query
- **Auth:** Required (implicit via admin route)
- **Args:** `{ menuId: v.id("menus") }`
- **Returns:** Menu object with `items: Doc<"menuItems">[]` and `assignedLocations: string[]`
- **Behavior:**
  1. Fetch menu by ID
  2. Query all items for this menu via `by_menu` index, sorted by position
  3. Query assigned locations via `menuLocations.by_menu` index
  4. Return combined object
- **Used by:** Admin menu editor page (`/admin/menus/$menuId/edit`)

#### `getMenuItemTree` - Get Menu Items as Tree

- **Type:** query
- **Auth:** Required (implicit)
- **Args:** `{ menuId: v.id("menus") }`
- **Returns:** `MenuItemTreeNode[]` (nested tree structure)
- **Behavior:**
  1. Query all items for menu, sort by position
  2. Build tree via `buildMenuItemTree()` helper
- **Used by:** Admin drag-and-drop builder (alternative to flat `getMenu` items)

#### `getMenuForLocation` - Get Menu for Location (Website)

- **Type:** query
- **Auth:** **Public** (no auth required)
- **Args:** `{ locationSlug: v.string() }`
- **Returns:** `{ menu: { _id, name, slug }, items: MenuItemTreeNode[] } | null`
- **Behavior:**
  1. Find location by slug
  2. Return null if no location or no assigned menu
  3. Get the assigned menu
  4. Get all items, sorted by position
  5. Filter out orphaned items (`isOrphaned !== true`)
  6. Resolve current URLs for content-linked items (handles slug changes)
  7. Build tree via `buildMenuItemTree()`
- **Used by:** Website `<SiteMenu>` component
- **Performance:** This is on the critical path for every page load. Convex caching handles most of the performance concern. URL resolution is done in parallel via `Promise.all`.

#### `getMenuLocations` - Get All Locations (Admin)

- **Type:** query
- **Auth:** Required
- **Args:** `{}`
- **Returns:** Array of locations with `menuName: string | null`
- **Behavior:**
  1. Auth check
  2. Query all menuLocations
  3. For each location with a menuId, fetch the menu name
- **Used by:** Admin locations page (`/admin/menus/locations`) and admin menu editor (location checkboxes)

#### `getLinkableContent` - Get Content for Add Items Panel

- **Type:** query
- **Auth:** Required (implicit via admin route)
- **Args:**
  ```typescript
  {
    type: v.union(v.literal("page"), v.literal("post"), v.literal("category"), v.literal("tag")),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),  // default 20
  }
  ```
- **Returns:** `Array<{ id: string, label: string, type: string, url: string }>`
- **Behavior:**
  - **Pages/Posts:** Query `posts` table by `type` + `status: "publish"`, optional search filter on title, sort pages by menuOrder then title, sort posts by publishedAt desc
  - **Categories/Tags:** Query `terms` table by taxonomy (`category` / `post_tag`), optional search filter on name, sort alphabetically
  - Slice to limit
- **Used by:** Admin "Add Menu Items" sidebar panels

### Helper Functions

Located in `ConvexPress-Admin/packages/backend/convex/helpers/menus.ts`:

#### `buildMenuItemTree(items: Doc<"menuItems">[]): MenuItemTreeNode[]`
Builds a hierarchical tree from a flat list of menu items. Two-pass algorithm:
1. First pass: create node map
2. Second pass: assign children to parents
3. Sort children by position at every level

#### `validateMenuItemObject(ctx, itemType, objectId): Promise<void>`
Validates that a referenced object exists and is valid:
- Page/Post: Checks `posts` table, verifies type matches, verifies not trashed
- Category/Tag: Checks `terms` table, verifies taxonomy matches

#### `resolveMenuItemUrl(ctx, itemType, objectId): Promise<string | undefined>`
Resolves the current URL for a content-linked item:
- Page: `page.path ?? /${page.slug}`
- Post: `/blog/${post.slug}`
- Category: `/category/${term.slug}`
- Tag: `/tag/${term.slug}`
Returns `undefined` if object is trashed/deleted.

#### `orphanMenuItemsByObject(ctx, itemType, objectId): Promise<number>`
Marks all menu items referencing a specific object as orphaned. Called by event handlers when content is deleted. Returns count of orphaned items.

#### `autoAddPageToMenus(ctx, pageId, pageTitle, pagePath): Promise<void>`
Automatically adds a page to all menus with `autoAddPages: true`. Called by the `page.published` event handler.

#### `initializeMenuLocations(ctx): Promise<void>`
Creates default menu locations from `DEFAULT_MENU_LOCATIONS` config if they don't already exist. Called during site setup/seeding.

### MenuItemTreeNode Type

```typescript
export interface MenuItemTreeNode {
  _id: Id<"menuItems">;
  menuId: Id<"menus">;
  itemType: "page" | "post" | "category" | "tag" | "custom";
  objectId?: string;
  label: string;
  title?: string;
  description?: string;
  url?: string;
  parentItemId?: Id<"menuItems">;
  position: number;
  depth: number;
  target?: "_self" | "_blank";
  cssClasses?: string;
  linkRel?: string;
  isOrphaned?: boolean;
  children: MenuItemTreeNode[];
}
```

---

## Events

### `menu.created`

- **Type:** System
- **Triggered By:** `menu.create` mutation
- **Payload:**
  ```typescript
  {
    menuId: Id<"menus">;
    name: string;
  }
  ```
- **Subscribers:**
  - Audit Log: Yes
- **Airtable ID:** `recmlqKNLjzkcdAui`

### `menu.updated`

- **Type:** System
- **Triggered By:** `menu.update` mutation (only when fields actually changed)
- **Payload:**
  ```typescript
  {
    menuId: Id<"menus">;
    changes: string[];  // Changed field names: ["name", "autoAddPages", etc.]
  }
  ```
- **Subscribers:**
  - Site Notification: "Menu Updated" - `Menu "{name}" updated` (Success type, shown to admin)
  - Audit Log: Yes
- **Airtable ID:** `reczYhgVOi4mbJ4cj`

### `menu.deleted`

- **Type:** System
- **Triggered By:** `menu.delete` mutation
- **Payload:**
  ```typescript
  {
    menuId: Id<"menus">;
    name: string;
  }
  ```
- **Subscribers:**
  - Audit Log: Yes
- **Airtable ID:** `reco4tM9cZJ6S5hzM`

### `menu.location_assigned`

- **Type:** System
- **Triggered By:** `menu.assign_location` mutation
- **Payload:**
  ```typescript
  {
    menuId: Id<"menus"> | undefined;  // undefined means unassigned
    location: string;                 // Location slug
  }
  ```
- **Subscribers:**
  - Site Notification: "Menu Location Assigned" - `Menu assigned to {location}` (Info type, shown to admin)
  - Audit Log: Yes
- **Airtable ID:** `reczfRHR8oTiRZPgD`

### Events This System Subscribes To

| Source Event | Handler | Action |
|-------------|---------|--------|
| `page.deleted` | `handlePageDeleted` | `orphanMenuItemsByObject("page", pageId)` |
| `post.deleted` | `handlePostDeleted` | `orphanMenuItemsByObject("post", postId)` |
| `taxonomy.category_deleted` | `handleCategoryDeleted` | `orphanMenuItemsByObject("category", termId)` |
| `taxonomy.tag_deleted` | `handleTagDeleted` | `orphanMenuItemsByObject("tag", termId)` |
| `page.published` | `handlePagePublished` | `autoAddPageToMenus()` if page is top-level |
| `page.updated` | `handlePageUpdated` | Update cached URL on menu items if slug/path changed |

---

## Admin Routes & UI

### All Menus (`/admin/menus`)

- **Purpose:** List all menus, create new menus, select a menu to edit
- **WordPress Equivalent:** `nav-menus.php` (Appearance > Menus)
- **Airtable Route ID:** `recBf84cXtBpwpkOa`
- **Auth:** Required, Administrator only
- **Layout:** `_admin` layout

**Header:**
- Page title: "Menus"
- Tab bar: "Edit Menus" (active) | "Manage Locations" (link to `/admin/menus/locations`)

**Menu Selector:**
- Dropdown: "Select a menu to edit" with all menus listed by name
- "or create a new menu" link
- "Select" button to navigate to `/admin/menus/$menuId/edit`

**Create Menu:**
- Shown when "create new" is clicked or no menus exist
- Input: "Menu Name" text field
- Button: "Create Menu"
- On success: navigates to `/admin/menus/$menuId/edit`

**Menu List Table:**

| Column | Width | Content |
|--------|-------|---------|
| Name | flex | Menu name (link to edit) |
| Items | 80px | Item count |
| Locations | 200px | Comma-separated location names, or "--" if unassigned |
| Date | 150px | Created date |
| Actions | 100px | Edit | Delete |

**Delete Confirmation:**
- Modal dialog: "Are you sure you want to delete the menu '{name}'? This will remove all menu items and unassign it from any locations."
- Buttons: "Delete" (destructive) | "Cancel"

**Data Requirements:**
- `useQuery(api.menus.listMenus)`

**Key Components:**
- `MenuListTable.tsx` - Menu list table
- `MenuCreateForm.tsx` - Create menu form
- `MenuDeleteDialog.tsx` - Delete confirmation modal

### Edit Menu (`/admin/menus/$menuId/edit`)

- **Purpose:** Full menu builder with drag-and-drop reordering, item management, and settings
- **WordPress Equivalent:** `nav-menus.php` with a menu selected
- **Airtable Route ID:** `rec7J3YvkSbkhB4yi`
- **Auth:** Required, Administrator only
- **Layout:** `_admin` layout, two-column (30% sidebar / 70% main)

**Left Sidebar (~30%) - Add Menu Items:**

Accordion panels, each with search and checkbox list:

- **Pages Panel:** Published pages, hierarchical, "Most Recent" / "View All" / "Search" tabs, "Select All" checkbox, "Add to Menu" button
- **Posts Panel:** Published posts, chronological (most recent first), same tab pattern
- **Custom Links Panel:** URL input + Link Text input + "Add to Menu" button
- **Categories Panel:** Hierarchical, "Most Used" / "View All" / "Search" tabs
- **Tags Panel:** Flat list, same tab pattern as Categories

**Main Area (~70%) - Menu Structure:**

- **Menu Name:** Editable text field at top
- **Save Menu:** Primary button (top right + bottom right)

- **Drag-and-Drop List:** Each item is a collapsible card:
  - **Collapsed:** Drag handle | Label | Type badge (Page/Post/Category/Custom) | Expand arrow
  - **Expanded:**
    - Navigation Label (text input)
    - Title Attribute (text input)
    - CSS Classes (text input)
    - Link Target (checkbox "Open link in a new tab")
    - Link Relationship (text input)
    - Description (textarea)
    - Original (read-only: "Page: About Us" or "Custom URL: https://...")
    - Move links: "Up one" | "Down one" | "Under [previous]" | "Out from under [parent]"
    - Remove link (red text)

- **Orphaned Items:** Yellow/warning border, badge "Original content deleted"

- **Menu Settings (bottom):**
  - Checkbox: "Automatically add new top-level pages to this menu"
  - Location checkboxes for each registered location, with "(Current: {menu name})" note for locations assigned to other menus

- **Delete Menu:** Destructive text link, bottom left

**Data Requirements:**
- `useQuery(api.menus.getMenu, { menuId })`
- `useQuery(api.menus.getMenuLocations)`
- `useQuery(api.menus.getLinkableContent, { type: "page" })`
- `useQuery(api.menus.getLinkableContent, { type: "post" })`
- `useQuery(api.menus.getLinkableContent, { type: "category" })`
- `useQuery(api.menus.getLinkableContent, { type: "tag" })`

**Key Components:**
- `MenuBuilder.tsx` - Main 2-column layout
- `MenuItemList.tsx` - Drag-and-drop sortable list
- `MenuItemCard.tsx` - Individual item (collapsed/expanded)
- `MenuItemEditor.tsx` - Expanded item edit form
- `MenuAddItemsPanel.tsx` - Left sidebar wrapper
- `MenuAddPagesPanel.tsx`, `MenuAddPostsPanel.tsx`, `MenuAddCustomLinkPanel.tsx`, `MenuAddCategoriesPanel.tsx`, `MenuAddTagsPanel.tsx` - Individual add panels
- `MenuSettingsPanel.tsx` - Auto-add pages + location checkboxes
- `MenuOrphanedBadge.tsx` - Warning badge for orphaned items

**Real-Time:** All queries are reactive via Convex subscriptions. Changes from another admin session appear instantly.

### Menu Locations (`/admin/menus/locations`)

- **Purpose:** Manage which menu is assigned to each theme location
- **WordPress Equivalent:** `nav-menus.php?action=locations` (Manage Locations tab)
- **Airtable Route ID:** `reco9QYk3JcDKAsjU`
- **Auth:** Required, Administrator only
- **Layout:** `_admin` layout

**Header:**
- Page title: "Menu Locations"
- Tab bar: "Edit Menus" (link to `/admin/menus`) | "Manage Locations" (active)
- Description: "Your theme supports {N} menus. Select which menu appears in each location."

**Locations Table:**

| Column | Width | Content |
|--------|-------|---------|
| Theme Location | 200px | Location name |
| Description | flex | Location description |
| Assigned Menu | 250px | Dropdown selector of all menus + "(No menu)" option |

**Actions:**
- "Save Changes" button at bottom
- Calls `assignMenuToLocation` for each changed location

**Data Requirements:**
- `useQuery(api.menus.getMenuLocations)`
- `useQuery(api.menus.listMenus)` (for dropdown options)

**Key Components:**
- `MenuLocationTable.tsx` - Location assignment table

---

## Website Routes

### Menu Rendering (All Pages)

Menus are rendered as part of the site layout, not as standalone routes. They appear in the header, footer, sidebar, and mobile overlay on every page.

**Primary Component:** `<SiteMenu location="header" />`

```typescript
interface SiteMenuProps {
  location: string;           // Location slug ("header", "footer", etc.)
  className?: string;         // Additional CSS classes
  itemClassName?: string;     // CSS class for each item
  maxDepth?: number;          // Max nesting to render (default: unlimited)
  showDescriptions?: boolean; // Show item descriptions (mega menu style)
}
```

**Data Requirements:**
- `useQuery(api.menus.getMenuForLocation, { locationSlug: location })`

**Rendering Variants:**
- **Header:** Horizontal nav with dropdown sub-menus on hover/click, active state on current page, collapses to mobile at breakpoint
- **Footer:** Horizontal or multi-column link list, typically flat
- **Mobile:** Slide-in/overlay triggered by hamburger, accordion sub-menus for nesting, falls back to header menu if unassigned
- **Sidebar:** Vertical list with indented sub-items, collapsible sections
- **Social:** Row of social media icons, icon detected from URL domain via `SOCIAL_PATTERNS`

**Active State Detection:**
```typescript
function isMenuItemActive(item: MenuItemTreeNode, currentPath: string): boolean {
  if (!item.url) return false;
  if (item.url === currentPath) return true;                    // Exact match
  if (currentPath.startsWith(item.url + "/")) return true;      // Ancestor match
  return false;
}
```

**Accessibility (WAI-ARIA):**
- `<nav>` element with `aria-label` set to menu name
- `<ul>` / `<li>` for list structure
- `aria-expanded` and `aria-haspopup="true"` on dropdown parents
- `aria-current="page"` on current page item
- Keyboard: Tab between top-level, Enter/Space to open dropdowns, Escape to close
- Mobile: Focus trap when open, `aria-hidden` when closed

**Social Links Menu:**

```typescript
// shared/config/social-patterns.ts
const SOCIAL_PATTERNS: Record<string, string> = {
  "facebook.com": "facebook",
  "twitter.com": "twitter",
  "x.com": "twitter",
  "instagram.com": "instagram",
  "linkedin.com": "linkedin",
  "youtube.com": "youtube",
  "github.com": "github",
  "tiktok.com": "tiktok",
  "pinterest.com": "pinterest",
  "mastodon": "mastodon",
  "threads.net": "threads",
};
```

---

## Notifications

### Email Notifications

The Menu System has **no email notifications**. This is consistent with WordPress - menu management is an admin-only activity that does not warrant email notifications.

### Site Notifications

| Name | Event | Type | Recipient | Message Template | Airtable ID |
|------|-------|------|-----------|-----------------|-------------|
| Menu Updated | `menu.updated` | Success | Admin (actor) | `Menu "{name}" updated` | `reck2W00TbLBUtT7Y` |
| Menu Location Assigned | `menu.location_assigned` | Info | Admin (actor) | `Menu assigned to {location}` | `rec99Voulc9241yXl` |

Site notifications appear as toast messages for the acting admin and in the notification feed for other logged-in administrators.

---

## Role & Capability Matrix

### Action-Role Matrix

| Action | Administrator | Editor | Author | Contributor | Subscriber |
|--------|:---:|:---:|:---:|:---:|:---:|
| `menu.create` | Yes | - | - | - | - |
| `menu.update` | Yes | - | - | - | - |
| `menu.delete` | Yes | - | - | - | - |
| `menu.add_item` | Yes | - | - | - | - |
| `menu.update_item` | Yes | - | - | - | - |
| `menu.delete_item` | Yes | - | - | - | - |
| `menu.reorder` | Yes | - | - | - | - |
| `menu.assign_location` | Yes | - | - | - | - |

### Route Access Matrix

| Route | Administrator | Editor | Author | Contributor | Subscriber | Public |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|
| `/admin/menus` | Yes | - | - | - | - | - |
| `/admin/menus/$menuId/edit` | Yes | - | - | - | - | - |
| `/admin/menus/locations` | Yes | - | - | - | - | - |
| Website menu rendering | Yes | Yes | Yes | Yes | Yes | Yes |

**Key Distinction:** Menu management is exclusively an Administrator function. The capability is `edit_theme_options`, which in WordPress is granted only to Administrators. Editors cannot manage menus.

---

## Dependencies

### Depends On

| System | Type | What Is Needed |
|--------|------|----------------|
| **Page System** | **Hard** | Pages are the primary content type for menu items. Page hierarchy (parentId), slugs, and paths determine menu item URLs. Menu System subscribes to `page.deleted`, `page.published`, `page.updated` events. Uses `posts` table with `by_type_status` index. |
| **Auth System** | **Hard** | auth identity for `createdBy` field and `ctx.auth.getUserIdentity()` for all mutations. |
| **Role & Capability System** | **Hard** | `requireCapability(ctx, identity, "edit_theme_options")` for all menu actions. Without this system, no capability checking is possible. |
| **Post System** | **Medium** | Posts can be added as menu items. Menu System subscribes to `post.deleted` event for orphan marking. Uses `posts` table. |
| **Taxonomy System** | **Medium** | Categories and tags can be added as menu items. Menu System subscribes to `taxonomy.category_deleted` and `taxonomy.tag_deleted` events. Uses `terms` table with `by_taxonomy` index. |
| **Event Dispatcher System** | **Medium** | All events are emitted through the dispatcher via `emitEvent()`. Menu System subscribes to content deletion events through the dispatcher. |
| **Slug Utility** | **Soft** | `generateSlug()` shared utility for generating URL-safe slugs from menu names. |

### Depended On By

| System | Type | What They Need |
|--------|------|----------------|

---

## Implementation Checklist

### Backend (`ConvexPress-Admin/packages/backend/`)

- [ ] `convex/schema.ts` - Add `menus`, `menuItems`, `menuLocations` table definitions (3 tables)
- [ ] `convex/menus.ts` - All mutations and queries:
  - [ ] `createMenu` mutation
  - [ ] `updateMenu` mutation
  - [ ] `deleteMenu` mutation
  - [ ] `addMenuItem` mutation
  - [ ] `updateMenuItem` mutation
  - [ ] `deleteMenuItem` mutation
  - [ ] `reorderMenuItems` mutation
  - [ ] `assignMenuToLocation` mutation
  - [ ] `listMenus` query
  - [ ] `getMenu` query
  - [ ] `getMenuItemTree` query
  - [ ] `getMenuForLocation` query (public)
  - [ ] `getMenuLocations` query
  - [ ] `getLinkableContent` query
- [ ] `convex/helpers/menus.ts` - Helper functions:
  - [ ] `buildMenuItemTree()`
  - [ ] `validateMenuItemObject()`
  - [ ] `resolveMenuItemUrl()`
  - [ ] `orphanMenuItemsByObject()`
  - [ ] `autoAddPageToMenus()`
  - [ ] `initializeMenuLocations()`
- [ ] `convex/types/events.ts` - Event payload types (add menu event types)
- [ ] Event subscriber registrations for `page.deleted`, `post.deleted`, `taxonomy.category_deleted`, `taxonomy.tag_deleted`, `page.published`, `page.updated`

### Admin Frontend (`ConvexPress-Admin/apps/web/`)

- [ ] `src/routes/admin/menus/index.tsx` - All Menus list + create
- [ ] `src/routes/admin/menus/locations.tsx` - Menu Locations management
- [ ] `src/routes/admin/menus/$menuId/edit.tsx` - Edit Menu (full builder)
- [ ] `src/components/menus/MenuListTable.tsx` - Menu list table
- [ ] `src/components/menus/MenuCreateForm.tsx` - Create menu form
- [ ] `src/components/menus/MenuBuilder.tsx` - Main 2-column builder layout
- [ ] `src/components/menus/MenuItemList.tsx` - Drag-and-drop sortable item list
- [ ] `src/components/menus/MenuItemCard.tsx` - Individual menu item card
- [ ] `src/components/menus/MenuItemEditor.tsx` - Expanded item edit form
- [ ] `src/components/menus/MenuAddItemsPanel.tsx` - Left sidebar wrapper
- [ ] `src/components/menus/MenuAddPagesPanel.tsx` - Pages accordion panel
- [ ] `src/components/menus/MenuAddPostsPanel.tsx` - Posts accordion panel
- [ ] `src/components/menus/MenuAddCustomLinkPanel.tsx` - Custom link form
- [ ] `src/components/menus/MenuAddCategoriesPanel.tsx` - Categories accordion
- [ ] `src/components/menus/MenuAddTagsPanel.tsx` - Tags accordion
- [ ] `src/components/menus/MenuSettingsPanel.tsx` - Auto-add pages + location checkboxes
- [ ] `src/components/menus/MenuLocationTable.tsx` - Location assignment table
- [ ] `src/components/menus/MenuOrphanedBadge.tsx` - Orphaned item warning badge
- [ ] `src/components/menus/MenuDeleteDialog.tsx` - Delete confirmation modal
- [ ] `src/hooks/menus/useMenus.ts` - List menus query hook
- [ ] `src/hooks/menus/useMenu.ts` - Single menu query hook
- [ ] `src/hooks/menus/useMenuLocations.ts` - Locations query hook
- [ ] `src/hooks/menus/useLinkableContent.ts` - Linkable content query hook
- [ ] `src/hooks/menus/useCreateMenu.ts` - Create mutation hook
- [ ] `src/hooks/menus/useUpdateMenu.ts` - Update mutation hook
- [ ] `src/hooks/menus/useDeleteMenu.ts` - Delete mutation hook
- [ ] `src/hooks/menus/useAddMenuItem.ts` - Add item mutation hook
- [ ] `src/hooks/menus/useUpdateMenuItem.ts` - Update item mutation hook
- [ ] `src/hooks/menus/useDeleteMenuItem.ts` - Delete item mutation hook
- [ ] `src/hooks/menus/useReorderMenuItems.ts` - Reorder mutation hook
- [ ] `src/hooks/menus/useAssignMenuToLocation.ts` - Assign location mutation hook

### Website Frontend (`ConvexPress-Website/apps/web/`)

- [ ] `src/components/menus/SiteMenu.tsx` - Main menu component (by location)
- [ ] `src/components/menus/MenuItemList.tsx` - Recursive menu item renderer
- [ ] `src/components/menus/MenuItem.tsx` - Single menu item link
- [ ] `src/components/menus/DropdownMenu.tsx` - Desktop dropdown sub-menu
- [ ] `src/components/menus/MobileMenu.tsx` - Mobile hamburger menu overlay
- [ ] `src/components/menus/MobileMenuToggle.tsx` - Hamburger button
- [ ] `src/components/menus/MobileMenuItem.tsx` - Mobile accordion menu item
- [ ] `src/components/menus/SocialLinksMenu.tsx` - Social icons menu variant
- [ ] `src/components/menus/SocialIcon.tsx` - Individual social platform icon
- [ ] `src/hooks/menus/useMenuForLocation.ts` - Website menu query hook

### Shared Configuration

- [ ] `shared/config/menu-locations.ts` - DEFAULT_MENU_LOCATIONS registry
- [ ] `shared/config/social-patterns.ts` - SOCIAL_PATTERNS URL-to-platform mapping

---

## Edge Cases & Gotchas

1. **Circular parent references:** When setting `parentItemId`, you must validate that walking up the parent chain does not reach the current item. A menu item cannot be its own ancestor.

2. **Cross-menu parenting:** A menu item's `parentItemId` must reference an item in the same menu. The `by_menu_parent` index helps enforce this, but validation must explicitly check `parentItem.menuId === args.menuId`.

3. **Depth limit enforcement:** Maximum nesting depth is 5 levels. When items are moved via drag-and-drop, the client must enforce this limit visually and the server must reject depths > 5.

4. **Delete re-parenting:** When a menu item is deleted, its children are re-parented to the deleted item's parent (or made top-level). This preserves the menu structure below. Do NOT cascade-delete children.

5. **Position gap closing:** When a menu item is deleted, the remaining siblings' positions must be re-sequenced (0, 1, 2...) to close the gap. Failure to do this can result in broken sort ordering.

6. **Orphan marking, not deletion:** When linked content (page/post/category/tag) is deleted, menu items referencing it are marked `isOrphaned: true`, NOT deleted. This matches WordPress behavior where menu items become "broken" but remain in the admin for the user to fix.

7. **URL resolution at query time:** Content-linked menu items store the URL at creation, but the `getMenuForLocation` query resolves URLs fresh from the current content slugs. This handles the case where a page's slug changes after being added to a menu.

8. **Auto-add pages edge cases:**
   - Only fires for initial publish, not re-publish after unpublish
   - Only adds top-level pages (pages with no parent)
   - Must check for existing menu items referencing the same objectId to avoid duplicates

9. **Social links menu:** The "social" location renders icons instead of text links. Icon detection is URL-based (e.g., "facebook.com" -> Facebook icon). If a URL doesn't match any pattern, it falls back to a generic link icon.

10. **Empty menus at locations:** If a location has no assigned menu (or the assigned menu has no items), the website component should render nothing (`return null`), not an empty nav element.

11. **Menu item count cache:** The `menus.itemCount` field is a denormalized cache. It must be incremented on `addMenuItem` and decremented on `deleteMenuItem`. If it drifts out of sync, the admin list shows incorrect counts. Consider a periodic reconciliation.

12. **Convex `v.optional` and `undefined`:** When unassigning a menu from a location, set `menuId` to `undefined`, not `null`. Convex treats these differently. The schema uses `v.optional(v.id("menus"))` which accepts `undefined` but not `null`.

13. **Drag-and-drop performance:** For menus with many items (50+), debounce the `reorderMenuItems` mutation. Only send the final state on `dragEnd`, not during drag. Recommended library: `@dnd-kit/core` + `@dnd-kit/sortable`.

14. **Mobile menu fallback:** When the "mobile" location has no menu assigned, the website should fall back to rendering the "header" location's menu instead.

15. **Slug generation collisions:** When auto-generating a slug from the menu name, handle collisions by appending `-2`, `-3`, etc. The `by_slug` index enforces uniqueness, but the create mutation must handle the retry logic.

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `register_nav_menus()` | `DEFAULT_MENU_LOCATIONS` config + `initializeMenuLocations()` | Theme registers locations via config, stored in DB |
| `wp_nav_menu()` | `<SiteMenu location="header" />` | React component renders menu by location |
| `wp_get_nav_menus()` | `listMenus` query | Returns all menus with location assignments |
| `wp_get_nav_menu_items()` | `getMenu` / `getMenuItemTree` query | Returns items for a menu, optionally as tree |
| `wp_create_nav_menu()` | `createMenu` mutation | Validates name/slug uniqueness |
| `wp_update_nav_menu()` | `updateMenu` mutation | Partial updates with change tracking |
| `wp_delete_nav_menu()` | `deleteMenu` mutation | Cascade deletes items + unassigns locations |
| `wp_update_nav_menu_item()` | `addMenuItem` / `updateMenuItem` mutation | Split into separate add and update operations |
| `wp_set_nav_menu_locations()` | `assignMenuToLocation` mutation | One location at a time |
| `wp_get_nav_menu_locations()` | `getMenuLocations` query | Returns all locations with menu names |
| `has_nav_menu()` | `getMenuForLocation` query (returns null if unset) | Returns null if no menu assigned to location |
| `Walker_Nav_Menu` | `buildMenuItemTree()` + `MenuItemList` component | Tree building + recursive React rendering |
| `wp_nav_menu_items` filter | N/A (modify component props) | No filter hooks; customize via component props |
| `wp_setup_nav_menu_item` filter | `resolveMenuItemUrl()` | URL resolution at query time |
| `wp_update_nav_menu` action | `menu.updated` event | Emitted via Event Dispatcher |
| `wp_create_nav_menu` action | `menu.created` event | Emitted via Event Dispatcher |
| `wp_delete_nav_menu` action | `menu.deleted` event | Emitted via Event Dispatcher |

---

## Business Rules Summary

1. Menu name uniqueness is enforced across all menus.
2. Menu slug uniqueness is enforced across all menus.
3. No circular item hierarchy - walking up from a potential parent must never reach the current item.
4. No self-parenting - a menu item cannot be its own parent.
5. Same-menu parenting - a menu item's parent must belong to the same menu.
6. Depth limit - maximum 5 levels of nesting.
7. Custom link URL required - custom link items must have a non-empty URL.
8. Content link validation - page/post/category/tag items must reference an existing, non-trashed object.
9. Location uniqueness - each location has at most one menu. A menu can be at multiple locations.
10. Delete cascading - deleting a menu deletes all its items and unassigns all its locations.
11. Orphan preservation - deleting linked content marks items as orphaned, not deleted.
12. Admin-only access - all menu management requires `edit_theme_options` capability (Administrator only).
