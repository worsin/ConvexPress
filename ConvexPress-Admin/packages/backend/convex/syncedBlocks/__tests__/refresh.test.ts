import { afterAll, beforeAll, expect, test } from "bun:test";
import { makeFunctionReference as ref } from "convex/server";
import { fixture, create, save, withdraw, reference } from "./fixture.test-support";
import { syncDocumentContactForms } from "../../canonicalDocuments/contactDocuments";
import { validateCanonicalTree } from "../../canonicalDocuments/foundation/generated/instances";
import { contactSourceAllowed } from "../../canonicalDocuments/contactSource";
import { capturePublicationAuthority, requireCapturedPublicationAuthority } from "../../helpers/permissions";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { readSearch } from "../../canonicalDocuments/search";

const step = ref<"mutation">("syncedBlocks/refresh:step"), retry = ref<"mutation">("syncedBlocks/refresh:retry"), status = ref<"query">("syncedBlocks/refresh:status");
const start = ref<"mutation">("syncedBlocks/refresh:start");
const recover = ref<"mutation">("syncedBlocks/refresh:recover");
const previousEpoch = process.env.MEDIA_REFERENCE_INDEX_EPOCH;
beforeAll(() => { process.env.MEDIA_REFERENCE_INDEX_EPOCH = "synced_refresh_fixture_epoch_0001"; });
afterAll(() => { if (previousEpoch === undefined) delete process.env.MEDIA_REFERENCE_INDEX_EPOCH; else process.env.MEDIA_REFERENCE_INDEX_EPOCH = previousEpoch; });
const email = { name: "email", label: "Email", type: "email", required: true };
const message = { name: "message", label: "Message", type: "textarea", required: false };
const contact = (fields: unknown[] = [email, message]) => [{ id: "contact", name: "core/contact-form", version: 2, attrs: { heading: "Contact", fields } }];

async function setup() {
  const f = await fixture();
  await f.t.run(async ctx => {
    const role = (await ctx.db.get("roles", f.ids.role))!;
    await ctx.db.patch("roles", role._id, { level: 80, capabilities: [...role.capabilities, "form.create", "form.update", "manage_options", "page.read", "page.update"] });
    await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: f.ids.user });
  });
  let index = await f.operator.mutation(ref<"mutation">("syncedBlocks/consumerIndex:begin"), {});
  for (let i = 0; index.status !== "ready" && i < 10; i++) index = await f.operator.mutation(ref<"mutation">("syncedBlocks/consumerIndex:step"), { generation: index.generation, expectedSequence: index.sequence });
  expect(index.status).toBe("ready");
  const source = await f.operator.mutation(create, { title: "Reusable contact", blocks: contact() });
  await f.release(source.id, 1, 1);
  const inspect = () => f.operator.query(status, { id: source.id });
  async function tick() {
    const current = (await inspect())!;
    const job = (await f.t.run(ctx => ctx.db.get("syncedBlockRefreshJobs", current.jobId)))!;
    const args = { jobId: job._id, attempt: job.attempt, afterPostId: job.afterPostId };
    await f.t.mutation(step, args);
    return args;
  }
  async function drain() {
    for (let i = 0; i < 20; i++) {
      if ((await inspect())?.status !== "pending") return;
      await tick();
    }
    throw new Error("Worker did not finish within the fixture bound");
  }
  async function addPage(blocks = validateCanonicalTree([{ ...reference(source.id)[0], id: "latest" }, { ...reference(source.id, 1)[0], id: "pinned" }])) {
    return f.operator.run(async ctx => {
      const postId = await ctx.db.insert("posts", { type: "page", title: "Consumer", slug: "consumer", status: "publish", visibility: "public", authorId: f.ids.user, commentStatus: "closed", blocksVersion: 2, blocks, createdAt: 1, updatedAt: 1 });
      await syncDocumentContactForms(ctx, { postId, title: "Consumer", blocks });
      return postId;
    });
  }
  async function update(fields: unknown[] = [email]) {
    const head = (await f.t.run(ctx => ctx.db.get("syncedBlocks", source.id)))!;
    const next = await f.operator.mutation(save, { id: source.id, expectedGeneration: head.generation, title: "Reusable contact", blocks: contact(fields) });
    await f.release(source.id, next.generation, next.revision);
  }
  const forms = () => f.t.run(ctx => ctx.db.query("forms").take(30));
  return { ...f, source, inspect, tick, drain, addPage, update, forms };
}

