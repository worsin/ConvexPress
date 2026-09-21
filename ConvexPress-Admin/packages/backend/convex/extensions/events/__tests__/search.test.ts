import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../../schema";
import { createPublicSearchSourceReader } from "../../../search/publicSource";
import { RequestReadLedger } from "../../../helpers/requestReadLedger";
const modules = {
  "./convex/membership/policyReads.ts": () => import("../../../membership/policyReads"),
  "./convex/_generated/api.js": () => import("../../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../../_generated/server.js"),
  "./convex/extensions/events/mutations.ts": () => import("../mutations"),
};
const create = makeFunctionReference<"mutation">("extensions/events/mutations:create");
const update = makeFunctionReference<"mutation">("extensions/events/mutations:update");
test("extension search uses current owned records, routes, publication and plugin authority", async () => {
  const t = convexTest({ schema, modules });
  const { user, settings } = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Manager", slug: "manager", description: "Fixture", level: 80, type: "internal", isDefault: false, isProtected: false, capabilities: ["manage_options"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const user = await ctx.db.insert("users", { authSource: "local", email: "search@example.invalid", emailVerified: true, roleId: role, status: "active", createdAt: 1, updatedAt: 1 });
    const settings = await ctx.db.insert("settings", { section: "plugins", values: { eventsEnabled: true }, updatedAt: 1, updatedBy: user });
    return { user, settings };
  });
  const client = t.withIdentity({ subject: user, tokenIdentifier: `https://convexpress-admin.local|${user}` });
  const fields = { title: "A public workshop", slug: "public-workshop", description: "Visible description", startsAt: Date.now() + 86400000, endsAt: Date.now() + 90000000, timeZone: "UTC", venue: "Studio", venueAddress: "" };
  const id = await client.mutation(create, fields);
  const read = () => t.run(ctx => createPublicSearchSourceReader(ctx, Date.now(), new RequestReadLedger())({ contentType: "event", contentId: id }));
  expect(await read()).toBeNull();
  const row = await t.run(ctx => ctx.db.get("extension_events", id));
  await client.mutation(update, { ...fields, id, expectedUpdatedAt: row!.updatedAt, status: "published" });
  expect(await read()).toMatchObject({ contentId: id, title: fields.title, url: "/events/public-workshop", excerpt: fields.description });
  await t.run(async ctx => {
    const index = await ctx.db.query("searchIndex").withIndex("by_content", q => q.eq("contentType", "event").eq("contentId", id)).unique();
    expect(index).toMatchObject({ url: "/events/public-workshop", status: "publish" });
    await ctx.db.patch(index!._id, { title: "Stale private cache", url: "/wrong" });
  });
  expect(await read()).toMatchObject({ title: fields.title, url: "/events/public-workshop" });
  await t.run(ctx => ctx.db.patch(settings, { values: { eventsEnabled: false } }));
  expect(await read()).toBeNull();
  await t.run(async ctx => {
    await ctx.db.patch(settings, { values: { eventsEnabled: true, membershipEnabled: true } });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "route", resourceIdOrKey: "/events/public-workshop", ruleMode: "allow_only", planIds: [], teaserMode: "hide", loginRequired: true, createdAt: 1, updatedAt: 1 });
  });
  expect(await read()).toBeNull();
  expect(await t.run(ctx => createPublicSearchSourceReader(ctx)({ contentType: "event", contentId: user }))).toBeNull();
});
