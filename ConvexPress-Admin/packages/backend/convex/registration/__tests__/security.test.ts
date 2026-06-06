import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api, internal } from "../../_generated/api";
import schema from "../../schema";

const CLERK_ISSUER = "https://clerk.example";
const ADMIN_ISSUER = "https://convexpress-admin.local";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/auth/inputLimits.ts": () => import("../../auth/inputLimits"),
  "./convex/registration/queries.ts": () => import("../queries"),
  "./convex/registration/mutations.ts": () => import("../mutations"),
  "./convex/registration/internals.ts": () => import("../internals"),
};

function createHarness() {
  return convexTest({ schema, modules });
}

async function seedRegistrationFixture(t: ReturnType<typeof createHarness>) {
  const now = Date.now();

  return await t.run(async (ctx) => {
    const adminRoleId = await ctx.db.insert("roles", {
      name: "Administrator",
      slug: "administrator",
      description: "Full access",
      level: 100,
      type: "internal",
      isDefault: false,
      isProtected: true,
      capabilities: ["registration.invite"],
      pageAccess: ["/admin/users/new"],
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const inviterId = await ctx.db.insert("users", {
      authSource: "local",
      email: "inviter@example.com",
      emailVerified: true,
      displayName: "Inviter",
      slug: "inviter",
      status: "active",
      roleId: adminRoleId,
      isInternal: true,
      internalRole: "admin",
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const invitedUserId = await ctx.db.insert("users", {
      authSource: "clerk",
      clerkUserId: "user_invited",
      email: "invited@example.com",
      emailVerified: true,
      displayName: "Invited User",
      slug: "invited-user",
      status: "active",
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const otherUserId = await ctx.db.insert("users", {
      authSource: "clerk",
      clerkUserId: "user_other",
      email: "other@example.com",
      emailVerified: true,
      displayName: "Other User",
      slug: "other-user",
      status: "active",
      registrationMethod: "self",
      registeredAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const invitationId = await ctx.db.insert("invitations", {
      email: "invited@example.com",
      role: "subscriber",
      invitedBy: inviterId,
      status: "pending",
      token:
        "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      previousToken:
        "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      previousTokenExpiresAt: now + 60 * 60 * 1000,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000,
      createdAt: now,
      resentCount: 0,
    });

    return { invitedUserId, otherUserId, invitationId, inviterId };
  });
}

function withClerkIdentity(
  t: ReturnType<typeof createHarness>,
  subject: string,
  email: string,
) {
  return t.withIdentity({
    issuer: CLERK_ISSUER,
    subject,
    tokenIdentifier: `${CLERK_ISSUER}|${subject}`,
    email,
    emailVerified: true,
  });
}

function withLocalAdminIdentity(
  t: ReturnType<typeof createHarness>,
  subject: string,
) {
  return t.withIdentity({
    issuer: ADMIN_ISSUER,
    subject,
    tokenIdentifier: `${ADMIN_ISSUER}|${subject}`,
    email: "inviter@example.com",
    name: "Inviter",
  });
}

describe("registration security", () => {
  test("public invitation lookup rejects malformed tokens and returns only safe fields", async () => {
    const t = createHarness();
    await seedRegistrationFixture(t);

    await expect(
      t.query(api.registration.queries.getByToken, {
        token: "x".repeat(5000),
      }),
    ).resolves.toBeNull();

    const invitation = await t.query(api.registration.queries.getByToken, {
      token:
        "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    });

    expect(invitation).toEqual({
      email: "invited@example.com",
      role: "subscriber",
      message: null,
      expiresAt: expect.any(Number),
    });
    expect(Object.keys(invitation ?? {})).not.toContain("token");
    expect(Object.keys(invitation ?? {})).not.toContain("_id");
  });

  test("acceptInvitation requires the authenticated email to match the invitation", async () => {
    const t = createHarness();
    const fixture = await seedRegistrationFixture(t);
    const otherUser = withClerkIdentity(t, "user_other", "other@example.com");

    await expect(
      otherUser.mutation(api.registration.mutations.acceptInvitation, {
        token:
          "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        userId: fixture.otherUserId,
      }),
    ).rejects.toThrow("Invitation email does not match");

    const invitation = await t.run(async (ctx) => {
      return await ctx.db.get(fixture.invitationId);
    });
    expect(invitation?.status).toBe("pending");
    expect(invitation?.acceptedBy).toBeUndefined();
  });

  test("resendInvitation still works and bulkInvite enforces a batch limit", async () => {
    const t = createHarness();
    const fixture = await seedRegistrationFixture(t);
    const admin = withLocalAdminIdentity(t, fixture.inviterId);

    await expect(
      admin.mutation(api.registration.mutations.resendInvitation, {
        invitationId: fixture.invitationId,
      }),
    ).resolves.toBeNull();

    const invitation = await t.run(async (ctx) => {
      return await ctx.db.get(fixture.invitationId);
    });
    expect(invitation?.status).toBe("pending");
    expect(invitation?.resentCount).toBe(1);
    expect(invitation?.previousToken).toBe(
      "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    );
    expect(invitation?.token).not.toBe(invitation?.previousToken);

    await expect(
      admin.mutation(api.registration.mutations.bulkInvite, {
        invitations: Array.from({ length: 101 }, (_, index) => ({
          email: `bulk-${index}@example.com`,
          role: "subscriber",
        })),
        sendNotification: false,
      }),
    ).rejects.toThrow("Bulk invitations are limited to 100 recipients");
  });

  test("external auth creation cannot bypass a closed registration gate with OAuth", async () => {
    const t = createHarness();

    await expect(
      t.mutation(internal.registration.internals.handleExternalAuthUserCreated, {
        externalAuthId: "user_oauth_closed",
        email: "oauth@example.com",
        emailVerified: true,
        oauthProvider: "google",
      }),
    ).rejects.toThrow("User registration is currently not allowed");

    const users = await t.run(async (ctx) => {
      return await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", "oauth@example.com"))
        .collect();
    });
    expect(users).toHaveLength(0);
  });
});
