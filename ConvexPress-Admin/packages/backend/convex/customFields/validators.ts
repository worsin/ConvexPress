/**
 * Custom Field System - Shared Argument Validators
 *
 * Reusable validator objects for custom field mutations and queries.
 * Centralizes validation logic so mutations.ts and queries.ts stay DRY.
 *
 * Also contains field type constants and slug generation utilities.
 */

import { v } from "convex/values";

// ─── Supported Field Types ──────────────────────────────────────────────────

/**
 * All 30 supported field type slugs, organized by category.
 *
 * Basic (7): text, textarea, number, range, email, url, password
 * Content (5): image, file, wysiwyg, oembed, gallery
 * Choice (5): select, checkbox, radio, button_group, true_false
 * Relational (6): link, post_object, page_link, relationship, taxonomy, user
 * Date & Time (4): date_picker, date_time_picker, time_picker, color_picker
 * Layout (3): message, accordion, tab
 * Compound (3): group, repeater, flexible_content
 */
export const SUPPORTED_FIELD_TYPES = [
  // Basic
  "text",
  "textarea",
  "number",
  "range",
  "email",
  "url",
  "password",
  // Content
  "image",
  "file",
  "wysiwyg",
  "oembed",
  "gallery",
  // Choice
  "select",
  "checkbox",
  "radio",
  "button_group",
  "true_false",
  // Relational
  "link",
  "post_object",
  "page_link",
  "relationship",
  "taxonomy",
  "user",
  // Date & Time
  "date_picker",
  "date_time_picker",
  "time_picker",
  "color_picker",
  // Layout (no stored value)
  "message",
  "accordion",
  "tab",
  // Multi-step (value-less; a wizard step boundary). Added by the Form
  // Multi-Step & Save-Continue System. Treated exactly like layout types by the
  // submit pipeline (no fieldValue written); the Website FormWizard reads it as
  // a step marker and consumes its `label` as the next step's title.
  "page_break",
  // Form security (value-less; rendered by the Forms Renderer, never persisted)
  // Added by the Form Spam & Submission Security System. Treated exactly like
  // layout types by the submit pipeline (no fieldValue written).
  "captcha",
  "honeypot",
  // Computed (value-bearing; recomputed authoritatively on submit). Added by the
  // Form Calculation & Pricing System. These HOLD a stored value (a number for
  // `calculation`, a priced line object for `product`) — they are NOT layout
  // types. The submit pipeline overwrites their value via the calc recompute.
  "calculation",
  "product",
  // Compound
  "group",
  "repeater",
  "flexible_content",
] as const;

export type FieldType = (typeof SUPPORTED_FIELD_TYPES)[number];

/** Set for O(1) lookup of valid field types. */
export const FIELD_TYPE_SET: Set<string> = new Set(SUPPORTED_FIELD_TYPES);

/**
 * Layout / value-less field types that produce no stored value. Includes the
 * Form Security types `captcha` + `honeypot` (Form Spam & Submission Security
 * System): they render in the form but never write a `fieldValue`, so the
 * submit pipeline skips them via this single source of truth.
 */
export const LAYOUT_FIELD_TYPES: Set<string> = new Set([
  "message",
  "accordion",
  "tab",
  "page_break",
  "captcha",
  "honeypot",
]);

/** Compound field types that can contain sub-fields. */
export const COMPOUND_FIELD_TYPES: Set<string> = new Set([
  "group",
  "repeater",
  "flexible_content",
]);

/**
 * Computed field types (Form Calculation & Pricing System). Their value is
 * DERIVED from a formula and recomputed authoritatively by the submit mutation —
 * never trusted from the client. They are value-bearing (unlike layout types):
 * `calculation` stores a number, `product` stores a priced line object.
 */
export const COMPUTED_FIELD_TYPES: Set<string> = new Set([
  "calculation",
  "product",
]);

// ─── Shared Value Validators ────────────────────────────────────────────────

