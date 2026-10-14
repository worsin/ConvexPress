import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";

import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { BUILT_IN_ROLES } from "../../seed/roles";
import { clerkIdentity, useClerkIssuer } from "../../__tests__/clerkIssuer.test-support";
import { capturePublicationAuthority, requireCapturedPublicationAuthority } from "../../helpers/permissions";
import { RequestReadLedger } from "../../helpers/requestReadLedger";

const ADMIN_ISSUER = "https://convexpress-admin.local";
const MANAGEMENT_ISSUER = "https://convexpress-management.local";
const CLERK_ISSUER = "https://clerk.casemedix.example";
const STAFF_ISSUER = "https://staff.casemedix.example";
const OTHER_ISSUER = "https://other-idp.example";
useClerkIssuer(CLERK_ISSUER);

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/users.ts": () => import("../../users"),
  "./convex/users/externalIdentities.ts": () => import("../externalIdentities"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/taxonomies/mutations.ts": () => import("../../taxonomies/mutations"),
  "./convex/feeds/internals.ts": () => import("../../feeds/internals"),
  "./convex/auth/internals.ts": () => import("../../auth/internals"),
  "./convex/auth/clerkProvisioning.ts": () => import("../../auth/clerkProvisioning"),
  "./convex/auth/clerkSync.ts": () => import("../../auth/clerkSync"),
  "./convex/auth/clerkManagement.ts": () => import("../../auth/clerkManagement"),
  "./convex/password/actions.ts": () => import("../../password/actions"),
  "./convex/password/internals.ts": () => import("../../password/internals"),
  "./convex/password/mutations.ts": () => import("../../password/mutations"),
  "./convex/password/queries.ts": () => import("../../password/queries"),
  "./convex/profiles/mutations.ts": () => import("../../profiles/mutations"),
};

type Harness = ReturnType<typeof createHarness>;

function createHarness() {
  return convexTest({ schema, modules });
}

function identity(issuer: string, subject: string) {
  return { issuer, subject, tokenIdentifier: `${issuer}|${subject}` };
}

async function seedSite(t: Harness) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const roleIds = new Map<string, Id<"roles">>();
    for (const role of BUILT_IN_ROLES) {
      roleIds.set(role.slug, await ctx.db.insert("roles", {
        name: role.name,
        slug: role.slug,
        description: role.description,
        level: role.level,
        type: role.type,
        isDefault: role.isDefault,
        isProtected: role.isProtected,
        capabilities: role.capabilities,
        pageAccess: role.pageAccess,
        status: role.status,
        createdAt: now,
        updatedAt: now,
      }));
    }
    const systemRoleId = await ctx.db.insert("roles", {
      name: "Integration System", slug: "integration-system", description: "System-reserved.",
      level: 90, type: "system", isDefault: false, isProtected: true,
      capabilities: ["manage_options"], pageAccess: [], status: "active", createdAt: now, updatedAt: now,
    });
    const administratorRoleId = roleIds.get("administrator");
    const subscriberRoleId = roleIds.get("subscriber");
    if (!administratorRoleId || !subscriberRoleId) throw new Error("built-in roles were not seeded");
    const adminId = await ctx.db.insert("users", {
      authSource: "local", email: "admin@example.com", username: "admin", passwordHash: "not-a-real-hash",
      displayName: "Local Admin", slug: "local-admin", emailVerified: true, status: "active",
      isInternal: true, internalRole: "admin", roleId: administratorRoleId,
      registrationMethod: "self", registeredAt: now, createdAt: now, updatedAt: now,
    });
    const clerkCustomerId = await ctx.db.insert("users", {
      authSource: "clerk", clerkUserId: "user_shared_subject", email: "customer@example.com",
      displayName: "Website Customer", slug: "website-customer", emailVerified: true, status: "active",
      roleId: subscriberRoleId, registrationMethod: "self", registeredAt: now, createdAt: now, updatedAt: now,
    });
    return { adminId, clerkCustomerId, systemRoleId };
  });
}

