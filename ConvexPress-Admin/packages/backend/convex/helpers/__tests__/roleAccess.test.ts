import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { getCurrentRoleAccess } from "../../users";
import { currentUserCan } from "../permissions";
function fixture(managed = true) {
  const ctx = commerceHarness({
    users: [{ _id: "actor", authSource: managed ? "management" : "local", status: "active", roleId: "role" }],
    roles: [{ _id: "role", name: "Editor", slug: "editor", level: 80, type: "internal", status: "active", capabilities: ["page.update", "blocks.ai"], pageAccess: ["/pages"] }],
    convexpress_managementSessions: [{ _id: "session", authorityId: "authority", bindingId: "binding", userId: "actor", websiteKey: "site", instanceKey: "live", siteRoleSlug: "editor", siteCapabilities: ["page.update"], capabilityRevision: 1, status: "active", expiresAt: Date.now() + 60_000 }],
    convexpress_managementAuthorities: [{ _id: "authority", controllerId: "controller", websiteKey: "site", instanceKey: "live", capabilityRevision: 1, status: "active", notBefore: 0 }],
    convexpress_managementBindings: [{ _id: "binding", authorityId: "authority", controllerId: "controller", userId: "actor", capabilityRevision: 1, status: "active" }],
  }, "actor");
  if (managed) ctx.auth.getUserIdentity = async () => ({ subject: "session", tokenIdentifier: "https://convexpress-management.local|session" });
  return ctx;
}
const read = (ctx: any) => (getCurrentRoleAccess as any)._handler(ctx, {});

test("self role display intersects the current role and original session grant", async () => {
  const ctx = fixture();
  expect((await read(ctx)).role.capabilities).toEqual(["page.update"]);
  expect(await currentUserCan(ctx, "blocks.ai")).toBe(false);
  ctx.tables.convexpress_managementSessions[0].siteCapabilities.push("blocks.ai");
  expect((await read(ctx)).role.capabilities).toEqual(["page.update", "blocks.ai"]);
  expect(await currentUserCan(ctx, "blocks.ai")).toBe(true);
  ctx.tables.roles[0].capabilities = ["page.update"];
  expect((await read(ctx)).role.capabilities).toEqual(["page.update"]);
  expect(await currentUserCan(ctx, "blocks.ai")).toBe(false);
});

test("self display denies every invalid management boundary without disclosing session data", async () => {
  for (const change of [
    (c: any) => { c.tables.convexpress_managementSessions[0].status = "revoked"; },
    (c: any) => { c.tables.convexpress_managementSessions[0].expiresAt = Date.now() - 1; },
    (c: any) => { c.tables.convexpress_managementAuthorities[0].status = "revoked"; },
    (c: any) => { c.tables.convexpress_managementAuthorities[0].capabilityRevision++; },
    (c: any) => { c.tables.convexpress_managementAuthorities[0].notBefore = Date.now() + 60_000; },
    (c: any) => { c.tables.convexpress_managementAuthorities[0].expiresAt = Date.now() - 1; },
    (c: any) => { c.tables.convexpress_managementBindings[0].status = "revoked"; },
    (c: any) => { c.tables.users[0].status = "banned"; },
    (c: any) => { c.tables.roles[0].status = "inactive"; },
  ]) {
    const ctx = fixture();
    const initial = await read(ctx);
    expect(Object.keys(initial).sort()).toEqual(["role", "userId", "validUntil"]);
    change(ctx);
    expect(await read(ctx)).toBeNull();
  }
});

test("time boundary is the earlier authority/session expiry and local roles retain their capabilities", async () => {
  const ctx = fixture();
  const early = Date.now() + 20_000;
  ctx.tables.convexpress_managementAuthorities[0].expiresAt = early;
  expect((await read(ctx)).validUntil).toBe(early);
  delete ctx.tables.convexpress_managementAuthorities[0].expiresAt;
  expect((await read(ctx)).validUntil).toBe(ctx.tables.convexpress_managementSessions[0].expiresAt);
  const local = fixture(false);
  expect((await read(local)).role.capabilities).toEqual(["page.update", "blocks.ai"]);
  expect((await read(local)).validUntil).toBeNull();
  local.tables.users[0].status = "inactive";
  expect(await read(local)).toBeNull();
  local.auth.getUserIdentity = async () => null;
  expect(await read(local)).toBeNull();
});

test("role resolution retains legacy fallback but never elevates Clerk into an internal role", async () => {
  const ctx = fixture(false);
  delete ctx.tables.users[0].roleId;
  ctx.tables.users[0].internalRole = "editor";
  expect((await read(ctx)).role.slug).toBe("editor");
  ctx.tables.users[0].roleId = "role";
  ctx.tables.roles[0].status = "inactive";
  expect(await read(ctx)).toBeNull();
  ctx.tables.roles[0].status = "active";
  ctx.tables.users[0].authSource = "clerk";
  ctx.tables.users[0].clerkUserId = "clerk-actor";
  ctx.auth.getUserIdentity = async () => ({ subject: "clerk-actor", tokenIdentifier: "clerk|clerk-actor" });
  expect(await read(ctx)).toBeNull();
});
