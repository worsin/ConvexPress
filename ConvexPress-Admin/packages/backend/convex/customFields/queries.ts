/**
 * Custom Field System - Public Queries
 *
 * All read operations for field groups, field definitions, and field values.
 *
 * Queries:
 *   - listGroups          - List all field groups with optional status filter and search
 *   - getGroup            - Get a single field group by ID or key
 *   - getFieldsByGroup    - Get all field definitions for a group, ordered by menuOrder
 *   - getGroupsForContext - Get groups matching an editor context (location rules)
 *   - getValue            - Get a single field value for an entity + field combo
 *   - getAllValues         - Get all field values for an entity
 *   - getFieldWithValue   - Get field definition + stored value for an entity + field name
 *   - searchGroups        - Search field groups by title or key
 *   - counts              - Count groups and fields for dashboard widgets
 *
 * Authentication:
 *   - Admin queries (listGroups, getGroup, getFieldsByGroup, searchGroups, counts)
 *     require authentication
 *   - Editor context queries (getGroupsForContext) require authentication
 *   - Value queries (getValue, getAllValues, getFieldWithValue) allow anonymous
 *     access for published content on the public website (SSR)
 */

import { query } from "../_generated/server";
import { getCurrentUser } from "../helpers/permissions";
import { evaluateLocationRules } from "../helpers/locationRules";
import type { LocationContext } from "../helpers/locationRules";
import {
  listGroupsArgs,
  getGroupArgs,
  getFieldsByGroupArgs,
  getGroupsForContextArgs,
  getValueArgs,
  getAllValuesArgs,
  getFieldWithValueArgs,
  searchGroupsArgs,
} from "./validators";
import { isPluginEnabled } from "../helpers/plugins";

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * List all field groups with optional status filter and search.
 *
 * Auth: Required (admin usage).
 * Returns groups sorted by menuOrder with field count per group.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const listGroups = query({
  args: listGroupsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    // Auth check
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    // Fetch groups based on status filter
    let groups;
    if (args.status === "active") {
      groups = await ctx.db
        .query("fieldGroups")
        .withIndex("by_active", (q: ConvexQueryBuilder) => q.eq("isActive", true))
        .collect();
    } else if (args.status === "inactive") {
      groups = await ctx.db
        .query("fieldGroups")
        .withIndex("by_active", (q: ConvexQueryBuilder) => q.eq("isActive", false))
        .collect();
    } else {
      // "all" or undefined: fetch all groups sorted by order
      groups = await ctx.db
        .query("fieldGroups")
        .withIndex("by_order")
        .collect();
    }

    // Search filter (case-insensitive substring on title or key)
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      groups = groups.filter(
        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        (g) =>
          g.title.toLowerCase().includes(searchLower) ||
          g.key.toLowerCase().includes(searchLower),
      );
    }

    // Sort by menuOrder (may already be sorted by index, but ensure consistency)
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    groups.sort((a, b) => a.menuOrder - b.menuOrder);

    // Join with field count
    const groupsWithCounts = await Promise.all(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      groups.map(async (group) => {
        const fields = await ctx.db
          .query("fieldDefinitions")
          .withIndex("by_group", (q: ConvexQueryBuilder) => q.eq("groupId", group._id))
          .collect();

        return {
          ...group,
          fieldCount: fields.length,
        };
      }),
    );

    return groupsWithCounts;
  },
});

