import type { PlatformRole } from "./decision";

export type DirectAccessScope = "organization" | "business" | "website";
export type DirectAccessLevel = "use" | "manage";

export function directAccessRoleSlug(
  platformRole: PlatformRole,
  scope: DirectAccessScope,
  level: DirectAccessLevel,
): "business-manager" | "site-operator" | "member" | "viewer" {
  if (level === "manage") {
    return scope === "website" ? "site-operator" : "business-manager";
  }

  if (scope === "website" && platformRole === "member") {
    return "member";
  }

  return "viewer";
}