async function linkStaff(
  t: Harness,
  overrides: Partial<{ subject: string; email: string; roleSlug: string; status: "active" | "inactive" }> = {},
) {
  const result = await t.mutation(internal.users.externalIdentities.upsertExternalOperator, {
    issuer: STAFF_ISSUER,
    subject: overrides.subject ?? "staff-001",
    email: overrides.email ?? "editor@casemedix.example",
    firstName: "Erin",
    lastName: "Editor",
    roleSlug: overrides.roleSlug ?? "editor",
    status: overrides.status ?? "active",
    linkedBy: "casemedix-sync",
    label: "CaseMedix staff",
  });
  if (!result.ok) throw new Error(`unexpected conflict: ${result.reason}`);
  return result;
}

describe("issuer-bound identity resolution", () => {
  test("an external identity resolves only through its exact link", async () => {
    const t = createHarness();
    await seedSite(t);
    const { userId } = await linkStaff(t);

    const linked = t.withIdentity(identity(STAFF_ISSUER, "staff-001"));
    const current = await linked.query(api.users.getCurrentUser, {});
    expect(current?._id).toBe(userId);
    expect(current?.email).toBe("editor@casemedix.example");

    // Same subject from another trusted issuer, another subject from the same
    // issuer, the user's own _id as subject, and the Clerk issuer: all unlinked.
    for (const viewer of [
      identity(OTHER_ISSUER, "staff-001"),
      identity(STAFF_ISSUER, "staff-002"),
      identity(STAFF_ISSUER, userId),
      identity(CLERK_ISSUER, "staff-001"),
    ]) {
      expect(await t.withIdentity(viewer).query(api.users.getCurrentUser, {})).toBeNull();
    }
  });

  test("an admin-issuer token naming an external user's _id never resolves (local auth only)", async () => {
    const t = createHarness();
    await seedSite(t);
    const { userId } = await linkStaff(t);
    const forged = t.withIdentity(identity(ADMIN_ISSUER, userId));
    expect(await forged.query(api.users.getCurrentUser, {})).toBeNull();
    const management = t.withIdentity(identity(MANAGEMENT_ISSUER, userId));
    expect(await management.query(api.users.getCurrentUser, {})).toBeNull();
  });

  test("deactivated and unlinked identities resolve to no user", async () => {
    const t = createHarness();
    await seedSite(t);
    const { userId } = await linkStaff(t);
    const staff = t.withIdentity(identity(STAFF_ISSUER, "staff-001"));

    const deactivated = await t.mutation(internal.users.externalIdentities.deactivateExternalOperator, { issuer: STAFF_ISSUER, subject: "staff-001" });
    expect(deactivated).toEqual({ ok: true, userId, changed: true });
    expect(await staff.query(api.users.getCurrentUser, {})).toBeNull();
    await expect(staff.mutation(api.taxonomies.mutations.createCategory, { name: "After deactivation" }))
      .rejects.toThrow("Authentication required");

    // The integrator restores access with an explicit active sync.
    await linkStaff(t);
    expect((await staff.query(api.users.getCurrentUser, {}))?._id).toBe(userId);

    const unlinked = await t.mutation(internal.users.externalIdentities.unlinkExternalIdentity, { issuer: STAFF_ISSUER, subject: "staff-001" });
    expect(unlinked).toEqual({ removed: true, userId });
    expect(await staff.query(api.users.getCurrentUser, {})).toBeNull();
    expect(await t.query(internal.users.externalIdentities.getExternalOperator, { issuer: STAFF_ISSUER, subject: "staff-001" })).toBeNull();
    expect(await t.mutation(internal.users.externalIdentities.deactivateExternalOperator, { issuer: STAFF_ISSUER, subject: "staff-001" }))
      .toEqual({ ok: false, reason: "not_found" });
  });

  test("deleting the account removes its identity links", async () => {
    const t = createHarness();
    const { adminId } = await seedSite(t);
    const { userId } = await linkStaff(t);
    const admin = t.withIdentity(identity(ADMIN_ISSUER, adminId));
    await admin.mutation(api.profiles.mutations.deleteUser, { userId, deleteContent: true });
    const links = await t.run(async (ctx) => await ctx.db.query("userExternalIdentities").collect());
    expect(links).toHaveLength(0);
    expect(await t.withIdentity(identity(STAFF_ISSUER, "staff-001")).query(api.users.getCurrentUser, {})).toBeNull();
  });
});

