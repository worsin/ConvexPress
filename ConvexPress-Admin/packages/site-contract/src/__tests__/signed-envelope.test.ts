import { describe, expect, test } from "bun:test";

import {
  createUnsignedManagementEnvelope,
  hashCanonicalBody,
} from "../envelope";
import { sha256Hex } from "../fingerprints";
import { OPERATION_CODES } from "../operations";
import {
  generateManagementKeyPair,
  signManagementEnvelope,
  verifyManagementEnvelope,
} from "../node";

const NOW = Date.parse("2026-09-02T18:00:00.000Z");

function command() {
  return createUnsignedManagementEnvelope({
    contractVersion: "1.0.0",
    controllerId: "controller_standalone",
    keyId: "key_primary_2026",
    websiteKey: "website_acme",
    instanceKey: "instance_prod",
    operationCode: OPERATION_CODES.backupCreate,
    body: { includeStorage: true },
    nonce: "nonce_000000000001",
    issuedAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 60_000).toISOString(),
    idempotencyKey: "backup-2026-09-02-001",
  });
}

describe("signed management envelopes", () => {
  test("matches the published SHA-256 vector", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("uses stable canonical hashing independent of object key order", () => {
    expect(hashCanonicalBody({ a: 1, nested: { y: 2, x: 3 } })).toBe(
      hashCanonicalBody({ nested: { x: 3, y: 2 }, a: 1 }),
    );
  });

  test("verifies an Ed25519 command for the intended site instance", () => {
    const keys = generateManagementKeyPair();
    const signed = signManagementEnvelope(command(), keys.privateKeyPem);

    expect(
      verifyManagementEnvelope({
        envelope: signed,
        body: { includeStorage: true },
        publicKeyPem: keys.publicKeyPem,
        now: NOW + 10_000,
        expectedWebsiteKey: "website_acme",
        expectedInstanceKey: "instance_prod",
        expectedCapability: "backup.create",
        usedNonces: new Set(),
      }),
    ).toEqual({ ok: true });
  });

  test("fails closed for tampering, wrong audience, expiry, replay, revocation, and capability mismatch", () => {
    const keys = generateManagementKeyPair();
    const signed = signManagementEnvelope(command(), keys.privateKeyPem);
    const base = {
      envelope: signed,
      body: { includeStorage: true },
      publicKeyPem: keys.publicKeyPem,
      now: NOW + 10_000,
      expectedWebsiteKey: "website_acme",
      expectedInstanceKey: "instance_prod",
      expectedCapability: "backup.create" as const,
      usedNonces: new Set<string>(),
    };

    expect(
      verifyManagementEnvelope({ ...base, body: { includeStorage: false } }),
    ).toEqual({ ok: false, reason: "body-hash-mismatch" });
    expect(
      verifyManagementEnvelope({
        ...base,
        expectedInstanceKey: "instance_staging",
      }),
    ).toEqual({ ok: false, reason: "audience-mismatch" });
    expect(
      verifyManagementEnvelope({ ...base, now: NOW + 120_000 }),
    ).toEqual({ ok: false, reason: "expired" });
    expect(
      verifyManagementEnvelope({
        ...base,
        usedNonces: new Set([signed.nonce]),
      }),
    ).toEqual({ ok: false, reason: "replay" });
    expect(
      verifyManagementEnvelope({ ...base, keyRevoked: true }),
    ).toEqual({ ok: false, reason: "key-revoked" });
    expect(
      verifyManagementEnvelope({
        ...base,
        expectedCapability: "site.deploy",
      }),
    ).toEqual({ ok: false, reason: "capability-mismatch" });
  });

  test("rejects a signature made by a different authority", () => {
    const signer = generateManagementKeyPair();
    const stranger = generateManagementKeyPair();
    const signed = signManagementEnvelope(command(), signer.privateKeyPem);

    expect(
      verifyManagementEnvelope({
        envelope: signed,
        body: { includeStorage: true },
        publicKeyPem: stranger.publicKeyPem,
        now: NOW + 10_000,
        expectedWebsiteKey: "website_acme",
        expectedInstanceKey: "instance_prod",
        expectedCapability: "backup.create",
        usedNonces: new Set(),
      }),
    ).toEqual({ ok: false, reason: "invalid-signature" });
  });
});
