import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { BUILT_IN_ROLES } from "../../seed/roles";
import { clerkIdentity, useClerkIssuer } from "../../__tests__/clerkIssuer.test-support";
import { classifyIdentity, isReservedIssuer, tokenIdentifierFor } from "../../auth/issuers";

const ADMIN_ISSUER = "https://convexpress-admin.local";
const MANAGEMENT_ISSUER = "https://convexpress-management.local";
const CLERK_ISSUER = "https://clerk.site.example";
const OTHER_ISSUER = "https://other-idp.example";
useClerkIssuer(CLERK_ISSUER);

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/users.ts": () => import("../../users"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/taxonomies/mutations.ts": () => import("../../taxonomies/mutations"),
  "./convex/feeds/internals.ts": () => import("../../feeds/internals"),
  "./convex/auditLogs/internals.ts": () => import("../../auditLogs/internals"),
  "./convex/sitemaps/helpers/auth.ts": () => import("../../sitemaps/helpers/auth"),
  "./convex/shipping/internals.ts": () => import("../../shipping/internals"),
  "./convex/airtableSync/_internal.ts": () => import("../../airtableSync/_internal"),
  "./convex/auth/clerkProvisioning.ts": () => import("../../auth/clerkProvisioning"),
};

type Harness = ReturnType<typeof createHarness>;

function createHarness() {
  return convexTest({ schema, modules });
}

function identity(issuer: string, subject: string) {
  return { issuer, subject, tokenIdentifier: tokenIdentifierFor(issuer, subject) };
}

/** A local administrator and a Clerk website author whose subject other issuers try to reuse. */
async function seedSite(t: Harness) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const roleIds = new Map<string, Id<"roles">>();
    for (const role of BUILT_IN_ROLES) {
      roleIds.set(role.slug, await ctx.db.insert("roles", {
        name: role.name, slug: role.slug, description: role.description, level: role.level,
        type: role.type, isDefault: role.isDefault, isProtected: role.isProtected,
        capabilities: role.capabilities, pageAccess: role.pageAccess, status: role.status,
        createdAt: now, updatedAt: now,
      }));
    }
    const administratorRoleId = roleIds.get("administrator");
    const authorRoleId = roleIds.get("author");
    if (!administratorRoleId || !authorRoleId) throw new Error("built-in roles were not seeded");
    const adminId = await ctx.db.insert("users", {
      authSource: "local", email: "admin@example.com", username: "admin", passwordHash: "not-a-real-hash",
      displayName: "Local Admin", slug: "local-admin", emailVerified: true, status: "active",
      isInternal: true, internalRole: "admin", roleId: administratorRoleId,
      registrationMethod: "self", registeredAt: now, createdAt: now, updatedAt: now,
    });
    const clerkAuthorId = await ctx.db.insert("users", {
      authSource: "clerk", clerkUserId: "user_shared_subject", email: "author@example.com",
      displayName: "Website Author", slug: "website-author", emailVerified: true, status: "active",
      roleId: authorRoleId, registrationMethod: "self", registeredAt: now, createdAt: now, updatedAt: now,
    });
    return { adminId, clerkAuthorId };
  });
}

describe("issuer classification", () => {
  test("ConvexPress's own issuers come from the token identifier; Clerk requires the configured issuer", () => {
    expect(classifyIdentity(identity(ADMIN_ISSUER, "u"))).toBe("admin");
    expect(classifyIdentity(identity(MANAGEMENT_ISSUER, "s"))).toBe("management");
    expect(classifyIdentity(identity(CLERK_ISSUER, "user_1"))).toBe("clerk");
    expect(classifyIdentity({ ...identity(CLERK_ISSUER, "user_1"), issuer: `${CLERK_ISSUER}/` })).toBe("clerk");
    expect(classifyIdentity(identity(OTHER_ISSUER, "user_1"))).toBe("external");
    // A token identifier that merely looks like Clerk's does not make it Clerk.
    expect(classifyIdentity({ tokenIdentifier: `${CLERK_ISSUER}|user_1`, issuer: OTHER_ISSUER })).toBe("external");
    expect(classifyIdentity({ tokenIdentifier: `${CLERK_ISSUER}|user_1` })).toBe("external");
  });

  test("reserved issuers include the configured Clerk issuer only while it is configured", () => {
    expect(isReservedIssuer(ADMIN_ISSUER)).toBe(true);
    expect(isReservedIssuer(`${MANAGEMENT_ISSUER}/`)).toBe(true);
    expect(isReservedIssuer(CLERK_ISSUER)).toBe(true);
    expect(isReservedIssuer(OTHER_ISSUER)).toBe(false);
  });
});

