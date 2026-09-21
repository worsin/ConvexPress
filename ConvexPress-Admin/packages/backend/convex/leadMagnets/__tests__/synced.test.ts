import { test, expect } from "bun:test";
import { makeFunctionReference as ref } from "convex/server";
import { fixture } from "./fixture.test";
import { publishedFixture } from "../../syncedBlocks/__tests__/publishedFixture.test-support";
import { resolvePublishedOccurrences } from "../../syncedBlocks/occurrences";
import { syncedContentDigest } from "../../canonicalDocuments/foundation/syncedContent";
import { readLeadMagnet } from "../../canonicalDocuments/leadMagnet";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
const offer = ref<"query">("leadMagnets/queries:offer"), request = ref<"action">("leadMagnets/actions:requestDownload"), lease = ref<"query">("leadMagnets/delivery:readLease");
const reserve = ref<"mutation">("leadMagnets/submission:reserve"), finalize = ref<"mutation">("leadMagnets/submission:finalize");
async function setup() {
  const f = await fixture();
  const seeded = await f.t.run(async ctx => {
    const post = (await ctx.db.get("posts", f.ids.post))!;
    const id = await publishedFixture(ctx, f.ids.user, post.blocks);
    const blocks = ["first", "second"].map(name => ({ id: name, name: "core/synced", version: 1, attrs: { syncedBlock: id, revisionPolicy: "latest" } }));
    await ctx.db.patch("posts", post._id, { blocks });
    const plan = await resolvePublishedOccurrences(ctx, blocks, new RequestReadLedger());
    return { id, blockIds: plan.resolverTree.map(node => node.id) };
  });
  const target = { postId: f.ids.post, blockId: seeded.blockIds[0]! };
  const current = await f.t.query(offer, target);
  const args = { ...target, offerDigest: current.digest, email: "reader@example.invalid", marketingConsent: true, requestId: "synced-request-0001", secret: "a".repeat(64), startedAt: Date.now() - 3000, honeypot: "" };
  return { ...f, ...seeded, target, current, args };
}

test("reused lead magnets bind placement identity and canonical previews to the current expanded document", async () => {
  const f = await setup();
  expect(await f.query()).toBeNull();
  const second = await f.t.query(offer, { ...f.target, blockId: f.blockIds[1]! });
  expect(second.blockId).not.toBe(f.current.blockId);expect(second.digest).not.toBe(f.current.digest);
  const read = (unsaved = false) => f.t.run(async ctx => {
    const post = (await ctx.db.get("posts", f.ids.post))!;
    const { resolverTree } = await resolvePublishedOccurrences(ctx, post.blocks, new RequestReadLedger());
    if (unsaved) resolverTree[0]!.attrs.title = "Unsaved title";
    return readLeadMagnet(ctx, { blockId: f.target.blockId }, { document: post, tree: resolverTree });
  });
  expect((await read()).offer?.digest).toBe(f.current.digest);expect((await read(true)).offer).toBeNull();
  const delivery = await f.t.action(request, f.args);
  expect(delivery.fileSize).toBe(16);
  const subscriber = await f.t.run(ctx => ctx.db.query("mailingListSubscribers").unique());
  expect(subscriber?.sourceBlockId).toBe(f.target.blockId);
  await f.t.run(ctx => ctx.db.patch("syncedBlocks", f.id, { publishedRevision: undefined }));
  expect(await f.t.query(offer, f.target)).toBeNull();
  await expect(f.t.query(lease, { leaseId: delivery.leaseId, secret: f.args.secret, requestTime: Date.now() })).rejects.toThrow();
});

test("a new source revision invalidates issued leases and in-flight consent without a containing-page edit", async () => {
  const f = await setup();
  const delivered = await f.t.action(request, { ...f.args, marketingConsent: false });
  const pendingArgs = { ...f.args, requestId: "synced-request-0002" };
  const pending = await f.t.mutation(reserve, pendingArgs);
  const before = await f.t.run(ctx => ctx.db.get("posts", f.ids.post));
  await f.t.run(async ctx => {
    const previous = (await ctx.db.query("syncedBlockRevisions").withIndex("by_source_revision", q => q.eq("syncedBlockId", f.id).eq("revision", 1)).unique())!;
    const title = "Republished source title";
    await ctx.db.insert("syncedBlockRevisions", { syncedBlockId: f.id, revision: 2, title, blocks: previous.blocks, digest: syncedContentDigest(title, previous.blocks), createdBy: f.ids.user, createdAt: 2, publishedAt: 2 });
    await ctx.db.patch("syncedBlocks", f.id, { title, generation: 4, lastRevision: 2, publishedRevision: 2 });
  });
  const next = await f.t.query(offer, f.target);
  expect(next.blockId).toBe(f.current.blockId);expect(next.digest).not.toBe(f.current.digest);
  expect(await f.t.run(ctx => ctx.db.get("posts", f.ids.post))).toEqual(before);
  await expect(f.t.query(lease, { leaseId: delivered.leaseId, secret: f.args.secret, requestTime: Date.now() })).rejects.toThrow();
  await expect(f.t.mutation(finalize, { ...pendingArgs, deliveryId: pending.deliveryId, captchaVerified: true })).rejects.toThrow();
  await expect(f.t.action(request, { ...f.args, requestId: "synced-request-0003" })).rejects.toThrow();
  expect(await f.t.run(ctx => ctx.db.query("mailingListSubscribers").take(1))).toEqual([]);
});
