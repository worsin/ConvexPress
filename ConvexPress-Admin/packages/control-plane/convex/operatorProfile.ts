import type { PlatformRole } from "./rbac/decision";

export type OperatorProfile =
  | "administrator"
  | "business-manager"
  | "site-operator"
  | "member"
  | "viewer";

export type OperatorProfilePlan = {
  profile: OperatorProfile;
  platformRole: Exclude<PlatformRole, "owner">;
  scope: "platform" | "business" | "website";
  level: "manage" | "use" | null;
};

const PLANS: Record<OperatorProfile, OperatorProfilePlan> = {
  administrator: {
    profile: "administrator",
    platformRole: "admin",
    scope: "platform",
    level: null,
  },
  "business-manager": {
    profile: "business-manager",
    platformRole: "manager",
    scope: "business",
    level: "manage",
  },
  "site-operator": {
    profile: "site-operator",
    platformRole: "manager",
    scope: "website",
    level: "manage",
  },
  member: {
    profile: "member",
    platformRole: "member",
    scope: "website",
    level: "use",
  },
  viewer: {
    profile: "viewer",
    platformRole: "viewer",
    scope: "website",
    level: "use",
  },
};

export function operatorProfilePlan(profile: OperatorProfile): OperatorProfilePlan {
  return PLANS[profile];
}

export function operatorProfileLabel(profile: string): string {
  switch (profile) {
    case "owner":
      return "Owner";
    case "admin":
    case "administrator":
      return "Administrator";
    case "manager":
      return "Manager";
    case "business-manager":
      return "Business Manager";
    case "site-operator":
      return "Site Operator";
    case "member":
      return "Member";
    case "viewer":
      return "Viewer";
    default:
      return profile;
  }
}