test("source-only refresh processes one page per durable step and preserves latest/pinned forms and answers", async () => {
  const f = await setup(); const first = await f.addPage(), second = await f.addPage(); await f.drain();
  const before = await f.forms(); expect(before).toHaveLength(4);
  const postBefore = await f.t.run(ctx => ctx.db.get("posts", first));
  const fields = await f.t.run(ctx => ctx.db.query("fieldDefinitions").take(20));
  const oldMessage = fields.find(field => field.name === "message")!;
  const answer = await f.t.run(ctx => ctx.db.insert("fieldValues", { entityType: "form_submission", entityId: "fixture-answer", fieldKey: oldMessage.key, fieldName: oldMessage.name, value: "Keep my answer", updatedBy: "fixture", updatedAt: 1 }));
  await f.update();
  const delivery = await f.tick(); expect((await f.inspect())?.processed).toBe(1);
  await f.t.mutation(step, delivery); expect((await f.inspect())?.processed).toBe(1);
  await f.drain(); expect(await f.inspect()).toMatchObject({ status: "completed", processed: 2, failed: 0 });
  expect((await f.forms()).map(form => form._id)).toEqual(before.map(form => form._id));
  for (const form of await f.forms()) expect(await f.t.run(ctx => contactSourceAllowed(ctx, form))).toBe(true);
  expect(await f.t.run(ctx => ctx.db.get("posts", first))).toEqual(postBefore);
  expect((await f.t.run(ctx => ctx.db.get("fieldValues", answer)))?.value).toBe("Keep my answer");
  const head = (await f.t.run(ctx => ctx.db.get("syncedBlocks", f.source.id)))!;
  await f.release(f.source.id, head.generation, 1); await f.drain();
  expect((await f.t.run(ctx => ctx.db.get("fieldDefinitions", oldMessage._id)))?.groupId).toBe(oldMessage.groupId);
  expect((await f.forms()).filter(form => form.contactPostId === second)).toHaveLength(2);
});

test("source publication refreshes searchable consumer copy while pinned revisions remain searchable", async () => {
  const f = await setup();
  const copy = (text: string) => [{ id: "copy", name: "core/paragraph", version: 2, attrs: {
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
  } }];
  async function publishCopy(text: string) {
    const head = (await f.t.run(ctx => ctx.db.get("syncedBlocks", f.source.id)))!;
    const saved = await f.operator.mutation(save, { id: head._id, expectedGeneration: head.generation, title: "Reusable editorial copy", blocks: copy(text) });
    await f.release(head._id, saved.generation, saved.revision);
    return saved.revision;
  }
  await f.drain();
  const oldRevision = await publishCopy("Oldorchidword");
  const latest = await f.addPage(validateCanonicalTree(reference(f.source.id)));
  const pinned = await f.addPage(validateCanonicalTree(reference(f.source.id, oldRevision)));
  const before = await f.t.run(async ctx => Promise.all([ctx.db.get("posts", latest), ctx.db.get("posts", pinned)]));
  for (const contentId of [latest, pinned]) await f.t.mutation(ref<"mutation">("search/internals:onContentChanged"), { contentType: "page", contentId, action: "upsert" });
  const search = (query: string) => f.t.run(ctx => readSearch(ctx, { query }, { websiteKey: "synced", instanceKey: "staging" }, "host"));
  expect(new Set((await search("Oldorchidword")).items.map(item => item.id))).toEqual(new Set([latest, pinned]));
  await f.drain();
  await publishCopy("Neworchidword");
  await f.drain();
  expect(await f.inspect()).toMatchObject({ status: "completed", processed: 2, failed: 0 });
  expect((await search("Neworchidword")).items.map(item => item.id)).toEqual([latest]);
  expect((await search("Oldorchidword")).items.map(item => item.id)).toEqual([pinned]);
  expect(await f.t.run(async ctx => Promise.all([ctx.db.get("posts", latest), ctx.db.get("posts", pinned)]))).toEqual(before);
  const head = (await f.t.run(ctx => ctx.db.get("syncedBlocks", f.source.id)))!;
  await f.operator.mutation(withdraw, { id: head._id, expectedGeneration: head.generation });
  await f.drain();
  expect((await search("Neworchidword")).items).toEqual([]);
  expect((await search("Oldorchidword")).items).toEqual([]);
});