/** Field group position validator. */
export const groupPositionValidator = v.union(
  v.literal("normal"),
  v.literal("side"),
  v.literal("after_title"),
);

/** Field group style validator. */
export const groupStyleValidator = v.union(
  v.literal("default"),
  v.literal("seamless"),
);

/** Label placement validator. */
export const labelPlacementValidator = v.union(
  v.literal("top"),
  v.literal("left"),
);

/** Instruction placement validator. */
export const instructionPlacementValidator = v.union(
  v.literal("label"),
  v.literal("field"),
);

/** Entity type validator. */
export const entityTypeValidator = v.string();

/** Location rule condition object validator. */
export const locationRuleConditionValidator = v.object({
  param: v.string(),
  operator: v.union(v.literal("=="), v.literal("!=")),
  value: v.string(),
});

/** Full location rules validator (OR groups of AND conditions). */
export const locationRulesValidator = v.array(
  v.array(locationRuleConditionValidator),
);

/** Group status filter for queries. */
export const groupStatusFilterValidator = v.optional(
  v.union(v.literal("active"), v.literal("inactive"), v.literal("all")),
);

// ─── Mutation Arg Validators ────────────────────────────────────────────────

/** Args for creating a field group. */
export const createGroupArgs = {
  title: v.string(),
  key: v.optional(v.string()),
  description: v.optional(v.string()),
  locationRules: locationRulesValidator,
  position: v.optional(groupPositionValidator),
  style: v.optional(groupStyleValidator),
  labelPlacement: v.optional(labelPlacementValidator),
  instructionPlacement: v.optional(instructionPlacementValidator),
  isActive: v.optional(v.boolean()),
  menuOrder: v.optional(v.number()),
  fields: v.optional(
    v.array(
      v.object({
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
      }),
    ),
  ),
};

/** Args for updating a field group. */
export const updateGroupArgs = {
  groupId: v.id("fieldGroups"),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  locationRules: v.optional(locationRulesValidator),
  position: v.optional(groupPositionValidator),
  style: v.optional(groupStyleValidator),
  labelPlacement: v.optional(labelPlacementValidator),
  instructionPlacement: v.optional(instructionPlacementValidator),
  isActive: v.optional(v.boolean()),
  menuOrder: v.optional(v.number()),
};

/** Args for deleting a field group. */
export const deleteGroupArgs = {
  groupId: v.id("fieldGroups"),
  deleteValues: v.optional(v.boolean()),
};

/** Args for creating a field definition. */
export const createFieldArgs = {
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
};

/** Args for updating a field definition. */
export const updateFieldArgs = {
  fieldId: v.id("fieldDefinitions"),
  label: v.optional(v.string()),
  name: v.optional(v.string()),
  type: v.optional(v.string()),
  instructions: v.optional(v.string()),
  required: v.optional(v.boolean()),
  defaultValue: v.optional(v.string()),
  settings: v.optional(v.string()),
  conditionalLogic: v.optional(v.string()),
  wrapperWidth: v.optional(v.string()),
  wrapperClass: v.optional(v.string()),
  wrapperId: v.optional(v.string()),
  menuOrder: v.optional(v.number()),
};

/** Args for deleting a field definition. */
export const deleteFieldArgs = {
  fieldId: v.id("fieldDefinitions"),
  deleteValues: v.optional(v.boolean()),
};

/** Args for reordering fields within a group. */
export const reorderFieldsArgs = {
  groupId: v.id("fieldGroups"),
  fieldOrder: v.array(
    v.object({
      fieldId: v.id("fieldDefinitions"),
      menuOrder: v.number(),
    }),
  ),
};

/** Args for setting a single field value. */
export const setValueArgs = {
  entityType: v.string(),
  entityId: v.string(),
  fieldKey: v.string(),
  value: v.string(),
};

/** Args for deleting a field value. */
export const deleteValueArgs = {
  entityType: v.string(),
  entityId: v.string(),
  fieldKey: v.string(),
};

