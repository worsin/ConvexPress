import { describe, expect, test } from "bun:test";

import { verifyManagementEnvelope } from "../node";
import { STANDALONE_VO_INTEROP_VECTOR } from "../test-vectors";

describe("standalone and VO interoperability vector", () => {
  test("verifies using only the published public material", () => {
    const vector = STANDALONE_VO_INTEROP_VECTOR;
    expect(
      verifyManagementEnvelope({
        envelope: vector.envelope,
        body: vector.body,
        publicKeyPem: vector.publicKeyPem,
        now: Date.parse("2026-09-02T18:01:00.000Z"),
        expectedWebsiteKey: vector.envelope.websiteKey,
        expectedInstanceKey: vector.envelope.instanceKey,
        expectedCapability: "backup.create",
        usedNonces: new Set(),
      }),
    ).toEqual({ ok: true });
  });
});
