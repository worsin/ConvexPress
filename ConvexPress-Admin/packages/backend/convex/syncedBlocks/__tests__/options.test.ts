import { expect, test } from "bun:test";
import { makeFunctionReference as ref } from "convex/server";
import { fixture, create, save, text } from "./fixture.test-support";
import { PLUGIN_SETTINGS_KEY } from "../../plugins/registry";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { owned } from "../model";

const names = ["page", "menu", "term", "author", "eventCategory", "form", "product", "productTerm", "recipe", "album", "membershipPlan", "instructor", "course", "kbCategory", "event", "bundle", "mailingList"] as const;
const paginationOpts = { numItems: 2, cursor: null };
const extra = (name: string) => name === "term" ? { taxonomy: "category" } : name === "productTerm" ? { taxonomy: "productCategory" } : {};
const sourceQuery = (name: string) => ref<"query">(`syncedBlocks/options:${name}Options`);
async function code(run: () => Promise<unknown>) {
  try { await run(); return null; }
  catch (error) { return (error as { data?: { code?: string } }).data?.code ?? String(error); }
}

async function setup() {
  const f = await fixture();
  const { id } = await f.operator.mutation(create, { title: "Reusable footer", blocks: text });
  const postId = await f.t.run(async ctx => {
    await ctx.db.patch("roles", f.ids.role, { capabilities: ["post.create", "post.read", "post.update", "post.publish", "post.unpublish", "page.update"] });
    await ctx.db.insert("settings", { section: "plugins", values: Object.fromEntries(Object.values(PLUGIN_SETTINGS_KEY).map(key => [key, true])), updatedBy: f.ids.user, updatedAt: 1 });
    const fields = { type: "page" as const, title: "Editor", slug: "editor", path: "/editor", content: "", status: "draft" as const, visibility: "public" as const, authorId: f.ids.user, commentStatus: "closed" as const, createdAt: 1, updatedAt: 1 };
    await ctx.db.insert("settings", { section: "appearance.template", values: { active: "core", overrides: {}, variants: {}, settings: {} }, legacyAppearanceMigration: { version: 2, migratedAt: 1 }, updatedBy: f.ids.user, updatedAt: 1 });
    const post = await ctx.db.insert("posts", fields);
    await ctx.db.insert("posts", { ...fields, title: "Public page", slug: "public", path: "/public", status: "publish" });
    await ctx.db.insert("posts", { ...fields, title: "Private page", slug: "private", path: "/private", status: "private", visibility: "private" });
    for (let n = 0; n < 5; n++) await ctx.db.insert("menus", { name: `Navigation ${n}`, slug: `navigation-${n}`, description: "Private author notes", createdBy: f.ids.user, createdAt: 1, updatedAt: 1 });
    return post;
  });
  return { ...f, id, postId };
}

test("all resource readers retain post eligibility and return the same choices for an authorized reusable source", async () => {
  const f = await setup();
  for (const name of names) {
    const request = { paginationOpts, ...extra(name) };
    const fromPost = await f.operator.query(ref<"query">(`canonicalDocuments:${name}Options`), { postId: f.postId, ...request });
    const fromSource = await f.operator.query(sourceQuery(name), { syncedBlockId: f.id, expectedGeneration: 1, ...request });
    expect(fromSource).toEqual(fromPost);
  }
  const menus: string[] = []; let cursor: string | null = null;
  do {
    const result = await f.operator.query(sourceQuery("menu"), { syncedBlockId: f.id, expectedGeneration: 1, paginationOpts: { numItems: 2, cursor } });
    expect(result.page.length).toBeLessThanOrEqual(2);
    for (const row of result.page) { menus.push(row.name); expect(row).not.toHaveProperty("description"); }
    cursor = result.isDone ? null : result.continueCursor;
  } while (cursor);
  expect(menus).toEqual([0, 1, 2, 3, 4].map(n => `Navigation ${n}`));
  await expect(f.operator.query(sourceQuery("menu"), { syncedBlockId: f.id, expectedGeneration: 1, paginationOpts: { numItems: 500, cursor: null } })).rejects.toThrow();
});

test("every picker rejects stale generation, customers, anonymous calls, and revoked editing authority", async () => {
  const f = await setup();
  await f.operator.mutation(save, { id: f.id, expectedGeneration: 1, title: "New draft", blocks: text });
  for (const name of names) {
    const request = { syncedBlockId: f.id, expectedGeneration: 1, paginationOpts, ...extra(name) };
    expect(await code(() => f.operator.query(sourceQuery(name), request))).toBe("SYNCED_CONFLICT");
    for (const actor of [f.t, f.customer]) await expect(actor.query(sourceQuery(name), { ...request, expectedGeneration: 2 })).rejects.toThrow();
  }
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: ["post.read"] }));
  for (const name of names) expect(await code(() => f.operator.query(sourceQuery(name), { syncedBlockId: f.id, expectedGeneration: 2, paginationOpts, ...extra(name) }))).toBe("FORBIDDEN");
});