/** Args for batch setting field values. */
export const setValuesArgs = {
  entityType: v.string(),
  entityId: v.string(),
  values: v.array(
    v.object({
      fieldKey: v.string(),
      value: v.string(),
    }),
  ),
};

/** Args for duplicating a field group. */
export const duplicateGroupArgs = {
  groupId: v.id("fieldGroups"),
  newTitle: v.optional(v.string()),
};

/** Args for exporting a field group. */
export const exportGroupArgs = {
  groupId: v.id("fieldGroups"),
};

/** Args for importing a field group. */
export const importGroupArgs = {
  data: v.string(),
};

// ─── Query Arg Validators ───────────────────────────────────────────────────

/** Args for listing field groups. */
export const listGroupsArgs = {
  status: groupStatusFilterValidator,
  search: v.optional(v.string()),
};

/** Args for getting a single field group. */
export const getGroupArgs = {
  groupId: v.optional(v.id("fieldGroups")),
  key: v.optional(v.string()),
};

/** Args for getting fields by group. */
export const getFieldsByGroupArgs = {
  groupId: v.id("fieldGroups"),
};

/** Args for getting groups for an editor context. */
export const getGroupsForContextArgs = {
  postType: v.optional(v.string()),
  postTemplate: v.optional(v.string()),
  postStatus: v.optional(v.string()),
  postCategories: v.optional(v.array(v.string())),
  pageTemplate: v.optional(v.string()),
  pageType: v.optional(v.string()),
  pageParent: v.optional(v.string()),
  currentUserRole: v.optional(v.string()),
  taxonomy: v.optional(v.string()),
};

/** Args for getting a single field value. */
export const getValueArgs = {
  entityType: v.string(),
  entityId: v.string(),
  fieldKey: v.optional(v.string()),
  fieldName: v.optional(v.string()),
};

/** Args for getting all field values for an entity. */
export const getAllValuesArgs = {
  entityType: v.string(),
  entityId: v.string(),
};

/** Args for getting a field with its value. */
export const getFieldWithValueArgs = {
  entityType: v.string(),
  entityId: v.string(),
  fieldName: v.string(),
};

/** Args for searching field groups. */
export const searchGroupsArgs = {
  query: v.string(),
};

// ─── Validation Constants ───────────────────────────────────────────────────

/** Maximum length for group titles. */
export const MAX_TITLE_LENGTH = 200;

/** Maximum length for group/field keys. */
export const MAX_KEY_LENGTH = 100;

/** Maximum length for group descriptions. */
export const MAX_DESCRIPTION_LENGTH = 1000;

/** Maximum length for field labels. */
export const MAX_LABEL_LENGTH = 200;

/** Maximum length for field names. */
export const MAX_NAME_LENGTH = 100;

/** Maximum length for field instructions. */
export const MAX_INSTRUCTIONS_LENGTH = 500;

/** Maximum nesting depth for compound fields (repeater inside repeater, etc.). */
export const MAX_NESTING_DEPTH = 3;

// ─── Slug Generation Helpers ────────────────────────────────────────────────

/**
 * Generate a slug/key from a display string.
 * Lowercase, replace spaces and special chars with underscores, trim.
 */
export function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .substring(0, MAX_KEY_LENGTH);
}

/**
 * Generate a random 6-character hex string for field key uniqueness.
 *
 * NOTE: Uses Math.random() which is NOT cryptographically secure.
 * This is an ACCEPTABLE deviation because:
 *   1. Convex server runtime does not expose crypto.getRandomValues()
 *   2. Field keys are internal identifiers, not security tokens
 *   3. Collision risk is mitigated by the key uniqueness check at insert time
 *   4. Uniqueness is further guaranteed by Convex index constraints
 */
export function generateRandomHex(): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Generate a unique field key in the format `field_{name}_{random6}`.
 */
export function generateFieldKey(name: string): string {
  return `field_${name}_${generateRandomHex()}`;
}

/**
 * Validate that a string is a supported field type.
 */
export function isValidFieldType(type: string): type is FieldType {
  return FIELD_TYPE_SET.has(type);
}
