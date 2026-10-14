/**
 * Accounts whose sign-in is owned by another system.
 *
 *   external    an integrator's trusted identity provider (users/externalIdentities.ts)
 *   management  the ConvexPress control plane
 *
 * ConvexPress holds no credential for these accounts. No self-service or
 * import path may give them a ConvexPress password, a Clerk identity, or
 * otherwise convert them to another auth source: that would let whoever
 * controls the new credential claim an operator account.
 */
export function isDelegatedSignInAccount(user: { authSource?: string }): boolean {
  return user.authSource === "external" || user.authSource === "management";
}

export const DELEGATED_SIGN_IN_EXPLANATION =
  "This account signs in through an external identity provider. Its password and sign-in are managed there, not in ConvexPress.";
