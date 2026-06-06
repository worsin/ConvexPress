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

async function seedUserHarness(
  t: ReturnType<typeof createHarness>,
  options: {
    email: string;
    username: string;
    roleSlug: string;
    capabilities: string[];
    pageAccess?: string[];
  },
) {
  const now = Date.now();
  const result = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: options.roleSlug,
      slug: options.roleSlug,
      description: "Test admin role",
      level: 100,
      type: "internal",
      isDefault: false,
      isProtected: options.roleSlug === "administrator",
      capabilities: options.capabilities,
      pageAccess: options.pageAccess ?? ["/admin"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const userId = await ctx.db.insert("users", {
      authSource: "local",
      email: options.email,
      username: options.username,
      passwordHash: "not-a-real-hash",
      displayName: options.username,
      slug: options.username,
      emailVerified: true,
      status: "active",
      isInternal: true,
      internalRole: options.roleSlug,
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
    email: options.email,
    name: options.username,
  });
}

async function seedAdminHarness(t: ReturnType<typeof createHarness>) {
  return await seedUserHarness(t, {
    email: "admin@example.com",
    username: "admin",
    roleSlug: "administrator",
    capabilities: [
      "manage_options",
      "shipping.zones.read",
      "shipping.packages.read",
    ],
    pageAccess: ["/admin", "/admin/setup"],
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

  test("requires shipping read capabilities for legacy zone and package reads", async () => {
    const t = createHarness();
    const admin = await seedAdminHarness(t);
    const basicUser = await seedUserHarness(t, {
      email: "viewer@example.com",
      username: "viewer",
      roleSlug: "viewer",
      capabilities: ["post.read"],
    });
    const now = Date.now();

    const seeded = await admin.run(async (ctx) => {
      const zoneId = await ctx.db.insert("commerce_shipping_zones", {
        name: "Domestic",
        slug: "domestic",
        countries: ["US"],
        states: [],
        postalCodeRules: [],
        enabled: true,
        isFallback: false,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("commerce_shipping_zone_methods", {
        zoneId,
        methodCode: "flat",
        label: "Flat rate",
        methodType: "flat_rate",
        enabled: true,
        sortOrder: 1,
        pricingRules: { flatRateAmount: 999 },
        createdAt: now,
        updatedAt: now,
      });
      const packageId = await ctx.db.insert("commerce_shipping_packages", {
        code: "box",
        label: "Box",
        packageType: "box",
        weight: 12,
        dimensions: { length: 8, width: 6, height: 4 },
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      });
      return { packageId };
    });

    const zones = await admin.query(api.shipping.queries.listZonesWithMethods, {});
    const packages = await admin.query(api.shipping.queries.listPackages, {});
    const packageDoc = await admin.query(api.shipping.queries.getPackage, {
      packageId: seeded.packageId,
    });

    expect(zones).toHaveLength(1);
    expect(zones[0]?.methods).toHaveLength(1);
    expect(packages).toHaveLength(1);
    expect(packageDoc?.label).toBe("Box");

    await expect(
      basicUser.query(api.shipping.queries.listZonesWithMethods, {}),
    ).rejects.toThrow("Insufficient permissions");
    await expect(
      basicUser.query(api.shipping.queries.listPackages, {}),
    ).rejects.toThrow("Insufficient permissions");
    await expect(
      basicUser.query(api.shipping.queries.getPackage, {
        packageId: seeded.packageId,
      }),
    ).rejects.toThrow("Insufficient permissions");
  });
});
