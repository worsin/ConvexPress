import { expect, test } from "bun:test";
import { makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import schema from "../../schema";
import type { Id } from "../../_generated/dataModel";

const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/menus/internals.ts": () => import("../internals"),
};
const autoAddPageToMenus = makeFunctionReference<"mutation", { eventId: Id<"events"> }, null>("menus/internals:autoAddPageToMenus");
const handleContentDeleted = makeFunctionReference<"mutation", { eventId: Id<"events"> }, null>("menus/internals:handleContentDeleted");

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const user = await ctx.db.insert("users", { authSource: "local", email: "menus@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const page = (slug: string, fields: { status?: "publish" | "draft"; parentId?: Id<"posts"> } = {}) =>
      ctx.db.insert("posts", {
        type: "page", title: slug === "pricing-faq" ? "Pricing FAQ" : "Pricing", slug, status: fields.status ?? "publish", visibility: "public",
        authorId: user, commentStatus: "closed", createdAt: 1, updatedAt: 1, ...(fields.parentId ? { parentId: fields.parentId } : {}),
      });
    const pricing = await page("pricing");
    const child = await page("pricing-faq", { parentId: pricing });
    const draft = await page("draft-page", { status: "draft" });
    const menu = (slug: string, autoAddPages: boolean) =>
      ctx.db.insert("menus", { name: slug, slug, autoAddPages, itemCount: 1, createdBy: user, createdAt: 1, updatedAt: 1 });
    const auto = await menu("auto", true);
    const manual = await menu("manual", false);
    for (const menuId of [auto, manual])
      await ctx.db.insert("menuItems", { menuId, itemType: "custom", label: "Home", url: "/", position: 0, depth: 0, createdAt: 1, updatedAt: 1 });
    return { pricing, child, draft, auto, manual };
  });
  const event = (code: string, payload: unknown) =>
    t.run((ctx) =>
      ctx.db.insert("events", {
        code, system: "page", payload: typeof payload === "string" ? payload : JSON.stringify(payload), status: "processing",
        listenersTotal: 1, listenersCompleted: 0, listenersFailed: 0, emittedAt: 1,
      }),
    );
  const items = (menuId: Id<"menus">) =>
    t.run(async (ctx) => (await ctx.db.query("menuItems").withIndex("by_menu", (q) => q.eq("menuId", menuId)).collect()).sort((a, b) => a.position - b.position));
  const menu = (menuId: Id<"menus">) => t.run(async (ctx) => (await ctx.db.get("menus", menuId))!);
  return { t, ids, event, items, menu };
}

test("page.published adds a top-level page to auto-add menus once, linking its public address", async () => {
  const f = await fixture();
  const published = await f.event("page.published", { pageId: f.ids.pricing, title: "Pricing", url: "/pricing" });
  await f.t.mutation(autoAddPageToMenus, { eventId: published });
  // A redelivered event adds nothing more.
  await f.t.mutation(autoAddPageToMenus, { eventId: published });

  const auto = await f.items(f.ids.auto);
  expect(auto.map(({ itemType, label, url, position, objectId }) => ({ itemType, label, url, position, objectId }))).toEqual([
    { itemType: "custom", label: "Home", url: "/", position: 0, objectId: undefined },
    { itemType: "page", label: "Pricing", url: "/page/pricing", position: 1, objectId: f.ids.pricing },
  ]);
  expect((await f.menu(f.ids.auto)).itemCount).toBe(2);
  expect(await f.items(f.ids.manual)).toHaveLength(1);
});

test("child pages, unpublished pages and unusable events change no menu", async () => {
  const f = await fixture();
  for (const eventId of [
    await f.event("page.published", { pageId: f.ids.child }),
    await f.event("page.published", { pageId: f.ids.draft }),
    await f.event("page.published", { pageId: "not-an-id" }),
    await f.event("page.published", "not json"),
    await f.event("page.updated", { pageId: f.ids.pricing }),
  ]) await f.t.mutation(autoAddPageToMenus, { eventId });
  expect(await f.items(f.ids.auto)).toHaveLength(1);
});

test("deleting the linked content orphans its menu items, by content type", async () => {
  const f = await fixture();
  const termId = "term-123";
  await f.t.run(async (ctx) => {
    await ctx.db.insert("menuItems", { menuId: f.ids.manual, itemType: "page", objectId: f.ids.pricing, label: "Pricing", url: "/page/pricing", position: 1, depth: 0, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("menuItems", { menuId: f.ids.manual, itemType: "tag", objectId: termId, label: "Guides", url: "/tag/guides", position: 2, depth: 0, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("menuItems", { menuId: f.ids.manual, itemType: "category", objectId: termId, label: "News", url: "/category/news", position: 3, depth: 0, createdAt: 1, updatedAt: 1 });
  });
  await f.t.mutation(handleContentDeleted, { eventId: await f.event("page.deleted", { pageId: f.ids.pricing, permanent: true }) });
  await f.t.mutation(handleContentDeleted, { eventId: await f.event("taxonomy.tag_deleted", { termId, name: "Guides" }) });
  // An unrelated event code is ignored, even with a matching id.
  await f.t.mutation(handleContentDeleted, { eventId: await f.event("page.updated", { pageId: f.ids.pricing }) });

  const orphaned = Object.fromEntries((await f.items(f.ids.manual)).map((item) => [item.label, item.isOrphaned === true]));
  expect(orphaned).toEqual({ Home: false, Pricing: true, Guides: true, News: false });
});
