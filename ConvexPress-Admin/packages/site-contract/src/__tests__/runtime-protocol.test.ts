import { describe, expect, test } from "bun:test";

import { MANAGEMENT_CAPABILITY_CODES, OPERATION_CAPABILITY, OPERATION_CODES } from "../codes";
import { verifyManagementEnvelope } from "../node";
import {
  RUNTIME_MANAGEMENT_CAPABILITY_CODES,
  RUNTIME_OPERATION_CAPABILITY,
  RUNTIME_OPERATION_CODES,
} from "../runtime-protocol";
import { verifyRuntimeManagementEnvelope } from "../runtime-node";
import { STANDALONE_VO_INTEROP_VECTOR } from "../test-vectors";

describe("schema-free Convex runtime protocol", () => {
  test("is value-identical to the schema-rich public contract", () => {
    expect(RUNTIME_MANAGEMENT_CAPABILITY_CODES).toEqual(MANAGEMENT_CAPABILITY_CODES);
    expect(RUNTIME_OPERATION_CODES).toEqual(OPERATION_CODES);
    expect(RUNTIME_OPERATION_CAPABILITY).toEqual(OPERATION_CAPABILITY);
  });

  test("verifies the same fixed interoperability vector", () => {
    const vector = STANDALONE_VO_INTEROP_VECTOR;
    const input = {
      envelope: vector.envelope,
      body: vector.body,
      publicKeyPem: vector.publicKeyPem,
      now: Date.parse("2026-09-02T18:01:00.000Z"),
      expectedWebsiteKey: vector.envelope.websiteKey,
      expectedInstanceKey: vector.envelope.instanceKey,
      expectedCapability: "backup.create" as const,
      usedNonces: new Set<string>(),
    };
    expect(verifyRuntimeManagementEnvelope(input)).toEqual(
      verifyManagementEnvelope(input),
    );
  });
});
