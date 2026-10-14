/**
 * Payment trust boundary (upstream PR 011): a learner's self-enrollment source
 * is derived from the server's access decision, never taken from the client.
 * A membership-gated self-enrollment stays a `membership_plan` projection, so
 * it ends with the membership; a client claiming `purchase` or `manual` cannot
 * turn it into independent, permanent access.
 */
import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../_generated/api";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/lms/enrollment/mutations.ts": () => import("../enrollment/mutations"),
  "./convex/lms/enrollment/queries.ts": () => import("../enrollment/queries"),
  "./convex/notifications/internals.ts": () => import("../../notifications/internals"),
};

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const role = await ctx.db.insert("roles", {
      name: "Subscriber", slug: "subscriber", description: "Fixture", level: 20, type: "customer", isDefault: true,
      isProtected: false, capabilities: [], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1,
    });
    const user = await ctx.db.insert("users", {
      authSource: "local", email: "learner@example.invalid", emailVerified: true, roleId: role, status: "active",
      createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("settings", { section: "plugins", values: { membershipEnabled: true, lmsEnabled: true }, updatedAt: 1, updatedBy: user });
    const course = (slug: string, accessMode: "members" | "free") =>
      ctx.db.insert("lms_courses", { title: slug, slug, status: "published", accessMode, authorId: user, createdAt: 1, updatedAt: 1 });
    const members = await course("members-course", "members");
    const free = await course("free-course", "free");
    const plan = await ctx.db.insert("membership_plans", {
      title: "Member", slug: "member", status: "active", grantMode: "manual", priority: 1, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("membership_restriction_rules", {
      resourceType: "course", resourceIdOrKey: String(members), ruleMode: "allow_only", planIds: [plan],
      teaserMode: "hide", loginRequired: true, createdAt: 1, updatedAt: 1,
    });
    const grant = await ctx.db.insert("membership_grants", {
      userId: user, planId: plan, sourceType: "manual", status: "active", startsAt: 1, createdAt: 1, updatedAt: 1,
    });
    return { user, members, free, plan, grant };
  });
  const learner = t.withIdentity({ subject: ids.user, tokenIdentifier: `https://convexpress-admin.local|${ids.user}` });
  return { t, ids, learner };
}

test("a membership self-enrollment stays tied to the membership whatever source the client claims", async () => {
  const f = await fixture();
  for (const source of ["purchase", "manual", undefined] as const) {
    const enrollmentId = await f.learner.mutation(api.lms.enrollment.mutations.enroll, {
      courseId: f.ids.members,
      ...(source ? { source } : {}),
    });
    const enrollment = await f.t.run((ctx) => ctx.db.get(enrollmentId));
    expect({ claimed: source, source: enrollment?.source, plan: enrollment?.membershipPlanId }).toEqual({
      claimed: source,
      source: "membership_plan",
      plan: f.ids.plan,
    });
  }
  expect((await f.learner.query(api.lms.enrollment.queries.canAccessCourse, { courseId: f.ids.members })).allowed).toBe(true);

  // The membership ends: the self-enrollment no longer grants the course.
  await f.t.run((ctx) => ctx.db.patch("membership_grants", f.ids.grant, { status: "revoked", revokedAt: Date.now() }));
  expect((await f.learner.query(api.lms.enrollment.queries.canAccessCourse, { courseId: f.ids.members })).allowed).toBe(false);
});

test("a free course self-enrollment is recorded as manual even if the client claims a purchase", async () => {
  const f = await fixture();
  const enrollmentId = await f.learner.mutation(api.lms.enrollment.mutations.enroll, { courseId: f.ids.free, source: "purchase" });
  expect((await f.t.run((ctx) => ctx.db.get(enrollmentId)))?.source).toBe("manual");
});