describe("external accounts cannot be claimed or given a ConvexPress password", () => {
  test("local login lookups refuse external users", async () => {
    const t = createHarness();
    await seedSite(t);
    const { userId } = await linkStaff(t);
    expect(await t.query(internal.auth.internals.findLocalUser, { email: "editor@casemedix.example" })).toBeNull();
    expect(await t.query(internal.auth.internals.getLocalSessionUserById, { userId })).toBeNull();
    await expect(t.mutation(internal.auth.internals.setPasswordHash, { userId, passwordHash: "attacker-hash" }))
      .rejects.toThrow("Only local accounts");
    const stored = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(stored?.passwordHash).toBeUndefined();
  });

  test("password reset is never issued or completed for an external user", async () => {
    const t = createHarness();
    const { adminId } = await seedSite(t);
    const { userId } = await linkStaff(t);

    await t.action(api.password.actions.requestPasswordReset, { email: "editor@casemedix.example" });
    let stored = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(stored?.passwordResetToken).toBeUndefined();

    const admin = t.withIdentity(identity(ADMIN_ISSUER, adminId));
    await expect(admin.action(api.password.actions.adminResetUserPassword, { targetUserId: userId }))
      .rejects.toThrow("external identity provider");
    stored = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(stored?.passwordResetToken).toBeUndefined();

    // Even a token planted on the record cannot complete a reset.
    const tokenHash = "0".repeat(64);
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { passwordResetToken: tokenHash, passwordResetTokenExpiresAt: Date.now() + 60_000 });
    });
    expect(await t.mutation(internal.password.internals.verifyResetToken, { email: "editor@casemedix.example", tokenHash })).toBeNull();
  });

  test("a Clerk session or Clerk webhook with the same email cannot claim the account", async () => {
    const t = createHarness();
    await seedSite(t);
    const { userId } = await linkStaff(t);
    const clerk = t.withIdentity({
      ...clerkIdentity(CLERK_ISSUER, "user_claimer"),
      email: "editor@casemedix.example",
      emailVerified: true,
    });
    expect(await clerk.mutation(api.auth.clerkProvisioning.ensureClerkUser, {}))
      .toEqual({ ok: false, reason: "email_conflict" });
    await t.mutation(internal.auth.clerkSync.upsertClerkUser, { clerkUserId: "user_claimer", email: "editor@casemedix.example" });
    await t.mutation(internal.auth.clerkManagement.markClerkProvisioning, {
      userId, source: "admin_manual", status: "linked_existing", clerkUserId: "user_claimer", setAuthSourceToClerk: true,
    });
    const stored = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(stored?.authSource).toBe("external");
    expect(stored?.clerkUserId).toBeUndefined();
    expect(stored?.passwordHash).toBeUndefined();
  });

  test("a non-Clerk identity is never provisioned as a Clerk website account", async () => {
    const t = createHarness();
    await seedSite(t);
    const staff = t.withIdentity({ ...identity(STAFF_ISSUER, "staff-unlinked"), email: "new@casemedix.example", emailVerified: true });
    expect(await staff.mutation(api.auth.clerkProvisioning.ensureClerkUser, {})).toEqual({ ok: false, reason: "unknown" });
    const users = await t.run(async (ctx) => await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", "new@casemedix.example")).collect());
    expect(users).toHaveLength(0);
  });
});

