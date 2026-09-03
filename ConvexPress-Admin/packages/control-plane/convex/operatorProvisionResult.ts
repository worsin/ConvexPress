import type { OperatorProfile } from "./operatorProfile";

export function publicOperatorProvisionResult<TUserId>({
  invitation,
  claimSecret,
  profile,
  targetType,
  targetId,
}: {
  invitation: {
    userId: TUserId;
    created: boolean;
    expiresAt: number;
  };
  claimSecret: string;
  profile: OperatorProfile;
  targetType: "platform" | "business" | "website";
  targetId: string | null;
}) {
  return {
    userId: invitation.userId,
    created: invitation.created,
    claimable: true as const,
    profile,
    targetType,
    targetId,
    claimSecret,
    claimExpiresAt: invitation.expiresAt,
  };
}
