import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api } from "../../_generated/api";
import schema from "../../schema";

const CLERK_ISSUER = "https://clerk.example";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/auth/clerkProvisioning.ts": () => import("../clerkProvisioning"),
  "./convex/auth/inputLimits.ts": () => import("../inputLimits"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

async function seedSubscriberRole(t: ReturnType<typeof createHarness>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("roles", {
      name: "Subscriber",
      slug: "subscriber",
      description: "Customer subscriber",
      level: 20,
      type: "customer",
      isDefault: true,
      isProtected: true,
      capabilities: [],
      pageAccess: [],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("Clerk session provisioning", () => {
  test("does not create a user from a Clerk session without a valid email", async () => {
    const t = createHarness().withIdentity({
      issuer: CLERK_ISSUER,
      subject: "user_without_email",
      tokenIdentifier: `${CLERK_ISSUER}|user_without_email`,
      name: "No Email",
      email: "",
      emailVerified: false,
    });

    const result = await t.mutation(
      api.auth.clerkProvisioning.provisionClerkUser,
    );
    expect(result).toBeNull();

    const users = await t.run(async (ctx) => {
      return await ctx.db.query("users").collect();
    });
    expect(users).toHaveLength(0);
  });

  test("bounds Clerk profile fields before creating website users", async () => {
    const t = createHarness();
    const subscriberRoleId = await seedSubscriberRole(t);
    const authenticated = t.withIdentity({
      issuer: CLERK_ISSUER,
      subject: " user_clerk_profile ",
      tokenIdentifier: `${CLERK_ISSUER}|user_clerk_profile`,
      name: "Display ".repeat(40),
      email: " New.Customer@Example.COM ",
      emailVerified: true,
      givenName: "F".repeat(200),
      familyName: "L".repeat(200),
      pictureUrl: `https://cdn.example.test/${"a".repeat(3000)}`,
    });

    const result = await authenticated.mutation(
      api.auth.clerkProvisioning.provisionClerkUser,
    );
    expect(result).toBeTruthy();

    const users = await t.run(async (ctx) => {
      return await ctx.db.query("users").collect();
    });
    expect(users).toHaveLength(1);

    const user = users[0]!;
    expect(user.authSource).toBe("clerk");
    expect(user.clerkUserId).toBe("user_clerk_profile");
    expect(user.email).toBe("new.customer@example.com");
    expect(user.emailVerified).toBe(true);
    expect(user.roleId).toBe(subscriberRoleId);
    expect(user.firstName).toHaveLength(128);
    expect(user.lastName).toHaveLength(128);
    expect(user.displayName).toHaveLength(128);
    expect(user.profilePictureUrl).toHaveLength(2048);
    expect(user.slug).toBe("new.customer");
  });

  test("requires verified email before linking an imported user by email", async () => {
    const t = createHarness();
    await seedSubscriberRole(t);

    const importedUserId = await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("users", {
        authSource: "local",
        email: "imported@example.com",
        emailVerified: false,
        displayName: "Imported Customer",
        slug: "imported",
        status: "active",
        registrationMethod: "import",
        registeredAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    const unverified = t.withIdentity({
      issuer: CLERK_ISSUER,
      subject: "user_unverified",
      tokenIdentifier: `${CLERK_ISSUER}|user_unverified`,
      name: "Unverified",
      email: "imported@example.com",
      emailVerified: false,
    });

    expect(
      await unverified.mutation(api.auth.clerkProvisioning.provisionClerkUser),
    ).toBeNull();

    const afterUnverified = await t.run(async (ctx) => {
      return await ctx.db.get(importedUserId);
    });
    expect(afterUnverified?.clerkUserId).toBeUndefined();

    const verified = t.withIdentity({
      issuer: CLERK_ISSUER,
      subject: "user_verified",
      tokenIdentifier: `${CLERK_ISSUER}|user_verified`,
      name: "Verified",
      email: "imported@example.com",
      emailVerified: true,
    });

    expect(
      await verified.mutation(api.auth.clerkProvisioning.provisionClerkUser),
    ).toBe(importedUserId);

    const afterVerified = await t.run(async (ctx) => {
      return await ctx.db.get(importedUserId);
    });
    expect(afterVerified?.clerkUserId).toBe("user_verified");
    expect(afterVerified?.emailVerified).toBe(true);
  });
});
