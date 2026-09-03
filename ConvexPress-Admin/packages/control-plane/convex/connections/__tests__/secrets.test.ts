import { randomBytes } from "node:crypto";
import { describe, expect, test } from "bun:test";

import {
  decryptCredentialPayload,
  encryptCredentialPayload,
} from "../crypto";
import { safeConnectionSummary } from "../safe";

describe("connection secret custody", () => {
  test("encrypts with AES-256-GCM and binds ciphertext to its target", () => {
    const key = randomBytes(32);
    const secret = {
      deployKey: "acceptance-secret-deploy-key",
      adminKey: "acceptance-secret-admin-key",
    };
    const envelope = encryptCredentialPayload({
      payload: secret,
      key,
      keyVersion: 7,
      aad: "website-key|instance-key|connection-id",
      now: 1_788_390_000_000,
    });
    expect(JSON.stringify(envelope)).not.toContain(secret.deployKey);
    expect(
      decryptCredentialPayload({
        envelope,
        key,
        aad: "website-key|instance-key|connection-id",
      }),
    ).toEqual(secret);
    expect(() =>
      decryptCredentialPayload({
        envelope,
        key,
        aad: "website-key|other-instance|connection-id",
      }),
    ).toThrow("could not be decrypted");
  });

  test("public summaries never contain encrypted or plaintext credential fields", () => {
    const summary = safeConnectionSummary({
      _id: "connection-1",
      name: "Northstar Production",
      serviceId: "convex-deployment",
      provider: "convex",
      accountLabel: "northstar-live",
      status: "connected",
      isActive: true,
      updatedAt: 1_788_390_000_000,
      credentials: {
        encrypted: "ciphertext-value",
        iv: "iv-value",
        authTag: "tag-value",
        version: 3,
      },
      config: {
        deploymentOrigin: "https://example.convex.cloud",
        deployKey: "must-never-leak",
      },
    });
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("credentials");
    expect(serialized).not.toContain("ciphertext-value");
    expect(serialized).not.toContain("must-never-leak");
    expect(summary).toMatchObject({
      connectionId: "connection-1",
      provider: "convex",
      hasCredentials: true,
      credentialVersion: 3,
    });
  });
});
