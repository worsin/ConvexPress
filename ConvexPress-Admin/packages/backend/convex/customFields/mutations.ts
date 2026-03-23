/**
 * Custom Field System - Public Mutations
 *
 * All write operations for managing field groups, field definitions, and field values.
 *
 * Mutations:
 *   - createGroup       - Create a new field group (optionally with inline fields)
 *   - updateGroup       - Update an existing field group's settings
 *   - deleteGroup       - Delete a field group and all its field definitions
 *   - createField       - Create a field definition within a group
 *   - updateField       - Update a field definition
 *   - deleteField       - Delete a field definition (and optionally its stored values)
 *   - reorderFields     - Reorder fields within a group via batch menuOrder update
 *   - setValue          - Set a single field value on an entity (upsert)
 *   - deleteValue       - Delete a single field value
 *   - setValues         - Batch set multiple field values on an entity
 *   - duplicateGroup    - Deep-copy a field group with all field definitions
 *   - exportGroup       - Export a field group + definitions as JSON
 *   - importGroup       - Import a field group from JSON
 *
 * All mutations require WorkOS authentication and appropriate capabilities.
 */

import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import { requireCan , getUserIdentifier } from "../helpers/permissions";
import { getCurrentUser } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { validateFieldValue } from "../helpers/customFieldValidation";
import { CUSTOM_FIELD_EVENTS, SYSTEM } from "../events/constants";
import {
  createGroupArgs,
  updateGroupArgs,
  deleteGroupArgs,
  createFieldArgs,
  updateFieldArgs,
  deleteFieldArgs,
  reorderFieldsArgs,
  setValueArgs,
  deleteValueArgs,
  setValuesArgs,
  duplicateGroupArgs,
  exportGroupArgs,
  importGroupArgs,
  generateSlug,
  generateFieldKey,
  generateRandomHex,
  isValidFieldType,
  LAYOUT_FIELD_TYPES,
  COMPOUND_FIELD_TYPES,
  MAX_TITLE_LENGTH,
  MAX_KEY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_INSTRUCTIONS_LENGTH,
} from "./validators";

// ─── Validation Helpers (local) ─────────────────────────────────────────────

function validateTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Title cannot be empty",
    });
  }
  if (trimmed.length > MAX_TITLE_LENGTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Title cannot exceed ${MAX_TITLE_LENGTH} characters`,
    });
  }
  return trimmed;
}

function validateLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Label cannot be empty",
    });
  }
  if (trimmed.length > MAX_LABEL_LENGTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Label cannot exceed ${MAX_LABEL_LENGTH} characters`,
    });
  }
  return trimmed;
}

function validateDescription(
  description: string | undefined,
): string | undefined {
  if (description === undefined) return undefined;
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`,
    });
  }
  return description;
}

function validateInstructions(
  instructions: string | undefined,
): string | undefined {
  if (instructions === undefined) return undefined;
  if (instructions.length > MAX_INSTRUCTIONS_LENGTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Instructions cannot exceed ${MAX_INSTRUCTIONS_LENGTH} characters`,
    });
  }
  return instructions;
}

