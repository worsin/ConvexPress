import { expect, test } from "bun:test";
import { makeFunctionReference as ref } from "convex/server";
import { fixture, create, reference } from "./fixture.test-support";
import { consumerDiscoveryReady, consumerIndexReady } from "../consumerIndexState";
import { installation } from "../model";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { insertWithMediaReferences, patchWithMediaReferences, replaceWithMediaReferences, deleteWithMediaReferences } from "../../media/attachmentGuard";
import { permitValidatedCanonicalAuthoringWrite } from "../../helpers/authoringVersionFence";
import { validateCanonicalTree } from "../../canonicalDocuments/foundation/generated/instances";
import { syncDocumentContactForms } from "../../canonicalDocuments/contactDocuments";
import { clearSyncedConsumerDirty } from "../consumerWrites";
import { displayContext } from "../../canonicalDocuments/displayContext";
const begin = ref<"mutation">("syncedBlocks/consumerIndex:begin"), step = ref<"mutation">("syncedBlocks/consumerIndex:step"), status = ref<"query">("syncedBlocks/consumerIndex:status");
const epochName = "MEDIA_REFERENCE_INDEX_EPOCH";
async function withEpoch(run: () => Promise<void>) {
  const old = process.env[epochName]; process.env[epochName] = "synced_index_fixture_epoch_0001";
  try { await run(); } finally { if (old === undefined) delete process.env[epochName]; else process.env[epochName] = old; }
}
async function setup() {
  const f = await fixture();
  await f.t.run(async ctx => { const role = (await ctx.db.get("roles", f.ids.role))!; await ctx.db.patch("roles", role._id, { capabilities: [...role.capabilities, "manage_options"] }); });
  const source = await f.operator.mutation(create, { title: "Shared text", blocks: [{ id: "text", name: "core/paragraph", version: 2, attrs: {} }] }); await f.release(source.id, 1, 1);
  async function addPage(blocks = validateCanonicalTree(reference(source.id))) {
    return f.t.run(ctx => ctx.db.insert("posts", { type: "page", title: "Existing private page", slug: "existing", status: "draft", visibility: "private", authorId: f.ids.user, commentStatus: "closed", blocksVersion: 2, blocks, createdAt: 1, updatedAt: 1 }));
  }
  const inspect = () => f.operator.query(status, {});
  async function tick() { const p = await inspect(); const args = { generation: p.generation, expectedSequence: p.sequence }; return { args, result: await f.operator.mutation(step, args) }; }
  async function drain() { await f.operator.mutation(begin, {}); for (let i = 0; i < 60; i++) { const p = await inspect(); if (p.status === "ready" || p.status === "blocked") return p; await tick(); } throw Error("Index did not finish"); }
  const ready = () => f.t.run(async ctx => consumerIndexReady(ctx, await installation(ctx), new RequestReadLedger()));
  const edges = () => f.t.run(ctx => ctx.db.query("syncedBlockConsumers").take(30));
  const dirty = () => f.t.run(ctx => ctx.db.query("syncedBlockConsumerDirty").take(30));
  return { ...f, source, addPage, inspect, tick, drain, ready, edges, dirty };
}

test("bounded rebuild discovers old private pages and nested pinned references without authoring or Forms writes", () => withEpoch(async () => {
  const f = await setup(); const outer = await f.operator.mutation(create, { title: "Nested", blocks: reference(f.source.id, 1) }); await f.release(outer.id, 1, 1);
  const page = await f.addPage(validateCanonicalTree(reference(outer.id))), other = await f.addPage();
  await f.addPage([]);
  const before = await f.t.run(ctx => ctx.db.get("posts", page));
  expect(await f.ready()).toBe(false); expect(await f.edges()).toHaveLength(0);
  await f.operator.mutation(begin, {}); const first = await f.tick();
  expect(first.result.documents).toBe(1); expect(first.result.status).toBe("building");
  const duplicate = await f.operator.mutation(step, first.args); expect(duplicate).toEqual(first.result);
  expect((await f.drain()).status).toBe("ready"); expect(await f.ready()).toBe(true);
  expect((await f.edges()).filter(edge => edge.postId === page).map(edge => edge.sourceId).sort()).toEqual([f.source.id, outer.id].sort());
  expect((await f.edges()).filter(edge => edge.postId === other)).toHaveLength(1);
  expect(await f.t.run(ctx => ctx.db.get("posts", page))).toEqual(before);
  expect(await f.t.run(ctx => ctx.db.query("forms").take(5))).toEqual([]);
}));

