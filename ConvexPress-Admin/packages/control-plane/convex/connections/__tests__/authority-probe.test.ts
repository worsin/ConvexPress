import { describe, expect, test } from "bun:test";

import {
  generateManagementKeyPair,
  verifyManagementEnvelope,
} from "@convexpress/site-contract/node";

import { probeControllerAuthority } from "../authorityProbe";

const target = {
  managementOrigin: "https://journal.example.test",
  websiteKey: "acceptance:northstar:journal",
  instanceKey: "acceptance:northstar:journal:live",
  controllerSubjectId: "operator_acceptance_owner",
};

function credential(privateKeyPem: string) {
  return {
    controllerId: "controller_convexpress_standalone",
    keyId: "key_acceptance_journal_live",
    privateKeyPem,
    capabilities: ["health.read", "session.exchange"] as const,
  };
}

describe("controller authority probe", () => {
  test("proves that the encrypted private key matches the site's enrolled authority", async () => {
    const pair = generateManagementKeyPair();
    let requestedUrl = "";
    await probeControllerAuthority({
      ...target,
      credential: credential(pair.privateKeyPem),
      now: Date.parse("2026-09-03T18:00:00.000Z"),
      nonce: "nonce_authority_probe_acceptance",
      fetchImpl: async (url, init) => {
        requestedUrl = String(url);
        const request = JSON.parse(String(init?.body));
        expect(
          verifyManagementEnvelope({
            envelope: request.envelope,
            body: request.body,
            publicKeyPem: pair.publicKeyPem,
            now: Date.parse("2026-09-03T18:00:00.000Z"),
            expectedWebsiteKey: target.websiteKey,
            expectedInstanceKey: target.instanceKey,
            expectedCapability: "session.exchange",
            usedNonces: new Set(),
          }),
        ).toEqual({ ok: true });
        return Response.json({
          token: "t".repeat(64),
          controllerId: "controller_convexpress_standalone",
          syntheticOperatorId: "operator_management_acceptance",
          capabilities: ["health.read"],
          siteRole: "subscriber",
          siteCapabilities: ["content.read"],
          expiresAt: Date.parse("2026-09-03T18:15:00.000Z"),
        });
      },
    });
    expect(requestedUrl).toBe(
      "https://journal.example.test/api/convexpress/management/session/exchange",
    );
  });

  test("rejects the exact stale-key condition that an unsigned health probe misses", async () => {
    const controllerPair = generateManagementKeyPair();
    const differentSitePair = generateManagementKeyPair();
    await expect(
      probeControllerAuthority({
        ...target,
        credential: credential(controllerPair.privateKeyPem),
        now: Date.parse("2026-09-03T18:00:00.000Z"),
        nonce: "nonce_authority_probe_stale_key",
        fetchImpl: async (_url, init) => {
          const request = JSON.parse(String(init?.body));
          const verification = verifyManagementEnvelope({
            envelope: request.envelope,
            body: request.body,
            publicKeyPem: differentSitePair.publicKeyPem,
            now: Date.parse("2026-09-03T18:00:00.000Z"),
            expectedWebsiteKey: target.websiteKey,
            expectedInstanceKey: target.instanceKey,
            expectedCapability: "session.exchange",
            usedNonces: new Set(),
          });
          expect(verification).toEqual({
            ok: false,
            reason: "invalid-signature",
          });
          return Response.json(
            { error: "Management session exchange failed" },
            { status: 401 },
          );
        },
      }),
    ).rejects.toThrow("authority probe failed");
  });
});
