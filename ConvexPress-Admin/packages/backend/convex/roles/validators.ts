/**
 * Role & Capability System - Shared Argument Validators
 *
 * Reusable Convex argument validators for role mutations.
 * Centralizes validation logic to keep mutations clean.
 */

import { v } from "convex/values";

/**
 * Role type union validator.
 */
export const roleTypeValidator = v.union(
  v.literal("internal"),
  v.literal("customer"),
  v.literal("system"),
);

/**
 * Role status union validator.
 */
export const roleStatusValidator = v.union(
  v.literal("active"),
  v.literal("inactive"),
);

/**
 * Arguments for creating a new role.
 */
export const createRoleArgs = {
  name: v.string(),
  slug: v.string(),
  description: v.string(),
  level: v.number(),
  type: roleTypeValidator,
  isDefault: v.optional(v.boolean()),
  capabilities: v.array(v.string()),
  pageAccess: v.array(v.string()),
};

/**
 * Arguments for updating an existing role.
 */
export const updateRoleArgs = {
  roleId: v.id("roles"),
  name: v.optional(v.string()),
  slug: v.optional(v.string()),
  description: v.optional(v.string()),
  level: v.optional(v.number()),
  type: v.optional(roleTypeValidator),
  isDefault: v.optional(v.boolean()),
  capabilities: v.optional(v.array(v.string())),
  pageAccess: v.optional(v.array(v.string())),
  status: v.optional(roleStatusValidator),
};

/**
 * Arguments for assigning a role to a user.
 */
export const assignRoleArgs = {
  userId: v.id("users"),
  roleId: v.id("roles"),
  reason: v.optional(v.string()),
};

/**
 * Arguments for granting a capability to a role.
 */
export const grantCapabilityArgs = {
  roleId: v.id("roles"),
  capability: v.string(),
};

/**
 * Arguments for revoking a capability from a role.
 */
export const revokeCapabilityArgs = {
  roleId: v.id("roles"),
  capability: v.string(),
};