function validateKeyFormat(key: string): string {
  const sanitized = key
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!sanitized) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Key must contain at least one alphanumeric character",
    });
  }
  if (sanitized.length > MAX_KEY_LENGTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Key cannot exceed ${MAX_KEY_LENGTH} characters`,
    });
  }
  return sanitized;
}

function validateNameFormat(name: string): string {
  const sanitized = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!sanitized) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Name must contain at least one alphanumeric character",
    });
  }
  if (sanitized.length > MAX_NAME_LENGTH) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: `Name cannot exceed ${MAX_NAME_LENGTH} characters`,
    });
  }
  return sanitized;
}

function validateSettings(settings: string | undefined): string {
  if (!settings) return "{}";
  try {
    JSON.parse(settings);
    return settings;
  } catch {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Settings must be valid JSON",
    });
  }
}

function validateConditionalLogic(
  logic: string | undefined,
): string | undefined {
  if (!logic) return undefined;
  try {
    JSON.parse(logic);
    return logic;
  } catch {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Conditional logic must be valid JSON",
    });
  }
}

// ─── Field Group Mutations ──────────────────────────────────────────────────

/**
 * Create a new field group.
 *
 * Requires `custom_field.create_group` capability (Administrator only).
 * Generates key from title if not provided. Validates key uniqueness.
 * Optionally creates inline field definitions.
 */
export const createGroup = mutation({
  args: createGroupArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const user = await requireCan(ctx, "custom_field.create_group");

    // 2. Validate title
    const title = validateTitle(args.title);

    // 3. Validate description
    const description = validateDescription(args.description);

    // 4. Generate or validate key
    let key: string;
    if (args.key) {
      key = validateKeyFormat(args.key);
    } else {
      key = generateSlug(title);
    }

    // 5. Check key uniqueness
    const existingByKey = await ctx.db
      .query("fieldGroups")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existingByKey) {
      // Auto-deduplicate: append a random suffix
      key = `${key}_${generateRandomHex()}`;
    }

    // 6. Validate location rules structure
    if (args.locationRules.length === 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message:
          "Location rules must have at least one rule group. An empty array means the group shows nowhere.",
      });
    }
    for (const ruleGroup of args.locationRules) {
      if (ruleGroup.length === 0) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message:
            "Each location rule group must have at least one condition",
        });
      }
    }

    // 7. Insert field group
    const now = Date.now();
    const groupId = await ctx.db.insert("fieldGroups", {
      title,
      key,
      description,
      locationRules: args.locationRules,
      position: args.position ?? "normal",
      style: args.style ?? "default",
      labelPlacement: args.labelPlacement ?? "top",
      instructionPlacement: args.instructionPlacement ?? "label",
      isActive: args.isActive ?? true,
      menuOrder: args.menuOrder ?? 0,
      createdBy: getUserIdentifier(user),
      createdAt: now,
      updatedAt: now,
    });

    // 8. Create inline field definitions if provided
    let fieldCount = 0;
    if (args.fields && args.fields.length > 0) {
      for (let i = 0; i < args.fields.length; i++) {
        const fieldDef = args.fields[i];
        const fieldLabel = validateLabel(fieldDef.label);

        // Validate field type
        if (!isValidFieldType(fieldDef.type)) {
          throw new ConvexError({
            code: "VALIDATION_ERROR",
            message: `Invalid field type: "${fieldDef.type}"`,
          });
        }

        // Generate or validate field name
        const fieldName = fieldDef.name
          ? validateNameFormat(fieldDef.name)
          : generateSlug(fieldLabel);

        // Check name uniqueness within group
        const existingField = await ctx.db
          .query("fieldDefinitions")
          .withIndex("by_group_name", (q) =>
            q.eq("groupId", groupId).eq("name", fieldName),
          )
          .unique();
        if (existingField) {
          throw new ConvexError({
            code: "CONFLICT",
            message: `A field with name "${fieldName}" already exists in this group`,
          });
        }

        // Generate unique field key
        const fieldKey = generateFieldKey(fieldName);

        // Validate settings JSON
        const settings = validateSettings(fieldDef.settings);

        // Validate conditional logic JSON
        const conditionalLogic = validateConditionalLogic(
          fieldDef.conditionalLogic,
        );

        await ctx.db.insert("fieldDefinitions", {
          groupId,
          label: fieldLabel,
          name: fieldName,
          key: fieldKey,
          type: fieldDef.type,
          instructions: validateInstructions(fieldDef.instructions),
          required: fieldDef.required ?? false,
          defaultValue: fieldDef.defaultValue,
          settings,
          conditionalLogic,
          wrapperWidth: fieldDef.wrapperWidth,
          wrapperClass: fieldDef.wrapperClass,
          wrapperId: fieldDef.wrapperId,
          menuOrder: fieldDef.menuOrder ?? i,
          createdAt: now,
          updatedAt: now,
        });

        fieldCount++;
      }
    }

    // 9. Emit event
    await emitEvent(
      ctx,
      CUSTOM_FIELD_EVENTS.GROUP_CREATED,
      SYSTEM.CUSTOM_FIELD,
      {
        groupId,
        title,
        key,
        fieldCount,
        createdBy: getUserIdentifier(user),
      },
    );

    // 10. Return new group ID
    return groupId;
  },
});

/**
 * Update an existing field group.
 *
 * Requires `custom_field.update_group` capability (Administrator only).
 * Key is immutable after creation. Validates all changed fields.
 */
export const updateGroup = mutation({
  args: updateGroupArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const user = await requireCan(ctx, "custom_field.update_group");

    // 2. Fetch existing group
    const group = await ctx.db.get("fieldGroups", args.groupId);
    if (!group) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Field group not found",
      });
    }

    // 3. Build patch object and track changes
    const patch: Record<string, any> = {};
    const changes: string[] = [];

    // 4. Validate and apply title change
    if (args.title !== undefined) {
      const newTitle = validateTitle(args.title);
      if (newTitle !== group.title) {
        patch.title = newTitle;
        changes.push("title");
      }
    }

    // 5. Validate and apply description change
    if (args.description !== undefined) {
      const newDesc = validateDescription(args.description);
      if (newDesc !== group.description) {
        patch.description = newDesc;
        changes.push("description");
      }
    }

    // 6. Validate and apply location rules change
    if (args.locationRules !== undefined) {
      // Reject empty locationRules array
      if (args.locationRules.length === 0) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message:
            "Location rules must have at least one rule group. An empty array means the group shows nowhere.",
        });
      }
      // Validate structure
      for (const ruleGroup of args.locationRules) {
        if (ruleGroup.length === 0) {
          throw new ConvexError({
            code: "VALIDATION_ERROR",
            message:
              "Each location rule group must have at least one condition",
          });
        }
      }
      patch.locationRules = args.locationRules;
      changes.push("locationRules");
    }

    // 7. Apply simple field changes
    if (args.position !== undefined && args.position !== group.position) {
      patch.position = args.position;
      changes.push("position");
    }
    if (args.style !== undefined && args.style !== group.style) {
      patch.style = args.style;
      changes.push("style");
    }
    if (
      args.labelPlacement !== undefined &&
      args.labelPlacement !== group.labelPlacement
    ) {
      patch.labelPlacement = args.labelPlacement;
      changes.push("labelPlacement");
    }
    if (
      args.instructionPlacement !== undefined &&
      args.instructionPlacement !== group.instructionPlacement
    ) {
      patch.instructionPlacement = args.instructionPlacement;
      changes.push("instructionPlacement");
    }
    if (args.menuOrder !== undefined && args.menuOrder !== group.menuOrder) {
      patch.menuOrder = args.menuOrder;
      changes.push("menuOrder");
    }

    // 8. Track activation/deactivation for separate events
    let activationChanged = false;
    let newIsActive: boolean | undefined;
    if (args.isActive !== undefined && args.isActive !== group.isActive) {
      patch.isActive = args.isActive;
      changes.push("isActive");
      activationChanged = true;
      newIsActive = args.isActive;
    }

    // 9. If no changes, return group ID as-is
    if (changes.length === 0) {
      return args.groupId;
    }

    // 10. Update
    patch.updatedAt = Date.now();
    await ctx.db.patch("fieldGroups", args.groupId, patch);

    // 11. Emit update event
    await emitEvent(
      ctx,
      CUSTOM_FIELD_EVENTS.GROUP_UPDATED,
      SYSTEM.CUSTOM_FIELD,
      {
        groupId: args.groupId,
        title: patch.title ?? group.title,
        changes,
        updatedBy: getUserIdentifier(user),
      },
    );

    // 12. Emit activation/deactivation events if applicable
    if (activationChanged) {
      if (newIsActive) {
        await emitEvent(
          ctx,
          CUSTOM_FIELD_EVENTS.GROUP_ACTIVATED,
          SYSTEM.CUSTOM_FIELD,
          {
            groupId: args.groupId,
            title: patch.title ?? group.title,
            activatedBy: getUserIdentifier(user),
          },
        );
      } else {
        await emitEvent(
          ctx,
          CUSTOM_FIELD_EVENTS.GROUP_DEACTIVATED,
          SYSTEM.CUSTOM_FIELD,
          {
            groupId: args.groupId,
            title: patch.title ?? group.title,
            deactivatedBy: getUserIdentifier(user),
          },
        );
      }
    }

    // 13. Return updated group ID
    return args.groupId;
  },
});

/**
 * Delete a field group.
 *
 * Requires `custom_field.delete_group` capability (Administrator only).
 * Deletes all field definitions belonging to this group.
 * Optionally deletes all stored field values for those definitions.
 */
export const deleteGroup = mutation({
  args: deleteGroupArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const user = await requireCan(ctx, "custom_field.delete_group");

    // 2. Fetch group
    const group = await ctx.db.get("fieldGroups", args.groupId);
    if (!group) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Field group not found",
      });
    }

    // 3. Get all field definitions for this group
    const fields = await ctx.db
      .query("fieldDefinitions")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .collect();

    // 4. If deleteValues is true, delete all field values and corresponding postMeta
    if (args.deleteValues) {
      for (const field of fields) {
        const values = await ctx.db
          .query("fieldValues")
          .withIndex("by_field_key", (q) => q.eq("fieldKey", field.key))
          .collect();

        for (const value of values) {
          // Clean up corresponding postMeta entries for post/page entities
          if (value.entityType === "post" || value.entityType === "page") {
            try {
              const meta = await ctx.db
                .query("postMeta")
                .withIndex("by_post_key", (q) =>
                  q.eq("postId", value.entityId as Id<"posts">).eq("key", field.name),
                )
                .unique();
              if (meta) {
                await ctx.db.delete("postMeta", meta._id);
              }
            } catch (err) {
              // postMeta table may not exist; log and skip
              console.warn("Custom field postMeta cleanup failed (deleteGroup):", err);
            }
          }

          await ctx.db.delete("fieldValues", value._id);
        }
      }
    }

    // 5. Delete all field definitions
    for (const field of fields) {
      await ctx.db.delete("fieldDefinitions", field._id);
    }

    // 6. Delete the field group
    const groupTitle = group.title;
    await ctx.db.delete("fieldGroups", args.groupId);

    // 7. Emit event
    await emitEvent(
      ctx,
      CUSTOM_FIELD_EVENTS.GROUP_DELETED,
      SYSTEM.CUSTOM_FIELD,
      {
        groupId: args.groupId,
        title: groupTitle,
        fieldCount: fields.length,
        valuesDeleted: args.deleteValues ?? false,
        deletedBy: getUserIdentifier(user),
      },
    );

    // 8. Return result
    return { deleted: true };
  },
});

// ─── Field Definition Mutations ─────────────────────────────────────────────

/**
 * Create a field definition within a group.
 *
 * Requires `custom_field.create_group` capability (Administrator only).
 * Generates name from label if not provided. Validates type and settings.
 */
export const createField = mutation({
  args: createFieldArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    await requireCan(ctx, "custom_field.create_group");

    // 2. Validate group exists
    const group = await ctx.db.get("fieldGroups", args.groupId);
    if (!group) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Field group not found",
      });
    }

    // 3. Validate label
    const label = validateLabel(args.label);

    // 4. Generate or validate name
    const name = args.name
      ? validateNameFormat(args.name)
      : generateSlug(label);

    // 5. Validate name uniqueness within group
    const existingField = await ctx.db
      .query("fieldDefinitions")
      .withIndex("by_group_name", (q) =>
        q.eq("groupId", args.groupId).eq("name", name),
      )
      .unique();
    if (existingField) {
      throw new ConvexError({
        code: "CONFLICT",
        message: `A field with name "${name}" already exists in this group`,
      });
    }

    // 6. Validate field type
    if (!isValidFieldType(args.type)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Invalid field type: "${args.type}"`,
      });
    }

    // 7. Generate unique field key
    const key = generateFieldKey(name);

    // 8. Validate settings JSON
    const settings = validateSettings(args.settings);

    // 9. Validate conditional logic JSON
    const conditionalLogic = validateConditionalLogic(args.conditionalLogic);

    // 10. Validate instructions
    const instructions = validateInstructions(args.instructions);

    // 11. Validate parent field if specified (for compound field sub-fields)
    if (args.parentFieldId) {
      const parentField = await ctx.db.get("fieldDefinitions", args.parentFieldId);
      if (!parentField) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Parent field not found",
        });
      }
      if (parentField.groupId !== args.groupId) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Parent field must belong to the same group",
        });
      }
      if (!COMPOUND_FIELD_TYPES.has(parentField.type)) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Parent field must be a compound type (group, repeater, or flexible_content), got "${parentField.type}"`,
        });
      }
    }

    // 12. Insert field definition
    const now = Date.now();
    const fieldId = await ctx.db.insert("fieldDefinitions", {
      groupId: args.groupId,
      label,
      name,
      key,
      type: args.type,
      instructions,
      required: args.required ?? false,
      defaultValue: args.defaultValue,
      settings,
      conditionalLogic,
      wrapperWidth: args.wrapperWidth,
      wrapperClass: args.wrapperClass,
      wrapperId: args.wrapperId,
      menuOrder: args.menuOrder ?? 0,
      parentFieldId: args.parentFieldId,
      createdAt: now,
      updatedAt: now,
    });

    // 13. Touch parent group's updatedAt
    await ctx.db.patch("fieldGroups", args.groupId, { updatedAt: now });

    // 14. Return field definition ID
    return fieldId;
  },
});

/**
 * Update an existing field definition.
 *
 * Requires `custom_field.update_group` capability (Administrator only).
 * Validates name uniqueness if changed. Warns on type changes.
 */
export const updateField = mutation({
  args: updateFieldArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    await requireCan(ctx, "custom_field.update_group");

    // 2. Fetch existing field
    const field = await ctx.db.get("fieldDefinitions", args.fieldId);
    if (!field) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Field definition not found",
      });
    }

    // 3. Build patch
    const patch: Record<string, any> = {};

    // 4. Validate label
    if (args.label !== undefined) {
      const newLabel = validateLabel(args.label);
      if (newLabel !== field.label) {
        patch.label = newLabel;
      }
    }

    // 5. Validate name
    if (args.name !== undefined) {
      const newName = validateNameFormat(args.name);
      if (newName !== field.name) {
        // Check uniqueness within group
        const existingField = await ctx.db
          .query("fieldDefinitions")
          .withIndex("by_group_name", (q) =>
            q.eq("groupId", field.groupId).eq("name", newName),
          )
          .unique();
        if (existingField && existingField._id !== args.fieldId) {
          throw new ConvexError({
            code: "CONFLICT",
            message: `A field with name "${newName}" already exists in this group`,
          });
        }
        patch.name = newName;
      }
    }

    // 6. Validate type change
    if (args.type !== undefined && args.type !== field.type) {
      if (!isValidFieldType(args.type)) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Invalid field type: "${args.type}"`,
        });
      }
      // Note: Changing type may invalidate existing stored values.
      // This is allowed but existing values remain as-is.
      patch.type = args.type;
    }

    // 7. Validate instructions
    if (args.instructions !== undefined) {
      patch.instructions = validateInstructions(args.instructions);
    }

    // 8. Apply simple changes
    if (args.required !== undefined) patch.required = args.required;
    if (args.defaultValue !== undefined) patch.defaultValue = args.defaultValue;
    if (args.wrapperWidth !== undefined) patch.wrapperWidth = args.wrapperWidth;
    if (args.wrapperClass !== undefined) patch.wrapperClass = args.wrapperClass;
    if (args.wrapperId !== undefined) patch.wrapperId = args.wrapperId;
    if (args.menuOrder !== undefined) patch.menuOrder = args.menuOrder;

    // 9. Validate settings
    if (args.settings !== undefined) {
      patch.settings = validateSettings(args.settings);
    }

    // 10. Validate conditional logic
    if (args.conditionalLogic !== undefined) {
      patch.conditionalLogic = validateConditionalLogic(
        args.conditionalLogic,
      );
    }

    // 11. If no changes, return field ID
    if (Object.keys(patch).length === 0) {
      return args.fieldId;
    }

    // 12. Update
    const now = Date.now();
    patch.updatedAt = now;
    await ctx.db.patch("fieldDefinitions", args.fieldId, patch);

    // 13. Touch parent group's updatedAt
    await ctx.db.patch("fieldGroups", field.groupId, { updatedAt: now });

    // 14. Return updated field ID
    return args.fieldId;
  },
});