describe("upsertExternalOperator", () => {
  test("is idempotent, assigns the role by slug, and audits role changes", async () => {
    const t = createHarness();
    await seedSite(t);
    const first = await linkStaff(t);
    expect(first.created).toBe(true);
    const second = await linkStaff(t);
    expect(second).toEqual({ ok: true, userId: first.userId, created: false });

    const snapshot = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", "editor@casemedix.example")).collect(),
      links: await ctx.db.query("userExternalIdentities").collect(),
      roleChanges: await ctx.db.query("roleChanges").withIndex("by_userId", (q) => q.eq("userId", first.userId)).collect(),
      editor: await ctx.db.query("roles").withIndex("by_slug", (q) => q.eq("slug", "editor")).unique(),
    }));
    expect(snapshot.users).toHaveLength(1);
    const [user] = snapshot.users;
    expect(user.authSource).toBe("external");
    expect(user.roleId).toBe(snapshot.editor?._id);
    expect(user.passwordHash).toBeUndefined();
    expect(user.clerkUserId).toBeUndefined();
    expect(snapshot.links).toEqual([expect.objectContaining({
      userId: first.userId, issuer: STAFF_ISSUER, subject: "staff-001",
      tokenIdentifier: `${STAFF_ISSUER}|staff-001`, linkedBy: "casemedix-sync", label: "CaseMedix staff",
    })]);
    expect(snapshot.roleChanges).toHaveLength(1);

    await linkStaff(t, { roleSlug: "author", email: "erin@casemedix.example" });
    const operator = await t.query(internal.users.externalIdentities.getExternalOperator, { issuer: STAFF_ISSUER, subject: "staff-001" });
    expect(operator).toEqual(expect.objectContaining({
      userId: first.userId, roleSlug: "author", email: "erin@casemedix.example", status: "active",
    }));
    const roleChanges = await t.run(async (ctx) => await ctx.db.query("roleChanges").withIndex("by_userId", (q) => q.eq("userId", first.userId)).collect());
    expect(roleChanges).toHaveLength(2);
  });

  test("refuses an email that belongs to a non-external account without writing anything", async () => {
    const t = createHarness();
    await seedSite(t);
    for (const email of ["admin@example.com", "customer@example.com"]) {
      const result = await t.mutation(internal.users.externalIdentities.upsertExternalOperator, {
        issuer: STAFF_ISSUER, subject: `claim-${email}`, email, roleSlug: "administrator", status: "active",
      });
      expect(result).toEqual(expect.objectContaining({ ok: false, reason: "email_conflict" }));
    }
    const snapshot = await t.run(async (ctx) => ({
      links: await ctx.db.query("userExternalIdentities").collect(),
      external: await ctx.db.query("users").withIndex("by_authSource", (q) => q.eq("authSource", "external")).collect(),
      admin: await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", "admin@example.com")).unique(),
    }));
    expect(snapshot.links).toHaveLength(0);
    expect(snapshot.external).toHaveLength(0);
    expect(snapshot.admin?.authSource).toBe("local");
  });

  test("refuses an email held by an external account linked to another identity", async () => {
    const t = createHarness();
    await seedSite(t);
    await linkStaff(t);
    const result = await t.mutation(internal.users.externalIdentities.upsertExternalOperator, {
      issuer: STAFF_ISSUER, subject: "staff-999", email: "editor@casemedix.example", roleSlug: "editor", status: "active",
    });
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: "email_conflict" }));
  });

  test("refuses reserved issuers, malformed claims and roles an external operator cannot hold", async () => {
    const t = createHarness();
    const { systemRoleId } = await seedSite(t);
    const base = { subject: "staff-001", email: "editor@casemedix.example", roleSlug: "editor", status: "active" as const };
    for (const issuer of [ADMIN_ISSUER, MANAGEMENT_ISSUER, CLERK_ISSUER, `${CLERK_ISSUER}/`, "https://bad|issuer.example", ` ${STAFF_ISSUER}`, ""]) {
      await expect(t.mutation(internal.users.externalIdentities.upsertExternalOperator, { ...base, issuer }))
        .rejects.toThrow("EXTERNAL_IDENTITY_INVALID");
    }
    const system = await t.run(async (ctx) => await ctx.db.get(systemRoleId));
    for (const roleSlug of [system?.slug ?? "integration-system", "missing-role"]) {
      await expect(t.mutation(internal.users.externalIdentities.upsertExternalOperator, { ...base, issuer: STAFF_ISSUER, roleSlug }))
        .rejects.toThrow("EXTERNAL_OPERATOR_ROLE_UNAVAILABLE");
    }
  });

  test("never lifts a ConvexPress ban", async () => {
    const t = createHarness();
    await seedSite(t);
    const { userId } = await linkStaff(t);
    await t.run(async (ctx) => { await ctx.db.patch(userId, { status: "banned" }); });
    const result = await t.mutation(internal.users.externalIdentities.upsertExternalOperator, {
      issuer: STAFF_ISSUER, subject: "staff-001", email: "editor@casemedix.example", roleSlug: "editor", status: "active",
    });
    expect(result).toEqual(expect.objectContaining({ ok: false, reason: "account_banned" }));
    expect(await t.withIdentity(identity(STAFF_ISSUER, "staff-001")).query(api.users.getCurrentUser, {})).toBeNull();
  });
});