test("search refresh failure rolls back consumer projections and an authorized retry repairs both", async () => {
  const f = await setup(); const postId = await f.addPage(); await f.drain();
  const duplicateId = await f.t.run(async ctx => {
    const row = (await ctx.db.query("searchIndex").withIndex("by_content", q => q.eq("contentType", "page").eq("contentId", postId)).unique())!;
    const { _id, _creationTime, ...value } = row;
    return ctx.db.insert("searchIndex", value);
  });
  const forms = await f.forms();
  const fields = await f.t.run(ctx => ctx.db.query("fieldDefinitions").take(30));
  await f.update(); await f.drain();
  const failed = (await f.inspect())!;
  expect(failed).toMatchObject({ status: "failed", processed: 1, failed: 1 });
  expect(await f.forms()).toEqual(forms);
  expect(await f.t.run(ctx => ctx.db.query("fieldDefinitions").take(30))).toEqual(fields);
  await f.t.run(ctx => ctx.db.delete("searchIndex", duplicateId));
  await f.operator.mutation(retry, { id: f.source.id, jobId: failed.jobId, expectedAttempt: failed.attempt });
  await f.drain();
  expect(await f.inspect()).toMatchObject({ status: "completed", processed: 1, failed: 0 });
  expect(await f.t.run(ctx => ctx.db.query("fieldDefinitions").take(30))).not.toEqual(fields);
});

test("recovery preserves a live callback regardless of job age and tracks each continuation", async () => {
  const f = await setup(); await f.addPage(); await f.addPage();
  const current = (await f.inspect())!;
  const readJob = () => f.t.run(ctx => ctx.db.get("syncedBlockRefreshJobs", current.jobId));
  await f.t.run(ctx => ctx.db.patch("syncedBlockRefreshJobs", current.jobId, { updatedAt: 1 }));
  const before = (await readJob())!;
  const callback = await f.t.run(ctx => ctx.db.system.get(before.scheduledFunctionId!));
  expect(callback?.state.kind).toBe("pending");
  await f.t.mutation(recover, {});
  expect(await readJob()).toEqual(before);
  await f.tick();
  const next = (await readJob())!;
  expect(next.processed).toBe(1);
  expect(next.scheduledFunctionId).not.toBe(before.scheduledFunctionId);
  expect((await f.t.run(ctx => ctx.db.system.get(next.scheduledFunctionId!)))?.args).toEqual([
    { jobId: next._id, attempt: next.attempt, afterPostId: next.afterPostId },
  ]);
  await f.t.mutation(recover, {});
  expect(await readJob()).toEqual(next);
});

test("canceled callback becomes retryable without changing pages or forms and retry captures fresh authority", async () => {
  const f = await setup(); const postId = await f.addPage(); await f.addPage(); await f.drain();
  await f.update(); const stale = await f.tick();
  const current = (await f.inspect())!;
  const readJob = () => f.t.run(ctx => ctx.db.get("syncedBlockRefreshJobs", current.jobId));
  const before = (await readJob())!;
  const forms = await f.forms(), post = await f.t.run(ctx => ctx.db.get("posts", postId));
  await f.t.run(ctx => ctx.scheduler.cancel(before.scheduledFunctionId!));
  await f.t.mutation(recover, {});
  expect(await f.inspect()).toMatchObject({ status: "failed", processed: 1, failed: 0, errorCode: "SYNCED_REFRESH_CALLBACK_FAILED" });
  const recovered = await readJob();
  await f.t.mutation(recover, {}); await f.t.mutation(step, stale);
  await f.t.mutation(step, { jobId: before._id, attempt: before.attempt, afterPostId: before.afterPostId });
  expect(await readJob()).toEqual(recovered);
  expect(await f.forms()).toEqual(forms);
  expect(await f.t.run(ctx => ctx.db.get("posts", postId))).toEqual(post);
  await f.t.run(async ctx => {
    const role = (await ctx.db.get("roles", f.ids.role))!;
    await ctx.db.patch("roles", role._id, { capabilities: [...role.capabilities, "form.delete"] });
  });
  await f.operator.mutation(retry, { id: f.source.id, jobId: before._id, expectedAttempt: before.attempt });
  const restarted = (await readJob())!;
  expect(restarted.scheduledFunctionId).not.toBe(before.scheduledFunctionId);
  expect(restarted.authority).not.toEqual(before.authority);
  expect(restarted).toMatchObject({ status: "pending", attempt: before.attempt + 1, processed: 0 });
  await f.t.mutation(step, stale); expect(await readJob()).toEqual(restarted);
  await f.drain(); expect(await f.inspect()).toMatchObject({ status: "completed", processed: 2, failed: 0 });
});