test("source options require exact environment ownership and Editor authority for another author's source", async () => {
  const f = await setup();
  const request = { syncedBlockId: f.id, expectedGeneration: 1, paginationOpts };
  for (const key of ["websiteKey", "instanceKey", "deploymentOrigin"] as const) {
    const prior = await f.t.run(async ctx => {
      const row = (await ctx.db.get("syncedBlocks", f.id))!;
      await ctx.db.patch("syncedBlocks", f.id, { [key]: key === "deploymentOrigin" ? "https://foreign.convex.cloud" : "foreign" });
      return row[key];
    });
    expect(await code(() => f.operator.query(sourceQuery("menu"), request))).toBe("SYNCED_UNAVAILABLE");
    await f.t.run(ctx => ctx.db.patch("syncedBlocks", f.id, { [key]: prior }));
  }
  await f.t.run(ctx => ctx.db.patch("syncedBlocks", f.id, { createdBy: f.ids.customer }));
  expect(await code(() => f.operator.query(sourceQuery("menu"), request))).toBe("SYNCED_FORBIDDEN");
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { level: 80 }));
  expect((await f.operator.query(sourceQuery("menu"), request)).page).toHaveLength(2);
  await f.release(f.id, 1, 1);
  expect(await code(() => f.operator.query(sourceQuery("menu"), request))).toBe("SYNCED_CONFLICT");
});

test("plugin policy remains live and ownership reads consume the shared request budget", async () => {
  const f = await setup();
  await f.t.run(async ctx => {
    const plugins = await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique();
    await ctx.db.patch("settings", plugins!._id, { values: { formsEnabled: false } });
  });
  expect(await code(() => f.operator.query(sourceQuery("form"), { syncedBlockId: f.id, expectedGeneration: 1, paginationOpts }))).toBe("PLUGIN_DISABLED");
  const budget = new RequestReadLedger({ queries: 1, documents: 2048, bytes: 8 * 1024 * 1024, documentBytes: 512 * 1024 });
  expect(await code(() => f.t.run(ctx => owned(ctx, f.id, f.ids.user, budget)))).toBe("CANONICAL_READ_BUDGET");
  expect(budget.queries).toBe(1);
});


test("editor snapshot validates the saved body and returns current site policy without dynamic resource data", async () => {
  const f = await setup(), getEditor = ref<"query">("syncedBlocks/editor:get");
  const current = await f.operator.query(getEditor, { id: f.id });
  expect(current).toMatchObject({ id: f.id, generation: 1, revision: 1, title: "Reusable footer", scope: { websiteKey: "synced", instanceKey: "staging" } });
  expect(current.policy.enabledPlugins).toContain("forms");
  expect(current.policy.disabledBlocks).toContain("core/synced");
  expect(current).not.toHaveProperty("data");
  for (const actor of [f.t, f.customer]) await expect(actor.query(getEditor, { id: f.id })).rejects.toThrow();
  await f.t.run(async ctx => {
    const version = await ctx.db.query("syncedBlockRevisions").withIndex("by_source_revision", q => q.eq("syncedBlockId", f.id).eq("revision", 1)).unique();
    await ctx.db.patch("syncedBlockRevisions", version!._id, { digest: "0".repeat(64) });
  });
  expect(await code(() => f.operator.query(getEditor, { id: f.id }))).toBe("SYNCED_REVISION");
});


test("a revision damaged after the editor read cannot pass an identical-save integrity check", async () => {
  const f = await setup();
  await f.t.run(async ctx => {
    const version = await ctx.db.query("syncedBlockRevisions").withIndex("by_source_revision", q => q.eq("syncedBlockId", f.id).eq("revision", 1)).unique();
    await ctx.db.patch("syncedBlockRevisions", version!._id, { title: "Damaged body" });
  });
  expect(await code(() => f.operator.mutation(save, { id: f.id, expectedGeneration: 1, title: "Reusable footer", blocks: text }))).toBe("SYNCED_REVISION");
  const head = await f.operator.query(ref<"query">("syncedBlocks/queries:head"), { id: f.id });
  expect(head.generation).toBe(1);expect(head.revision).toBe(1);
});
