import { describe, expect, test } from "bun:test";

import { publicOperatorProvisionResult } from "../operatorProvisionResult";

describe("operator provisioning result", () => {
  test("returns only fields declared by the public mutation validator", () => {
    const result = publicOperatorProvisionResult({
      invitation: {
        userId: "operator-id",
        created: true,
        invitationId: "private-invitation-id",
        expiresAt: 123_456,
      },
      claimSecret: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      profile: "viewer",
      targetType: "website",
      targetId: "website-id",
    });

    expect(result).toEqual({
      userId: "operator-id",
      created: true,
      claimable: true,
      profile: "viewer",
      targetType: "website",
      targetId: "website-id",
      claimSecret: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      claimExpiresAt: 123_456,
    });
    expect("invitationId" in result).toBe(false);
    expect("expiresAt" in result).toBe(false);
  });
});
