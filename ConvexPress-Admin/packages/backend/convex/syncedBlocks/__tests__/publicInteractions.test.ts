import { test, expect } from "bun:test";
import { makeFunctionReference as ref } from "convex/server";
import { fixture, create, save, withdraw, reference } from "./fixture.test-support";
import { parsePollDefinition, pollDefinitionVersion } from "../../canonicalDocuments/foundation/pollContracts";
import { resolvePublishedOccurrences } from "../occurrences";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { readPublicBlockSource } from "../../canonicalDocuments/publicBlockSource";
import { readPublishedBlockPath } from "../../canonicalDocuments/publishedBlockPath";

const get = ref<"query">("extensions/forms/polls:get"), vote = ref<"mutation">("extensions/forms/polls:vote");
async function setup() {
  const f = await fixture();
  const attrs = parsePollDefinition({ question: "Which workshop?", options: [{ key: "wood", label: "Woodworking" }, { key: "clay", label: "Ceramics" }] });
  const blocks = [{ id: "poll", name: "core/poll", version: 1, attrs }];
  const { id } = await f.operator.mutation(create, { title: "Workshop poll", blocks });
  await f.release(id, 1, 1);
  const placements = [{ ...reference(id)[0]!, id: "first" }, { ...reference(id, 1)[0]!, id: "second" }];
  const ids = await f.t.run(async ctx => {
    const plugins = await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: f.ids.user });
    const post = await ctx.db.insert("posts", { type: "page", title: "Workshops", slug: "workshops", path: "/workshops", status: "publish", visibility: "public", authorId: f.ids.user, commentStatus: "closed", blocksVersion: 2, blocks: placements, createdAt: 1, updatedAt: 1 });
    const plan = await resolvePublishedOccurrences(ctx, placements, new RequestReadLedger());
    return { plugins, post, blockIds: plan.resolverTree.map(node => node.id) };
  });
  const target = { postId: ids.post, blockId: ids.blockIds[0]!, visitorToken: "a".repeat(64) };
  const args = { ...target, definitionVersion: pollDefinitionVersion(attrs), optionKey: "wood" };
  const read = (extra = {}) => f.t.query(get, { ...target, ...extra });
  const submit = (extra = {}) => f.t.mutation(vote, { ...args, ...extra });
  return { ...f, sourceId: id, postIds: ids, attrs, blocks, placements, target, args, read, submit };
}

test("registered polls isolate reused placements and recheck latest, pinned, replaced and withdrawn sources", async () => {
  const f = await setup(), second = f.postIds.blockIds[1]!;
  expect(await f.read({ blockId: "poll" })).toBeNull();
  await expect(f.submit({ blockId: "poll" })).rejects.toThrow();
  await f.submit();
  expect(await f.read({ blockId: second })).toMatchObject({ total: 0, votedKey: null });
  await f.submit({ blockId: second, optionKey: "clay" });
  expect(await f.read()).toMatchObject({ total: 1, votedKey: "wood" });
  expect(await f.read({ blockId: second })).toMatchObject({ total: 1, votedKey: "clay" });
  const changed = { ...f.attrs, question: "A different workshop?" };
  await f.operator.mutation(save, { id: f.sourceId, expectedGeneration: 2, title: "New poll", blocks: [{ ...f.blocks[0]!, attrs: changed }] });
  expect(await f.read()).toMatchObject({ total: 1 });
  await f.release(f.sourceId, 3, 2);
  expect(await f.read()).toMatchObject({ total: 0, definitionVersion: pollDefinitionVersion(changed) });
  expect(await f.read({ blockId: second })).toMatchObject({ total: 1 });
  await expect(f.submit()).rejects.toThrow();
  const replacement = await f.operator.mutation(create, { title: "Replacement", blocks: f.blocks });
  await f.release(replacement.id, 1, 1);
  await f.t.run(ctx => ctx.db.patch("posts", f.postIds.post, { blocks: [{ ...reference(replacement.id)[0]!, id: "first" }, f.placements[1]!] }));
  expect(await f.read()).toBeNull();await expect(f.submit()).rejects.toThrow();
  await f.operator.mutation(withdraw, { id: f.sourceId, expectedGeneration: 4 });
  expect(await f.read({ blockId: second })).toBeNull();await expect(f.submit({ blockId: second })).rejects.toThrow();
  expect(await f.t.run(ctx => ctx.db.query("form_poll_votes").take(10))).toHaveLength(2);
});