test("dirty canonical writes invalidate readiness and bounded recovery reconciles inserts, patches and replacements", () => withEpoch(async () => {
  const f = await setup(); const postId = await f.addPage(); await f.drain(); expect(await f.ready()).toBe(true);
  await f.t.run(async ctx => {
    const previous = (await ctx.db.get("posts", postId))!, value = { blocks: [], blocksVersion: 2, blocksRevision: 2 };
    await patchWithMediaReferences(ctx, "posts", postId, value, permitValidatedCanonicalAuthoringWrite({ table: "posts", operation: "patch", id: postId, previous, value }));
  });
  expect(await f.ready()).toBe(false); expect(await f.dirty()).toHaveLength(1); expect((await f.inspect()).phase).toBe("dirty");
  await f.drain(); expect(await f.ready()).toBe(true); expect(await f.edges()).toHaveLength(0);
  await f.t.run(async ctx => {
    const previous = (await ctx.db.get("posts", postId))!, { _id, _creationTime, ...value } = { ...previous, blocks: validateCanonicalTree(reference(f.source.id)) };
    await replaceWithMediaReferences(ctx, "posts", postId, value, permitValidatedCanonicalAuthoringWrite({ table: "posts", operation: "replace", id: postId, previous, value }));
  });
  expect(await f.ready()).toBe(false); await f.drain(); expect(await f.edges()).toHaveLength(1);
  const copy = await f.t.run(async ctx => {
    const { _id, _creationTime, ...value } = (await ctx.db.get("posts", postId))!;
    return insertWithMediaReferences(ctx, "posts", value, permitValidatedCanonicalAuthoringWrite({ table: "posts", operation: "insert", value }));
  });
  expect(await f.ready()).toBe(false); await f.drain(); expect((await f.edges()).some(edge => edge.postId === copy)).toBe(true);
}));

test("canonical reconciliation and final write acknowledgement leave no dirty window, including writes behind the scan cursor", () => withEpoch(async () => {
  const f = await setup(); const postId = await f.addPage(); await f.addPage(); await f.operator.mutation(begin, {}); await f.tick();
  await f.operator.run(async ctx => {
    const previous = (await ctx.db.get("posts", postId))!, blocks = validateCanonicalTree([]), value = { blocks, blocksVersion: 2, blocksRevision: 2 };
    await syncDocumentContactForms(ctx, { postId, title: previous.title, blocks });
    await patchWithMediaReferences(ctx, "posts", postId, value, permitValidatedCanonicalAuthoringWrite({ table: "posts", operation: "patch", id: postId, previous, value }));
    await clearSyncedConsumerDirty(ctx, postId);
  });
  expect(await f.dirty()).toHaveLength(0); await f.drain(); expect(await f.ready()).toBe(true);
  expect((await f.edges()).some(edge => edge.postId === postId)).toBe(false);
}));

test("canonical replacement and deletion clean edges and dirty rows through normal guarded writers", () => withEpoch(async () => {
  const f = await setup(); const recovery = await f.addPage(), deleted = await f.addPage(); await f.drain();
  await f.t.run(async ctx => {
    const previous = (await ctx.db.get("posts", recovery))!, value = { blocksVersion: 2, blocks: [] };
    await syncDocumentContactForms(ctx, {postId:recovery,title:previous.title,blocks:[]});
    await patchWithMediaReferences(ctx, "posts", recovery, value, permitValidatedCanonicalAuthoringWrite({ table: "posts", operation: "patch", id: recovery, previous, value }));
    await clearSyncedConsumerDirty(ctx,recovery);
    await deleteWithMediaReferences(ctx, "posts", deleted);
  });
  expect(await f.edges()).toHaveLength(0); expect(await f.dirty()).toHaveLength(0); expect(await f.ready()).toBe(true);
}));

test("orphan and foreign scoped edges from an old snapshot are repaired before ready", () => withEpoch(async () => {
  const f = await setup(); const postId = await f.addPage(), orphan = await f.addPage();
  await f.t.run(async ctx => {
    await ctx.db.delete("posts", orphan);
    for (const id of [postId, orphan]) await ctx.db.insert("syncedBlockConsumers", { sourceId: f.source.id, postId: id, websiteKey: "foreign", instanceKey: "wrong", deploymentOrigin: "https://foreign.convex.cloud" });
  });
  await f.drain(); const edges = await f.edges(); expect(edges).toHaveLength(1); expect(edges[0]).toMatchObject({ postId, websiteKey: "synced", instanceKey: "staging" });
}));

test("blocked document retains cursor for repair and resume, without hiding incomplete work", () => withEpoch(async () => {
  const f = await setup(); const postId = await f.addPage();
  await f.t.run(ctx => ctx.db.patch("posts", postId, { blocks: [{ ...reference(f.source.id)[0], attrs: { syncedBlock: f.source.id, revisionPolicy: "pinned", revision: 0 } }] }));
  const failed = await f.drain(); expect(failed.status).toBe("blocked"); expect(await f.ready()).toBe(false); expect(failed.documents).toBe(0);
  expect(await f.edges()).toHaveLength(0);
  await f.t.run(ctx => ctx.db.patch("posts", postId, { blocks: validateCanonicalTree(reference(f.source.id)) }));
  await f.tick(); await f.drain(); expect(await f.ready()).toBe(true); expect(await f.edges()).toHaveLength(1);
}));

