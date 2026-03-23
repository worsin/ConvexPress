/**
 * Custom Field System - Schema
 *
 * Three tables implementing WordPress ACF-like structured metadata:
 *   - `fieldGroups`      - Named collections of field definitions with location rules
 *   - `fieldDefinitions` - Individual field schemas (type, validation, settings)
 *   - `fieldValues`      - Actual stored values for entities (posts, pages, users)
 *
 * WordPress equivalent: ACF's `acf-field-group` + `acf-field` custom post types
 * merged with `wp_postmeta` into a first-class, type-safe system.
 *
 * Architecture:
 *   - Field groups define WHERE fields appear (location rules) and HOW (position, style)
 *   - Field definitions define WHAT each field is (type, validation, settings)
 *   - Field values store the actual data per entity, with JSON-encoded values
 *   - For posts/pages, values are dual-written to both `fieldValues` and `postMeta`
 *
 * Key design decisions:
 *   - Settings and conditionalLogic stored as JSON strings (flexible per field type)
 *   - Location rules use OR-of-AND boolean logic (same as ACF)
 *   - Compound fields (group, repeater, flexible_content) use self-referencing parentFieldId
 *   - Layout fields (message, accordion, tab) produce no stored values
 *   - Field keys are globally unique with format `field_{name}_{random6}`
 *   - Group keys are globally unique slugs derived from title
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const customFieldTables = {
  /**
   * Field Groups - collections of related field definitions.
   *
   * Each group has location rules that determine which editor screens
   * it appears on, and presentation settings for how it renders.
   *
   * WordPress equivalent: ACF Field Group (stored as `acf-field-group` CPT).
   */
  fieldGroups: defineTable({
    // --- Identity ---
    title: v.string(), // Display name (e.g., "Hero Section Fields")
    key: v.string(), // Unique slug/key (e.g., "hero_section_fields")
    description: v.optional(v.string()), // Admin-facing description

    // --- Location Rules ---
    // OR groups of AND conditions: [[{param, operator, value}, ...], ...]
    locationRules: v.array(
      v.array(
        v.object({
          param: v.string(), // e.g., "post_type", "page_template", "current_user_role"
          operator: v.union(v.literal("=="), v.literal("!=")),
          value: v.string(), // e.g., "post", "page", "sidebar", "administrator"
        }),
      ),
    ),

    // --- Presentation ---
    position: v.union(
      v.literal("normal"), // Below the content editor
      v.literal("side"), // In the sidebar
      v.literal("after_title"), // Between title and content editor
    ),
    style: v.union(
      v.literal("default"), // Standard metabox with border and header
      v.literal("seamless"), // No metabox chrome, blends into page
    ),
    labelPlacement: v.union(
      v.literal("top"), // Label above input (default)
      v.literal("left"), // Label to left of input (horizontal layout)
    ),
    instructionPlacement: v.union(
      v.literal("label"), // Below the label, above the input
      v.literal("field"), // Below the input
    ),

    // --- State ---
    isActive: v.boolean(), // Whether this group is enabled
    menuOrder: v.number(), // Sort order (lower = higher priority)

    // --- Metadata ---
    createdBy: v.string(), // WorkOS user ID of creator
    createdAt: v.number(), // Creation timestamp (ms)
    updatedAt: v.number(), // Last modification timestamp (ms)
  })
    .index("by_key", ["key"]) // Lookup by unique key
    .index("by_active", ["isActive", "menuOrder"]) // Active groups sorted by order
    .index("by_order", ["menuOrder"]) // All groups sorted by order
    .index("by_created", ["createdAt"]), // Recently created

  /**
   * Field Definitions - schema for each individual field within a group.
   *
   * Supports recursive nesting for compound fields (group, repeater,
   * flexible_content) via self-referencing `parentFieldId`.
   *
   * WordPress equivalent: ACF Field (stored as `acf-field` CPT with parent = group).
   */
  fieldDefinitions: defineTable({
    // --- Identity ---
    groupId: v.id("fieldGroups"), // Parent field group
    label: v.string(), // Display label (e.g., "Hero Image")
    name: v.string(), // Field name/slug (e.g., "hero_image") - used as meta_key
    key: v.string(), // Unique field key (e.g., "field_hero_image_abc123")
    type: v.string(), // Field type slug (see SUPPORTED_FIELD_TYPES)
    instructions: v.optional(v.string()), // Help text shown near the input

    // --- Validation ---
    required: v.boolean(), // Whether field must have a value
    defaultValue: v.optional(v.string()), // Default value (JSON-encoded for complex types)

    // --- Type-Specific Settings ---
    settings: v.string(), // JSON-encoded type-specific settings

    // --- Conditional Logic ---
    conditionalLogic: v.optional(v.string()), // JSON-encoded conditional display rules

    // --- Wrapper (Layout) ---
    wrapperWidth: v.optional(v.string()), // CSS width (e.g., "50%", "33.33%")
    wrapperClass: v.optional(v.string()), // Additional CSS class
    wrapperId: v.optional(v.string()), // CSS ID

    // --- Ordering ---
    menuOrder: v.number(), // Sort order within parent group/field

    // --- Sub-fields (for group, repeater, flexible_content) ---
    parentFieldId: v.optional(v.id("fieldDefinitions")), // Parent field for nested sub-fields

    // --- Timestamps ---
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group", ["groupId", "menuOrder"]) // All fields in a group, sorted
    .index("by_parent", ["parentFieldId", "menuOrder"]) // Sub-fields of a parent field, sorted
    .index("by_key", ["key"]) // Lookup by unique field key
    .index("by_name", ["name"]) // Lookup by field name/slug
    .index("by_group_name", ["groupId", "name"]), // Unique name within group

  /**
   * Field Values - actual stored data for a field on a specific entity.
   *
   * Source of truth for all field data. For posts/pages, values are
   * also written to `postMeta` for backward compatibility.
   *
   * WordPress equivalent: `wp_postmeta` rows created by ACF.
   */
  fieldValues: defineTable({
    // --- Target ---
    entityType: v.string(), // "post", "page", "user", "term", etc.
    entityId: v.string(), // The ID of the target record

    // --- Field Reference ---
    fieldKey: v.string(), // References fieldDefinitions.key
    fieldName: v.string(), // References fieldDefinitions.name (denormalized)

    // --- Value ---
    value: v.string(), // JSON-encoded value (type depends on field type)

    // --- Metadata ---
    updatedBy: v.string(), // WorkOS user ID of last editor
    updatedAt: v.number(), // Last modification timestamp
  })
    .index("by_entity", ["entityType", "entityId"]) // All values for an entity
    .index("by_entity_field", ["entityType", "entityId", "fieldKey"]) // Specific value
    .index("by_field_key", ["fieldKey"]), // All values for a field definition
};
