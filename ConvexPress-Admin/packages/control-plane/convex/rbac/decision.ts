export type PlatformRole = "owner" | "admin" | "manager" | "member" | "viewer";
export type GrantStatus = "active" | "inactive" | "revoked" | "expired";
export type TargetType =
  | "platform"
  | "organization"
  | "business"
  | "website"
  | "environment";

export interface AccessTarget {
  organizationId?: string;
  businessId?: string;
  websiteId?: string;
  instanceId?: string;
}

export interface ScopedTarget {
  type: TargetType;
  id?: string;
}

export type AccessSelector =
  | { type: "route" | "capability" | "action"; code: string }
  | { type: "all" };

export interface RoleDefinition {
  slug: string;
  status: "active" | "inactive" | "planned";
  capabilityCodes: readonly string[];
  routePaths: readonly string[];
}

export interface RoleAssignment {
  assignmentId: string;
  userId: string;
  roleSlug: string;
  status: GrantStatus;
  target?: ScopedTarget;
  includeChildren?: boolean;
}

export interface PermissionGrant {
  permissionId: string;
  effect: "allow" | "deny";
  status?: GrantStatus;
  subject:
    | { type: "user"; id: string }
    | { type: "role"; id: string }
    | { type: "all" };
  selector: AccessSelector;
  target?: ScopedTarget;
  includeChildren?: boolean;
  effectiveAt?: number;
  expiresAt?: number;
}

export interface AccessDecisionInput {
  now: number;
  actor: {
    userId: string;
    status: "active" | "inactive";
    platformRole: PlatformRole;
  };
  request: {
    selector: Exclude<AccessSelector, { type: "all" }>;
    target: AccessTarget;
  };
  assignments: readonly RoleAssignment[];
  permissions: readonly PermissionGrant[];
  roles: readonly RoleDefinition[];
}

export type AccessDecisionReason =
  | "actor_inactive"
  | "explicit_deny"
  | "platform_administrator"
  | "explicit_allow"
  | "role_assignment"
  | "no_matching_grant";

export interface AccessDecision {
  allowed: boolean;
  reason: AccessDecisionReason;
  winningRuleId: string | null;
  roleSlug: string | null;
}

function matchesCode(pattern: string, requested: string): boolean {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) {
    return requested.startsWith(pattern.slice(0, -1));
  }
  return pattern === requested;
}

function selectorMatches(
  grant: AccessSelector,
  request: Exclude<AccessSelector, { type: "all" }>,
): boolean {
  if (grant.type === "all") return true;
  return grant.type === request.type && matchesCode(grant.code, request.code);
}

function targetId(type: TargetType, target: AccessTarget): string | undefined {
  switch (type) {
    case "platform":
      return "platform";
    case "organization":
      return target.organizationId;
    case "business":
      return target.businessId;
    case "website":
      return target.websiteId;
    case "environment":
      return target.instanceId;
  }
}

const targetDepth: Record<TargetType, number> = {
  platform: 0,
  organization: 1,
  business: 2,
  website: 3,
  environment: 4,
};

function requestDepth(target: AccessTarget): number {
  if (target.instanceId) return targetDepth.environment;
  if (target.websiteId) return targetDepth.website;
  if (target.businessId) return targetDepth.business;
  if (target.organizationId) return targetDepth.organization;
  return targetDepth.platform;
}

function targetMatches(
  grant: ScopedTarget | undefined,
  request: AccessTarget,
  includeChildren = false,
): boolean {
  if (!grant || grant.type === "platform") return true;
  if (!grant.id || targetId(grant.type, request) !== grant.id) return false;
  const deeperRequest = requestDepth(request) > targetDepth[grant.type];
  return !deeperRequest || includeChildren;
}

function permissionIsActive(permission: PermissionGrant, now: number): boolean {
  if (permission.status && permission.status !== "active") return false;
  if (permission.effectiveAt !== undefined && permission.effectiveAt > now) {
    return false;
  }
  if (permission.expiresAt !== undefined && permission.expiresAt <= now) {
    return false;
  }
  return true;
}