test("external import epoch and installation changes invalidate restored completion certificates", () => withEpoch(async () => {
  const f = await setup(); await f.addPage(); await f.drain(); const old = await f.inspect(); expect(await f.ready()).toBe(true);
  process.env[epochName] = "mi_pending_fixture_import"; expect(await f.ready()).toBe(false);
  await expect(f.operator.mutation(begin, {})).rejects.toThrow("snapshot import");
  process.env[epochName] = "synced_index_fixture_epoch_0002"; expect(await f.ready()).toBe(false); expect((await f.inspect()).status).toBe("stale");
  await expect(f.operator.mutation(step, { generation: old.generation, expectedSequence: old.sequence })).rejects.toThrow("Start indexing");
  await f.drain(); expect(await f.ready()).toBe(true);
  await f.t.run(ctx => ctx.db.patch("convexpress_siteIdentity", f.ids.site, { instanceKey: "another-installation" }));
  expect(await f.ready()).toBe(false); await f.drain(); expect(await f.edges()).toHaveLength(0);
}));

test("index maintenance requires current administrative capability and never discloses page titles", () => withEpoch(async () => {
  const f = await setup(); await f.addPage();
  await expect(f.t.query(status, {})).rejects.toThrow(); await expect(f.customer.mutation(begin, {})).rejects.toThrow();
  await f.operator.mutation(begin, {}); const before = await f.inspect();
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: ["post.read"] }));
  await expect(f.operator.mutation(step, { generation: before.generation, expectedSequence: before.sequence })).rejects.toThrow();
  expect(await f.edges()).toHaveLength(0);
  expect(Object.keys(before).sort()).toEqual(["status", "generation", "sequence", "documents", "phase", "errorCode"].sort());
}));

test("corrupt overflowing dependency rows are repaired in bounded resumable chunks", () => withEpoch(async () => {
  const f = await setup(); const postId = await f.addPage();
  await f.t.run(async ctx => {
    for (let i = 0; i < 20; i++) await ctx.db.insert("syncedBlockConsumers", { sourceId: f.source.id, postId, websiteKey: "synced", instanceKey: "staging", deploymentOrigin: "https://synced.convex.cloud" });
  });
  await f.operator.mutation(begin, {}); const first = await f.tick();
  expect(first.result.documents).toBe(0); expect(first.result.status).toBe("building");
  expect(await f.edges()).toHaveLength(12);
  await f.drain(); expect(await f.ready()).toBe(true); expect(await f.edges()).toHaveLength(1);
}));

