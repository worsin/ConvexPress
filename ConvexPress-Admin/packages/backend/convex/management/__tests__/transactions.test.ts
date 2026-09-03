import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { decodeJwt, generateKeyPair, exportPKCS8 } from "jose";

import {
  createUnsignedManagementEnvelope,
  CURRENT_ENGINE_VERSION,
  CURRENT_SCHEMA_VERSION,
  CURRENT_SITE_CONTRACT_VERSION,
  OPERATION_CODES,
} from "@convexpress/site-contract";
import {
  generateManagementKeyPair,
  signManagementEnvelope,
} from "@convexpress/site-contract/node";

import { internal } from "../../_generated/api";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/management/actions.ts": () => import("../actions"),
  "./convex/management/authority.ts": () => import("../authority"),
  "./convex/management/bootstrap.ts": () => import("../bootstrap"),
  "./convex/management/runtime.ts": () => import("../runtime"),
  "./convex/management/sessionPolicy.ts": () => import("../sessionPolicy"),
};

const WEBSITE_KEY = "website_acceptance";
const INSTANCE_KEY = "instance_acceptance_live";

function createHarness() {
  return convexTest({ schema, modules });
}

async function seedAdministratorRole(t: ReturnType<typeof createHarness>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("roles", {
      name: "Administrator",
      slug: "administrator",
      description: "Full site access",
      level: 100,
      type: "internal",
      isDefault: false,
      isProtected: true,
      capabilities: ["dashboard.view", "post.read", "post.update"],
      pageAccess: ["/admin", "/admin/*"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("roles", {
      name: "Viewer",
      slug: "subscriber",
      description: "Read-only site access",
      level: 20,
      type: "customer",
      isDefault: true,
      isProtected: true,
      capabilities: ["dashboard.view", "post.read"],
      pageAccess: ["/admin"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  });
}

function signedExchange(input: {
  controllerId: string;
  keyId: string;
  privateKeyPem: string;
  nonce: string;
}) {
  const body = {
    requestedCapabilities: ["health.read"] as const,
    requestedSiteRole: "subscriber" as const,
  };
  return {
    body,
    envelope: signManagementEnvelope(
      createUnsignedManagementEnvelope({
        contractVersion: CURRENT_SITE_CONTRACT_VERSION,
        controllerId: input.controllerId,
        keyId: input.keyId,
        websiteKey: WEBSITE_KEY,
        instanceKey: INSTANCE_KEY,
        operationCode: OPERATION_CODES.sessionExchange,
        body,
        nonce: input.nonce,
        issuedAt: new Date(Date.now() - 1_000).toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        idempotencyKey: `exchange-${input.nonce}`,
      }),
      input.privateKeyPem,
    ),
  };
}

describe("management authority transactions", () => {
  test("exchanges independent controller signatures atomically and revokes only one", async () => {
    const t = createHarness();
    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    process.env.AUTH_PRIVATE_KEY = await exportPKCS8(privateKey);
    await seedAdministratorRole(t);
    await t.mutation(internal.management.bootstrap.configureIdentity, {
      websiteKey: WEBSITE_KEY,
      instanceKey: INSTANCE_KEY,
      environmentKind: "live",
      deploymentOrigin: "http://127.0.0.1:4820",
      managementOrigin: "http://127.0.0.1:4821",
      siteOrigin: "https://shop.acceptance.test",
      siteContractVersion: CURRENT_SITE_CONTRACT_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      engineVersion: CURRENT_ENGINE_VERSION,
      managementCapabilities: [
        "health.read",
        "session.exchange",
        "backup.create",
      ],
    });

    const standaloneKeys = generateManagementKeyPair();
    const voKeys = generateManagementKeyPair();
    const standalone = await t.mutation(
      internal.management.bootstrap.enrollAuthority,
      {
        controllerId: "controller_standalone",
        keyId: "key_standalone_2026",
        label: "Standalone ConvexPress",
        publicKeyPem: standaloneKeys.publicKeyPem,
        capabilities: [
          "health.read",
          "session.exchange",
          "backup.create",
        ],
      },
    );
    const vo = await t.mutation(internal.management.bootstrap.enrollAuthority, {
      controllerId: "controller_virtual_overseer",
      keyId: "key_vo_2026",
      label: "Virtual Overseer",
      publicKeyPem: voKeys.publicKeyPem,
      capabilities: ["health.read", "session.exchange"],
    });

    const standaloneCommand = signedExchange({
      controllerId: "controller_standalone",
      keyId: "key_standalone_2026",
      privateKeyPem: standaloneKeys.privateKeyPem,
      nonce: "nonce_standalone_exchange_0001",
    });
    const voCommand = signedExchange({
      controllerId: "controller_virtual_overseer",
      keyId: "key_vo_2026",
      privateKeyPem: voKeys.privateKeyPem,
      nonce: "nonce_vo_exchange_0001",
    });

    const standaloneSession = await t.action(
      internal.management.actions.exchangeSession,
      standaloneCommand,
    );
    const voSession = await t.action(
      internal.management.actions.exchangeSession,
      voCommand,
    );
    expect(standaloneSession.token.split(".")).toHaveLength(3);
    expect(voSession.token.split(".")).toHaveLength(3);
    expect(voSession.token).not.toBe(standaloneSession.token);
    expect(decodeJwt(standaloneSession.token)).toMatchObject({
      iss: "https://convexpress-management.local",
      aud: "convexpress-admin",
      siteRole: "subscriber",
    });

    await expect(
      t.action(internal.management.actions.exchangeSession, standaloneCommand),
    ).rejects.toThrow("Management session exchange failed");

    await t.mutation(internal.management.bootstrap.revokeAuthority, {
      controllerId: "controller_standalone",
      keyId: "key_standalone_2026",
    });

    const snapshot = await t.run(async (ctx) => ({
      nonces: await ctx.db.query("convexpress_managementNonces").collect(),
      sessions: await ctx.db.query("convexpress_managementSessions").collect(),
      authorities: await ctx.db
        .query("convexpress_managementAuthorities")
        .collect(),
    }));
    expect(snapshot.nonces).toHaveLength(2);
    expect(snapshot.sessions).toHaveLength(2);
    expect(snapshot.sessions.some((session) => session.tokenHash === standaloneSession.token)).toBe(
      false,
    );
    const principals = await t.run(async (ctx) =>
      (await ctx.db.query("users").collect()).filter(
        (user) => user.authSource === "management",
      ),
    );
    expect(principals).toHaveLength(2);
    expect(principals.every((user) => user.passwordHash === undefined)).toBe(true);
    expect(
      snapshot.sessions.find((session) => session.authorityId === standalone.authorityId)
        ?.status,
    ).toBe("revoked");
    expect(
      snapshot.sessions.find((session) => session.authorityId === vo.authorityId)
        ?.status,
    ).toBe("active");
    expect(
      snapshot.authorities.find((authority) => authority._id === standalone.authorityId)
        ?.status,
    ).toBe("revoked");
    expect(
      snapshot.authorities.find((authority) => authority._id === vo.authorityId)
        ?.status,
    ).toBe("active");
  });

  test("refuses a silent identity rebind", async () => {
    const t = createHarness();
    const input = {
      websiteKey: WEBSITE_KEY,
      instanceKey: INSTANCE_KEY,
      environmentKind: "staging" as const,
      deploymentOrigin: "http://127.0.0.1:4830",
      managementOrigin: "http://127.0.0.1:4831",
      siteOrigin: "https://staging.shop.acceptance.test",
      siteContractVersion: CURRENT_SITE_CONTRACT_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      engineVersion: CURRENT_ENGINE_VERSION,
      managementCapabilities: ["health.read", "session.exchange"] as const,
    };
    await t.mutation(internal.management.bootstrap.configureIdentity, input);
    await t.mutation(internal.management.bootstrap.configureIdentity, input);

    await expect(
      t.mutation(internal.management.bootstrap.configureIdentity, {
        ...input,
        instanceKey: "instance_different_environment",
      }),
    ).rejects.toThrow("cannot be rebound");
  });
});
