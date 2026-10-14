/** Matches helpers/permissions.resolveUserRole's auth-source boundary.
 * Legacy role names, isInternal and Clerk IDs never establish operator identity.
 */
export type RoleAssignmentTarget = {
  authSource?: "local" | "clerk" | "management" | "external";
};
/**
 * Customer roles fit every account. Local and management operators may hold
 * any role. External operators (an integrator's trusted staff identity
 * provider) may hold internal roles too, but never system-reserved ones.
 * Website (Clerk) and unclassified accounts are limited to customer roles.
 */
export function roleCompatibleWithIdentity(
  target: RoleAssignmentTarget,
  role: { type: string },
): boolean {
  return (
    role.type === "customer" ||
    target.authSource === "local" ||
    target.authSource === "management" ||
    (target.authSource === "external" && role.type === "internal")
  );
}
export const CUSTOMER_ROLE_ASSIGNMENT_EXPLANATION =
  "Website accounts can receive customer roles. Editor and administrator access requires a local, managed or external operator account; changing a customer role does not grant native Admin access.";

/**
 * The legacy `users.internalRole` value kept in sync with a role assignment,
 * for code that still reads the pre-capability fields.
 */
export function legacyInternalRoleForRoleSlug(slug: string): string {
  if (slug === "administrator") return "admin";
  if (slug === "subscriber") return "customer";
  return slug;
}

export const INVITATION_ROLE_SLUGS = [
  "subscriber",
  "contributor",
  "author",
  "editor",
  "administrator",
] as const;