test("recovery refuses callbacks for another attempt, cursor, job or function and handles legacy missing handles", async () => {
  for (const mismatch of ["attempt", "cursor", "job", "function", "missing"] as const) {
    const f = await setup(); const postId = await f.addPage();
    const current = (await f.inspect())!;
    await f.t.run(async ctx => {
      const job = (await ctx.db.get("syncedBlockRefreshJobs", current.jobId))!;
      const args = { jobId: job._id, attempt: job.attempt, afterPostId: job.afterPostId };
      if (mismatch === "attempt") args.attempt++;
      if (mismatch === "cursor") args.afterPostId = postId;
      if (mismatch === "job") {
        const { _id, _creationTime, ...copy } = job;
        args.jobId = await ctx.db.insert("syncedBlockRefreshJobs", { ...copy, status: "completed" });
      }
      const scheduledFunctionId = mismatch === "missing" ? undefined :
        mismatch === "function" ? await ctx.scheduler.runAfter(0, recover, {}) : await ctx.scheduler.runAfter(0, step, args);
      await ctx.db.patch("syncedBlockRefreshJobs", job._id, { scheduledFunctionId });
    });
    const before = await f.forms();
    await f.t.mutation(recover, {});
    expect(await f.inspect()).toMatchObject({ status: "failed", processed: 0, errorCode: mismatch === "missing" ? "SYNCED_REFRESH_RECOVERY_REQUIRED" : "SYNCED_REFRESH_CALLBACK_FAILED" });
    expect(await f.forms()).toEqual(before);
  }
});

test("recovery bounds each sweep and schedules remaining pending jobs without changing completed jobs", async () => {
  const f = await setup();
  const current = (await f.inspect())!;
  const complete = await f.t.run(async ctx => {
    const job = (await ctx.db.get("syncedBlockRefreshJobs", current.jobId))!;
    const { _id, _creationTime, ...copy } = job;
    for (let i = 0; i < 24; i++) await ctx.db.insert("syncedBlockRefreshJobs", { ...copy, scheduledFunctionId: undefined });
    const id = await ctx.db.insert("syncedBlockRefreshJobs", { ...copy, status: "completed", scheduledFunctionId: undefined });
    return ctx.db.get("syncedBlockRefreshJobs", id);
  });
  await f.t.mutation(recover, {});
  const jobs = await f.t.run(ctx => ctx.db.query("syncedBlockRefreshJobs").take(30));
  expect(jobs.filter(job => job.status === "failed")).toHaveLength(19);
  const callbacks = await f.t.run(ctx => ctx.db.system.query("_scheduled_functions").take(30));
  const continuation = callbacks.find(callback => callback.name === "syncedBlocks/refresh:recover");
  expect(continuation).toBeDefined();
  await f.t.mutation(recover, continuation!.args[0]);
  expect((await f.t.run(ctx => ctx.db.query("syncedBlockRefreshJobs").take(30))).filter(job => job.status === "failed")).toHaveLength(24);
  expect(await f.t.run(ctx => ctx.db.get("syncedBlockRefreshJobs", complete!._id))).toEqual(complete);
  expect((await f.inspect())?.status).toBe("pending");
});

test("nested contact-free sources discover first forms and ignore unrelated page contacts", async () => {
  const f = await setup();
  const outer = await f.operator.mutation(create, { title: "Outer", blocks: reference(f.source.id) }); await f.release(outer.id, 1, 1);
  await f.addPage(validateCanonicalTree([...reference(outer.id), { ...contact()[0], id: "page-contact" }]));
  const unrelated = (await f.forms()).find(form => form.contactBlockId === "page-contact")!;
  await f.update(); await f.drain();
  expect(await f.t.run(ctx => ctx.db.get("forms", unrelated._id))).toEqual(unrelated);
  const empty = await f.operator.mutation(create, { title: "Initially empty", blocks: [] }); await f.release(empty.id, 1, 1);
  const postId = await f.addPage(validateCanonicalTree(reference(empty.id)));
  expect((await f.forms()).filter(form => form.contactPostId === postId)).toHaveLength(0);
  await f.operator.mutation(save, { id: empty.id, expectedGeneration: 2, title: "Initially empty", blocks: contact() }); await f.release(empty.id, 3, 2);
  const job = (await f.operator.query(status, { id: empty.id }))!;
  await f.t.mutation(step, { jobId: job.jobId, attempt: 1, afterPostId: null });
  expect((await f.forms()).filter(form => form.contactPostId === postId)).toHaveLength(1);
});

