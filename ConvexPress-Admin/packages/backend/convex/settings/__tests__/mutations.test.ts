import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api } from "../../_generated/api";
import schema from "../../schema";

const ADMIN_ISSUER = "https://convexpress-admin.local";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/settings/mutations.ts": () => import("../mutations"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

async function seedAdmin(t: ReturnType<typeof createHarness>) {
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
      capabilities: ["manage_options", "settings.update_email"],
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

describe("settings mutations", () => {
  test("strips query document metadata before persisting settings values", async () => {
    const t = createHarness();
    const admin = await seedAdmin(t);

    await admin.mutation(api.settings.mutations.updateSection, {
      section: "commerce.payments",
      values: {
        _id: "not-a-settings-doc-id",
        _creationTime: 123,
        section: "commerce.payments",
        updatedAt: 456,
        updatedBy: "not-a-user-id",
        stripePublishableKey: "pk_test_public",
        stripeSecretKey: "sk_test_secret",
        stripeWebhookSecret: "whsec_test_secret",
        stripeMode: "sandbox",
        paypalMode: "sandbox",
      },
    });

    const values = await t.run(async (ctx) => {
      const doc = await ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", "commerce.payments"))
        .unique();
      return doc?.values as Record<string, unknown>;
    });

    expect(values._id).toBeUndefined();
    expect(values._creationTime).toBeUndefined();
    expect(values.section).toBeUndefined();
    expect(values.updatedAt).toBeUndefined();
    expect(values.updatedBy).toBeUndefined();
    expect(values.stripeMode).toBe("sandbox");
    expect(values.paypalMode).toBe("sandbox");
  });
});