test("reused submissions honor current containing-page access, wrapper policy and authored or placement membership rules", async () => {
  const f = await setup();
  await f.t.run(ctx => ctx.db.patch("posts", f.postIds.post, { visibility: "password", password: "fixture-only" }));
  expect(await f.read()).toBeNull();await expect(f.submit()).rejects.toThrow();
  expect(await f.read({ password: "fixture-only" })).toMatchObject({ total: 0 });
  await f.t.run(ctx => ctx.db.patch("posts", f.postIds.post, { visibility: "public" }));
  const disabled = await f.t.run(ctx => ctx.db.insert("settings", { section: "blocks", values: { disabledBlockNames: ["core/synced"] }, updatedBy: f.ids.user, updatedAt: 1 }));
  expect(await f.read()).toBeNull();await expect(f.submit()).rejects.toThrow();
  await f.t.run(async ctx => { await ctx.db.delete("settings", disabled);await ctx.db.patch("settings", f.postIds.plugins, { values: { formsEnabled: true, membershipEnabled: true } }); });
  for (const key of ["first", "poll", f.target.blockId, "core/synced", "core/poll"]) {
    const rule = await f.t.run(ctx => ctx.db.insert("membership_restriction_rules", { resourceType: "block", resourceIdOrKey: key, ruleMode: "allow_only", planIds: [], loginRequired: true, teaserMode: "hide", createdAt: 1, updatedAt: 1 }));
    expect(await f.read()).toBeNull();await expect(f.submit()).rejects.toThrow();
    await f.t.run(ctx => ctx.db.delete("membership_restriction_rules", rule));
    expect(await f.read()).toMatchObject({ total: 0 });
  }
  await f.t.run(ctx => ctx.db.patch("posts", f.postIds.post, { status: "draft" }));
  expect(await f.read()).toBeNull();await expect(f.submit()).rejects.toThrow();
  expect(await f.t.run(ctx => ctx.db.query("form_poll_votes").take(1))).toEqual([]);
});

test("nested reusable parents enforce restrictions and foreign installation ownership with one shared read budget", async () => {
  const f = await setup();
  const outer = await f.operator.mutation(create, { title: "Nested", blocks: [{ id: "group", name: "core/group", version: 1, attrs: {}, children: reference(f.sourceId) }] });
  await f.release(outer.id, 1, 1);
  const nested = reference(outer.id);
  const blockId = await f.t.run(async ctx => {
    await ctx.db.patch("posts", f.postIds.post, { blocks: nested });
    const plan = await resolvePublishedOccurrences(ctx, nested, new RequestReadLedger());
    return [...plan.byId.values()].find(node => node.node.name === "core/poll")!.id;
  });
  expect(await f.read({ blockId })).toMatchObject({ total: 0 });
  await expect(f.t.run(ctx => readPublishedBlockPath(ctx, nested, blockId, new RequestReadLedger({ queries: 2, documents: 2048, bytes: 8 * 1024 * 1024, documentBytes: 512 * 1024 })))).rejects.toThrow("safe read budget");
  await f.t.run(async ctx => {
    await ctx.db.patch("settings", f.postIds.plugins, { values: { formsEnabled: true, membershipEnabled: true } });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "block", resourceIdOrKey: "group", ruleMode: "allow_only", planIds: [], loginRequired: true, teaserMode: "hide", createdAt: 1, updatedAt: 1 });
  });
  expect(await f.read({ blockId })).toBeNull();await expect(f.submit({ blockId })).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch("settings", f.postIds.plugins, { values: { formsEnabled: true, membershipEnabled: false } }));
  const measured = await f.t.run(async ctx => {
    const budget = new RequestReadLedger();
    expect(await readPublicBlockSource(ctx, { ...f.target, blockId, blockName: "core/poll", plugin: "forms" }, budget)).not.toBeNull();
    return budget.queries;
  });
  await expect(f.t.run(ctx => readPublicBlockSource(ctx, { ...f.target, blockId, blockName: "core/poll", plugin: "forms" }, new RequestReadLedger({ queries: measured - 1, documents: 2048, bytes: 8 * 1024 * 1024, documentBytes: 512 * 1024 })))).rejects.toThrow("safe read budget");
  for (const key of ["websiteKey", "instanceKey", "deploymentOrigin"] as const) {
    const prior = await f.t.run(async ctx => { const source = (await ctx.db.get("syncedBlocks", f.sourceId))!;await ctx.db.patch("syncedBlocks", f.sourceId, { [key]: key === "deploymentOrigin" ? "https://foreign.convex.cloud" : "foreign" });return source[key]; });
    expect(await f.read({ blockId })).toBeNull();await expect(f.submit({ blockId })).rejects.toThrow();
    await f.t.run(ctx => ctx.db.patch("syncedBlocks", f.sourceId, { [key]: prior }));
  }
});