test("permission failure rolls back the page, persists safe failure, and fresh authorized retry resumes", async () => {
  const f = await setup(); await f.addPage(); await f.drain(); const before = await f.forms();
  await f.update(); const previous = (await f.inspect())!;
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: ["post.publish", "post.read", "post.update"] }));
  await f.drain(); expect(await f.inspect()).toMatchObject({ status: "failed", failed: 1, processed: 1 });
  expect(await f.forms()).toEqual(before);
  const errors = await f.t.run(ctx => ctx.db.query("syncedBlockRefreshFailures").take(5));
  expect(errors).toHaveLength(1); expect(errors[0].code).toBe("SYNCED_REFRESH_AUTHORITY");
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: ["post.publish", "post.read", "post.update", "form.create", "form.update"] }));
  await f.operator.mutation(retry, { id: f.source.id, jobId: previous.jobId, expectedAttempt: 1 });
  await f.t.mutation(step, { jobId: previous.jobId, attempt: 1, afterPostId: null });
  expect(await f.inspect()).toMatchObject({ attempt: 2, processed: 0 });
  await f.drain(); expect(await f.inspect()).toMatchObject({ status: "completed", failed: 0 });
  await expect(f.operator.mutation(retry, { id: f.source.id, jobId: previous.jobId, expectedAttempt: 1 })).rejects.toThrow("Refresh changed");
  for (const form of await f.forms()) expect(await f.t.run(ctx => contactSourceAllowed(ctx, form))).toBe(true);
});

test("new publication supersedes stale jobs while draft saves do not cancel published refresh", async () => {
  const f = await setup(); await f.addPage(); await f.drain(); await f.update(); const old = (await f.inspect())!;
  await f.update([{ ...email, label: "Current email" }]); const current = (await f.inspect())!;
  expect(current.jobId).not.toBe(old.jobId);
  await f.t.mutation(step, { jobId: old.jobId, attempt: 1, afterPostId: null });
  expect((await f.t.run(ctx => ctx.db.get("syncedBlockRefreshJobs", old.jobId)))?.status).toBe("superseded");
  const head = (await f.t.run(ctx => ctx.db.get("syncedBlocks", f.source.id)))!;
  await f.operator.mutation(save, { id: f.source.id, expectedGeneration: head.generation, title: "Unpublished edit", blocks: [] });
  await f.drain(); expect(await f.inspect()).toMatchObject({ jobId: current.jobId, status: "completed", processed: 1 });
  for (const form of await f.forms()) expect(await f.t.run(ctx => contactSourceAllowed(ctx, form))).toBe(true);
});

test("removed references, deleted pages and withdrawal preserve history without granting stale edge authority", async () => {
  const f = await setup(); const removed = await f.addPage(), deleted = await f.addPage(); await f.drain(); const before = await f.forms();
  await f.update();
  await f.t.run(async ctx => { await ctx.db.patch("posts", removed, { blocks: [] }); await ctx.db.delete("posts", deleted); });
  await f.drain(); expect(await f.forms()).toEqual(before);
  expect(await f.t.run(ctx => ctx.db.query("syncedBlockConsumers").take(10))).toHaveLength(0);
  const remaining = await f.addPage();
  const head = (await f.t.run(ctx => ctx.db.get("syncedBlocks", f.source.id)))!;
  await f.operator.mutation(withdraw, { id: f.source.id, expectedGeneration: head.generation }); await f.drain();
  const forms = (await f.forms()).filter(form => form.contactPostId === remaining);
  for (const form of forms) expect(await f.t.run(ctx => contactSourceAllowed(ctx, form))).toBe(false);
  await f.release(f.source.id, head.generation + 1, 1); await f.drain();
  for (const form of (await f.forms()).filter(form => form.contactPostId === remaining)) expect(await f.t.run(ctx => contactSourceAllowed(ctx, form))).toBe(true);
});

test("foreign installation, expired grant and changed local credentials refuse background writes", async () => {
  for (const change of ["scope", "expiry", "password", "inactive", "provenance"] as const) {
    const f = await setup(); await f.addPage(); await f.drain(); await f.update(); const before = await f.forms();
    const current = (await f.inspect())!;
    await f.t.run(async ctx => {
      if (change === "scope") await ctx.db.patch("convexpress_siteIdentity", f.ids.site, { instanceKey: "elsewhere" });
      if (change === "expiry") { const job = (await ctx.db.get("syncedBlockRefreshJobs", current.jobId))!; await ctx.db.patch("syncedBlockRefreshJobs", job._id, { authority: { ...job.authority, expiresAt: 1 } }); }
      if (change === "password") await ctx.db.patch("users", f.ids.user, { lastPasswordChangedAt: Date.now() });
      if (change === "inactive") await ctx.db.patch("users", f.ids.user, { status: "inactive" });
      if (change === "provenance") await ctx.db.patch("users", f.ids.user, { authSource: "clerk", clerkUserId: "other" });
    });
    await f.t.mutation(step, { jobId: current.jobId, attempt: 1, afterPostId: null });
    expect(await f.forms()).toEqual(before);
    expect(await f.t.run(ctx => ctx.db.get("syncedBlockRefreshJobs", current.jobId))).toMatchObject({ status: "failed", processed: 0 });
  }
});