test("Forms verification pauses after complete discovery, authorized refresh repairs every placement, and resume preserves pages", () => withEpoch(async () => {
  const f = await setup();
  await f.t.run(async ctx => {
    const role = (await ctx.db.get("roles", f.ids.role))!;
    await ctx.db.patch("roles", role._id, { capabilities: [...role.capabilities, "form.create", "form.update"] });
    await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: f.ids.user });
  });
  const contact = await f.operator.mutation(create, { title: "Imported contact", blocks: [{ id: "contact", name: "core/contact-form", version: 2, attrs: { heading: "Contact", fields: [{ name: "email", type: "email", label: "Email", required: true }] } }] });
  await f.release(contact.id, 1, 1);
  const pages = [await f.addPage(validateCanonicalTree(reference(contact.id))), await f.addPage(validateCanonicalTree(reference(contact.id)))];
  const before = await f.t.run(async ctx => Promise.all(pages.map(id => ctx.db.get("posts", id))));
  const jobStatus = ref<"query">("syncedBlocks/refresh:status"), retry = ref<"mutation">("syncedBlocks/refresh:retry");
  const job = (await f.operator.query(jobStatus, { id: contact.id }))!;
  await expect(f.operator.mutation(retry, { id: contact.id, jobId: job.jobId, expectedAttempt: job.attempt })).rejects.toThrow("Finish indexing");
  const paused = await f.drain(); expect(paused).toMatchObject({ status: "blocked", phase: "forms", errorCode: "SYNCED_FORMS_REQUIRES_REFRESH" });
  expect(await f.ready()).toBe(false); expect((await f.edges()).filter(edge => edge.sourceId === contact.id)).toHaveLength(2);
  expect(await f.t.run(async ctx => consumerDiscoveryReady(ctx, await installation(ctx), new RequestReadLedger()))).toBe(true);
  expect(await f.t.run(ctx => ctx.db.query("forms").take(10))).toHaveLength(0);
  const diagnostic = ref<"query">("syncedBlocks/consumerIndex:blockedDocument");
  expect(await f.operator.query(diagnostic, {})).toBeNull();
  await f.t.run(async ctx => { const role = (await ctx.db.get("roles", f.ids.role))!; await ctx.db.patch("roles", role._id, { capabilities: [...role.capabilities, "page.read", "page.update"] }); });
  expect(await f.operator.query(diagnostic, {})).toMatchObject({ title: "Existing private page", type: "page" });
  await expect(f.customer.query(diagnostic, {})).rejects.toThrow();
  await f.operator.mutation(retry, { id: contact.id, jobId: job.jobId, expectedAttempt: job.attempt });
  for (let i = 0; i < 5; i++) {
    const current = (await f.t.run(ctx => ctx.db.get("syncedBlockRefreshJobs", job.jobId)))!;
    if (current.status !== "pending") break;
    await f.t.mutation(ref<"mutation">("syncedBlocks/refresh:step"), { jobId: current._id, attempt: current.attempt, afterPostId: current.afterPostId });
  }
  expect(await f.operator.query(jobStatus, { id: contact.id })).toMatchObject({ status: "completed", processed: 2, failed: 0 });
  expect(await f.t.run(ctx => ctx.db.query("forms").take(10))).toHaveLength(2);
  await f.tick(); // Resume the retained failed cursor after repairing its forms.
  expect((await f.drain()).status).toBe("ready"); expect(await f.ready()).toBe(true);
  expect(await f.operator.query(diagnostic, {})).toBeNull();
  expect(await f.t.run(async ctx => Promise.all(pages.map(id => ctx.db.get("posts", id))))).toEqual(before);
  // Restored field rows must be inspected, not just the form's definition hash.
  await f.t.run(async ctx => { const field = (await ctx.db.query("fieldDefinitions").first())!; await ctx.db.patch("fieldDefinitions", field._id, { defaultValue: "Unexpected imported default" }); });
  process.env[epochName] = "synced_index_fixture_epoch_0002";
  expect((await f.drain()).errorCode).toBe("SYNCED_FORMS_REQUIRES_REFRESH"); expect(await f.ready()).toBe(false);
}));

test("a dirty document during Forms verification returns to discovery before certifying readiness", () => withEpoch(async () => {
  const f = await setup(); const postId = await f.addPage(); await f.addPage();
  await f.operator.mutation(begin, {});
  for (let i = 0; (await f.inspect()).phase !== "forms" && i < 30; i++) await f.tick();
  expect((await f.inspect()).phase).toBe("forms");
  await f.tick();
  await f.t.run(ctx => ctx.db.insert("syncedBlockConsumerDirty", { postId }));
  expect(await f.t.run(async ctx => consumerDiscoveryReady(ctx, await installation(ctx), new RequestReadLedger()))).toBe(false);
  expect((await f.tick()).result.phase).toBe("dirty");
  expect((await f.drain()).status).toBe("ready"); expect(await f.dirty()).toHaveLength(0);
}));

test("verified installations enable real Synced editor reads and saves while explicit disables and restored indexes refuse", () => withEpoch(async () => {
  const f = await setup();
  await f.t.run(async ctx => {
    const role = (await ctx.db.get("roles", f.ids.role))!;
    await ctx.db.patch("roles", role._id, { capabilities: [...role.capabilities, "page.read", "page.update"] });
  });
  const postId = await f.addPage();
  await f.t.run(ctx => ctx.db.patch("posts", postId, { blocksRevision: 1 }));
  const policy = () => f.t.run(async ctx => (await displayContext(ctx, new RequestReadLedger())).policy);
  expect((await policy()).disabledBlocks).toContain("core/synced");
  await f.drain(); expect((await policy()).disabledBlocks).not.toContain("core/synced");
  const get = ref<"query">("canonicalDocuments:get"), save = ref<"mutation">("canonicalDocuments:save");
  const current = await f.operator.query(get, { postId });
  expect(current.contract).toBe("canonical-document-v1"); expect(current.synced).toBeDefined();
  expect(current.document.blocks[0].name).toBe("core/synced");
  const receipt = await f.operator.mutation(save, { postId, expectedRevision: current.document.revision, title: "Saved reusable page", blocks: current.document.blocks });
  expect(receipt.changed).toBe(true);
  const reopened = await f.operator.query(get, { postId });
  expect(reopened.document.title).toBe("Saved reusable page"); expect(reopened.synced).toBeDefined();
  await f.t.run(ctx => ctx.db.insert("settings", { section: "blocks", values: { disabledBlockNames: ["core/synced"] }, updatedAt: 1, updatedBy: f.ids.user }));
  expect((await policy()).disabledBlocks).toContain("core/synced");
  process.env[epochName] = "mi_pending_fixture_import";
  expect((await policy()).disabledBlocks).toContain("core/synced");
}));
