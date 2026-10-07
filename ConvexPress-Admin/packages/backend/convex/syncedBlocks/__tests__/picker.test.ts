import { expect, test } from "bun:test";
import { makeFunctionReference as ref } from "convex/server";
import { fixture, create, save, text, withdraw } from "./fixture.test-support";
import { authoringRevision } from "../../canonicalDocuments/foundation/documentState";
const sources = ref<"query">("syncedBlocks/picker:sources"), revisions = ref<"query">("syncedBlocks/picker:revisions"), select = ref<"query">("syncedBlocks/picker:select");
const expectedScope = { websiteKey: "synced", instanceKey: "staging" }, paginationOpts = { numItems: 2, cursor: null };
async function setup() {
  const f = await fixture();
  const source = await f.operator.mutation(create, { title: "Published footer", blocks: text });
  await f.release(source.id, 1, 1);
  await f.operator.mutation(save, { id: source.id, expectedGeneration: 2, title: "Private draft title", blocks: text });
  const owner = await f.operator.mutation(create, { title: "Owner", blocks: text });
  const page = await f.t.run(async ctx => {
    await ctx.db.patch("roles", f.ids.role, { capabilities: ["post.create", "post.read", "post.update", "post.publish", "post.unpublish", "page.update"] });
    const id = await ctx.db.insert("posts", { type: "page", title: "Page", slug: "page", path: "/page",  status: "draft", visibility: "public", authorId: f.ids.user, commentStatus: "closed", blocksVersion: 2, blocks: text, createdAt: 1, updatedAt: 1 });
    return { postId: id, expectedRevision: authoringRevision((await ctx.db.get("posts", id))!) };
  });
  const base = { owner: { syncedBlockId: owner.id, expectedGeneration: 1 }, expectedScope };
  const selected = { ...base, sourceId: source.id, publishedRevision: 1, revisionPolicy: "pinned", revision: 1 };
  return { ...f, source: source.id, owner: owner.id, page, base, selected };
}
test("page and source pickers expose published metadata only and accept both revision policies", async () => {
  const f = await setup();
  for (const owner of [f.base.owner, f.page]) {
    const args = { ...f.base, owner };
    const result = await f.operator.query(sources, { ...args, paginationOpts });
    expect(result.page).toHaveLength(1); expect(result.page[0]).toMatchObject({ id: f.source, title: "Published footer", revision: 1 });
    expect(result.page[0]).not.toHaveProperty("blocks"); expect(JSON.stringify(result)).not.toContain("Private draft");
    const history = await f.operator.query(revisions, { ...args, sourceId: f.source, publishedRevision: 1, paginationOpts });
    expect(history.page.map((r: {revision:number}) => r.revision)).toEqual([1]); expect(JSON.stringify(history)).not.toContain("Private draft");
    for (const revisionPolicy of ["pinned", "latest"]) expect(await f.operator.query(select, { ...f.selected, ...args, revisionPolicy })).toMatchObject({ id: f.source, revision: 1, revisionPolicy, scope: expectedScope });
  }
  await expect(f.operator.query(select, { ...f.selected, revision: 2 })).rejects.toThrow();
});
test("publication changes invalidate open choices, draft changes do not, and withdrawal hides all pins", async () => {
  const f = await setup();
  await f.operator.mutation(save, { id: f.source, expectedGeneration: 3, title: "Another private draft", blocks: text });
  expect((await f.operator.query(select, f.selected)).revision).toBe(1);
  await f.release(f.source, 4, 3);
  await expect(f.operator.query(select, f.selected)).rejects.toThrow();
  await expect(f.operator.query(revisions, { ...f.base, sourceId: f.source, publishedRevision: 1, paginationOpts })).rejects.toThrow();
  expect((await f.operator.query(select, { ...f.selected, publishedRevision: 3 })).revision).toBe(1);
  await expect(f.operator.query(select, { ...f.selected, publishedRevision: 3, revisionPolicy: "latest" })).rejects.toThrow();
  expect((await f.operator.query(select, { ...f.selected, publishedRevision: 3, revisionPolicy: "latest", revision: 3 })).revision).toBe(3);
  await f.operator.mutation(withdraw, { id: f.source, expectedGeneration: 5 });
  await expect(f.operator.query(select, { ...f.selected, publishedRevision: 3 })).rejects.toThrow();
});
test("every endpoint reauthorizes the actual owner, generation and environment", async () => {
  const f = await setup();
  const requests = [[sources, { ...f.base, paginationOpts }], [revisions, { ...f.base, sourceId: f.source, publishedRevision: 1, paginationOpts }], [select, f.selected]] as const;
  for (const [endpoint, args] of requests) {
    for (const actor of [f.t, f.customer]) await expect(actor.query(endpoint, args)).rejects.toThrow();
    await expect(f.operator.query(endpoint, { ...args, owner: { ...f.base.owner, expectedGeneration: 99 } })).rejects.toThrow();
    await expect(f.operator.query(endpoint, { ...args, owner: { ...f.page, expectedRevision: 99 } })).rejects.toThrow();
    await expect(f.operator.query(endpoint, { ...args, expectedScope: { ...expectedScope, instanceKey: "production" } })).rejects.toThrow();
  }
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: ["post.read"] }));
  for (const [endpoint, args] of requests) {
    await expect(f.operator.query(endpoint, args)).rejects.toThrow();
    await expect(f.operator.query(endpoint, { ...args, owner: f.page })).rejects.toThrow();
  }
});
test("reuse permits another author's publication without granting source editing or foreign access", async () => {
  const f = await setup();
  await f.t.run(ctx => ctx.db.patch("syncedBlocks", f.source, { createdBy: f.ids.customer }));
  expect((await f.operator.query(select, f.selected)).id).toBe(f.source);
  await expect(f.operator.query(sources, { ...f.base, owner: { syncedBlockId: f.source, expectedGeneration: 3 }, paginationOpts })).rejects.toThrow();
  for (const field of ["websiteKey", "instanceKey", "deploymentOrigin"] as const) {
    const old = await f.t.run(async ctx => { const row = (await ctx.db.get("syncedBlocks", f.source))!; await ctx.db.patch("syncedBlocks", f.source, { [field]: field === "deploymentOrigin" ? "https://foreign.convex.cloud" : "foreign" }); return row[field]; });
    expect((await f.operator.query(sources, { ...f.base, paginationOpts })).page).toHaveLength(0);
    await expect(f.operator.query(select, f.selected)).rejects.toThrow();
    await f.t.run(ctx => ctx.db.patch("syncedBlocks", f.source, { [field]: old }));
  }
});
test("damaged publications and self-links cannot be selected; paging remains bounded across private drafts", async () => {
  const f = await setup();
  await expect(f.operator.query(sources, { ...f.base, paginationOpts: { numItems: 9, cursor: null } })).rejects.toThrow();
  await f.release(f.owner, 1, 1);
  const base = { ...f.base, owner: { ...f.base.owner, expectedGeneration: 2 } };
  expect((await f.operator.query(sources, { ...base, paginationOpts })).page.map((r: {id:string}) => r.id)).toEqual([f.source]);
  await expect(f.operator.query(select, { ...f.selected, ...base, sourceId: f.owner })).rejects.toThrow();
  for (let n = 0; n < 5; n++) await f.operator.mutation(save, { id: f.source, expectedGeneration: n + 3, title: `Secret ${n}`, blocks: text });
  const seen: number[] = []; let cursor: string | null = null, pages = 0;
  do {
    const result = await f.operator.query(revisions, { ...base, sourceId: f.source, publishedRevision: 1, paginationOpts: { numItems: 2, cursor } });
    expect(result.page.length).toBeLessThanOrEqual(2); expect(JSON.stringify(result)).not.toContain("Secret");
    seen.push(...result.page.map((r: {revision:number}) => r.revision)); cursor = result.isDone ? null : result.continueCursor; pages++;
  } while (cursor && pages < 10);
  expect(seen).toEqual([1]); expect(pages).toBeGreaterThan(1);
  await f.t.run(async ctx => { const row = await ctx.db.query("syncedBlockRevisions").withIndex("by_source_revision", q => q.eq("syncedBlockId", f.source).eq("revision", 1)).unique(); await ctx.db.patch("syncedBlockRevisions", row!._id, { digest: "0".repeat(64) }); });
  expect((await f.operator.query(sources, { ...base, paginationOpts })).page).toHaveLength(0);
  await expect(f.operator.query(select, { ...f.selected, ...base })).rejects.toThrow();
});