test("captured capabilities cannot gain privileges later and status does not reveal consumer identities", async () => {
  const f = await setup(); await f.addPage(); await f.drain();
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: ["post.publish", "post.read", "post.update"] }));
  await f.update();
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: ["post.publish", "post.read", "post.update", "form.create", "form.update"] }));
  await f.drain(); expect((await f.inspect())?.status).toBe("failed");
  expect(Object.keys((await f.inspect())!).sort()).toEqual(["jobId", "sourceGeneration", "status", "attempt", "processed", "failed", "errorCode", "updatedAt"].sort());
  await expect(f.t.query(status, { id: f.source.id })).rejects.toThrow();
  await expect(f.customer.query(status, { id: f.source.id })).rejects.toThrow();
});

test("captured management authority honors session, binding, controller, scope and capability revocation", async () => {
  for (const change of ["session", "expiry", "binding", "revision", "controller", "scope", "capability"] as const) {
    const f = await setup(), scope = { websiteKey: "synced", instanceKey: "staging" };
    const ids = await f.t.run(async ctx => {
      await ctx.db.patch("users", f.ids.user, { authSource: "management" });
      const authority = await ctx.db.insert("convexpress_managementAuthorities", { controllerId: "controller", keyId: "key", publicKeyPem: "fixture", fingerprintSha256: "fixture", ...scope, capabilities: [], capabilityRevision: 1, status: "active", notBefore: 1, expiresAt: Date.now() + 60_000, enrolledAt: 1, updatedAt: 1 });
      const binding = await ctx.db.insert("convexpress_managementBindings", { authorityId: authority, controllerId: "controller", syntheticOperatorId: "operator", userId: f.ids.user, capabilityRevision: 1, status: "active", createdAt: 1, updatedAt: 1 });
      const session = await ctx.db.insert("convexpress_managementSessions", { tokenHash: "not-a-token", authorityId: authority, bindingId: binding, userId: f.ids.user, ...scope, capabilities: [], siteRoleSlug: "editor", siteCapabilities: ["post.publish", "form.create", "form.update"], capabilityRevision: 1, expiresAt: Date.now() + 60_000, status: "active", createdAt: 1 });
      return { authority, binding, session };
    });
    const operator = f.t.withIdentity({ subject: ids.session, tokenIdentifier: `https://convexpress-management.local|${ids.session}` });
    const grant = await operator.run(ctx => capturePublicationAuthority(ctx, scope, "post.publish", new RequestReadLedger()));
    expect((await f.t.run(ctx => requireCapturedPublicationAuthority(ctx, grant, scope, "form.update", new RequestReadLedger())))._id).toBe(f.ids.user);
    await f.t.run(async ctx => {
      if (change === "session") await ctx.db.patch("convexpress_managementSessions", ids.session, { status: "revoked" });
      if (change === "expiry") await ctx.db.patch("convexpress_managementSessions", ids.session, { expiresAt: 1 });
      if (change === "binding") await ctx.db.patch("convexpress_managementBindings", ids.binding, { status: "revoked" });
      if (change === "revision") await ctx.db.patch("convexpress_managementAuthorities", ids.authority, { capabilityRevision: 2 });
      if (change === "controller") await ctx.db.patch("convexpress_managementBindings", ids.binding, { controllerId: "foreign" });
      if (change === "scope") await ctx.db.patch("convexpress_managementSessions", ids.session, { instanceKey: "foreign" });
      if (change === "capability") await ctx.db.patch("convexpress_managementSessions", ids.session, { siteCapabilities: ["post.publish"] });
    });
    await expect(f.t.run(ctx => requireCapturedPublicationAuthority(ctx, grant, scope, "form.update", new RequestReadLedger()))).rejects.toThrow("permission expired or changed");
  }
});


