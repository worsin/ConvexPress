import { defineTable } from "convex/server";
import { v } from "convex/values";

export const membershipPlanStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived"),
);

export const membershipGrantStatusValidator = v.union(
  v.literal("active"),
  v.literal("grace"),
  v.literal("revoked"),
  v.literal("expired"),
);

export const membershipRestrictionModeValidator = v.union(
  v.literal("allow_only"),
  v.literal("deny_if_missing"),
);

export const membershipTables = {
  membership_plans: defineTable({
    title: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    status: membershipPlanStatusValidator,
    grantMode: v.union(
      v.literal("manual"),
      v.literal("subscription"),
      v.literal("purchase"),
      v.literal("hybrid"),
    ),
    linkedSubscriptionCode: v.optional(v.string()),
    linkedRoleId: v.optional(v.id("roles")),
    linkedCapabilities: v.optional(v.array(v.string())),
    priority: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"]),

  membership_plan_benefits: defineTable({
    planId: v.id("membership_plans"),
    code: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    displayAsFeature: v.optional(v.boolean()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_plan", ["planId"]),

  membership_grants: defineTable({
    userId: v.id("users"),
    planId: v.id("membership_plans"),
    sourceType: v.union(
      v.literal("manual"),
      v.literal("subscription"),
      v.literal("purchase"),
      v.literal("import"),
    ),
    sourceRef: v.optional(v.string()),
    status: membershipGrantStatusValidator,
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    graceEndsAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_plan", ["planId"])
    .index("by_user_status", ["userId", "status"]),

  membership_restriction_rules: defineTable({
    resourceType: v.union(
      v.literal("page"),
      v.literal("post"),
      v.literal("route"),
      v.literal("product"),
      v.literal("block"),
    ),
    resourceIdOrKey: v.string(),
    ruleMode: membershipRestrictionModeValidator,
    planIds: v.array(v.id("membership_plans")),
    requiredCapabilities: v.optional(v.array(v.string())),
    teaserMode: v.union(
      v.literal("hide"),
      v.literal("excerpt"),
      v.literal("custom_message"),
    ),
    customMessage: v.optional(v.string()),
    loginRequired: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_resource", ["resourceType", "resourceIdOrKey"]),

  membership_access_log: defineTable({
    userId: v.optional(v.id("users")),
    resourceType: v.string(),
    resourceIdOrKey: v.string(),
    allowed: v.boolean(),
    reason: v.optional(v.string()),
    matchingPlanIds: v.array(v.id("membership_plans")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_resource", ["resourceType", "resourceIdOrKey"]),
};
