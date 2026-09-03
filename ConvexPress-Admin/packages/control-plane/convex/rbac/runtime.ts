import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  resolveAccessDecision,
  type AccessDecisionInput,
  type AccessTarget,
  type PermissionGrant,
  type RoleAssignment,
  type RoleDefinition,
} from "./decision";

type ReadCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

function uniqueById<T extends { _id: unknown }>(rows: readonly T[]): T[] {
  return [...new Map(rows.map((row) => [String(row._id), row])).values()];
}

function storedTarget(row: {
  organization_id?: unknown;
  business_id?: unknown;
  businessId?: unknown;
  constraints?: unknown;
}): { target?: RoleAssignment["target"]; includeChildren: boolean } {
  const constraints =
    row.constraints && typeof row.constraints === "object"
      ? (row.constraints as Record<string, unknown>)
      : {};
  const instanceId =
    typeof constraints.instanceId === "string" ? constraints.instanceId : undefined;
  const websiteId =
    typeof constraints.websiteId === "string" ? constraints.websiteId : undefined;
  const businessId =
    (typeof constraints.businessId === "string" ? constraints.businessId : undefined) ??
    row.businessId ??
    row.business_id;
  const organizationId =
    (typeof constraints.organizationId === "string"
      ? constraints.organizationId
      : undefined) ?? row.organization_id;

  if (instanceId) {
    return {
      target: { type: "environment", id: instanceId },
      includeChildren: false,
    };
  }
  if (websiteId) {
    return {
      target: { type: "website", id: websiteId },
      includeChildren: constraints.includeChildren === true,
    };
  }
  if (businessId) {
    return {
      target: { type: "business", id: String(businessId) },
      includeChildren: constraints.includeChildren === true,
    };
  }
  if (organizationId) {
    return {
      target: { type: "organization", id: String(organizationId) },
      includeChildren: constraints.includeChildren === true,
    };
  }
  return { includeChildren: false };
}

function mapAssignment(
  row: Doc<"overseer_roleAssignments">,
  roleSlug: string,
): RoleAssignment | null {
  if (!row.userId) return null;
  const { target, includeChildren } = storedTarget(row);
  return {
    assignmentId: String(row._id),
    userId: String(row.userId),
    roleSlug,
    status: row.status ?? "active",
    ...(target ? { target } : {}),
    includeChildren,
  };
}

function mapRole(row: Doc<"overseer_roles">): RoleDefinition {
  return {
    slug: row.slug,
    status: row.status,
    capabilityCodes: row.actionCodes ?? row.capabilities,
    routePaths: row.routePaths ?? row.pageAccess,
  };
}

function mapPermission(
  row: Doc<"overseer_permissions">,
  request: AccessDecisionInput["request"],
): PermissionGrant {
  const { target, includeChildren } = storedTarget(row);
  const storedCode = row.capabilityCode ?? row.actionCode;
  const selector =
    row.selectorType === "all" || storedCode === "*"
      ? ({ type: "all" } as const)
      : request.selector.type === "route" && storedCode.startsWith("route:")
        ? ({ type: "route", code: storedCode.slice(6) } as const)
        : ({ type: request.selector.type, code: storedCode } as const);
  const subject: PermissionGrant["subject"] = row.subjectType && row.subjectId
    ? row.subjectType === "role"
      ? { type: "role", id: row.subjectId }
      : { type: "user", id: row.subjectId }
    : row.roleSlug
      ? { type: "role", id: row.roleSlug }
      : { type: "all" };

  return {
    permissionId: String(row._id),
    effect: row.effect,
    status: row.status as PermissionGrant["status"],
    subject,
    selector,
    ...(target ? { target } : {}),
    includeChildren,
    effectiveAt: row.effectiveAt,
    expiresAt: row.expiresAt,
  };
}

function requestedStoredCodes(request: AccessDecisionInput["request"]): string[] {
  const code = request.selector.code;
  return request.selector.type === "route"
    ? [`route:${code}`, "*"]
    : [code, "*"];
}