describe("capabilities for an external operator", () => {
  test("an external editor passes a real capability-gated mutation and is audited as itself", async () => {
    const t = createHarness();
    await seedSite(t);
    const { userId } = await linkStaff(t);
    const staff = t.withIdentity(identity(STAFF_ISSUER, "staff-001"));

    const termId = await staff.mutation(api.taxonomies.mutations.createCategory, { name: "Clinical Updates" });
    const term = await t.run(async (ctx) => await ctx.db.get(termId));
    expect(term?.createdBy).toBe(userId);
    const events = await t.run(async (ctx) => await ctx.db.query("events").collect());
    expect(events.find((event) => event.code === "taxonomy.category_created")?.actorId).toBe(userId);

    expect((await staff.query(api.users.checkAdminAccess, {}))?.id).toBe(userId);
    expect((await staff.query(api.users.getCurrentRoleAccess, {}))?.role.slug).toBe("editor");
    expect(await staff.query(internal.feeds.internals.getCallerRoleLevel, {})).toBe(80);
  });

  test("the role, not the identity source, decides: a subscriber operator is forbidden", async () => {
    const t = createHarness();
    await seedSite(t);
    await linkStaff(t, { roleSlug: "subscriber" });
    const staff = t.withIdentity(identity(STAFF_ISSUER, "staff-001"));
    await expect(staff.mutation(api.taxonomies.mutations.createCategory, { name: "Denied" }))
      .rejects.toThrow("Insufficient permissions");
    expect(await staff.query(api.users.checkAdminAccess, {})).toBeNull();
  });

  test("an unlinked identity from a trusted issuer is unauthenticated everywhere", async () => {
    const t = createHarness();
    await seedSite(t);
    const stranger = t.withIdentity(identity(STAFF_ISSUER, "staff-unlinked"));
    await expect(stranger.mutation(api.taxonomies.mutations.createCategory, { name: "Denied" }))
      .rejects.toThrow("Authentication required");
    expect(await stranger.query(api.users.checkAdminAccess, {})).toBeNull();
    expect(await stranger.query(internal.feeds.internals.getCallerRoleLevel, {})).toBeNull();
  });
});

describe("captured background authority", () => {
  test("a captured publication authority is bound to the exact external link", async () => {
    const t = createHarness();
    await seedSite(t);
    const { userId } = await linkStaff(t);
    const scope = { websiteKey: "site", instanceKey: "live" };
    const staff = t.withIdentity(identity(STAFF_ISSUER, "staff-001"));

    const authority = await staff.run(async (ctx) =>
      await capturePublicationAuthority(ctx, scope, "post.publish", new RequestReadLedger()));
    expect(authority).toEqual(expect.objectContaining({
      userId, authSource: "external", externalTokenIdentifier: `${STAFF_ISSUER}|staff-001`, clerkSubject: null,
    }));

    const recheck = (captured: typeof authority) => t.run(async (ctx) =>
      (await requireCapturedPublicationAuthority(ctx, captured, scope, "post.publish", new RequestReadLedger()))._id);
    expect(await recheck(authority)).toBe(userId);
    await expect(recheck({ ...authority, externalTokenIdentifier: `${OTHER_ISSUER}|staff-001` }))
      .rejects.toThrow("SYNCED_REFRESH_AUTHORITY");
    await expect(recheck({ ...authority, externalTokenIdentifier: undefined }))
      .rejects.toThrow("SYNCED_REFRESH_AUTHORITY");

    await t.mutation(internal.users.externalIdentities.unlinkExternalIdentity, { issuer: STAFF_ISSUER, subject: "staff-001" });
    await expect(recheck(authority)).rejects.toThrow("SYNCED_REFRESH_AUTHORITY");
  });
});
