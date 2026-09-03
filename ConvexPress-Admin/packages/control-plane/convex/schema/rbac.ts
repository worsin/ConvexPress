import { defineTable } from "convex/server";
import { v } from "convex/values";

const roleSubjectType = v.union(
  v.literal("user"),
  v.literal("role"),
  v.literal("agent"),
);

const syncStatus = v.union(
  v.literal("synced"),
  v.literal("planned"),
  v.literal("blocked"),
  v.literal("error"),
);

const grantEffect = v.union(v.literal("allow"), v.literal("deny"));

const permissionSelectorType = v.union(
  v.literal("action"),
  v.literal("skill"),
  v.literal("app"),
  v.literal("system"),
  v.literal("category"),
  v.literal("domain"),
  v.literal("all"),
);

const definitionScopeFields = {
  organization_id: v.optional(v.id("overseer_organizations")),
  business_id: v.optional(v.id("overseer_businesses")),
  owner_id: v.optional(v.string()),
  app_id: v.optional(v.string()),
  vo_project_id: v.optional(v.id("genericprojects_projects")),
  tags: v.optional(v.array(v.string())),
};

export const rbacTables = {
  overseer_accessPresets: defineTable({
    ...definitionScopeFields,
    dnaiCode: v.optional(v.string()),
    name: v.string(),
    departmentCode: v.optional(v.string()),
    kind: v.optional(v.string()),
    notes: v.optional(v.string()),
    ownerLabel: v.optional(v.string()),
    ownerAppId: v.optional(v.string()),
    sourceAppId: v.optional(v.string()),
    defaultRoleSlug: v.optional(v.string()),
    defaultRoleName: v.optional(v.string()),
    defaultRoleMagicRecordId: v.optional(v.string()),
    defaultAppIds: v.array(v.string()),
    status: v.optional(v.string()),
    magicTablesBaseId: v.optional(v.string()),
    magicTablesTableId: v.optional(v.string()),
    magicTablesRecordId: v.optional(v.string()),
    sourceSection: v.optional(v.string()),
    sourceFields: v.optional(v.any()),
    syncedAt: v.optional(v.number()),
    syncStatus: v.optional(syncStatus),
    syncHash: v.optional(v.string()),
    syncIssues: v.optional(v.array(v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_department_code", ["departmentCode"])
    .index("by_kind", ["kind"])
    .index("by_role_slug", ["defaultRoleSlug"])
    .index("by_magic_record", ["magicTablesRecordId"])
    .index("by_source_app", ["sourceAppId"])
    .index("by_status", ["status"]),

  overseer_permissions: defineTable({
    ...definitionScopeFields,
    team_id: v.optional(v.id("overseer_teams")),
    roleSlug: v.optional(v.string()),
    subjectType: v.optional(roleSubjectType),
    subjectId: v.optional(v.string()),
    actionCode: v.string(),
    actionDnaiCode: v.optional(v.string()),
    selectorType: v.optional(permissionSelectorType),
    selectorCode: v.optional(v.string()),
    skillCode: v.optional(v.string()),
    capabilityCode: v.optional(v.string()),
    constraints: v.optional(v.any()),
    autonomyMax: v.optional(v.string()),
    riskMax: v.optional(v.string()),
    approvalPolicy: v.optional(v.string()),
    rateLimit: v.optional(v.number()),
    ratePeriodMs: v.optional(v.number()),
    effectiveAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    grantedBy: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    effect: grantEffect,
    status: v.optional(v.string()),
    sourceAppId: v.optional(v.string()),
    magicTablesBaseId: v.optional(v.string()),
    magicTablesTableId: v.optional(v.string()),
    magicTablesRecordId: v.optional(v.string()),
    syncedAt: v.optional(v.number()),
    syncHash: v.optional(v.string()),
  })
    .index("by_action", ["actionCode"])
    .index("by_role_action", ["roleSlug", "actionCode"])
    .index("by_subject", ["subjectType", "subjectId"])
    .index("by_subject_selector", [
      "subjectType",
      "subjectId",
      "selectorType",
      "selectorCode",
    ])
    .index("by_selector", ["selectorType", "selectorCode"])
    .index("by_source_app", ["sourceAppId"]),

  overseer_roleAssignments: defineTable({
    roleId: v.id("overseer_roles"),
    userId: v.optional(v.id("overseer_users")),
    subjectType: v.optional(roleSubjectType),
    subjectId: v.optional(v.string()),
    assignedBy: v.optional(v.id("overseer_users")),
    assignedAt: v.optional(v.number()),
    status: v.optional(
      v.union(v.literal("active"), v.literal("revoked"), v.literal("expired")),
    ),
    businessId: v.optional(v.id("overseer_businesses")),
    business_id: v.optional(v.id("overseer_businesses")),
    organization_id: v.optional(v.id("overseer_organizations")),
    owner_id: v.optional(v.string()),
    app_id: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_subject", ["subjectType", "subjectId"])
    .index("by_role", ["roleId"])
    .index("by_status", ["status"])
    .index("by_app", ["app_id"])
    .index("by_user_app", ["userId", "app_id"])
    .index("by_user_business", ["userId", "businessId"])
    .index("by_subject_app", ["subjectType", "subjectId", "app_id"]),

  overseer_roles: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    level: v.number(),
    type: v.union(
      v.literal("built-in"),
      v.literal("custom"),
      v.literal("internal"),
      v.literal("customer"),
      v.literal("system"),
      v.literal("user"),
      v.literal("operator"),
      v.literal("admin"),
    ),
    isDefault: v.boolean(),
    status: v.union(
      v.literal("active"),
      v.literal("inactive"),
      v.literal("planned"),
    ),
    capabilities: v.array(v.string()),
    pageAccess: v.array(v.string()),
    sourceApp: v.optional(v.string()),
    notes: v.optional(v.string()),
    auditStatus: v.optional(v.string()),
    completion: v.optional(v.number()),
    capabilitySummary: v.optional(v.string()),
    routeAccess: v.optional(v.string()),
    magicTablesRowId: v.optional(v.string()),
    dnaiCode: v.optional(v.string()),
    actionCodes: v.optional(v.array(v.string())),
    routePaths: v.optional(v.array(v.string())),
    systemCodes: v.optional(v.array(v.string())),
    ownerAppId: v.optional(v.string()),
    sourceAppId: v.optional(v.string()),
    magicTablesBaseId: v.optional(v.string()),
    magicTablesTableId: v.optional(v.string()),
    magicTablesRecordId: v.optional(v.string()),
    sourceSection: v.optional(v.string()),
    sourceFields: v.optional(v.any()),
    syncedAt: v.optional(v.number()),
    syncStatus: v.optional(syncStatus),
    syncHash: v.optional(v.string()),
    syncIssues: v.optional(v.array(v.string())),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_type", ["type"]),
};
