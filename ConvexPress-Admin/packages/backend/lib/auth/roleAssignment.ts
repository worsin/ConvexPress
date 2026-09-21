/** Matches helpers/permissions.resolveUserRole's auth-source boundary.
 * Legacy role names, isInternal and Clerk IDs never establish operator identity.
 */
export type RoleAssignmentTarget = {
  authSource?: "local" | "clerk" | "management";
};
export function roleCompatibleWithIdentity(
  target: RoleAssignmentTarget,
  role: { type: string },
): boolean {
  return (
    role.type === "customer" ||
    target.authSource === "local" ||
    target.authSource === "management"
  );
}
export const CUSTOMER_ROLE_ASSIGNMENT_EXPLANATION =
  "Website accounts can receive customer roles. Editor and administrator access requires a local or managed operator account; changing a customer role does not grant native Admin access.";

export const INVITATION_ROLE_SLUGS = [
  "subscriber",
  "contributor",
  "author",
  "editor",
  "administrator",
] as const;
