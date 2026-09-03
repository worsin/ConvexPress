import { describe, expect, test } from "bun:test";

import {
  createControllerCredential,
  parseControllerCredential,
} from "../controllerCredentials";

const input = {
  controllerId: "controller_convexpress_standalone",
  keyId: "key_acceptance_2026",
  privateKeyPem:
    "-----BEGIN PRIVATE KEY-----\nacceptance-only-key-material\n-----END PRIVATE KEY-----\n",
  deploymentAdminKey: "acceptance-local-admin-key-0123456789",
  capabilities: ["health.read", "session.exchange"] as const,
};

describe("site controller credential custody", () => {
  test("round-trips the exact versioned private credential payload", () => {
    const credential = createControllerCredential(input);
    expect(parseControllerCredential(credential)).toEqual({
      kind: "convexpress-site-controller-v1",
      ...input,
      capabilities: ["health.read", "session.exchange"],
    });
  });

  test("rejects unknown fields, duplicate grants, public keys, and weak admin material", () => {
    const credential = createControllerCredential(input);
    expect(() =>
      parseControllerCredential({ ...credential, plaintextToken: "leak" }),
    ).toThrow("invalid");
    expect(() =>
      createControllerCredential({
        ...input,
        capabilities: ["health.read", "health.read"],
      }),
    ).toThrow("invalid");
    expect(() =>
      createControllerCredential({
        ...input,
        privateKeyPem:
          "-----BEGIN PUBLIC KEY-----\nnot-private\n-----END PUBLIC KEY-----",
      }),
    ).toThrow("invalid");
    expect(() =>
      createControllerCredential({ ...input, deploymentAdminKey: "short" }),
    ).toThrow("invalid");
  });
});
