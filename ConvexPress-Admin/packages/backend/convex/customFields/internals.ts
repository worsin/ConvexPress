/**
 * Custom Field System - Internal Functions
 *
 * Functions that are NOT callable from the client. Used for system-to-system
 * communication (e.g., Post System calling to clean up field values when
 * a post is deleted).
 *
 * Internal functions:
 *   - deleteFieldValuesForEntity - Delete all field values for an entity (post/page/user)
 *   - deletePostMetaForField     - Delete postMeta entries for a specific field
 *   - getGroupsForEntityType     - Get active groups matching an entity type
 *   - getFieldDefinitionByKey    - Look up a field definition by its key
 */

import { internalMutation, internalQuery } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";

// ─── Cleanup Functions ──────────────────────────────────────────────────────

/**
 * Delete all field values for a given entity.
 *
 * Called by the Post System when a post is permanently deleted,
 * or by the User Profile System when a user is deleted.
 * Also cleans up corresponding postMeta entries for posts/pages.
 */
export const deleteFieldValuesForEntity = internalMutation({
  args: {
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all field values for this entity
    const values = await ctx.db
      .query("fieldValues")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId),
      )
      .collect();

    let deleted = 0;
    for (const value of values) {
      await ctx.db.delete("fieldValues", value._id);
      deleted++;
    }

    // If entity is a post/page, also clean up postMeta entries
    if (
      (args.entityType === "post" || args.entityType === "page") &&
      deleted > 0
    ) {
      try {
        // Get all postMeta entries for this post
        const metaEntries = await ctx.db
          .query("postMeta")
          .withIndex("by_post", (q) => q.eq("postId", args.entityId as Id<"posts">))
          .collect();

        // Build a set of field names that we just deleted from fieldValues
        const fieldNames = new Set(values.map((v) => v.fieldName));

        // Delete postMeta entries that match our field names
        let metaDeleted = 0;
        for (const meta of metaEntries) {
          if (fieldNames.has(meta.key)) {
            await ctx.db.delete("postMeta", meta._id);
            metaDeleted++;
          }
        }

        return { fieldValuesDeleted: deleted, postMetaDeleted: metaDeleted };
      } catch (err) {
        // postMeta table may not exist; log and skip
        console.warn("Custom field postMeta cleanup failed (deleteFieldValuesForEntity):", err);
      }
    }

    return { fieldValuesDeleted: deleted, postMetaDeleted: 0 };
  },
});

/**
 * Delete postMeta entries for a specific field name on a specific post.
 *
 * Used when a field definition is deleted and we need to clean up
 * the denormalized postMeta entries.
 */
export const deletePostMetaForField = internalMutation({
  args: {
    fieldName: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const metaEntries = await ctx.db
        .query("postMeta")
        .withIndex("by_key", (q) => q.eq("key", args.fieldName))
        .collect();

      let deleted = 0;
      for (const meta of metaEntries) {
        await ctx.db.delete("postMeta", meta._id);
        deleted++;
      }

      return { deleted };
    } catch (err) {
      // postMeta table may not exist; log and skip
      console.warn("Custom field postMeta cleanup failed (deletePostMetaForField):", err);
      return { deleted: 0 };
    }
  },
});

// ─── Lookup Helpers ─────────────────────────────────────────────────────────

/**
 * Get all active field groups that match a given entity type.
 *
 * Used by other systems to determine if custom fields should be shown
 * for a specific content type (e.g., when rendering the post editor).
 *
 * This is a simpler version of the public getGroupsForContext query,
 * intended for internal system-to-system checks.
 */
export const getGroupsForEntityType = internalQuery({
  args: {
    entityType: v.string(),
  },
  handler: async (ctx, args) => {
    // Fetch all active groups
    const activeGroups = await ctx.db
      .query("fieldGroups")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Filter to groups that have a location rule matching the entity type
    const matchingGroups = activeGroups.filter((group) => {
      return group.locationRules.some((ruleGroup) => {
        return ruleGroup.some(
          (condition) =>
            condition.param === "post_type" &&
            condition.operator === "==" &&
            condition.value === args.entityType,
        );
      });
    });

    // Sort by menuOrder
    matchingGroups.sort((a, b) => a.menuOrder - b.menuOrder);

    return matchingGroups;
  },
});

/**
 * Get a field definition by its unique key.
 *
 * Used by other systems that store field keys and need to resolve
 * them to full definitions (e.g., for type-aware value rendering).
 */
export const getFieldDefinitionByKey = internalQuery({
  args: {
    fieldKey: v.string(),
  },
  handler: async (ctx, args) => {
    const field = await ctx.db
      .query("fieldDefinitions")
      .withIndex("by_key", (q) => q.eq("key", args.fieldKey))
      .unique();

    return field;
  },
});

/**
 * Get all field definitions for a group (internal version without auth).
 *
 * Used by other systems that need to inspect field definitions
 * without going through the public query auth layer.
 */
export const getFieldDefinitionsForGroup = internalQuery({
  args: {
    groupId: v.id("fieldGroups"),
  },
  handler: async (ctx, args) => {
    const fields = await ctx.db
      .query("fieldDefinitions")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .collect();

    fields.sort((a, b) => a.menuOrder - b.menuOrder);

    return fields;
  },
});
