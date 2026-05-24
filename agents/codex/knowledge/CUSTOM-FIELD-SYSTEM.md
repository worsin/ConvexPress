# Custom Field System - Expert Knowledge Document

**System:** Custom Field System
**Status:** Complete (100%)
**Priority:** P2 - Medium
**WordPress Equivalent:** Advanced Custom Fields (ACF) Plugin + Native `wp_postmeta` Custom Fields
**Category:** Content & Marketing
**Layer:** Full Stack
**Complexity:** Complex
**Last Analyzed:** 2026-02-13

---

## Quick Reference

### What This System Does

The Custom Field System is ConvexPress's built-in equivalent of WordPress's Advanced Custom Fields (ACF) plugin. It provides a type-safe, visual field management system that lets administrators define structured metadata for posts, pages, and any future content types without writing code. Fields are organized into **Field Groups** (collections of related fields) that are conditionally attached to content via **Location Rules** (e.g., "show on all posts" or "show on pages with template 'sidebar'").

Unlike WordPress, which has a raw `wp_postmeta` key-value store plus ACF as a separate plugin, ConvexPress merges both concepts into a single first-class system: the `postMeta` table stores field values, and two new tables (`fieldGroups` and `fieldDefinitions`) store the field schema.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Field Group** | A named collection of related field definitions. Attached to content via location rules. Equivalent to an ACF Field Group. |
| **Field Definition** | The schema for a single custom field within a group: type, label, name, validation rules, settings. Equivalent to an ACF Field. |
| **Field Value** | The actual data stored for a field on a specific entity. Stored in `fieldValues` table (and denormalized to `postMeta` for posts/pages). |
| **Location Rules** | Boolean logic (OR groups of AND conditions) that determines which editor screens display a field group. |
| **Conditional Logic** | Client-side show/hide rules on individual fields based on sibling field values. |
| **Metabox** | The visual container rendered on the content editor for each matching field group. Positioned: normal, side, or after_title. |
| **Compound Fields** | Fields that contain sub-fields: `group` (single row), `repeater` (multiple rows), `flexible_content` (multiple layout types). |
| **Layout Fields** | Fields that produce no stored value but organize the UI: `message`, `accordion`, `tab`. |

### ConvexPress vs WordPress

| Aspect | WordPress (ACF) | ConvexPress |
|--------|-----------------|-------------|
| **Storage** | `wp_postmeta` (serialized PHP) + `wp_posts` (ACF field groups as CPT) | Convex `postMeta` (values) + `fieldGroups` + `fieldDefinitions` (schema) |
| **Schema Enforcement** | No schema enforcement; raw strings in DB | Type-safe Convex validators; values validated before write |
| **Reactivity** | Page refresh to see changes | Real-time Convex subscriptions; field groups update live |
| **Field Groups** | Stored as custom post type `acf-field-group` | Dedicated `fieldGroups` table with proper schema |
| **Field Definitions** | Stored as `acf-field` post type, parent = group | Dedicated `fieldDefinitions` table linked to group |
| **Location Rules** | PHP array serialized in `post_content` | Structured JSON in `fieldGroups.locationRules` |
| **API** | `get_field()`, `update_field()`, PHP-only | Convex queries/mutations, type-safe TypeScript, reactive |
| **Repeater Fields** | Pro-only ACF feature ($$$) | Built-in, first-class support |
| **Conditional Logic** | Client-side show/hide via jQuery | Client-side show/hide via React state |
| **Export/Import** | JSON/PHP export from ACF UI | Native Convex backup; JSON export mutation |
| **Auth** | `manage_options` capability (PHP) | `manage_custom_fields` capability via Convex Auth + Role & Capability System |

---

## Architecture Overview

### Data Flow

1. **Admin creates Field Group**: Administrator uses the field group builder UI at `/admin/custom-fields/$groupId/edit` to define groups and fields.
2. **Location Rules evaluated**: When a user opens the post/page editor, the admin app fetches all active field groups, builds a `LocationContext`, and evaluates each group's location rules to determine which groups appear.
3. **Metaboxes rendered**: Matching field groups render as metaboxes in their configured position. Field values are loaded and pre-populated.
4. **Values saved**: When the user saves the post/page, dirty field values are batch-saved via `customFields.setValues`. Values are written to both `fieldValues` (source of truth) and `postMeta` (backward compat for posts/pages).
5. **Events emitted**: Group CRUD operations emit events for audit logging and admin toasts.
6. **Website reads values**: The website app uses SSR helper functions (`getField`, `getFields`) to read typed field values for rendering.

### Real-Time Behavior

- **Field Group List** (`/admin/custom-fields`): Subscribes to `customFields.listGroups` query. When another admin creates, deletes, or reorders groups, the list updates in real-time.
- **Field Group Builder** (`/admin/custom-fields/$groupId/edit`): Subscribes to `customFields.getGroup` and `customFields.getFieldsForGroup`. Live updates if another admin edits the same group (conflict resolution is last-write-wins).
- **Content Editor**: Subscribes to `customFields.getGroupsForContext` for location rule evaluation. When the user changes post type, template, or categories, field groups show/hide reactively. Field values load via `customFields.getAllValues`.
- **Website**: Uses `fetchQuery` for SSR (not subscriptions). No real-time needed for public pages.

### Authentication & Authorization

- **auth identity** required for all mutations and most queries.
- **Capability checks** use the Role & Capability System's `currentUserCan()` function.
- **Anonymous read access** allowed for published content field values (public website SSR).
- Three custom capabilities introduced by this system:
  - `manage_custom_fields` - Administrator only - Full CRUD on field groups and definitions
  - `edit_custom_field_values` - Admin, Editor, Author (own) - Set field values on editable content
  - `read_custom_field_values` - All roles + anonymous for public content - Read field values

---

## Database Schema

### `fieldGroups` Table