/**
 * Delete a field definition.
 *
 * Requires `custom_field.delete_group` capability (Administrator only).
 * Recursively deletes sub-fields for compound types.
 * Optionally deletes all stored field values.
 */
export const deleteField = mutation({
  args: deleteFieldArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    await requireCan(ctx, "custom_field.delete_group");

    // 2. Fetch field
    const field = await ctx.db.get("fieldDefinitions", args.fieldId);
    if (!field) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Field definition not found",
      });
    }

    // 3. Recursively delete sub-fields if this is a compound type
    if (COMPOUND_FIELD_TYPES.has(field.type)) {
      await deleteSubFieldsRecursive(ctx, args.fieldId, args.deleteValues);
    }

    // 4. Delete field values if requested
    if (args.deleteValues) {
      const values = await ctx.db
        .query("fieldValues")
        .withIndex("by_field_key", (q) => q.eq("fieldKey", field.key))
        .collect();

      for (const value of values) {
        await ctx.db.delete("fieldValues", value._id);
      }
    }

    // 5. Delete the field definition
    await ctx.db.delete("fieldDefinitions", args.fieldId);

    // 6. Touch parent group's updatedAt
    const now = Date.now();
    await ctx.db.patch("fieldGroups", field.groupId, { updatedAt: now });

    // 7. Return result
    return { deleted: true };
  },
});