test("a failure after the first form write rolls back the complete page subtransaction", async () => {
  const f = await setup(); await f.addPage(validateCanonicalTree([{ ...reference(f.source.id)[0], id: "first" }, { ...reference(f.source.id)[0], id: "second" }])); await f.drain();
  const forms = await f.forms();
  await f.t.run(async ctx => {
    await ctx.db.delete("forms", forms[0]._id);
    await ctx.db.patch("roles", f.ids.role, { capabilities: ["post.read", "post.update", "post.publish", "form.create"] });
  });
  const before = await f.forms();
  const fieldsBefore = await f.t.run(ctx => ctx.db.query("fieldDefinitions").take(30));
  const groupsBefore = await f.t.run(ctx => ctx.db.query("fieldGroups").take(30));
  await f.update(); await f.drain();
  expect(await f.inspect()).toMatchObject({ status: "failed", failed: 1 });
  expect(await f.forms()).toEqual(before);
  expect(await f.t.run(ctx => ctx.db.query("fieldDefinitions").take(30))).toEqual(fieldsBefore);
  expect(await f.t.run(ctx => ctx.db.query("fieldGroups").take(30))).toEqual(groupsBefore);
});

async function importedPublication(run: (f: Awaited<ReturnType<typeof setup>> & { index: () => Promise<void> }) => Promise<void>) {
  const key = "MEDIA_REFERENCE_INDEX_EPOCH", previous = process.env[key];
  process.env[key] = "synced_refresh_import_fixture_0001";
  try {
    const f = await setup(); await f.drain();
    await f.t.run(async ctx => {
      await ctx.db.patch("syncedBlocks", f.source.id, { refreshJobId: undefined });
      const index = await ctx.db.query("syncedBlockConsumerIndex").withIndex("by_key", q => q.eq("key", "active")).unique();
      if (index) await ctx.db.delete("syncedBlockConsumerIndex", index._id);
      const role = (await ctx.db.get("roles", f.ids.role))!;
      await ctx.db.patch("roles", role._id, { capabilities: [...role.capabilities, "manage_options"] });
    });
    async function index() {
      let p = await f.operator.mutation(ref<"mutation">("syncedBlocks/consumerIndex:begin"), {});
      for (let i = 0; i < 60 && p.status !== "ready" && p.status !== "blocked"; i++) p = await f.operator.mutation(ref<"mutation">("syncedBlocks/consumerIndex:step"), { generation: p.generation, expectedSequence: p.sequence });
      expect(["ready", "blocked"]).toContain(p.status);
    }
    await run({ ...f, index });
  } finally { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
}

test("imported publication starts one authorized refresh after discovery and repairs existing page forms", () => importedPublication(async f => {
  const postId = await f.t.run(ctx => ctx.db.insert("posts", { type: "page", title: "Imported page", slug: "imported", status: "publish", visibility: "public", authorId: f.ids.user, commentStatus: "closed", blocksVersion: 2, blocks: validateCanonicalTree(reference(f.source.id)), createdAt: 1, updatedAt: 1 }));
  const before = await f.t.run(ctx => ctx.db.get("posts", postId));
  expect(await f.forms()).toHaveLength(0); expect(await f.inspect()).toBeNull();
  await expect(f.operator.mutation(start, { id: f.source.id, expectedGeneration: 2 })).rejects.toThrow("Finish indexing");
  await f.index();
  const sourceBefore = (await f.t.run(ctx => ctx.db.get("syncedBlocks", f.source.id)))!;
  const started = await f.operator.mutation(start, { id: f.source.id, expectedGeneration: 2 });
  await expect(f.operator.mutation(start, { id: f.source.id, expectedGeneration: 2 })).rejects.toThrow("Refresh already exists");
  await f.drain(); expect(await f.inspect()).toMatchObject({ jobId: started.jobId, status: "completed", processed: 1, failed: 0 });
  expect(await f.forms()).toHaveLength(1);
  const repaired = (await f.forms())[0];
  expect(await f.t.run(ctx => contactSourceAllowed(ctx, repaired))).toBe(true);
  expect(await f.t.run(ctx => ctx.db.get("posts", postId))).toEqual(before);
  expect(await f.t.run(ctx => ctx.db.get("syncedBlocks", f.source.id))).toEqual({ ...sourceBefore, refreshJobId: started.jobId });
}));

test("initial refresh rejects stale heads, missing publication, guests and revoked publishers without creating jobs", () => importedPublication(async f => {
  await f.index();
  const args = { id: f.source.id, expectedGeneration: 2 };
  const before = await f.t.run(ctx => ctx.db.query("syncedBlockRefreshJobs").take(10));
  await expect(f.t.mutation(start, args)).rejects.toThrow();
  await expect(f.customer.mutation(start, args)).rejects.toThrow();
  await expect(f.operator.mutation(start, { ...args, expectedGeneration: 1 })).rejects.toThrow("changed");
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: ["post.read"] }));
  await expect(f.operator.mutation(start, args)).rejects.toThrow();
  await f.t.run(async ctx => { await ctx.db.patch("roles", f.ids.role, { capabilities: ["post.publish"] }); await ctx.db.patch("syncedBlocks", f.source.id, { publishedRevision: undefined }); });
  await expect(f.operator.mutation(start, args)).rejects.toThrow("Publish this reusable content");
  expect(await f.t.run(ctx => ctx.db.query("syncedBlockRefreshJobs").take(10))).toEqual(before);
}));

