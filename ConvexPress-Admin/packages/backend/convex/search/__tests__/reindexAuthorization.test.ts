import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/search/actions.ts": () => import("../actions"),
  "./convex/search/internals.ts": () => import("../internals"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
const reindex = makeFunctionReference<"action">("search/actions:reindex");
const permission = makeFunctionReference<"query">("search/internals:checkReindexPermission");
async function fixture(capabilities: string[] = [], status: "active" | "inactive" = "active") {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const roleId = await ctx.db.insert("roles", { name: "Fixture", slug: "fixture", description: "Test fixture", level: 80, type: "internal", status: "active", isDefault: false, isProtected: false, capabilities, pageAccess: [], createdAt: 1, updatedAt: 1 });
    const userId = await ctx.db.insert("users", { email: "reindex@example.test", emailVerified: true, authSource: "local", roleId, status, createdAt: 1, updatedAt: 1 });
    const postId = await ctx.db.insert("posts", { type: "post", title: "Index me", slug: "index-me", content: "Current content", status: "publish", visibility: "public", commentStatus: "closed", authorId: userId, createdAt: 1, updatedAt: 1 });
    return { userId, postId };
  });
  return { t, ids, client: t.withIdentity({ subject: ids.userId, issuer: "https://convexpress-admin.local" }) };
}
for (const incremental of [false, true]) test(`reindex denies insufficient capability before ${incremental ? "incremental" : "full"} work`, async () => {
  const f = await fixture();
  const args = incremental ? { contentType: "post", contentId: f.ids.postId } : {};
  await expect(f.client.action(reindex, args)).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  expect(await f.t.run(ctx => ctx.db.query("searchIndex").collect())).toEqual([]);
});
test("anonymous incremental reindex is denied", async () => {
  const f = await fixture();
  await expect(f.t.action(reindex, { contentId: f.ids.postId })).rejects.toMatchObject({ data: { code: "UNAUTHORIZED" } });
});
for (const capability of ["search.reindex", "manage_options"]) test(`${capability} authorizes incremental reindex`, async () => {
  const f = await fixture([capability]);
  expect(await f.client.action(reindex, { contentType: "post", contentId: f.ids.postId })).toEqual({ updated: true });
  expect((await f.t.run(ctx => ctx.db.query("searchIndex").collect())).map(row => row.contentId)).toEqual([f.ids.postId]);
});
test("inactive account cannot reindex despite retained administrator capability", async () => {
  const f = await fixture(["manage_options"], "inactive");
  await expect(f.client.action(reindex, { contentId: f.ids.postId })).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  expect(await f.t.run(ctx => ctx.db.query("searchIndex").collect())).toEqual([]);
});
test("permission query cannot substitute an unrelated privileged identity", async () => {
  const f = await fixture(["search.reindex"]);
  expect(await f.t.query(permission, { userId: f.ids.userId })).toBe(false);
  expect(await f.t.withIdentity({ subject: "different-user", issuer: "https://convexpress-admin.local" }).query(permission, { userId: f.ids.userId })).toBe(false);
});

test("reindex permission follows management-session scope and revocation", async () => {
  const { commerceHarness } = await import("../../commerce/__tests__/handlerHarness.test-support");
  const { checkReindexPermission } = await import("../internals");
  const ctx = commerceHarness({
    users: [{ _id: "managed-user", authSource: "management", status: "active", roleId: "managed-role" }],
    roles: [{ _id: "managed-role", slug: "administrator", type: "internal", status: "active", level: 100, capabilities: ["search.reindex", "manage_options"] }],
    convexpress_managementSessions: [{ _id: "managed-session", authorityId: "authority", bindingId: "binding", userId: "managed-user", websiteKey: "site", instanceKey: "live", siteRoleSlug: "administrator", siteCapabilities: ["search.reindex"], capabilityRevision: 1, status: "active", expiresAt: Date.now() + 60000 }],
    convexpress_managementAuthorities: [{ _id: "authority", controllerId: "controller", websiteKey: "site", instanceKey: "live", capabilityRevision: 1, status: "active", notBefore: 0 }],
    convexpress_managementBindings: [{ _id: "binding", authorityId: "authority", controllerId: "controller", userId: "managed-user", capabilityRevision: 1, status: "active" }],
  });
  ctx.auth.getUserIdentity = async () => ({ subject: "managed-session", tokenIdentifier: "https://convexpress-management.local|managed-session" });
  const invoke = () => (checkReindexPermission as unknown as { _handler(ctx: unknown, args: { userId: string }): Promise<boolean> })._handler(ctx, { userId: "managed-session" });
  expect(await invoke()).toBe(true);
  ctx.tables.convexpress_managementSessions[0].siteCapabilities = [];
  expect(await invoke()).toBe(false);
  ctx.tables.convexpress_managementSessions[0].siteCapabilities = ["search.reindex"];
  ctx.tables.convexpress_managementSessions[0].status = "revoked";
  expect(await invoke()).toBe(false);
});