describe("Clerk identities are bound to the configured issuer", () => {
  test("a Clerk subject presented by another trusted issuer resolves to no user", async () => {
    const t = createHarness();
    const { clerkAuthorId } = await seedSite(t);
    expect((await t.withIdentity(clerkIdentity(CLERK_ISSUER, "user_shared_subject")).query(api.users.getCurrentUser, {}))?._id)
      .toBe(clerkAuthorId);
    for (const issuer of [OTHER_ISSUER, "https://convex.test", `${CLERK_ISSUER}.evil.example`]) {
      const viewer = t.withIdentity(identity(issuer, "user_shared_subject"));
      expect(await viewer.query(api.users.getCurrentUser, {})).toBeNull();
      await expect(viewer.mutation(api.taxonomies.mutations.createTag, { name: "Leak" }))
        .rejects.toThrow("Authentication required");
    }
  });

  test("the configured Clerk issuer still resolves its users, ignoring a trailing slash", async () => {
    const t = createHarness();
    const { clerkAuthorId } = await seedSite(t);
    const viewer = t.withIdentity(clerkIdentity(CLERK_ISSUER, "user_shared_subject"));
    const previous = process.env.CLERK_JWT_ISSUER_DOMAIN;
    process.env.CLERK_JWT_ISSUER_DOMAIN = `${CLERK_ISSUER}/`;
    try {
      expect((await viewer.query(api.users.getCurrentUser, {}))?._id).toBe(clerkAuthorId);
      expect((await viewer.mutation(api.taxonomies.mutations.createTag, { name: "Allowed" }))).toBeTruthy();
    } finally {
      process.env.CLERK_JWT_ISSUER_DOMAIN = previous;
    }
  });

  test("with no Clerk issuer configured, no identity resolves as a Clerk user", async () => {
    const t = createHarness();
    await seedSite(t);
    const previous = process.env.CLERK_JWT_ISSUER_DOMAIN;
    delete process.env.CLERK_JWT_ISSUER_DOMAIN;
    try {
      expect(await t.withIdentity(clerkIdentity(CLERK_ISSUER, "user_shared_subject")).query(api.users.getCurrentUser, {}))
        .toBeNull();
    } finally {
      process.env.CLERK_JWT_ISSUER_DOMAIN = previous;
    }
  });

  test("Clerk provisioning ignores identities from any other issuer", async () => {
    const t = createHarness();
    await seedSite(t);
    const admin = await t.run(async (ctx) => await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", "admin@example.com")).unique());
    if (!admin) throw new Error("admin missing");
    // A local admin JWT and a foreign issuer must not become Clerk website accounts.
    for (const viewer of [identity(ADMIN_ISSUER, admin._id), identity(OTHER_ISSUER, "user_new")]) {
      const result = await t.withIdentity({ ...viewer, email: "fresh@example.com", emailVerified: true })
        .mutation(api.auth.clerkProvisioning.ensureClerkUser, {});
      expect(result).toEqual({ ok: false, reason: "unknown" });
    }
    const created = await t.run(async (ctx) => await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", "fresh@example.com")).collect());
    expect(created).toHaveLength(0);
  });
});

describe("action capability checks resolve the caller from the verified identity", () => {
  test("administrators pass and foreign-issuer look-alikes fail", async () => {
    const t = createHarness();
    const { adminId } = await seedSite(t);
    const admin = t.withIdentity(identity(ADMIN_ISSUER, adminId));
    expect(await admin.query(internal.feeds.internals.getCallerRoleLevel, {})).toBe(100);
    expect(await admin.query(internal.auditLogs.internals.checkExportPermission, {})).toBe(true);
    expect((await admin.query(internal.sitemaps.helpers.auth.checkCapability, { capability: "seo.generate_sitemap" })).userId).toBe(adminId);
    expect((await admin.query(internal.shipping.internals.checkShippingAdminAction, { capability: "manage_options" })).userId).toBe(adminId);
    expect((await admin.query(internal.airtableSync._internal.checkAdminPermission, {})).userId).toBe(adminId);

    // The admin's _id as the subject of a foreign token, and the Clerk user's
    // subject from a foreign issuer, were both accepted by the old
    // subject-only lookups.
    for (const viewer of [identity(OTHER_ISSUER, adminId), identity(OTHER_ISSUER, "user_shared_subject")]) {
      const foreign = t.withIdentity(viewer);
      expect(await foreign.query(internal.feeds.internals.getCallerRoleLevel, {})).toBeNull();
      expect(await foreign.query(internal.auditLogs.internals.checkExportPermission, {})).toBe(false);
      await expect(foreign.query(internal.sitemaps.helpers.auth.checkCapability, { capability: "seo.generate_sitemap" }))
        .rejects.toThrow("Authentication required");
      await expect(foreign.query(internal.shipping.internals.checkShippingAdminAction, { capability: "manage_options" }))
        .rejects.toThrow("Authentication required");
      await expect(foreign.query(internal.airtableSync._internal.checkAdminPermission, {}))
        .rejects.toThrow("Authentication required");
    }
  });

  test("a website account's role cannot pass an operator capability check", async () => {
    const t = createHarness();
    await seedSite(t);
    const author = t.withIdentity(clerkIdentity(CLERK_ISSUER, "user_shared_subject"));
    expect(await author.query(internal.feeds.internals.getCallerRoleLevel, {})).toBe(60);
    expect(await author.query(internal.auditLogs.internals.checkExportPermission, {})).toBe(false);
    await expect(author.query(internal.airtableSync._internal.checkAdminPermission, {}))
      .rejects.toThrow("Insufficient permissions");
  });
});