function roleAllows(role: RoleDefinition, selector: AccessDecisionInput["request"]["selector"]) {
  if (role.status !== "active") return false;
  if (selector.type === "route") {
    return role.routePaths.some((path) => matchesCode(path, selector.code));
  }
  return role.capabilityCodes.some((code) => matchesCode(code, selector.code));
}

function specificity(permission: PermissionGrant): number {
  const subjectScore =
    permission.subject.type === "user"
      ? 300
      : permission.subject.type === "role"
        ? 200
        : 100;
  const selectorScore = permission.selector.type === "all" ? 0 : 20;
  const targetScore = targetDepth[permission.target?.type ?? "platform"];
  return subjectScore + selectorScore + targetScore;
}

function deterministicWinner(matches: readonly PermissionGrant[]) {
  return [...matches].sort((left, right) => {
    const score = specificity(right) - specificity(left);
    if (score !== 0) return score;
    return left.permissionId.localeCompare(right.permissionId);
  })[0];
}

export function resolveAccessDecision(input: AccessDecisionInput): AccessDecision {
  if (input.actor.status !== "active") {
    return {
      allowed: false,
      reason: "actor_inactive",
      winningRuleId: null,
      roleSlug: null,
    };
  }

  const activeAssignments = input.assignments.filter(
    (assignment) =>
      assignment.userId === input.actor.userId &&
      assignment.status === "active" &&
      targetMatches(
        assignment.target,
        input.request.target,
        assignment.includeChildren,
      ),
  );
  const activeRoleSlugs = new Set([
    input.actor.platformRole,
    ...activeAssignments.map((assignment) => assignment.roleSlug),
  ]);

  const matchingPermissions = input.permissions.filter((permission) => {
    const subjectMatches =
      permission.subject.type === "all" ||
      (permission.subject.type === "user" &&
        permission.subject.id === input.actor.userId) ||
      (permission.subject.type === "role" &&
        activeRoleSlugs.has(permission.subject.id));
    return (
      subjectMatches &&
      permissionIsActive(permission, input.now) &&
      selectorMatches(permission.selector, input.request.selector) &&
      targetMatches(
        permission.target,
        input.request.target,
        permission.includeChildren,
      )
    );
  });

  const denied = deterministicWinner(
    matchingPermissions.filter((permission) => permission.effect === "deny"),
  );
  if (denied) {
    return {
      allowed: false,
      reason: "explicit_deny",
      winningRuleId: denied.permissionId,
      roleSlug: null,
    };
  }

  if (
    input.actor.platformRole === "owner" ||
    input.actor.platformRole === "admin"
  ) {
    return {
      allowed: true,
      reason: "platform_administrator",
      winningRuleId: `platform-role:${input.actor.platformRole}`,
      roleSlug: input.actor.platformRole,
    };
  }

  const allowed = deterministicWinner(
    matchingPermissions.filter((permission) => permission.effect === "allow"),
  );
  if (allowed) {
    return {
      allowed: true,
      reason: "explicit_allow",
      winningRuleId: allowed.permissionId,
      roleSlug: null,
    };
  }

  const roleDefinitions = new Map(
    input.roles.map((role) => [role.slug, role] as const),
  );
  const assignment = activeAssignments
    .filter((candidate) => {
      const role = roleDefinitions.get(candidate.roleSlug);
      return role ? roleAllows(role, input.request.selector) : false;
    })
    .sort((left, right) => left.assignmentId.localeCompare(right.assignmentId))[0];
  if (assignment) {
    return {
      allowed: true,
      reason: "role_assignment",
      winningRuleId: assignment.assignmentId,
      roleSlug: assignment.roleSlug,
    };
  }

  return {
    allowed: false,
    reason: "no_matching_grant",
    winningRuleId: null,
    roleSlug: null,
  };
}