test("restored foreign job pointer cannot supersede another source's pending work", () => importedPublication(async f => {
  const other = await f.operator.mutation(create, { title: "Other source", blocks: [] }); await f.release(other.id, 1, 1);
  const progress = (await f.operator.query(status, { id: other.id }))!;
  const before = await f.t.run(ctx => ctx.db.get("syncedBlockRefreshJobs", progress.jobId));
  await f.t.run(ctx => ctx.db.patch("syncedBlocks", f.source.id, { refreshJobId: progress.jobId }));
  expect(await f.inspect()).toBeNull(); await f.index();
  const next = await f.operator.mutation(start, { id: f.source.id, expectedGeneration: 2 });
  expect(next.jobId).not.toBe(progress.jobId);
  expect(await f.t.run(ctx => ctx.db.get("syncedBlockRefreshJobs", progress.jobId))).toEqual(before);
}));

test("an import epoch change refuses initial refresh even with a restored ready index", () => importedPublication(async f => {
  await f.index(); process.env.MEDIA_REFERENCE_INDEX_EPOCH = "synced_refresh_import_fixture_0002";
  await expect(f.operator.mutation(start, { id: f.source.id, expectedGeneration: 2 })).rejects.toThrow("Finish indexing");
  expect(await f.inspect()).toBeNull();
}));

test("a restored legacy or expired job cannot report empty success and retries capture fresh authority", async () => {
  for (const change of ["missing-generation", "expired-authority"] as const) {
    const f = await setup(), before = (await f.inspect())!;
    await f.t.run(async ctx => {
      const job = (await ctx.db.get("syncedBlockRefreshJobs", before.jobId))!;
      await ctx.db.patch("syncedBlockRefreshJobs", job._id, change === "missing-generation" ? { indexGeneration: undefined } : { authority: { ...job.authority, expiresAt: 1 } });
    });
    await f.tick();
    expect(await f.inspect()).toMatchObject({ status: "failed", processed: 0, failed: 0, errorCode: change === "missing-generation" ? "SYNCED_REFRESH_INDEX_CHANGED" : "SYNCED_REFRESH_AUTHORITY" });
    await f.operator.mutation(retry, { id: f.source.id, jobId: before.jobId, expectedAttempt: 1 });
    await f.drain(); expect(await f.inspect()).toMatchObject({ status: "completed", attempt: 2, errorCode: null });
  }
});

test("changing the import epoch fences queued page writes until discovery and an authorized retry", async () => {
  const f = await setup(); await f.addPage(); await f.drain(); await f.update();
  const before = await f.forms(), current = (await f.inspect())!, previous = process.env.MEDIA_REFERENCE_INDEX_EPOCH;
  try {
    process.env.MEDIA_REFERENCE_INDEX_EPOCH = "synced_refresh_changed_epoch_0002";
    await f.tick(); expect(await f.inspect()).toMatchObject({ status: "failed", processed: 0, errorCode: "SYNCED_REFRESH_INDEX_CHANGED" });
    expect(await f.forms()).toEqual(before);
    await expect(f.operator.mutation(retry, { id: f.source.id, jobId: current.jobId, expectedAttempt: 1 })).rejects.toThrow("Finish indexing");
    let p = await f.operator.mutation(ref<"mutation">("syncedBlocks/consumerIndex:begin"), {});
    for (let i = 0; i < 20 && p.status !== "blocked"; i++) p = await f.operator.mutation(ref<"mutation">("syncedBlocks/consumerIndex:step"), { generation: p.generation, expectedSequence: p.sequence });
    expect(p).toMatchObject({ status: "blocked", phase: "forms" });
    await f.operator.mutation(retry, { id: f.source.id, jobId: current.jobId, expectedAttempt: 1 });
    await f.drain(); expect(await f.inspect()).toMatchObject({ status: "completed", processed: 1, errorCode: null });
    for (const form of await f.forms()) expect(await f.t.run(ctx => contactSourceAllowed(ctx, form))).toBe(true);
  } finally { process.env.MEDIA_REFERENCE_INDEX_EPOCH = previous; }
});
