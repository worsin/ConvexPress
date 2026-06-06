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

async function seedOpenRegistration(t: ReturnType<typeof createHarness>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const updaterId = await ctx.db.insert("users", {
      authSource: "local",
      email: "settings-updater@example.com",
      emailVerified: true,
      displayName: "Settings Updater",
      slug: "settings-updater",
      status: "active",
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("settings", {
      section: "general",
      values: {
        membershipEnabled: true,
        registrationMode: "invite_only",
      },
      updatedAt: now,
      updatedBy: updaterId,
    });
  });
}

async function seedInvitationFixture(t: ReturnType<typeof createHarness>) {
  const now = Date.now();

  return await t.run(async (ctx) => {
    const inviterId = await ctx.db.insert("users", {
      authSource: "local",
      email: "inviter@example.com",
      emailVerified: true,
      displayName: "Inviter",
      slug: "inviter",
      status: "active",
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const editorRoleId = await ctx.db.insert("roles", {
      name: "Editor",
      slug: "editor",
      description: "Content editor",
      level: 80,
      type: "internal",
      isDefault: false,
      isProtected: true,
      capabilities: ["post.update"],
      pageAccess: ["/admin/posts"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const invitationId = await ctx.db.insert("invitations", {
      email: "invited@example.com",
      role: "editor",
      invitedBy: inviterId,
      status: "pending",
      token:
        "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      expiresAt: now + 7 * 24 * 60 * 60 * 1000,
      createdAt: now,
      resentCount: 0,
    });

    return { editorRoleId, invitationId };
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
    await seedOpenRegistration(t);
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

    const user = users.find((candidate) => candidate.email === "new.customer@example.com");
    expect(user).toBeDefined();
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

  test("does not create new Clerk users while public registration is closed", async () => {
    const t = createHarness();
    await seedSubscriberRole(t);

    const authenticated = t.withIdentity({
      issuer: CLERK_ISSUER,
      subject: "user_closed_registration",
      tokenIdentifier: `${CLERK_ISSUER}|user_closed_registration`,
      name: "Closed Registration",
      email: "closed@example.com",
      emailVerified: true,
    });

    expect(
      await authenticated.mutation(api.auth.clerkProvisioning.provisionClerkUser),
    ).toBeNull();

    const users = await t.run(async (ctx) => {
      return await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "closed@example.com"))
        .collect();
    });
    expect(users).toHaveLength(0);
  });

  test("allows a Clerk user with a live invitation while registration is closed", async () => {
    const t = createHarness();
    await seedSubscriberRole(t);
    const fixture = await seedInvitationFixture(t);

    const authenticated = t.withIdentity({
      issuer: CLERK_ISSUER,
      subject: "user_invited_registration",
      tokenIdentifier: `${CLERK_ISSUER}|user_invited_registration`,
      name: "Invited User",
      email: "invited@example.com",
      emailVerified: true,
    });

    const result = await authenticated.mutation(
      api.auth.clerkProvisioning.provisionClerkUser,
    );
    expect(result).toBeTruthy();

    const snapshot = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "invited@example.com"))
        .unique();
      const invitation = await ctx.db.get(fixture.invitationId);
      return { user, invitation };
    });

    expect(snapshot.user?.roleId).toBe(fixture.editorRoleId);
    expect(snapshot.user?.registrationMethod).toBe("invite");
    expect(snapshot.invitation?.status).toBe("accepted");
    expect(snapshot.invitation?.acceptedBy).toBe(snapshot.user?._id);
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