/**
 * Get a single field group by ID or by key.
 *
 * Auth: Required (admin usage).
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getGroup = query({
  args: getGroupArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    let group;
    if (args.groupId) {
      group = await ctx.db.get("fieldGroups", args.groupId);
    } else if (args.key) {
      group = await ctx.db
        .query("fieldGroups")
        .withIndex("by_key", (q: ConvexQueryBuilder) => q.eq("key", args.key!))
        .unique();
    } else {
      return null;
    }

    return group ?? null;
  },
});

/**
 * Get all field definitions for a group, ordered by menuOrder.
 *
 * Auth: Required (admin usage).
 * Returns flat list sorted by menuOrder. Sub-fields are included
 * with parentFieldId references for client-side nesting.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getFieldsByGroup = query({
  args: getFieldsByGroupArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const fields = await ctx.db
      .query("fieldDefinitions")
      .withIndex("by_group", (q: ConvexQueryBuilder) => q.eq("groupId", args.groupId))
      .collect();

    // Sort by menuOrder (index already sorts, but ensure)
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    fields.sort((a, b) => a.menuOrder - b.menuOrder);

    return fields;
  },
});

/**
 * Get field groups matching an editor context via location rules evaluation.
 *
 * Auth: Required (editor context).
 * Evaluates each active group's location rules against the provided context.
 * Returns matching groups with their field definitions, sorted by menuOrder.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getGroupsForContext = query({
  args: getGroupsForContextArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    // 1. Fetch all active field groups
    const activeGroups = await ctx.db
      .query("fieldGroups")
      .withIndex("by_active", (q: ConvexQueryBuilder) => q.eq("isActive", true))
      .collect();

    // 2. Build location context from args
    const context: LocationContext = {
      postType: args.postType,
      postTemplate: args.postTemplate,
      postStatus: args.postStatus,
      postCategories: args.postCategories,
      pageTemplate: args.pageTemplate,
      pageType: args.pageType,
      pageParent: args.pageParent,
      currentUserRole: args.currentUserRole,
      taxonomy: args.taxonomy,
    };

    // 3. Evaluate each group's location rules
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    const matchingGroups = activeGroups.filter((group) =>
      evaluateLocationRules(group.locationRules, context),
    );

    // 4. Sort by menuOrder
    // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
    matchingGroups.sort((a, b) => a.menuOrder - b.menuOrder);

    // 5. Fetch field definitions for each matching group
    const groupsWithFields = await Promise.all(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      matchingGroups.map(async (group) => {
        const fields = await ctx.db
          .query("fieldDefinitions")
          .withIndex("by_group", (q: ConvexQueryBuilder) => q.eq("groupId", group._id))
          .collect();

        // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
        fields.sort((a, b) => a.menuOrder - b.menuOrder);

        return {
          ...group,
          fields,
        };
      }),
    );

    return groupsWithFields;
  },
});

/**
 * Get a single field value for an entity + field combo.
 *
 * Auth: Public for published content (website SSR).
 * Looks up by fieldKey or fieldName. Returns the value with type info.
 * If no stored value exists but field has a defaultValue, returns the default.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getValue = query({
  args: getValueArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    // No auth required - allows anonymous access for public content

    let fieldDef;
    let fieldKey: string | undefined;

    // Look up field definition
    if (args.fieldKey) {
      fieldDef = await ctx.db
        .query("fieldDefinitions")
        .withIndex("by_key", (q: ConvexQueryBuilder) => q.eq("key", args.fieldKey!))
        .unique();
      fieldKey = args.fieldKey;
    } else if (args.fieldName) {
      fieldDef = await ctx.db
        .query("fieldDefinitions")
        .withIndex("by_name", (q: ConvexQueryBuilder) => q.eq("name", args.fieldName!))
        .first();
      fieldKey = fieldDef?.key;
    }

    if (!fieldDef || !fieldKey) return null;

    // Look up the stored value
    const fieldValue = await ctx.db
      .query("fieldValues")
      .withIndex("by_entity_field", (q: ConvexQueryBuilder) =>
        q
          .eq("entityType", args.entityType)
          .eq("entityId", args.entityId)
          .eq("fieldKey", fieldKey!),
      )
      .unique();

    if (fieldValue) {
      return {
        fieldKey: fieldDef.key,
        fieldName: fieldDef.name,
        type: fieldDef.type,
        value: fieldValue.value,
      };
    }

    // If no stored value but field has a default, return default
    if (fieldDef.defaultValue !== undefined) {
      return {
        fieldKey: fieldDef.key,
        fieldName: fieldDef.name,
        type: fieldDef.type,
        value: fieldDef.defaultValue,
      };
    }

    return null;
  },
});

/**
 * Get all field values for an entity.
 *
 * Auth: Public for published content (website SSR).
 * Returns an array of field values with type info from definitions.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getAllValues = query({
  args: getAllValuesArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    // No auth required - allows anonymous access for public content

    // Get all values for this entity
    const values = await ctx.db
      .query("fieldValues")
      .withIndex("by_entity", (q: ConvexQueryBuilder) =>
        q.eq("entityType", args.entityType).eq("entityId", args.entityId),
      )
      .collect();

    // Join with field definitions for type info
    const valuesWithType = await Promise.all(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      values.map(async (val) => {
        const fieldDef = await ctx.db
          .query("fieldDefinitions")
          .withIndex("by_key", (q: ConvexQueryBuilder) => q.eq("key", val.fieldKey))
          .unique();

        return {
          fieldKey: val.fieldKey,
          fieldName: val.fieldName,
          type: fieldDef?.type ?? "unknown",
          value: val.value,
        };
      }),
    );

    return valuesWithType;
  },
});

/**
 * Get a field definition + its stored value for a specific entity and field name.
 *
 * Auth: Public for published content (website SSR).
 * Returns both the definition schema and the current value.
 * Equivalent to WordPress's get_field_object().
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const getFieldWithValue = query({
  args: getFieldWithValueArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    // No auth required - allows anonymous access for public content

    // Look up field definition by name
    const fieldDef = await ctx.db
      .query("fieldDefinitions")
      .withIndex("by_name", (q: ConvexQueryBuilder) => q.eq("name", args.fieldName))
      .first();

    if (!fieldDef) return null;

    // Look up stored value
    const fieldValue = await ctx.db
      .query("fieldValues")
      .withIndex("by_entity_field", (q: ConvexQueryBuilder) =>
        q
          .eq("entityType", args.entityType)
          .eq("entityId", args.entityId)
          .eq("fieldKey", fieldDef.key),
      )
      .unique();

    return {
      definition: fieldDef,
      value: fieldValue?.value ?? fieldDef.defaultValue ?? null,
    };
  },
});

/**
 * Search field groups by title or key.
 *
 * Auth: Required (admin usage).
 * Simple case-insensitive substring search.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const searchGroups = query({
  args: searchGroupsArgs,
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx, args) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const searchLower = args.query.toLowerCase();

    const allGroups = await ctx.db
      .query("fieldGroups")
      .withIndex("by_order")
      .collect();

    return allGroups.filter(
      // @ts-expect-error TS7006: Callback param loses contextual typing downstream of TS2589.
      (g) =>
        g.title.toLowerCase().includes(searchLower) ||
        g.key.toLowerCase().includes(searchLower),
    );
  },
});

/**
 * Get counts of field groups and field definitions for dashboard.
 *
 * Auth: Required (admin dashboard).
 * Returns { groups, activeGroups, fields } for "At a Glance" widgets.
 */
// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const counts = query({
  args: {},
  // @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "customFields"))) return null;
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { groups: 0, activeGroups: 0, fields: 0 };
    }

    const allGroups = await ctx.db.query("fieldGroups").collect();
    const allFields = await ctx.db.query("fieldDefinitions").collect();

    let activeGroups = 0;
    for (const group of allGroups) {
      if (group.isActive) activeGroups++;
    }

    return {
      groups: allGroups.length,
      activeGroups,
      fields: allFields.length,
    };
  },
});
