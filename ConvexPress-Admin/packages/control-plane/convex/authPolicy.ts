export type AuthClaimDecision =
  | { kind: "create-owner" }
  | { kind: "claim-provisioned-user" };

export interface ProvisionedOperator {
  email?: string;
  isActive?: boolean;
  authUserId?: string;
}

export interface OwnerReservation {
  ownerEmail: string;
  status: "reserved" | "owner_created" | "finalized" | "failed";
  expiresAt: number;
}

export function decideAuthUserClaim(input: {
  now: number;
  normalizedEmail: string;
  anyUserExists: boolean;
  reservation?: OwnerReservation;
  provisionedUser?: ProvisionedOperator;
}): AuthClaimDecision {
  if (!input.anyUserExists) {
    const reservation = input.reservation;
    if (
      !reservation ||
      reservation.status !== "reserved" ||
      reservation.expiresAt <= input.now ||
      reservation.ownerEmail.toLowerCase().trim() !== input.normalizedEmail
    ) {
      throw new Error("A live matching owner reservation is required");
    }
    return { kind: "create-owner" };
  }

  const user = input.provisionedUser;
  if (!user || user.email?.toLowerCase().trim() !== input.normalizedEmail) {
    throw new Error("A matching pre-provisioned operator row is required");
  }
  if (user.isActive === false) {
    throw new Error("This ConvexPress operator account is inactive");
  }
  if (user.authUserId) {
    throw new Error("This operator already has a login");
  }

  return { kind: "claim-provisioned-user" };
}
