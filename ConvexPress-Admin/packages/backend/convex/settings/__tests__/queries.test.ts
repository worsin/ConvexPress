import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api } from "../../_generated/api";
import schema from "../../schema";

const ADMIN_ISSUER = "https://convexpress-admin.local";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/settings/queries.ts": () => import("../queries"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

async function seedAuthenticatedUser(
  t: ReturnType<typeof createHarness>,
  capabilities: string[],
) {
  const now = Date.now();
  const result = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: capabilities.includes("manage_options") ? "Administrator" : "Editor",
      slug: capabilities.includes("manage_options") ? "administrator" : "editor",
      description: "Test role",
      level: capabilities.includes("manage_options") ? 100 : 80,
      type: "internal",
      isDefault: false,
      isProtected: true,
      capabilities,
      pageAccess: ["/admin"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const userId = await ctx.db.insert("users", {
      authSource: "local",
      email: capabilities.includes("manage_options")
        ? "admin@example.com"
        : "editor@example.com",
      username: capabilities.includes("manage_options") ? "admin" : "editor",
      passwordHash: "not-a-real-hash",
      displayName: capabilities.includes("manage_options") ? "Admin" : "Editor",
      slug: capabilities.includes("manage_options") ? "admin" : "editor",
      emailVerified: true,
      status: "active",
      isInternal: true,
      internalRole: capabilities.includes("manage_options") ? "admin" : "editor",
      roleId,
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("settings", {
      section: "general",
      values: {
        siteTitle: "ConvexPress Test",
      },
      updatedAt: now,
      updatedBy: userId,
    });

    await ctx.db.insert("settings", {
      section: "integrations.clerk",
      values: {
        clerkSecretKey: "sk_test_secret",
        clerkWebhookSecret: "whsec_test_secret",
        clerkJwtIssuerDomain: "https://clerk.example.test",
      },
      updatedAt: now,
      updatedBy: userId,
    });

    return {
      userId,
      email: capabilities.includes("manage_options")
        ? "admin@example.com"
        : "editor@example.com",
      name: capabilities.includes("manage_options") ? "Admin" : "Editor",
    };
  });

  return t.withIdentity({
    issuer: ADMIN_ISSUER,
    subject: result.userId,
    tokenIdentifier: `${ADMIN_ISSUER}|${result.userId}`,
    email: result.email,
    name: result.name,
  });
}

describe("settings queries", () => {
  test("requires manage_options for sensitive setup sections", async () => {
    const t = createHarness();
    const editor = await seedAuthenticatedUser(t, []);

    const general = await editor.query(api.settings.queries.getBySection, {
      section: "general",
    });
    expect(general?.siteTitle).toBe("ConvexPress Test");

    await expect(
      editor.query(api.settings.queries.getBySection, {
        section: "integrations.clerk",
      }),
    ).rejects.toThrow("Insufficient permissions");

    await expect(
      editor.query(api.settings.queries.get, {
        section: "integrations.clerk",
      }),
    ).rejects.toThrow("Insufficient permissions");
  });

  test("allows managers to read redacted setup sections", async () => {
    const t = createHarness();
    const admin = await seedAuthenticatedUser(t, ["manage_options"]);

    const clerk = await admin.query(api.settings.queries.getBySection, {
      section: "integrations.clerk",
    });

    expect(clerk?.clerkSecretKey).toBe("__set__");
    expect(clerk?.clerkWebhookSecret).toBe("__set__");
    expect(clerk?.clerkJwtIssuerDomain).toBe("https://clerk.example.test");
  });
});