Stores the definition of each field group (equivalent to ACF's `acf-field-group` custom post type).

```typescript
fieldGroups: defineTable({
  // --- Identity ---
  title: v.string(),                                    // Display name (e.g., "Hero Section Fields")
  key: v.string(),                                      // Unique slug/key (e.g., "hero_section_fields")
  description: v.optional(v.string()),                  // Admin-facing description of this group's purpose

  // --- Location Rules ---
  locationRules: v.array(v.array(v.object({              // OR groups of AND conditions
    param: v.string(),                                   // e.g., "post_type", "page_template", "user_role"
    operator: v.union(v.literal("=="), v.literal("!=")),
    value: v.string(),                                   // e.g., "post", "page", "sidebar", "administrator"
  }))),

  // --- Presentation ---
  position: v.union(
    v.literal("normal"),       // Below the content editor
    v.literal("side"),         // In the sidebar
    v.literal("after_title"),  // Between title and content editor
  ),
  style: v.union(
    v.literal("default"),      // Standard metabox with border and header
    v.literal("seamless"),     // No metabox chrome, blends into page
  ),
  labelPlacement: v.union(
    v.literal("top"),          // Label above input (default)
    v.literal("left"),         // Label to left of input (horizontal layout)
  ),
  instructionPlacement: v.union(
    v.literal("label"),        // Below the label, above the input
    v.literal("field"),        // Below the input
  ),

  // --- State ---
  isActive: v.boolean(),                                 // Whether this group is enabled
  menuOrder: v.number(),                                 // Sort order (lower = higher priority)

  // --- Metadata ---
  createdBy: v.string(),                                 // user identifier of creator
  createdAt: v.number(),                                 // Creation timestamp (ms)
  updatedAt: v.number(),                                 // Last modification timestamp (ms)
})
  .index("by_key", ["key"])                              // Lookup by unique key
  .index("by_active", ["isActive", "menuOrder"])         // Active groups sorted by order
  .index("by_order", ["menuOrder"])                      // All groups sorted by order
  .index("by_created", ["createdAt"])                    // Recently created
```

**Field Validations:**

| Field | Validation |
|-------|------------|
| `title` | 1-200 chars. Trimmed whitespace. Required. |
| `key` | Lowercase, alphanumeric + underscores. Max 100 chars. Unique across all groups. Auto-generated from title if not provided. |
| `description` | Max 1000 chars. Optional. |
| `locationRules` | At least one rule group with at least one condition. Each condition needs valid param/operator/value. |
| `position` | One of: `normal`, `side`, `after_title`. Default: `normal`. |
| `style` | One of: `default`, `seamless`. Default: `default`. |
| `labelPlacement` | One of: `top`, `left`. Default: `top`. |
| `instructionPlacement` | One of: `label`, `field`. Default: `label`. |
| `isActive` | Boolean. Default: `true`. |
| `menuOrder` | Non-negative integer. Default: `0`. |
| `createdBy` | Valid user identifier. Set on creation, immutable. |
| `createdAt` | Timestamp. Set on creation, immutable. |
| `updatedAt` | Timestamp. Updated on every mutation. |

### `fieldDefinitions` Table

Stores the schema for each individual field within a field group. Supports recursive nesting for compound fields.

```typescript
fieldDefinitions: defineTable({
  // --- Identity ---
  groupId: v.id("fieldGroups"),                          // Parent field group
  label: v.string(),                                     // Display label (e.g., "Hero Image")
  name: v.string(),                                      // Field name/slug (e.g., "hero_image") - used as meta_key
  key: v.string(),                                       // Unique field key (e.g., "field_hero_image_abc123")
  type: v.string(),                                      // Field type (see Supported Field Types section)
  instructions: v.optional(v.string()),                  // Help text shown below label or below input

  // --- Validation ---
  required: v.boolean(),                                 // Whether field must have a value
  defaultValue: v.optional(v.string()),                  // Default value (JSON-encoded for complex types)

  // --- Type-Specific Settings ---
  settings: v.string(),                                  // JSON-encoded type-specific settings

  // --- Conditional Logic ---
  conditionalLogic: v.optional(v.string()),              // JSON-encoded conditional display rules

  // --- Wrapper (Layout) ---
  wrapperWidth: v.optional(v.string()),                  // CSS width (e.g., "50%", "33.33%")
  wrapperClass: v.optional(v.string()),                  // Additional CSS class
  wrapperId: v.optional(v.string()),                     // CSS ID

  // --- Ordering ---
  menuOrder: v.number(),                                 // Sort order within parent group

  // --- Sub-fields (for group, repeater, flexible_content) ---
  parentFieldId: v.optional(v.id("fieldDefinitions")),   // Parent field for nested sub-fields

  // --- Timestamps ---
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_group", ["groupId", "menuOrder"])           // All fields in a group, sorted
  .index("by_parent", ["parentFieldId", "menuOrder"])    // Sub-fields of a parent field, sorted
  .index("by_key", ["key"])                              // Lookup by unique field key
  .index("by_name", ["name"])                            // Lookup by field name/slug
  .index("by_group_name", ["groupId", "name"])           // Unique name within group
```

**Field Validations:**

| Field | Validation |
|-------|------------|
| `groupId` | Must reference existing field group. Required. |
| `label` | 1-200 chars. Trimmed whitespace. Required. |
| `name` | Lowercase, alphanumeric + underscores. Max 100 chars. Unique within group. Auto-generated from label. |
| `key` | Format: `field_{name}_{random6}`. Globally unique. Auto-generated. |
| `type` | Must be one of the 30+ supported field type slugs. Required. |
| `instructions` | Max 500 chars. Optional. |
| `required` | Boolean. Default: `false`. |
| `defaultValue` | JSON-encoded. Must be valid for the field type. Optional. |
| `settings` | Valid JSON. Structure validated per field type. Default: `"{}"`. Required. |
| `conditionalLogic` | Valid JSON matching conditional logic schema. Optional. |
| `wrapperWidth` | Valid CSS width (e.g., "50%", "100%"). Optional. |
| `menuOrder` | Non-negative integer. Default: `0`. |
| `parentFieldId` | Must reference a group, repeater, or flexible_content field in the same group. Optional. |

### `fieldValues` Table

Stores the actual field values for any entity type. Source of truth for field data.

```typescript
fieldValues: defineTable({
  // --- Target ---
  entityType: v.string(),                                // "post", "page", "user", "term", etc.
  entityId: v.string(),                                  // The ID of the target record

  // --- Field Reference ---
  fieldKey: v.string(),                                  // References fieldDefinitions.key
  fieldName: v.string(),                                 // References fieldDefinitions.name (denormalized)

  // --- Value ---
  value: v.string(),                                     // JSON-encoded value (type depends on field type)

  // --- Metadata ---
  updatedBy: v.string(),                                 // user identifier of last editor
  updatedAt: v.number(),                                 // Last modification timestamp
})
  .index("by_entity", ["entityType", "entityId"])        // All values for an entity
  .index("by_entity_field", ["entityType", "entityId", "fieldKey"])  // Specific value
  .index("by_field_key", ["fieldKey"])                    // All values for a field definition
```

**Value Encoding Reference:**

| Field Type | Encoding |
|------------|----------|
| `text`, `textarea`, `email`, `url`, `password` | Raw string |
| `number`, `range` | JSON number as string (e.g., `"42"`) |
| `true_false` | `"true"` or `"false"` |
| `select`, `radio`, `button_group` | Selected value string |
| `checkbox` | JSON array of selected values |
| `image`, `file` | Media ID string |
| `gallery` | JSON array of media IDs |
| `date_picker` | `"YYYY-MM-DD"` |
| `date_time_picker` | `"YYYY-MM-DD HH:mm:ss"` |
| `time_picker` | `"HH:mm:ss"` |
| `color_picker` | `"#hex"` or `"rgba(...)"` |
| `link` | JSON `{ url, title, target }` |
| `post_object`, `page_link`, `user`, `taxonomy` | ID string or JSON array of IDs |
| `relationship` | JSON array of post IDs |
| `group` | JSON object of `{ fieldName: value }` |
| `repeater` | JSON array of row objects |
| `flexible_content` | JSON array of `{ acf_fc_layout, ...fields }` |
| `oembed` | URL string |
| `google_map` | JSON `{ lat, lng, address, city, state, country, zoom }` |

### Indexes

| Index | Table | Purpose |
|-------|-------|---------|
| `by_key` | `fieldGroups` | Look up a group by its unique key slug |
| `by_active` | `fieldGroups` | Fetch all active groups sorted by display order (primary query for editor integration) |
| `by_order` | `fieldGroups` | Fetch all groups sorted by order (admin list page) |
| `by_created` | `fieldGroups` | Sort groups by creation date |
| `by_group` | `fieldDefinitions` | Get all fields in a group, sorted by menuOrder |
| `by_parent` | `fieldDefinitions` | Get sub-fields of a compound field (repeater, group, flexible_content) |
| `by_key` | `fieldDefinitions` | Look up a field by its unique key |
| `by_name` | `fieldDefinitions` | Look up a field by its name slug |
| `by_group_name` | `fieldDefinitions` | Enforce unique name within a group |
| `by_entity` | `fieldValues` | Get all field values for a given entity |
| `by_entity_field` | `fieldValues` | Get a specific field value for an entity (upsert target) |
| `by_field_key` | `fieldValues` | Get all stored values for a field definition (used for cascade delete) |

### Relationships

| This Table | Related Table | Relationship | Notes |
|------------|---------------|-------------|-------|
| `fieldDefinitions.groupId` | `fieldGroups._id` | Many-to-One | Each field belongs to exactly one group |
| `fieldDefinitions.parentFieldId` | `fieldDefinitions._id` | Self-referencing Many-to-One | Sub-fields of compound fields |
| `fieldValues.fieldKey` | `fieldDefinitions.key` | Many-to-One (denormalized) | Value references field definition |
| `fieldValues` (post/page) | `postMeta` (Post System) | Denormalized copy | Values mirrored to postMeta for backward compat |
| `fieldValues.entityId` | `posts._id` / `pages._id` / etc. | Polymorphic | Entity type determines which table |

### Interaction with `postMeta` Table (Post System)

The Post System's existing `postMeta` table:

```typescript
postMeta: defineTable({
  postId: v.id("posts"),
  key: v.string(),
  value: v.string(),
})
  .index("by_post", ["postId"])
  .index("by_post_key", ["postId", "key"])
  .index("by_key", ["key"])
```

**Dual-write strategy:** For posts and pages, field values are written to BOTH `fieldValues` (source of truth with typed metadata) AND `postMeta` (for simple key-value lookups and backward compatibility). The `fieldValues` table is authoritative; `postMeta` is a denormalized copy.

For entity types beyond posts (users, terms), only `fieldValues` is used.

---

## Supported Field Types

### Basic Fields (7 types)

| Slug | Label | Settings | Value |
|------|-------|----------|-------|
| `text` | Text | `{ placeholder?, maxLength?, prepend?, append? }` | Raw string |
| `textarea` | Textarea | `{ placeholder?, maxLength?, rows?, newLines?: "br"\|"wpautop" }` | Raw string |
| `number` | Number | `{ placeholder?, min?, max?, step?, prepend?, append? }` | JSON number string |
| `range` | Range | `{ min, max, step }` | JSON number string |
| `email` | Email | `{ placeholder? }` | Validated email string |
| `url` | URL | `{ placeholder? }` | Validated URL string |
| `password` | Password | `{ placeholder? }` | String |

### Content Fields (5 types)

| Slug | Label | Settings | Value |
|------|-------|----------|-------|
| `image` | Image | `{ returnFormat: "id"\|"url"\|"object", previewSize: "thumbnail"\|"medium"\|"large"\|"full", library: "all"\|"uploadedTo" }` | Media ID string |
| `file` | File | `{ returnFormat: "id"\|"url"\|"object", library: "all"\|"uploadedTo", mimeTypes? }` | Media ID string |
| `wysiwyg` | WYSIWYG Editor | `{ tabs: "all"\|"visual"\|"text", toolbar: "full"\|"basic", mediaUpload: boolean }` | HTML string |
| `oembed` | oEmbed | `{ width?, height? }` | URL string |
| `gallery` | Gallery | `{ returnFormat: "id"\|"url"\|"object", previewSize, library, minImages?, maxImages? }` | JSON array of media IDs |

### Choice Fields (5 types)

| Slug | Label | Settings | Value |
|------|-------|----------|-------|
| `select` | Select | `{ choices: Array<{value, label}>, allowNull, multiple, placeholder? }` | Value string or JSON array |
| `checkbox` | Checkbox | `{ choices: Array<{value, label}>, layout: "vertical"\|"horizontal", toggleAll }` | JSON array of values |
| `radio` | Radio | `{ choices: Array<{value, label}>, layout: "vertical"\|"horizontal", otherChoice }` | Value string |
| `button_group` | Button Group | `{ choices: Array<{value, label}>, layout: "horizontal"\|"vertical" }` | Value string |
| `true_false` | True / False | `{ message?, defaultValue? }` | `"true"` or `"false"` |

### Relational Fields (6 types)

| Slug | Label | Settings | Value |
|------|-------|----------|-------|
| `link` | Link | `{ returnFormat: "array" }` | JSON `{ url, title, target }` |
| `post_object` | Post Object | `{ postType: string[], multiple, returnFormat: "id"\|"object" }` | Post ID string or JSON array |
| `page_link` | Page Link | `{ postType: string[], multiple, allowArchives }` | URL string or JSON array |
| `relationship` | Relationship | `{ postType: string[], filters: string[], min?, max?, returnFormat: "id"\|"object" }` | JSON array of post IDs |
| `taxonomy` | Taxonomy | `{ taxonomy, fieldType: "checkbox"\|"select"\|"multi_select"\|"radio", returnFormat: "id"\|"object", createTerms }` | Term ID or JSON array |
| `user` | User | `{ role: string[], multiple, returnFormat: "id"\|"object" }` | User ID string or JSON array |

### Date & Time Fields (4 types)

| Slug | Label | Settings | Value |
|------|-------|----------|-------|
| `date_picker` | Date Picker | `{ displayFormat, returnFormat, firstDay }` | `"YYYY-MM-DD"` |
| `date_time_picker` | Date Time Picker | `{ displayFormat, returnFormat, firstDay }` | `"YYYY-MM-DD HH:mm:ss"` |
| `time_picker` | Time Picker | `{ displayFormat, returnFormat }` | `"HH:mm:ss"` |
| `color_picker` | Color Picker | `{ enableOpacity, returnFormat: "string"\|"array", defaultColor? }` | `"#hex"` or `"rgba(...)"` |

### Layout Fields (3 types - no value stored)

| Slug | Label | Settings | Value |
|------|-------|----------|-------|
| `message` | Message | `{ message, escapeHtml }` | N/A |
| `accordion` | Accordion | `{ open, multiExpand, endpoint }` | N/A |
| `tab` | Tab | `{ placement: "top"\|"left", endpoint }` | N/A |

### Compound Fields (3 types)

| Slug | Label | Settings | Value |
|------|-------|----------|-------|
| `group` | Group | `{ layout: "block"\|"table"\|"row" }` | JSON object of `{ fieldName: value }` |
| `repeater` | Repeater | `{ layout: "table"\|"block"\|"row", minRows?, maxRows?, buttonLabel, collapsed? }` | JSON array of row objects |
| `flexible_content` | Flexible Content | `{ layouts: Array<{name, label, min?, max?, display}>, minLayouts?, maxLayouts?, buttonLabel }` | JSON array of `{ acf_fc_layout, ...fields }` |

---

## Actions & Functions

### Mutations

#### `custom_field.create_group` - Create Field Group

- **Convex Function:** `mutations/customFields.createGroup`
- **Airtable Record:** `[redacted-airtable-record-id]`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** `manage_custom_fields` (Administrator only)
- **Args:**
  ```typescript
  {
    title: v.string(),
    key: v.optional(v.string()),
    description: v.optional(v.string()),
    locationRules: v.array(v.array(v.object({
      param: v.string(),
      operator: v.union(v.literal("=="), v.literal("!=")),
      value: v.string(),
    }))),
    position: v.optional(fieldGroupPosition),              // Default: "normal"
    style: v.optional(fieldGroupStyle),                    // Default: "default"
    labelPlacement: v.optional(labelPlacement),            // Default: "top"
    instructionPlacement: v.optional(instructionPlacement), // Default: "label"
    isActive: v.optional(v.boolean()),                     // Default: true
    menuOrder: v.optional(v.number()),                     // Default: 0
    fields: v.optional(v.array(v.object({
      label: v.string(),
      name: v.optional(v.string()),
      type: v.string(),
      instructions: v.optional(v.string()),
      required: v.optional(v.boolean()),
      defaultValue: v.optional(v.string()),
      settings: v.optional(v.string()),
      conditionalLogic: v.optional(v.string()),
      wrapperWidth: v.optional(v.string()),
      wrapperClass: v.optional(v.string()),
      wrapperId: v.optional(v.string()),
      menuOrder: v.optional(v.number()),
    }))),
  }
  ```
- **Returns:** `Id<"fieldGroups">`
- **Behavior:**
  1. Authenticate user via auth identity.
  2. Check capability: `manage_custom_fields` (Administrator only).
  3. Validate `title` is 1-200 chars after trimming.
  4. If `key` not provided, generate from title: lowercase, replace spaces/special chars with underscores, truncate to 100 chars.
  5. Validate `key` is unique across all `fieldGroups` (using `by_key` index).
  6. Validate `locationRules` structure: each group must have at least one condition with valid param/operator/value.
  7. Insert `fieldGroups` record with defaults for optional fields.
  8. If `fields` array provided, iterate and create `fieldDefinitions` for each:
     a. Generate `name` from label if not provided.
     b. Generate unique `key` in format `field_{name}_{random6}`.
     c. Validate `type` is one of the supported field types.
     d. Validate `settings` JSON matches the expected schema for the field type.
     e. Insert `fieldDefinitions` record with `groupId` = new group ID.
  9. Emit event: `custom_field.group_created`.
  10. Return the new group ID.
- **Events:** `custom_field.group_created`
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated.
  - `FORBIDDEN`: User lacks `manage_custom_fields` capability.
  - `VALIDATION_ERROR`: Title empty or exceeds 200 chars.
  - `CONFLICT`: Key already exists in another field group.
  - `VALIDATION_ERROR`: Invalid location rule structure.
  - `VALIDATION_ERROR`: Invalid field type in fields array.
  - `VALIDATION_ERROR`: Invalid settings JSON for field type.

#### `custom_field.update_group` - Update Field Group

- **Convex Function:** `mutations/customFields.updateGroup`
- **Airtable Record:** `[redacted-airtable-record-id]`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** `manage_custom_fields` (Administrator only)
- **Args:**
  ```typescript
  {
    groupId: v.id("fieldGroups"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    locationRules: v.optional(v.array(v.array(v.object({
      param: v.string(),
      operator: v.union(v.literal("=="), v.literal("!=")),
      value: v.string(),
    })))),
    position: v.optional(fieldGroupPosition),
    style: v.optional(fieldGroupStyle),
    labelPlacement: v.optional(labelPlacement),
    instructionPlacement: v.optional(instructionPlacement),
    isActive: v.optional(v.boolean()),
    menuOrder: v.optional(v.number()),
  }
  ```
- **Returns:** `Id<"fieldGroups">`
- **Behavior:**
  1. Authenticate user via auth identity.
  2. Check capability: `manage_custom_fields`.
  3. Retrieve existing group by `groupId`. If not found, throw `NOT_FOUND`.
  4. If `title` provided, validate 1-200 chars.
  5. If `locationRules` provided, validate structure.
  6. Merge provided fields with existing values. Update `updatedAt` to `Date.now()`.
  7. Patch the `fieldGroups` record.
  8. Emit event: `custom_field.group_updated`.
  9. Return the updated group ID.
- **Events:** `custom_field.group_updated`
- **Errors:**
  - `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`

#### `custom_field.delete_group` - Delete Field Group

- **Convex Function:** `mutations/customFields.deleteGroup`
- **Airtable Record:** `[redacted-airtable-record-id]`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** `manage_custom_fields` (Administrator only)
- **Args:**
  ```typescript
  {
    groupId: v.id("fieldGroups"),
    deleteValues: v.optional(v.boolean()),  // Default: false
  }
  ```
- **Returns:** `{ deleted: true }`
- **Behavior:**
  1. Authenticate user via auth identity.
  2. Check capability: `manage_custom_fields`.
  3. Retrieve existing group by `groupId`. If not found, throw `NOT_FOUND`.
  4. Retrieve all `fieldDefinitions` where `groupId` matches (including sub-fields via recursive lookup).
  5. If `deleteValues` is true:
     a. For each field definition, delete all `fieldValues` records where `fieldKey` matches.
     b. For post/page entity types, also clean up corresponding `postMeta` entries.
  6. Delete all `fieldDefinitions` records belonging to this group (including nested sub-fields).
  7. Delete the `fieldGroups` record.
  8. Emit event: `custom_field.group_deleted`.
  9. Return `{ deleted: true }`.
- **Events:** `custom_field.group_deleted`
- **Errors:** `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`

#### `custom_field.set_value` - Set Field Value

- **Convex Function:** `mutations/customFields.setValue`
- **Airtable Record:** `[redacted-airtable-record-id]`
- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** `edit_custom_field_values` (Administrator, Editor, Author-own)
- **Args:**
  ```typescript
  {
    entityType: v.string(),   // "post", "page", "user", "term"
    entityId: v.string(),
    fieldKey: v.string(),
    value: v.string(),        // JSON-encoded
  }
  ```
- **Returns:** `{ success: true }`
- **Behavior:**
  1. Authenticate user via auth identity.
  2. Check capability: `edit_custom_field_values`. For Authors, additionally check ownership of the target entity (using `mapMetaCap` from Role & Capability System).
  3. Retrieve the field definition by `fieldKey` (using `by_key` index). If not found, throw `NOT_FOUND`.
  4. Validate the `value` against the field type's validation rules:
     - `required` fields must have a non-empty value.
     - Type-specific validation (email format, min/max for numbers, valid choices for selects, etc.).
     - For `repeater`, validate each row matches sub-field schema.
     - For `flexible_content`, validate each layout block matches its defined fields.
  5. Upsert the `fieldValues` record:
     - Query `by_entity_field` index for existing record.
     - If exists: update `value`, `updatedBy`, `updatedAt`.
     - If not exists: insert new record.
  6. If `entityType` is `"post"` or `"page"`:
     a. Get the field definition's `name`.
     b. Upsert the `postMeta` record with `key = name` and `value = args.value`.
  7. Emit event: `custom_field.value_set`.
  8. Return `{ success: true }`.
- **Events:** `custom_field.value_set`
- **Errors:**
  - `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`

#### `customFields.createField` - Create Field Definition

- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** `manage_custom_fields`
- **Args:**
  ```typescript
  {
    groupId: v.id("fieldGroups"),
    label: v.string(),
    name: v.optional(v.string()),
    type: v.string(),
    instructions: v.optional(v.string()),
    required: v.optional(v.boolean()),
    defaultValue: v.optional(v.string()),
    settings: v.optional(v.string()),
    conditionalLogic: v.optional(v.string()),
    wrapperWidth: v.optional(v.string()),
    wrapperClass: v.optional(v.string()),
    wrapperId: v.optional(v.string()),
    menuOrder: v.optional(v.number()),
    parentFieldId: v.optional(v.id("fieldDefinitions")),
  }
  ```
- **Returns:** `Id<"fieldDefinitions">`
- **Behavior:**
  1. Validate group exists.
  2. Generate `name` from label if not provided (lowercase, underscores).
  3. Validate `name` is unique within the group (using `by_group_name` index).
  4. Generate unique `key` in format `field_{name}_{random6}`.
  5. Validate `type` is supported.
  6. Validate `settings` JSON against type-specific schema.
  7. Insert `fieldDefinitions` record.
  8. Touch parent group's `updatedAt`.
  9. Return the new field definition ID.

#### `customFields.updateField` - Update Field Definition

- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** `manage_custom_fields`
- **Args:**
  ```typescript
  {
    fieldId: v.id("fieldDefinitions"),
    label: v.optional(v.string()),
    name: v.optional(v.string()),
    type: v.optional(v.string()),          // WARNING: Changing type may invalidate existing values
    instructions: v.optional(v.string()),
    required: v.optional(v.boolean()),
    defaultValue: v.optional(v.string()),
    settings: v.optional(v.string()),
    conditionalLogic: v.optional(v.string()),
    wrapperWidth: v.optional(v.string()),
    wrapperClass: v.optional(v.string()),
    wrapperId: v.optional(v.string()),
    menuOrder: v.optional(v.number()),
  }
  ```
- **Returns:** `Id<"fieldDefinitions">`
- **Behavior:**
  1. Retrieve field definition. Validate exists.
  2. If `name` changed, validate uniqueness within group.
  3. If `type` changed, log a warning -- existing stored values may need migration.
  4. Merge and patch. Touch parent group's `updatedAt`.
  5. Return updated field ID.

#### `customFields.deleteField` - Delete Field Definition

- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** `manage_custom_fields`
- **Args:**
  ```typescript
  {
    fieldId: v.id("fieldDefinitions"),
    deleteValues: v.optional(v.boolean()),
  }
  ```
- **Behavior:**
  1. Retrieve field definition. Validate exists.
  2. If field has sub-fields (repeater/group/flexible_content children), recursively delete them.
  3. If `deleteValues`, delete all `fieldValues` (and `postMeta` entries) for this field's key.
  4. Delete the field definition.
  5. Touch parent group's `updatedAt`.

#### `customFields.reorderFields` - Reorder Fields in Group

- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** `manage_custom_fields`
- **Args:**
  ```typescript
  {
    groupId: v.id("fieldGroups"),
    fieldOrder: v.array(v.object({
      fieldId: v.id("fieldDefinitions"),
      menuOrder: v.number(),
    })),
  }
  ```
- **Behavior:** Batch update `menuOrder` for all specified fields. Touch group's `updatedAt`.

#### `customFields.setValues` - Batch Set Field Values

- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** `edit_custom_field_values`
- **Args:**
  ```typescript
  {
    entityType: v.string(),
    entityId: v.string(),
    values: v.array(v.object({
      fieldKey: v.string(),
      value: v.string(),
    })),
  }
  ```
- **Behavior:** Iterate and call setValue logic for each entry. Used by the content editor on save to batch all dirty field values.

#### `customFields.duplicateGroup` - Duplicate Field Group

- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** `manage_custom_fields`
- **Args:**
  ```typescript
  {
    groupId: v.id("fieldGroups"),
    newTitle: v.optional(v.string()),
  }
  ```
- **Returns:** `Id<"fieldGroups">`
- **Behavior:**
  1. Deep-copy the group and all its field definitions (with new IDs and keys).
  2. Set `isActive` to `false` on the copy (prevent accidental duplicate display).
  3. Append " (Copy)" to title if `newTitle` not provided.
  4. Return the new group ID.

#### `customFields.exportGroup` - Export Field Group as JSON

- **Type:** Mutation (or Query)
- **Auth:** Required
- **Capabilities:** `manage_custom_fields`
- **Args:** `{ groupId: v.id("fieldGroups") }`
- **Returns:** JSON string blob containing full group + field definitions.

#### `customFields.importGroup` - Import Field Group from JSON

- **Type:** Mutation
- **Auth:** Required
- **Capabilities:** `manage_custom_fields`
- **Args:** `{ data: v.string() }` (JSON blob from exportGroup)
- **Returns:** `Id<"fieldGroups">`
- **Behavior:** Parse JSON, create new group and field definitions. Generate new IDs and keys. Validate all fields.

### Queries

#### `customFields.listGroups` - List All Field Groups

- **Type:** Query
- **Auth:** Required (Admin)
- **Args:**
  ```typescript
  {
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"), v.literal("all"))),
    search: v.optional(v.string()),
  }
  ```
- **Returns:** `Array<FieldGroup & { fieldCount: number }>`
- **Behavior:** Query all groups using `by_order` index. Filter by `isActive` if status specified. Search title/key if search provided. Join with field count via `by_group` index.

#### `customFields.getGroup` - Get Single Field Group

- **Type:** Query
- **Auth:** Required (Admin)
- **Args:** `{ groupId: v.id("fieldGroups") }`
- **Returns:** `FieldGroup | null`

#### `customFields.getFieldsForGroup` - Get Fields in a Group

- **Type:** Query
- **Auth:** Required (Admin)
- **Args:** `{ groupId: v.id("fieldGroups") }`
- **Returns:** `Array<FieldDefinition>` (sorted by menuOrder, includes sub-fields nested)

#### `customFields.getGroupsForContext` - Get Matching Groups for Editor Context

- **Type:** Query
- **Auth:** Required
- **Args:**
  ```typescript
  {
    postType: v.optional(v.string()),
    postTemplate: v.optional(v.string()),
    postStatus: v.optional(v.string()),
    postCategories: v.optional(v.array(v.string())),
    pageTemplate: v.optional(v.string()),
    pageType: v.optional(v.string()),
    pageParent: v.optional(v.string()),
    currentUserRole: v.optional(v.string()),
    taxonomy: v.optional(v.string()),
  }
  ```
- **Returns:** `Array<FieldGroup & { fields: FieldDefinition[] }>` (only matching groups with their fields)
- **Behavior:**
  1. Fetch all active groups (using `by_active` index).
  2. Build `LocationContext` from args.
  3. Evaluate each group's `locationRules` against the context.
  4. For matching groups, fetch their field definitions.
  5. Return matching groups sorted by `menuOrder`.

#### `customFields.getValue` - Get Single Field Value

- **Type:** Query
- **Auth:** Required or Public (for published content)
- **Airtable Record:** `[redacted-airtable-record-id]`
- **Args:**
  ```typescript
  {
    entityType: v.string(),
    entityId: v.string(),
    fieldKey: v.optional(v.string()),
    fieldName: v.optional(v.string()),
  }
  ```
- **Returns:** `{ fieldKey, fieldName, value, type } | null`
- **Behavior:** Look up by `fieldKey` (via `by_entity_field` index) or by `fieldName` (look up definition first, then query). Decode value from JSON.

#### `customFields.getAllValues` - Get All Field Values for Entity

- **Type:** Query
- **Auth:** Required or Public (for published content)
- **Args:**
  ```typescript
  {
    entityType: v.string(),
    entityId: v.string(),
  }
  ```
- **Returns:** `Array<{ fieldKey, fieldName, type, value }>`
- **Behavior:** Query `by_entity` index for all field values. Join with field definitions for type info.

#### `customFields.getFieldWithValue` - Get Field Definition + Value

- **Type:** Query
- **Auth:** Required or Public
- **Args:**
  ```typescript
  {
    entityType: v.string(),
    entityId: v.string(),
    fieldName: v.string(),
  }
  ```
- **Returns:** `{ definition: FieldDefinition, value: any } | null`

#### `customFields.searchGroups` - Search Field Groups

- **Type:** Query
- **Auth:** Required (Admin)
- **Args:** `{ query: v.string() }`
- **Returns:** `Array<FieldGroup>` matching title or key.

---

## Events

### `custom_field.group_created`

- **Type:** System
- **Triggered By:** `custom_field.create_group` mutation
- **Payload:**
  ```typescript
  {
    groupId: Id<"fieldGroups">,
    title: string,
    key: string,
    fieldCount: number,
    createdBy: string,   // user identifier
  }
  ```
- **Subscribers:**
  - Email: None
  - Site: Admin toast: "Field group '{title}' created"
  - Audit Log: Yes

### `custom_field.group_updated`

- **Type:** System
- **Triggered By:** `custom_field.update_group` mutation
- **Payload:**
  ```typescript
  {
    groupId: Id<"fieldGroups">,
    title: string,
    changes: string[],    // List of changed field names
    updatedBy: string,
  }
  ```
- **Subscribers:**
  - Email: None
  - Site: Admin toast: "Field group '{title}' updated"
  - Audit Log: Yes

### `custom_field.group_deleted`

- **Type:** System
- **Triggered By:** `custom_field.delete_group` mutation
- **Payload:**
  ```typescript
  {
    groupId: Id<"fieldGroups">,
    title: string,
    fieldCount: number,
    valuesDeleted: boolean,
    deletedBy: string,
  }
  ```
- **Subscribers:**
  - Email: None
  - Site: Admin toast: "Field group '{title}' deleted"
  - Audit Log: Yes

### `custom_field.group_activated`

- **Type:** System
- **Triggered By:** `custom_field.update_group` mutation (when `isActive` changes to `true`)
- **Payload:**
  ```typescript
  {
    groupId: Id<"fieldGroups">,
    title: string,
    activatedBy: string,
  }
  ```
- **Subscribers:**
  - Email: None
  - Site: Admin toast: "Field group '{title}' activated"
  - Audit Log: Yes

### `custom_field.group_deactivated`

- **Type:** System
- **Triggered By:** `custom_field.update_group` mutation (when `isActive` changes to `false`)
- **Payload:**
  ```typescript
  {
    groupId: Id<"fieldGroups">,
    title: string,
    deactivatedBy: string,
  }
  ```
- **Subscribers:**
  - Email: None
  - Site: Admin toast: "Field group '{title}' deactivated"
  - Audit Log: Yes

### `custom_field.value_set`

- **Type:** Content
- **Triggered By:** `custom_field.set_value` mutation
- **Payload:**
  ```typescript
  {
    entityType: string,
    entityId: string,
    fieldKey: string,
    fieldName: string,
    updatedBy: string,
  }
  ```
- **Subscribers:**
  - Email: None (too frequent)
  - Site: None (too frequent)
  - Audit Log: Yes

---

## Admin Routes & UI

### Custom Fields - Field Groups List (`/admin/custom-fields`)

- **Airtable Route Record:** `[redacted-airtable-record-id]`
- **Purpose:** List all field groups with status, location rules summary, field count, and actions.
- **WordPress Equivalent:** `/wp-admin/edit.php?post_type=acf-field-group`
- **Roles:** Administrator only
- **Layout:**
  ```
  +-------------------------------------------------------+
  | Custom Fields                          [+ Add New]     |
  +-------------------------------------------------------+
  | Search: [___________]   Status: [All v]                |
  +-------------------------------------------------------+
  | [ ] | Title          | Key           | Fields | Location         | Status  | Order |
  |-----|----------------|---------------|--------|------------------|---------|-------|
  | [ ] | Hero Section   | hero_section  | 4      | Post Type = Post | Active  | 0     |
  | [ ] | Sidebar Meta   | sidebar_meta  | 3      | Template = Side  | Active  | 1     |
  | [ ] | Author Bio     | author_bio    | 6      | Post Type = Post | Inactive| 2     |
  +-------------------------------------------------------+
  | Bulk Actions: [Delete v] [Apply]    Showing 1-3 of 3   |
  +-------------------------------------------------------+
  ```
- **Key Components:**
  - `FieldGroupList` - WordPress-style list table with bulk actions
  - Status filter dropdown (All, Active, Inactive)
  - Search input (filters by title or key)
  - Row hover actions: Edit, Duplicate, Export JSON, Delete
  - Bulk actions: Delete Selected, Activate Selected, Deactivate Selected
- **Data Requirements:** `customFields.listGroups` query
- **User Interactions:**
  - Click title to edit group
  - Toggle status badge to activate/deactivate
  - Drag handles for reordering
  - Checkbox + bulk action dropdown for batch operations
- **Real-Time:** List updates live via Convex subscription when groups are created/deleted/reordered by other admins.

### Edit Field Group (`/admin/custom-fields/$groupId/edit`)

- **Airtable Route Record:** `[redacted-airtable-record-id]`
- **Purpose:** Full-page visual builder for creating and editing a field group and its fields.
- **WordPress Equivalent:** ACF Field Group editor
- **Roles:** Administrator only
- **Layout:** Full-page interface (NOT a modal) with:
  - Title and key inputs at top
  - **Fields section**: Drag-drop sortable list of field rows, each expandable to show type-specific settings
  - **Settings section**: Location rules builder, presentation options, active toggle, description
  - Save/Save & Close buttons in header
- **Key Components:**
  - `FieldGroupBuilder` - Main builder component orchestrating the page
  - `FieldRow` - Collapsed/expanded field row with drag handle
  - `FieldSettingsPanel` - Expanded settings for a field (type-specific)
  - `LocationRulesBuilder` - AND/OR rule builder with param/operator/value dropdowns
  - `ConditionalLogicBuilder` - Per-field conditional logic rules
  - 30+ field-type-specific input components in `fields/` subfolder
- **Data Requirements:** `customFields.getGroup` + `customFields.getFieldsForGroup`
- **User Interactions:**
  - Drag-drop field reordering (via `@dnd-kit/core` + `@dnd-kit/sortable`)
  - Add Field button opens new row with type selector
  - Expand/collapse field settings
  - Type change updates settings panel dynamically
  - Label auto-generates name (slugified)
  - Sub-fields (for group/repeater/flexible_content) nested within parent field
  - Location rule AND/OR builder with dynamic value dropdowns
  - Keyboard shortcuts: Ctrl+S (save), Tab (between fields), Enter (expand/collapse), Delete (with confirm), Ctrl+D (duplicate)
- **Real-Time:** Live updates if another admin edits the same group.

---

## Website Routes

### SSR Helper Functions (No dedicated routes)

The Custom Field System does not have its own website routes. Instead, it provides helper functions used within other systems' routes (blog posts, pages, etc.).

- **Module:** `apps/website/src/lib/customFields.ts`
- **Functions:**
  - `getField(entityType, entityId, fieldName)` - Get single value (equivalent to WP's `get_field()`)
  - `getFields(entityType, entityId)` - Get all values as key-value record (equivalent to WP's `get_fields()`)
  - `getFieldObject(entityType, entityId, fieldName)` - Get definition + value (equivalent to WP's `get_field_object()`)
- **Usage:** Called in TanStack Start loaders for SSR. No real-time subscriptions needed; uses `fetchQuery`.
- **Caching:** Relies on Convex's built-in query caching.

---

## Notifications

### Email Notifications

| Name | Event | Recipients | Priority | Subject |
|------|-------|------------|----------|---------|
| (None) | - | - | - | The Custom Field System does not send email notifications. Field group CRUD is admin-only infrastructure and does not warrant emails. |

### Site Notifications

| Name | Event | Type | Persistent | Recipients |
|------|-------|------|-----------|------------|
| Field Group Created | `custom_field.group_created` | Toast | No | Current admin (inline feedback) |
| Field Group Updated | `custom_field.group_updated` | Toast | No | Current admin (inline feedback) |
| Field Group Deleted | `custom_field.group_deleted` | Toast | No | Current admin (inline feedback) |
| Field Group Activated | `custom_field.group_activated` | Toast | No | Current admin (inline feedback) |
| Field Group Deactivated | `custom_field.group_deactivated` | Toast | No | Current admin (inline feedback) |

Note: `custom_field.value_set` does NOT produce notifications (too frequent; would be noisy). All events are recorded in the Audit Log.

---

## Role & Capability Matrix

| Action | Admin | Editor | Author | Contributor | Subscriber |
|--------|-------|--------|--------|-------------|-----------|
| `manage_custom_fields` (CRUD groups/definitions) | Yes | No | No | No | No |
| `edit_custom_field_values` (set values on content) | Yes | Yes | Yes (own content only) | No | No |
| `read_custom_field_values` (read values) | Yes | Yes | Yes | Yes | Yes |
| Access `/admin/custom-fields` | Yes | No | No | No | No |
| Access `/admin/custom-fields/$groupId/edit` | Yes | No | No | No | No |
| See field metaboxes on content editor | Yes | Yes | Yes | No | No |
| Read field values via SSR helpers (website) | Yes | Yes | Yes | Yes | Yes (+ anonymous for public) |

**Meta-capability mapping for `edit_custom_field_values`:**
- Authors: maps to `edit_posts` (can only set values on their own posts)
- Editors/Admins: maps to `edit_others_posts` (can set values on any post)
- Pages: mirrors the Page System ownership model

---

## Dependencies

### Depends On

| System | Type | What It Provides |
|--------|------|------------------|
| **Post System** | Hard | `posts` and `postMeta` tables; post editor screen where field groups render as metaboxes; `postMeta` for denormalized value storage |
| **Page System** | Hard | Page editor screen; page-specific location rule parameters (`page_template`, `page_type`, `page_parent`) |
| **Role & Capability System** | Hard | `currentUserCan()` for capability checks; role slugs for `current_user_role` location parameter; `mapMetaCap` for Author ownership mapping |
| **Auth System** | Hard | auth identity for all mutations; user ID for `createdBy` / `updatedBy` fields |
| **Media System** | Soft | Image/file/gallery field types need the media library picker component for selecting media assets |
| **Taxonomy System** | Soft | Taxonomy field type needs term data for selection UI; `post_category` location rule parameter |
| **Event Dispatcher System** | Soft | Emitting events for audit logging and notifications |
| **Content Editor System** | Soft | WYSIWYG field type may reuse the content editor component (TipTap/Plate) |

### Depended On By

| System | Type | What It Uses |
|--------|------|-------------|
| **SEO System** | Soft | May use custom fields for per-post SEO overrides instead of hardcoded `postMeta` keys |

---

## Implementation Checklist

### Backend (`ConvexPress-Admin/packages/backend/convex/`)

- [ ] `schema.ts` - Add `fieldGroups`, `fieldDefinitions`, `fieldValues` tables (3 tables)
- [ ] `mutations/customFields.ts` - All mutations:
  - [ ] `createGroup`
  - [ ] `updateGroup`
  - [ ] `deleteGroup`
  - [ ] `createField`
  - [ ] `updateField`
  - [ ] `deleteField`
  - [ ] `reorderFields`
  - [ ] `setValue`
  - [ ] `setValues` (batch)
  - [ ] `duplicateGroup`
  - [ ] `exportGroup`
  - [ ] `importGroup`
- [ ] `queries/customFields.ts` - All queries:
  - [ ] `listGroups`
  - [ ] `getGroup`
  - [ ] `getFieldsForGroup`
  - [ ] `getGroupsForContext`
  - [ ] `getValue`
  - [ ] `getAllValues`
  - [ ] `getFieldWithValue`
  - [ ] `searchGroups`
- [ ] `helpers/customFieldValidation.ts` - Type-specific validation logic for each of 30+ field types
- [ ] `helpers/locationRules.ts` - Location rule evaluation engine (`evaluateLocationRules`, `evaluateCondition`)
- [ ] `helpers/fieldKeyGenerator.ts` - Unique key generation for groups and fields
- [ ] `helpers/fieldValueEncoder.ts` - JSON encode/decode utilities for field values

### Admin Frontend (`ConvexPress-Admin/apps/web/src/`)

- [ ] `routes/admin/custom-fields/index.tsx` - Field Groups list page
- [ ] `routes/admin/custom-fields/$groupId/edit.tsx` - Field Group builder page
- [ ] `components/custom-fields/FieldGroupList.tsx` - List table component
- [ ] `components/custom-fields/FieldGroupBuilder.tsx` - Main builder component
- [ ] `components/custom-fields/FieldRow.tsx` - Single field row (expandable)
- [ ] `components/custom-fields/FieldSettingsPanel.tsx` - Expanded settings for a field
- [ ] `components/custom-fields/LocationRulesBuilder.tsx` - AND/OR rule builder UI
- [ ] `components/custom-fields/ConditionalLogicBuilder.tsx` - Field-level conditional logic UI
- [ ] `components/custom-fields/fields/` - 30+ per-type input components:
  - [ ] `FieldText.tsx`, `FieldTextarea.tsx`, `FieldNumber.tsx`, `FieldRange.tsx`
  - [ ] `FieldEmail.tsx`, `FieldUrl.tsx`, `FieldPassword.tsx`
  - [ ] `FieldImage.tsx`, `FieldFile.tsx`, `FieldWysiwyg.tsx`, `FieldOembed.tsx`, `FieldGallery.tsx`
  - [ ] `FieldSelect.tsx`, `FieldCheckbox.tsx`, `FieldRadio.tsx`, `FieldButtonGroup.tsx`, `FieldTrueFalse.tsx`
  - [ ] `FieldLink.tsx`, `FieldPostObject.tsx`, `FieldPageLink.tsx`, `FieldRelationship.tsx`, `FieldTaxonomy.tsx`, `FieldUser.tsx`
  - [ ] `FieldDatePicker.tsx`, `FieldDateTimePicker.tsx`, `FieldTimePicker.tsx`, `FieldColorPicker.tsx`
  - [ ] `FieldMessage.tsx`, `FieldAccordion.tsx`, `FieldTab.tsx`
  - [ ] `FieldGroup.tsx`, `FieldRepeater.tsx`, `FieldFlexibleContent.tsx`
- [ ] `components/custom-fields/metabox/CustomFieldsMetabox.tsx` - Renders field groups as metaboxes on content editor
- [ ] `components/custom-fields/metabox/MetaboxRenderer.tsx` - Renders fields within a metabox

### Website Frontend (`ConvexPress-Website/apps/web/src/`)

- [ ] `lib/customFields.ts` - SSR helper functions (`getField`, `getFields`, `getFieldObject`)

---

## Edge Cases & Gotchas

1. **Key uniqueness**: Field group keys must be globally unique. Field names must be unique within their group. Field keys (auto-generated) must be globally unique. Always check before insert.

2. **Recursive sub-field deletion**: When deleting a compound field (repeater, group, flexible_content), all sub-fields AND their sub-fields must be recursively deleted. Use `by_parent` index to find children, then recurse.

3. **Type change on existing field**: Changing a field definition's `type` does NOT automatically migrate stored values. The old values remain in `fieldValues` as strings. Implementation should log a warning and optionally offer a migration action.

4. **Dual-write to postMeta**: When setting values for posts/pages, BOTH `fieldValues` and `postMeta` must be updated atomically. If one write fails, both should be rolled back. Convex mutations are transactional within a single mutation, so batch both writes in the same mutation.

5. **Location rule evaluation order**: Rules are OR between groups, AND within groups. An empty `locationRules` array means the group shows NOWHERE (not everywhere). This is different from some ACF versions where empty rules showed everywhere.

6. **Conditional logic evaluation**: Conditional logic is purely client-side. Hidden fields retain their values in state but are NOT submitted on save. The server does NOT evaluate conditional logic -- it only validates values that are actually submitted.

7. **Repeater field depth**: Repeaters can theoretically nest (a repeater inside a repeater). Implementation should set a practical depth limit (e.g., 3 levels) to prevent infinite recursion and performance issues.

8. **Flexible content layout ordering**: Each layout block in a `flexible_content` field can be reordered. The order is stored in the JSON array sequence. The `acf_fc_layout` key in each block identifies which layout template to use.

9. **Gallery field ordering**: Images in a gallery field are ordered by their position in the JSON array. Drag-drop reordering must update the array order.

10. **Anonymous access**: Public website SSR needs to read field values without authentication. The `getValue` and `getAllValues` queries must allow anonymous access for published content but deny access to draft/private content.

11. **Concurrent editing**: If two admins edit the same field group simultaneously, last-write-wins. The UI should show a warning if the group's `updatedAt` has changed since the page loaded.

12. **Large field groups**: Groups with 50+ fields may cause performance issues in the builder UI. Implement virtualization or lazy loading of field settings panels. Only render expanded panels.

13. **postMeta sync consistency**: When a field definition is renamed (name change), existing `postMeta` entries with the old name are NOT automatically renamed. This could cause orphaned postMeta entries. Consider a migration utility.

14. **Default values**: When a field has a `defaultValue` and no stored value exists for an entity, the getValue query should return the default. But the default should NOT be written to `fieldValues` until the user explicitly saves.

15. **Layout fields**: `message`, `accordion`, and `tab` fields produce no stored value. The setValue mutation should reject attempts to set values on these field types.

16. **JSON settings parsing**: The `settings` field is a JSON string. Always wrap `JSON.parse()` in try/catch. Invalid JSON should be caught during validation, not during rendering.

17. **Field key format**: Keys follow the format `field_{name}_{random6}`. The random suffix ensures uniqueness even when field names collide across groups. Use a cryptographically random 6-char hex string.

---

## WordPress Functions Reference

| WordPress (ACF) | ConvexPress Convex | Notes |
|------------------|-------------------|-------|
| `get_field($selector, $post_id)` | `customFields.getValue` query | Returns decoded value. ConvexPress requires `entityType` + `entityId` instead of just `$post_id`. |
| `update_field($selector, $value, $post_id)` | `customFields.setValue` mutation | ConvexPress validates value against field type before writing. |
| `get_field_object($selector, $post_id)` | `customFields.getFieldWithValue` query | Returns both definition and value. |
| `get_fields($post_id)` | `customFields.getAllValues` query | Returns all field values for an entity as array. |
| `have_rows($selector, $post_id)` | Check `Array.isArray(value) && value.length > 0` | No dedicated function; standard JS array check. |
| `the_row()` / `get_sub_field()` | Standard `for...of` loop + property access | Repeater iteration is just array iteration in JS. |
| `get_field_groups()` | `customFields.listGroups` query | Returns all field groups (not just active ones in admin). |
| `acf_add_local_field_group()` | `customFields.importGroup` mutation | ConvexPress uses JSON import instead of PHP arrays. |
| `add_post_meta($post_id, $key, $value)` | `customFields.setValue` mutation | ConvexPress unifies meta and ACF fields into one system. |
| `get_post_meta($post_id, $key, $single)` | `customFields.getValue` query | Also works: direct `postMeta` query from Post System. |
| `update_post_meta($post_id, $key, $value)` | `customFields.setValue` mutation | Writes to both `fieldValues` and `postMeta`. |
| `delete_post_meta($post_id, $key)` | `customFields.setValue` with empty value, or dedicated delete | No direct equivalent yet; could add `deleteValue` mutation. |

### Location Rule Parameter Mapping

| ACF Parameter | ConvexPress Parameter | Notes |
|---------------|----------------------|-------|
| `post_type` | `post_type` | Values: `"post"`, `"page"` |
| `post_template` | `post_template` | Template slug |
| `post_status` | `post_status` | `"draft"`, `"pending"`, `"publish"`, `"future"`, `"private"` |
| `post_format` | Not supported | ConvexPress does not have post formats at launch |
| `post_category` | `post_category` | Category term IDs |
| `post_taxonomy` | Not supported | Use `post_category` or `taxonomy` |
| `page_template` | `page_template` | Template slug |
| `page_type` | `page_type` | `"front_page"`, `"posts_page"`, `"top_level"`, `"parent"`, `"child"` |
| `page_parent` | `page_parent` | Page ID |
| `current_user` | Not supported | Use `current_user_role` instead |
| `current_user_role` | `current_user_role` | Role slug |
| `user_form` | Not supported | No user profile field groups at launch |
| `user_role` | Not supported | Use `current_user_role` |
| `taxonomy` | `taxonomy` | Taxonomy edit screen |
| `attachment` | Not supported | No media attachment field groups at launch |
| `comment` | Not supported | No comment field groups at launch |
| `widget` | Not supported | No widget field groups at launch |
| `nav_menu` | Not supported | No nav menu field groups at launch |
| `nav_menu_item` | Not supported | No nav menu item field groups at launch |
| `block` | Not supported | ConvexPress does not use blocks |
| `options_page` | Not supported | No ACF options pages equivalent at launch |

---

## Location Rules Engine

### Evaluation Logic

```typescript
function evaluateLocationRules(
  rules: LocationRuleGroup[],
  context: LocationContext
): boolean {
  // If no rules, show nowhere
  if (rules.length === 0) return false;

  // OR between groups: if ANY group matches, show the field group
  return rules.some(group => {
    // AND within group: ALL conditions must match
    return group.every(condition => {
      return evaluateCondition(condition, context);
    });
  });
}

interface LocationContext {
  postType?: "post" | "page";
  postStatus?: string;
  postCategories?: string[];
  postTemplate?: string;
  pageTemplate?: string;
  pageType?: string;
  pageParent?: string;
  currentUserRole?: string;
  taxonomy?: string;
}

function evaluateCondition(
  condition: LocationCondition,
  context: LocationContext
): boolean {
  const contextValue = getContextValue(condition.param, context);
  const matches = Array.isArray(contextValue)
    ? contextValue.includes(condition.value)
    : contextValue === condition.value;

  return condition.operator === "==" ? matches : !matches;
}
```

### Client-Side Resolution Flow

1. Post/page editor loads.
2. Fetch all active field groups via `customFields.getGroupsForContext()`.
3. Build `LocationContext` from current editor state.
4. Evaluate each group's `locationRules`.
5. Render matching groups as metaboxes in configured position.
6. When editor state changes (category, template, status), re-evaluate and reactively show/hide groups.

---

## Conditional Logic Schema

```typescript
interface ConditionalLogic {
  action: "show" | "hide";           // Show or hide this field when rules match
  logic: "and" | "or";               // How to combine multiple rules
  rules: Array<{
    field: string;                    // Key of the sibling field to check
    operator: "==" | "!=" | ">" | "<" | "contains" | "empty" | "not_empty";
    value: string;                    // Value to compare against
  }>;
}
```

**Evaluation:** Client-side only. Hidden fields retain values but are excluded from save payload.

---

## UI Component Library

### Drag-Drop

- Use `@dnd-kit/core` + `@dnd-kit/sortable`
- Grip handle (icon) on each field row
- Ghost preview while dragging
- Drop indicator (blue line) at insertion point
- 200ms animation on reorder
- Constrained within repeater for sub-fields

### Field Type Selector

- Categorized dropdown (Basic, Content, Choice, Relational, Date & Time, Layout, Compound)
- Icon + label + brief description per type
- Keyboard search support
- Remember last-used type

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save field group |
| `Tab` | Move between field rows |
| `Enter` | Expand/collapse field row |
| `Delete` | Delete focused field (with confirmation) |
| `Ctrl+D` | Duplicate focused field |
