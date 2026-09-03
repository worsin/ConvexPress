import { describe, expect, test } from "bun:test";

import {
  createUnsignedManagementEnvelope,
  OPERATION_CODES,
  type SiteIdentity,
} from "@convexpress/site-contract";
import {
  generateManagementKeyPair,
  signManagementEnvelope,
} from "@convexpress/site-contract/node";

import {
  verifyStoredManagementEnvelope,
  type StoredManagementAuthority,
} from "../authority";

const NOW = Date.parse("2026-09-02T18:00:00.000Z");

const identity: SiteIdentity = {
  websiteKey: "website_acme",
  instanceKey: "instance_live",
  environmentKind: "live",
  deploymentOrigin: "https://acme.convex.cloud",
  managementOrigin: "https://acme.convex.site",
  siteOrigin: "https://shop.example.com",
  siteContractVersion: "1.0.0",
  schemaVersion: "2026.9.0",
  engineVersion: "1.0.0",
  managementCapabilities: [
    "health.read",
    "session.exchange",
    "backup.create",
  ],
};

function authority(input: {
  controllerId: string;
  keyId: string;
  publicKeyPem: string;
}): StoredManagementAuthority {
  return {
    ...input,
    websiteKey: identity.websiteKey,
    instanceKey: identity.instanceKey,
    capabilities: ["health.read", "session.exchange", "backup.create"],
    status: "active",
    capabilityRevision: 1,
    notBefore: NOW - 1_000,
  };
}

function envelope(input: {
  controllerId: string;
  keyId: string;
  privateKeyPem: string;
  nonce: string;
}) {
  const body = { requestedCapabilities: ["health.read"] };
  const unsigned = createUnsignedManagementEnvelope({
    contractVersion: identity.siteContractVersion,
    controllerId: input.controllerId,
    keyId: input.keyId,
    websiteKey: identity.websiteKey,
    instanceKey: identity.instanceKey,
    operationCode: OPERATION_CODES.sessionExchange,
    body,
    nonce: input.nonce,
    issuedAt: new Date(NOW).toISOString(),
    expiresAt: new Date(NOW + 60_000).toISOString(),
    idempotencyKey: `exchange-${input.nonce}`,
  });
  return {
    body,
    signed: signManagementEnvelope(unsigned, input.privateKeyPem),
  };
}

describe("site-owned management authorities", () => {
  test("accepts independent standalone and VO controllers for one unchanged site", () => {
    const standaloneKeys = generateManagementKeyPair();
    const voKeys = generateManagementKeyPair();
    const standalone = authority({
      controllerId: "controller_standalone",
      keyId: "key_standalone_2026",
      publicKeyPem: standaloneKeys.publicKeyPem,
    });
    const vo = authority({
      controllerId: "controller_virtual_overseer",
      keyId: "key_vo_2026",
      publicKeyPem: voKeys.publicKeyPem,
    });
    const standaloneCommand = envelope({
      controllerId: standalone.controllerId,
      keyId: standalone.keyId,
      privateKeyPem: standaloneKeys.privateKeyPem,
      nonce: "nonce_standalone_0001",
    });
    const voCommand = envelope({
      controllerId: vo.controllerId,
      keyId: vo.keyId,
      privateKeyPem: voKeys.privateKeyPem,
      nonce: "nonce_virtual_overseer_0001",
    });

    expect(
      verifyStoredManagementEnvelope({
        identity,
        authority: standalone,
        envelope: standaloneCommand.signed,
        body: standaloneCommand.body,
        now: NOW + 1_000,
        expectedCapability: "session.exchange",
        usedNonces: new Set(),
      }),
    ).toEqual({ ok: true });
    expect(
      verifyStoredManagementEnvelope({
        identity,
        authority: vo,
        envelope: voCommand.signed,
        body: voCommand.body,
        now: NOW + 1_000,
        expectedCapability: "session.exchange",
        usedNonces: new Set(),
      }),
    ).toEqual({ ok: true });
  });

  test("revoking standalone leaves the VO authority functional", () => {
    const standaloneKeys = generateManagementKeyPair();
    const voKeys = generateManagementKeyPair();
    const standalone = authority({
      controllerId: "controller_standalone",
      keyId: "key_standalone_2026",
      publicKeyPem: standaloneKeys.publicKeyPem,
    });
    const vo = authority({
      controllerId: "controller_virtual_overseer",
      keyId: "key_vo_2026",
      publicKeyPem: voKeys.publicKeyPem,
    });
    const standaloneCommand = envelope({
      controllerId: standalone.controllerId,
      keyId: standalone.keyId,
      privateKeyPem: standaloneKeys.privateKeyPem,
      nonce: "nonce_standalone_0002",
    });
    const voCommand = envelope({
      controllerId: vo.controllerId,
      keyId: vo.keyId,
      privateKeyPem: voKeys.privateKeyPem,
      nonce: "nonce_virtual_overseer_0002",
    });

    expect(
      verifyStoredManagementEnvelope({
        identity,
        authority: { ...standalone, status: "revoked" },
        envelope: standaloneCommand.signed,
        body: standaloneCommand.body,
        now: NOW + 1_000,
        expectedCapability: "session.exchange",
        usedNonces: new Set(),
      }),
    ).toEqual({ ok: false, reason: "authority-revoked" });
    expect(
      verifyStoredManagementEnvelope({
        identity,
        authority: vo,
        envelope: voCommand.signed,
        body: voCommand.body,
        now: NOW + 1_000,
        expectedCapability: "session.exchange",
        usedNonces: new Set(),
      }),
    ).toEqual({ ok: true });
  });

  test("fails closed for the wrong contract, audience, grant, or authority window", () => {
    const keys = generateManagementKeyPair();
    const stored = authority({
      controllerId: "controller_standalone",
      keyId: "key_standalone_2026",
      publicKeyPem: keys.publicKeyPem,
    });
    const command = envelope({
      controllerId: stored.controllerId,
      keyId: stored.keyId,
      privateKeyPem: keys.privateKeyPem,
      nonce: "nonce_standalone_0003",
    });
    const base = {
      identity,
      authority: stored,
      envelope: command.signed,
      body: command.body,
      now: NOW + 1_000,
      expectedCapability: "session.exchange" as const,
      usedNonces: new Set<string>(),
    };

    expect(
      verifyStoredManagementEnvelope({
        ...base,
        identity: { ...identity, siteContractVersion: "2.0.0" },
      }),
    ).toEqual({ ok: false, reason: "contract-version-mismatch" });
    expect(
      verifyStoredManagementEnvelope({
        ...base,
        authority: { ...stored, instanceKey: "instance_staging" },
      }),
    ).toEqual({ ok: false, reason: "authority-audience-mismatch" });
    expect(
      verifyStoredManagementEnvelope({
        ...base,
        authority: { ...stored, capabilities: ["health.read"] },
      }),
    ).toEqual({ ok: false, reason: "capability-not-granted" });
    expect(
      verifyStoredManagementEnvelope({
        ...base,
        authority: { ...stored, expiresAt: NOW + 500 },
      }),
    ).toEqual({ ok: false, reason: "authority-expired" });
  });
});
