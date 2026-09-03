import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { exportPKCS8, generateKeyPair } from "jose";

import {
  createUnsignedManagementEnvelope,
  CURRENT_ENGINE_VERSION,
  CURRENT_SCHEMA_VERSION,
  CURRENT_SITE_CONTRACT_VERSION,
  OPERATION_CODES,
  siteHealthResponseSchema,
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
  "./convex/http.ts": () => import("../../http"),
  "./convex/management/bootstrap.ts": () => import("../bootstrap"),
  "./convex/management/actions.ts": () => import("../actions"),
  "./convex/management/authority.ts": () => import("../authority"),
  "./convex/management/http.ts": () => import("../http"),
  "./convex/management/queries.ts": () => import("../queries"),
  "./convex/management/runtime.ts": () => import("../runtime"),
  "./convex/management/sessionPolicy.ts": () => import("../sessionPolicy"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

describe("site management HTTP", () => {
  test("reports unconfigured until the exact non-secret site identity is present", async () => {
    const t = createHarness();
    const unavailable = await t.fetch("/api/convexpress/management/health");
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({
      error: "Site management identity is not configured",
    });

    await t.mutation(internal.management.bootstrap.configureIdentity, {
      websiteKey: "website_acceptance",
      instanceKey: "instance_acceptance_staging",
      environmentKind: "staging",
      deploymentOrigin: "http://127.0.0.1:4840",
      managementOrigin: "http://127.0.0.1:4841",
      siteOrigin: "https://staging.shop.acceptance.test",
      siteContractVersion: CURRENT_SITE_CONTRACT_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      engineVersion: CURRENT_ENGINE_VERSION,
      managementCapabilities: ["health.read", "session.exchange"],
    });
    const response = await t.fetch("/api/convexpress/management/health");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(siteHealthResponseSchema.parse(body)).toEqual(body);
    expect(body).toMatchObject({
      status: "healthy",
      websiteKey: "website_acceptance",
      instanceKey: "instance_acceptance_staging",
      storageStatus: "healthy",
      authStatus: "healthy",
    });
    expect(JSON.stringify(body)).not.toMatch(/secret|token|credential|private/i);
  });

  test("exchanges a signed envelope once through the real HTTP route", async () => {
    const t = createHarness();
    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    process.env.AUTH_PRIVATE_KEY = await exportPKCS8(privateKey);
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
        capabilities: ["dashboard.view", "post.read"],
        pageAccess: ["/admin", "/admin/*"],
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    });
    await t.mutation(internal.management.bootstrap.configureIdentity, {
      websiteKey: "website_acceptance",
      instanceKey: "instance_acceptance_live",
      environmentKind: "live",
      deploymentOrigin: "http://127.0.0.1:4850",
      managementOrigin: "http://127.0.0.1:4851",
      siteOrigin: "https://shop.acceptance.test",
      siteContractVersion: CURRENT_SITE_CONTRACT_VERSION,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      engineVersion: CURRENT_ENGINE_VERSION,
      managementCapabilities: ["health.read", "session.exchange"],
    });
    const keys = generateManagementKeyPair();
    await t.mutation(internal.management.bootstrap.enrollAuthority, {
      controllerId: "controller_standalone",
      keyId: "key_standalone_http_2026",
      publicKeyPem: keys.publicKeyPem,
      capabilities: ["health.read", "session.exchange"],
    });
    const body = {
      requestedCapabilities: ["health.read"] as const,
      requestedSiteRole: "administrator" as const,
    };
    const envelope = signManagementEnvelope(
      createUnsignedManagementEnvelope({
        contractVersion: CURRENT_SITE_CONTRACT_VERSION,
        controllerId: "controller_standalone",
        keyId: "key_standalone_http_2026",
        websiteKey: "website_acceptance",
        instanceKey: "instance_acceptance_live",
        operationCode: OPERATION_CODES.sessionExchange,
        body,
        nonce: "nonce_http_exchange_0001",
        issuedAt: new Date(Date.now() - 1_000).toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        idempotencyKey: "exchange-http-0001",
      }),
      keys.privateKeyPem,
    );
    const request = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ envelope, body }),
    };
    const response = await t.fetch(
      "/api/convexpress/management/session/exchange",
      request,
    );
    const session = await response.json();
    expect(response.status).toBe(200);
    expect(session.token.split(".")).toHaveLength(3);
    expect(session.capabilities).toEqual(["health.read"]);
    expect(session.siteRole).toBe("administrator");
    expect(session.siteCapabilities).toEqual(["dashboard.view", "post.read"]);

    const replay = await t.fetch(
      "/api/convexpress/management/session/exchange",
      request,
    );
    expect(replay.status).toBe(401);
    expect(await replay.json()).toEqual({
      error: "Management session exchange failed",
    });
  });
});