/** Helper: recursively delete sub-fields of a compound field. */
async function deleteSubFieldsRecursive(
  ctx: MutationCtx,
  parentFieldId: Id<"fieldDefinitions">,
  deleteValues?: boolean,
): Promise<void> {
  const subFields = await ctx.db
    .query("fieldDefinitions")
    .withIndex("by_parent", (q) => q.eq("parentFieldId", parentFieldId))
    .collect();

  for (const subField of subFields) {
    // Recurse for nested compound fields
    if (COMPOUND_FIELD_TYPES.has(subField.type)) {
      await deleteSubFieldsRecursive(ctx, subField._id, deleteValues);
    }

    // Delete values if requested
    if (deleteValues) {
      const values = await ctx.db
        .query("fieldValues")
        .withIndex("by_field_key", (q) =>
          q.eq("fieldKey", subField.key),
        )
        .collect();

      for (const value of values) {
        await ctx.db.delete("fieldValues", value._id);
      }
    }

    // Delete the sub-field
    await ctx.db.delete("fieldDefinitions", subField._id);
  }
}

/**
 * Reorder fields within a group.
 *
 * Requires `custom_field.update_group` capability (Administrator only).
 * Batch updates menuOrder for all specified fields.
 */
export const reorderFields = mutation({
  args: reorderFieldsArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    await requireCan(ctx, "custom_field.update_group");

    // 2. Validate group exists
    const group = await ctx.db.get("fieldGroups", args.groupId);
    if (!group) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Field group not found",
      });
    }

    // 3. Batch update menuOrder
    const now = Date.now();
    for (const entry of args.fieldOrder) {
      const field = await ctx.db.get("fieldDefinitions", entry.fieldId);
      if (!field) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: `Field ${entry.fieldId} not found`,
        });
      }
      if (field.groupId !== args.groupId) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Field ${entry.fieldId} does not belong to this group`,
        });
      }
      await ctx.db.patch("fieldDefinitions", entry.fieldId, {
        menuOrder: entry.menuOrder,
        updatedAt: now,
      });
    }

    // 4. Touch group's updatedAt
    await ctx.db.patch("fieldGroups", args.groupId, { updatedAt: now });

    // 5. Return success
    return { reordered: args.fieldOrder.length };
  },
});

// ─── Field Value Mutations ──────────────────────────────────────────────────

/**
 * Set a single field value on an entity (upsert).
 *
 * Requires `custom_field.set_value` capability.
 * Validates field exists and value is appropriate for the field type.
 * Layout fields (message, accordion, tab) cannot have values set.
 * Upserts: updates existing value or creates new one.
 */
export const setValue = mutation({
  args: setValueArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const user = await requireCan(ctx, "custom_field.set_value");

    // 2. Retrieve field definition by fieldKey
    const fieldDef = await ctx.db
      .query("fieldDefinitions")
      .withIndex("by_key", (q) => q.eq("key", args.fieldKey))
      .unique();
    if (!fieldDef) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: `Field definition with key "${args.fieldKey}" not found`,
      });
    }

    // 3. Reject layout fields (they produce no stored value)
    if (LAYOUT_FIELD_TYPES.has(fieldDef.type)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Cannot set value on layout field type "${fieldDef.type}"`,
      });
    }

    // 4. Type-specific validation (includes required check)
    {
      let parsedSettings: Record<string, unknown> = {};
      try {
        parsedSettings = JSON.parse(fieldDef.settings);
      } catch {
        // If settings JSON is malformed, use empty object
      }
      const validation = validateFieldValue(
        fieldDef.type,
        args.value,
        parsedSettings,
        fieldDef.required,
      );
      if (!validation.valid) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Field "${fieldDef.label}": ${validation.error}`,
        });
      }
    }

    // 5. Upsert field value
    const now = Date.now();
    const existing = await ctx.db
      .query("fieldValues")
      .withIndex("by_entity_field", (q) =>
        q
          .eq("entityType", args.entityType)
          .eq("entityId", args.entityId)
          .eq("fieldKey", args.fieldKey),
      )
      .unique();

    if (existing) {
      // Update existing
      await ctx.db.patch("fieldValues", existing._id, {
        value: args.value,
        fieldName: fieldDef.name,
        updatedBy: getUserIdentifier(user),
        updatedAt: now,
      });
    } else {
      // Insert new
      await ctx.db.insert("fieldValues", {
        entityType: args.entityType,
        entityId: args.entityId,
        fieldKey: args.fieldKey,
        fieldName: fieldDef.name,
        value: args.value,
        updatedBy: getUserIdentifier(user),
        updatedAt: now,
      });
    }

    // 6. Dual-write to postMeta for posts/pages (if postMeta table exists)
    if (args.entityType === "post" || args.entityType === "page") {
      try {
        // Query for existing postMeta with this key
        // Note: postMeta table may not exist yet during incremental build
        const existingMeta = await ctx.db
          .query("postMeta")
          .withIndex("by_post_key", (q) =>
            q.eq("postId", args.entityId as Id<"posts">).eq("key", fieldDef.name),
          )
          .unique();

        if (existingMeta) {
          await ctx.db.patch("postMeta", existingMeta._id, {
            value: args.value,
          });
        } else {
          await ctx.db.insert("postMeta", {
            postId: args.entityId as Id<"posts">,
            key: fieldDef.name,
            value: args.value,
          });
        }
      } catch (err) {
        // postMeta table may not exist yet; log and skip dual-write
        console.warn("Custom field postMeta dual-write failed (setValue):", err);
      }
    }

    // 7. Emit event
    await emitEvent(ctx, CUSTOM_FIELD_EVENTS.VALUE_SET, SYSTEM.CUSTOM_FIELD, {
      entityType: args.entityType,
      entityId: args.entityId,
      fieldKey: args.fieldKey,
      fieldName: fieldDef.name,
      updatedBy: getUserIdentifier(user),
    });

    // 8. Return success
    return { success: true };
  },
});

/**
 * Delete a single field value.
 *
 * Requires `custom_field.set_value` capability.
 */
export const deleteValue = mutation({
  args: deleteValueArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    await requireCan(ctx, "custom_field.set_value");

    // 2. Find existing value
    const existing = await ctx.db
      .query("fieldValues")
      .withIndex("by_entity_field", (q) =>
        q
          .eq("entityType", args.entityType)
          .eq("entityId", args.entityId)
          .eq("fieldKey", args.fieldKey),
      )
      .unique();

    if (!existing) {
      // Idempotent: value doesn't exist, return success
      return { deleted: false };
    }

    // 3. Delete value
    await ctx.db.delete("fieldValues", existing._id);

    // 4. Clean up postMeta for posts/pages
    if (args.entityType === "post" || args.entityType === "page") {
      try {
        const fieldDef = await ctx.db
          .query("fieldDefinitions")
          .withIndex("by_key", (q) => q.eq("key", args.fieldKey))
          .unique();

        if (fieldDef) {
          const meta = await ctx.db
            .query("postMeta")
            .withIndex("by_post_key", (q) =>
              q.eq("postId", args.entityId as Id<"posts">).eq("key", fieldDef.name),
            )
            .unique();

          if (meta) {
            await ctx.db.delete("postMeta", meta._id);
          }
        }
      } catch (err) {
        // postMeta table may not exist; log and skip
        console.warn("Custom field postMeta dual-write failed (deleteValue):", err);
      }
    }

    // 5. Return result
    return { deleted: true };
  },
});

/**
 * Batch set multiple field values on an entity.
 *
 * Requires `custom_field.set_value` capability.
 * Used by the content editor to save all dirty field values at once.
 */
export const setValues = mutation({
  args: setValuesArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const user = await requireCan(ctx, "custom_field.set_value");
    const now = Date.now();

    let saved = 0;
    let skipped = 0;
    for (const entry of args.values) {
      // 2. Retrieve field definition
      const fieldDef = await ctx.db
        .query("fieldDefinitions")
        .withIndex("by_key", (q) => q.eq("key", entry.fieldKey))
        .unique();

      if (!fieldDef) { skipped++; continue; } // Skip unknown fields
      if (LAYOUT_FIELD_TYPES.has(fieldDef.type)) { skipped++; continue; } // Skip layout fields

      // 2b. Type-specific validation
      {
        let parsedSettings: Record<string, unknown> = {};
        try {
          parsedSettings = JSON.parse(fieldDef.settings);
        } catch {
          // If settings JSON is malformed, use empty object
        }
        const validation = validateFieldValue(
          fieldDef.type,
          entry.value,
          parsedSettings,
          fieldDef.required,
        );
        if (!validation.valid) {
          // Skip invalid values in batch mode (don't fail entire batch)
          console.warn(
            `Custom field validation failed for "${fieldDef.label}" (${fieldDef.key}): ${validation.error}`,
          );
          skipped++;
          continue;
        }
      }

      // 3. Upsert field value
      const existing = await ctx.db
        .query("fieldValues")
        .withIndex("by_entity_field", (q) =>
          q
            .eq("entityType", args.entityType)
            .eq("entityId", args.entityId)
            .eq("fieldKey", entry.fieldKey),
        )
        .unique();

      if (existing) {
        await ctx.db.patch("fieldValues", existing._id, {
          value: entry.value,
          fieldName: fieldDef.name,
          updatedBy: getUserIdentifier(user),
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("fieldValues", {
          entityType: args.entityType,
          entityId: args.entityId,
          fieldKey: entry.fieldKey,
          fieldName: fieldDef.name,
          value: entry.value,
          updatedBy: getUserIdentifier(user),
          updatedAt: now,
        });
      }

      // 4. Dual-write to postMeta for posts/pages
      if (args.entityType === "post" || args.entityType === "page") {
        try {
          const existingMeta = await ctx.db
            .query("postMeta")
            .withIndex("by_post_key", (q) =>
              q
                .eq("postId", args.entityId as Id<"posts">)
                .eq("key", fieldDef.name),
            )
            .unique();

          if (existingMeta) {
            await ctx.db.patch("postMeta", existingMeta._id, {
              value: entry.value,
            });
          } else {
            await ctx.db.insert("postMeta", {
              postId: args.entityId as Id<"posts">,
              key: fieldDef.name,
              value: entry.value,
            });
          }
        } catch (err) {
          // postMeta table may not exist; log and skip
          console.warn("Custom field postMeta dual-write failed (setValues):", err);
        }
      }

      saved++;
    }

    // 5. Return counts
    return { saved, skipped };
  },
});

// ─── Group Utilities ────────────────────────────────────────────────────────

/**
 * Duplicate a field group with all its field definitions.
 *
 * Requires `custom_field.create_group` capability (Administrator only).
 * Deep-copies the group and all field definitions with new IDs and keys.
 * The copy starts as inactive to prevent accidental duplicate display.
 */
export const duplicateGroup = mutation({
  args: duplicateGroupArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const user = await requireCan(ctx, "custom_field.create_group");

    // 2. Fetch source group
    const sourceGroup = await ctx.db.get("fieldGroups", args.groupId);
    if (!sourceGroup) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Field group not found",
      });
    }

    // 3. Generate new title and key
    const newTitle = args.newTitle ?? `${sourceGroup.title} (Copy)`;
    const newKey = `${sourceGroup.key}_copy_${generateRandomHex()}`;

    // 4. Insert new group
    const now = Date.now();
    const newGroupId = await ctx.db.insert("fieldGroups", {
      title: newTitle,
      key: newKey,
      description: sourceGroup.description,
      locationRules: sourceGroup.locationRules,
      position: sourceGroup.position,
      style: sourceGroup.style,
      labelPlacement: sourceGroup.labelPlacement,
      instructionPlacement: sourceGroup.instructionPlacement,
      isActive: false, // Start inactive
      menuOrder: sourceGroup.menuOrder,
      createdBy: getUserIdentifier(user),
      createdAt: now,
      updatedAt: now,
    });

    // 5. Deep-copy field definitions (top-level first, then sub-fields)
    const allFields = await ctx.db
      .query("fieldDefinitions")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .collect();

    // Build a map from old ID to new ID for parent references
    const idMap = new Map<string, Id<"fieldDefinitions">>();

    // First pass: copy all fields, tracking ID mappings
    // Sort so parent fields come before children
    const topLevelFields = allFields.filter((f) => !f.parentFieldId);
    const subFields = allFields.filter((f) => f.parentFieldId);

    // Copy top-level fields first
    for (const field of topLevelFields) {
      const newFieldKey = generateFieldKey(field.name);
      const newFieldId = await ctx.db.insert("fieldDefinitions", {
        groupId: newGroupId,
        label: field.label,
        name: field.name,
        key: newFieldKey,
        type: field.type,
        instructions: field.instructions,
        required: field.required,
        defaultValue: field.defaultValue,
        settings: field.settings,
        conditionalLogic: field.conditionalLogic,
        wrapperWidth: field.wrapperWidth,
        wrapperClass: field.wrapperClass,
        wrapperId: field.wrapperId,
        menuOrder: field.menuOrder,
        createdAt: now,
        updatedAt: now,
      });
      idMap.set(field._id, newFieldId);
    }

    // Copy sub-fields, resolving parent references
    for (const field of subFields) {
      const newParentId = field.parentFieldId
        ? idMap.get(field.parentFieldId)
        : undefined;
      const newFieldKey = generateFieldKey(field.name);
      const newFieldId = await ctx.db.insert("fieldDefinitions", {
        groupId: newGroupId,
        label: field.label,
        name: field.name,
        key: newFieldKey,
        type: field.type,
        instructions: field.instructions,
        required: field.required,
        defaultValue: field.defaultValue,
        settings: field.settings,
        conditionalLogic: field.conditionalLogic,
        wrapperWidth: field.wrapperWidth,
        wrapperClass: field.wrapperClass,
        wrapperId: field.wrapperId,
        menuOrder: field.menuOrder,
        parentFieldId: newParentId,
        createdAt: now,
        updatedAt: now,
      });
      idMap.set(field._id, newFieldId);
    }

    // 6. Emit event
    await emitEvent(
      ctx,
      CUSTOM_FIELD_EVENTS.GROUP_CREATED,
      SYSTEM.CUSTOM_FIELD,
      {
        groupId: newGroupId,
        title: newTitle,
        key: newKey,
        fieldCount: allFields.length,
        createdBy: getUserIdentifier(user),
        duplicatedFrom: args.groupId,
      },
    );

    // 7. Return new group ID
    return newGroupId;
  },
});

/**
 * Export a field group and all its field definitions as JSON.
 *
 * Requires `custom_field.create_group` capability (Administrator only).
 * Returns a JSON string blob suitable for importGroup.
 */
export const exportGroup = mutation({
  args: exportGroupArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    await requireCan(ctx, "custom_field.create_group");

    // 2. Fetch group
    const group = await ctx.db.get("fieldGroups", args.groupId);
    if (!group) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Field group not found",
      });
    }

    // 3. Fetch all field definitions
    const fields = await ctx.db
      .query("fieldDefinitions")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .collect();

    // 4. Build export object (strip internal IDs)
    const exportData = {
      version: 1,
      exportedAt: Date.now(),
      group: {
        title: group.title,
        key: group.key,
        description: group.description,
        locationRules: group.locationRules,
        position: group.position,
        style: group.style,
        labelPlacement: group.labelPlacement,
        instructionPlacement: group.instructionPlacement,
        isActive: group.isActive,
        menuOrder: group.menuOrder,
      },
      fields: fields.map((f) => ({
        label: f.label,
        name: f.name,
        type: f.type,
        instructions: f.instructions,
        required: f.required,
        defaultValue: f.defaultValue,
        settings: f.settings,
        conditionalLogic: f.conditionalLogic,
        wrapperWidth: f.wrapperWidth,
        wrapperClass: f.wrapperClass,
        wrapperId: f.wrapperId,
        menuOrder: f.menuOrder,
        _origKey: f.key, // For parent reference resolution
        _origParentKey: f.parentFieldId
          ? fields.find((p) => p._id === f.parentFieldId)?.key
          : undefined,
      })),
    };

    return JSON.stringify(exportData, null, 2);
  },
});

/**
 * Import a field group from a JSON string.
 *
 * Requires `custom_field.create_group` capability (Administrator only).
 * Creates new group and field definitions with new IDs and keys.
 */
export const importGroup = mutation({
  args: importGroupArgs,
  handler: async (ctx, args) => {
    // 1. Auth + capability check
    const user = await requireCan(ctx, "custom_field.create_group");

    // 2. Parse JSON
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(args.data);
    } catch {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Invalid JSON data",
      });
    }

    // 3. Validate structure
    if (!data.group || !data.fields) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Import data must contain 'group' and 'fields' properties",
      });
    }

    // 4. Generate new key (avoid conflicts)
    const baseKey = generateSlug(data.group.title || "imported_group");
    const newKey = `${baseKey}_${generateRandomHex()}`;

    // 5. Insert new group
    const now = Date.now();
    const newGroupId = await ctx.db.insert("fieldGroups", {
      title: data.group.title || "Imported Group",
      key: newKey,
      description: data.group.description,
      locationRules: data.group.locationRules || [[{ param: "post_type", operator: "==" as const, value: "post" }]],
      position: data.group.position || "normal",
      style: data.group.style || "default",
      labelPlacement: data.group.labelPlacement || "top",
      instructionPlacement: data.group.instructionPlacement || "label",
      isActive: false, // Start inactive for safety
      menuOrder: data.group.menuOrder ?? 0,
      createdBy: getUserIdentifier(user),
      createdAt: now,
      updatedAt: now,
    });

    // 6. Import field definitions
    // First pass: import top-level fields (no parent)
    const origKeyToNewId = new Map<string, Id<"fieldDefinitions">>();
    const fieldsArray: Array<Record<string, unknown>> = data.fields;

    const topLevel = fieldsArray.filter((f: Record<string, unknown>) => !f._origParentKey);
    const subLevel = fieldsArray.filter((f: Record<string, unknown>) => f._origParentKey);

    for (const field of topLevel) {
      if (!field.label || !field.type) continue; // Skip invalid

      const fieldName = field.name || generateSlug(field.label);
      const fieldKey = generateFieldKey(fieldName);

      const newFieldId = await ctx.db.insert("fieldDefinitions", {
        groupId: newGroupId,
        label: field.label,
        name: fieldName,
        key: fieldKey,
        type: field.type,
        instructions: field.instructions,
        required: field.required ?? false,
        defaultValue: field.defaultValue,
        settings: field.settings || "{}",
        conditionalLogic: field.conditionalLogic,
        wrapperWidth: field.wrapperWidth,
        wrapperClass: field.wrapperClass,
        wrapperId: field.wrapperId,
        menuOrder: field.menuOrder ?? 0,
        createdAt: now,
        updatedAt: now,
      });

      if (field._origKey) {
        origKeyToNewId.set(field._origKey, newFieldId);
      }
    }

    // Second pass: import sub-fields with resolved parent references
    for (const field of subLevel) {
      if (!field.label || !field.type) continue;

      const parentId = field._origParentKey
        ? origKeyToNewId.get(field._origParentKey)
        : undefined;

      const fieldName = field.name || generateSlug(field.label);
      const fieldKey = generateFieldKey(fieldName);

      const newFieldId = await ctx.db.insert("fieldDefinitions", {
        groupId: newGroupId,
        label: field.label,
        name: fieldName,
        key: fieldKey,
        type: field.type,
        instructions: field.instructions,
        required: field.required ?? false,
        defaultValue: field.defaultValue,
        settings: field.settings || "{}",
        conditionalLogic: field.conditionalLogic,
        wrapperWidth: field.wrapperWidth,
        wrapperClass: field.wrapperClass,
        wrapperId: field.wrapperId,
        menuOrder: field.menuOrder ?? 0,
        parentFieldId: parentId,
        createdAt: now,
        updatedAt: now,
      });

      if (field._origKey) {
        origKeyToNewId.set(field._origKey, newFieldId);
      }
    }

    // 7. Emit event
    await emitEvent(
      ctx,
      CUSTOM_FIELD_EVENTS.GROUP_CREATED,
      SYSTEM.CUSTOM_FIELD,
      {
        groupId: newGroupId,
        title: data.group.title || "Imported Group",
        key: newKey,
        fieldCount: fieldsArray.length,
        createdBy: getUserIdentifier(user),
        imported: true,
      },
    );

    // 8. Return new group ID
    return newGroupId;
  },
});
