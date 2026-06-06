import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api } from "../../_generated/api";
import schema from "../../schema";

const ADMIN_ISSUER = "https://convexpress-admin.local";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/shipping/queries.ts": () => import("../queries"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

async function seedAdminHarness(t: ReturnType<typeof createHarness>) {
  const now = Date.now();
  const result = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: "Administrator",
      slug: "administrator",
      description: "Test admin role",
      level: 100,
      type: "internal",
      isDefault: false,
      isProtected: true,
      capabilities: ["manage_options"],
      pageAccess: ["/admin", "/admin/setup"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const userId = await ctx.db.insert("users", {
      authSource: "local",
      email: "admin@example.com",
      username: "admin",
      passwordHash: "not-a-real-hash",
      displayName: "Admin",
      slug: "admin",
      emailVerified: true,
      status: "active",
      isInternal: true,
      internalRole: "admin",
      roleId,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { userId };
  });

  return t.withIdentity({
    issuer: ADMIN_ISSUER,
    subject: result.userId,
    tokenIdentifier: `${ADMIN_ISSUER}|${result.userId}`,
    email: "admin@example.com",
    name: "Admin",
  });
}

describe("shipping queries", () => {
  test("reports provider secret presence in overview without exposing secrets", async () => {
    const t = createHarness();
    const admin = await seedAdminHarness(t);
    const now = Date.now();

    await admin.run(async (ctx) => {
      const connectionId = await ctx.db.insert("shipping_provider_connections", {
        provider: "shipstation",
        displayName: "ShipStation",
        status: "connected",
        enabled: true,
        mode: "production",
        isPrimary: true,
        rateShoppingEnabled: true,
        rateShoppingPriority: 10,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("shipping_provider_secrets", {
        connectionId,
        secretVersion: 1,
        encryptedPayload: "encrypted",
        createdAt: now,
        updatedAt: now,
      });
    });

    const overview = await admin.query(api.shipping.queries.getOverview, {});

    const shipstation = overview.providers.find(
      (provider) => provider.provider === "shipstation",
    );
    const ups = overview.providers.find((provider) => provider.provider === "ups");

    expect(shipstation?.secretStored).toBe(true);
    expect(shipstation?.connection?.status).toBe("connected");
    expect(shipstation).not.toHaveProperty("encryptedPayload");
    expect(ups?.secretStored).toBe(false);
  });
});
