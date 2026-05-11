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
import { isPluginEnabled, requirePluginEnabled } from "../helpers/plugins";

// ─── Cleanup Functions ──────────────────────────────────────────────────────

/**
 * Delete all field values for a given entity.
 *
 * Called by the Post System when a post is permanently deleted,
 * or by the User Profile System when a user is deleted.
 * Also cleans up corresponding postMeta entries for posts/pages.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const deleteFieldValuesForEntity = internalMutation({
  args: {
    entityType: v.string(),
    entityId: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "customFields");
    // Get all field values for this entity
    const values = await ctx.db
      .query("fieldValues")
      .withIndex("by_entity", (q: ConvexQueryBuilder) =>
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
          .withIndex("by_post", (q: ConvexQueryBuilder) => q.eq("postId", args.entityId as Id<"posts">))
          .collect();

        // Build a set of field names that we just deleted from fieldValues
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const deletePostMetaForField = internalMutation({
  args: {
    fieldName: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    await requirePluginEnabled(ctx, "customFields");
    try {
      const metaEntries = await ctx.db
        .query("postMeta")
        .withIndex("by_key", (q: ConvexQueryBuilder) => q.eq("key", args.fieldName))
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getGroupsForEntityType = internalQuery({
  args: {
    entityType: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    // Fetch all active groups
    const activeGroups = await ctx.db
      .query("fieldGroups")
      .withIndex("by_active", (q: ConvexQueryBuilder) => q.eq("isActive", true))
      .collect();

    // Filter to groups that have a location rule matching the entity type
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    const matchingGroups = activeGroups.filter((group) => {
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      return group.locationRules.some((ruleGroup) => {
        return ruleGroup.some(
          // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
          (condition) =>
            condition.param === "post_type" &&
            condition.operator === "==" &&
            condition.value === args.entityType,
        );
      });
    });

    // Sort by menuOrder
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getFieldDefinitionByKey = internalQuery({
  args: {
    fieldKey: v.string(),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    const field = await ctx.db
      .query("fieldDefinitions")
      .withIndex("by_key", (q: ConvexQueryBuilder) => q.eq("key", args.fieldKey))
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
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getFieldDefinitionsForGroup = internalQuery({
  args: {
    // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
    groupId: v.id("fieldGroups"),
  },
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    const fields = await ctx.db
      .query("fieldDefinitions")
      .withIndex("by_group", (q: ConvexQueryBuilder) => q.eq("groupId", args.groupId))
      .collect();

    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    fields.sort((a, b) => a.menuOrder - b.menuOrder);

    return fields;
  },
});