export async function resolveStoredAccess(
  ctx: ReadCtx,
  operator: Doc<"overseer_users">,
  request: AccessDecisionInput["request"],
) {
  const userId = operator._id;
  const [
    directAssignments,
    subjectAssignments,
    directPermissions,
    organizationGrants,
    businessGrants,
    websiteGrants,
    ...actionGroups
  ] =
    await Promise.all([
      ctx.db
        .query("overseer_roleAssignments")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(200),
      ctx.db
        .query("overseer_roleAssignments")
        .withIndex("by_subject", (q) =>
          q.eq("subjectType", "user").eq("subjectId", String(userId)),
        )
        .take(200),
      ctx.db
        .query("overseer_permissions")
        .withIndex("by_subject", (q) =>
          q.eq("subjectType", "user").eq("subjectId", String(userId)),
        )
        .take(500),
      ctx.db
        .query("overseer_organizationAccess")
        .withIndex("by_subject", (q) =>
          q.eq("subjectType", "user").eq("subjectId", String(userId)),
        )
        .take(200),
      ctx.db
        .query("overseer_businessAccess")
        .withIndex("by_subject", (q) =>
          q.eq("subjectType", "user").eq("subjectId", String(userId)),
        )
        .take(200),
      ctx.db
        .query("overseer_websiteAccess")
        .withIndex("by_subject", (q) =>
          q.eq("subjectType", "user").eq("subjectId", String(userId)),
        )
        .take(500),
      ...requestedStoredCodes(request).map((actionCode) =>
        ctx.db
          .query("overseer_permissions")
          .withIndex("by_action", (q) => q.eq("actionCode", actionCode))
          .take(500),
      ),
    ]);

  const assignmentRows = uniqueById([
    ...directAssignments,
    ...subjectAssignments,
  ]);
  const [assignedRoleRows, ...directAccessRoleGroups] = await Promise.all([
    Promise.all(
      uniqueById(
        assignmentRows.map((assignment) => ({ _id: assignment.roleId })),
      ).map(({ _id }) => ctx.db.get(_id)),
    ),
    ...["business-manager", "site-operator", "viewer"].map((slug) =>
      ctx.db
        .query("overseer_roles")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .take(2),
    ),
  ]);
  const roleRows = uniqueById(
    [...assignedRoleRows, ...directAccessRoleGroups.flat()].filter(
      (role): role is Doc<"overseer_roles"> => role !== null,
    ),
  );
  const rolesById = new Map(
    roleRows
      .filter((role): role is Doc<"overseer_roles"> => role !== null)
      .map((role) => [String(role._id), role]),
  );
  const assignments = assignmentRows
    .map((assignment) => {
      const role = rolesById.get(String(assignment.roleId));
      return role ? mapAssignment(assignment, role.slug) : null;
    })
    .filter((assignment): assignment is RoleAssignment => assignment !== null);
  assignments.push(
    ...organizationGrants.map((grant) => ({
      assignmentId: `organization-access:${String(grant._id)}`,
      userId: String(userId),
      roleSlug: grant.level === "manage" ? "business-manager" : "viewer",
      status: "active" as const,
      target: { type: "organization" as const, id: String(grant.organizationId) },
      includeChildren: false,
    })),
    ...businessGrants.map((grant) => ({
      assignmentId: `business-access:${String(grant._id)}`,
      userId: String(userId),
      roleSlug: grant.level === "manage" ? "business-manager" : "viewer",
      status: "active" as const,
      target: { type: "business" as const, id: String(grant.businessId) },
      includeChildren: true,
    })),
    ...websiteGrants.map((grant) => ({
      assignmentId: `website-access:${String(grant._id)}`,
      userId: String(userId),
      roleSlug: grant.level === "manage" ? "site-operator" : "viewer",
      status: "active" as const,
      target: { type: "website" as const, id: String(grant.websiteId) },
      includeChildren: grant.includeEnvironments === true,
    })),
  );
  const permissions = uniqueById([
    ...directPermissions,
    ...actionGroups.flat(),
  ]).map((permission) => mapPermission(permission, request));

  return resolveAccessDecision({
    now: Date.now(),
    actor: {
      userId: String(operator._id),
      status: operator.isActive === false ? "inactive" : "active",
      platformRole: operator.role,
    },
    request,
    assignments,
    permissions,
    roles: roleRows.map(mapRole),
  });
}

export function targetFromArgs(args: {
  organizationId?: string;
  businessId?: string;
  websiteId?: string;
  instanceId?: string;
}): AccessTarget {
  return {
    organizationId: args.organizationId,
    businessId: args.businessId,
    websiteId: args.websiteId,
    instanceId: args.instanceId,
  };
}
