import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../../schema";
import { collectMediaReferenceIds } from "../../media/referenceExtraction";

const scope = { websiteKey: "draft-site", instanceKey: "draft-stage" };
const ref = (name: string) => makeFunctionReference<any, any, any>(`canonicalDocuments/drafts:${name}`);
const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/canonicalDocuments/drafts.ts": () => import("../drafts"),
  "./convex/canonicalDocuments/draftMaintenance.ts": () => import("../draftMaintenance"),
  "./convex/revisions/internals.ts": () => import("../../revisions/internals"),
};
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Editor", slug: "editor", description: "Fixture", level: 80, type: "internal", isDefault: false, isProtected: false, capabilities: ["page.update"], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const user = await ctx.db.insert("users", { authSource: "local", email: "draft-a@example.invalid", emailVerified: true, roleId: role, status: "active", createdAt: 1, updatedAt: 1 });
    const other = await ctx.db.insert("users", { authSource: "local", email: "draft-b@example.invalid", emailVerified: true, roleId: role, status: "active", createdAt: 1, updatedAt: 1 });
    const denied = await ctx.db.insert("users", { authSource: "local", email: "draft-denied@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("convexpress_siteIdentity", { identityKey: "site-identity", ...scope, environmentKind: "staging", deploymentOrigin: "https://draft.convex.cloud", managementOrigin: "https://draft.convex.site", siteOrigin: "https://draft.example.invalid", siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
    const post = await ctx.db.insert("posts", { type: "page", title: "Published title", slug: "draft-specimen", path: "/draft-specimen",  blocksVersion: 2, blocksRevision: 2, blocks: [], status: "publish", visibility: "public", authorId: user, commentStatus: "closed", createdAt: 1, updatedAt: 1 });
    return { role, user, other, denied, post };
  });
  const as = (id: typeof ids.user) => t.withIdentity({ subject: id, tokenIdentifier: `https://convexpress-admin.local|${id}` });
  const args = { postId: ids.post, expectedScope: scope };
  const client = as(ids.user);
  const content = () => t.run(async ctx => ({ post: await ctx.db.get("posts", ids.post), revisions: await ctx.db.query("revisions").collect() }));
  return { t, ids, as, args, client, content };
}
const draft = { title: "Private unfinished title", blocks: [{ id: "section", name: "core/section", version: 1, attrs: {}, children: [{ id: "notice", name: "core/announcement-bar", version: 1, anchor: "unfinished anchor", attrs: { text: "Private nested notice", schedule: { startsAt: "2040-06-01T09:00:00Z", endsAt: "2040-06-01T08:00:00Z" } } }] }] };

test("private autosave preserves unfinished nested input without publication or accepted revisions", async () => {
  const f = await fixture(), before = await f.content();
  expect((await f.client.query(ref("get"), f.args)).draft).toBeNull();
  const request = { ...f.args, expectedGeneration: 0, baseRevision: 2, draft };
  const saved = await f.client.mutation(ref("save"), request);
  expect(saved.generation).toBe(1); expect(saved.draft).toEqual(draft);
  expect(await f.client.mutation(ref("save"), request)).toEqual(saved);
  expect(await f.client.query(ref("get"), f.args)).toEqual(saved);
  expect((await f.as(f.ids.other).query(ref("get"), f.args)).draft).toBeNull();
  expect(await f.content()).toEqual(before);
});

test("draft generations fence stale saves, discards, lost acknowledgements and delayed first writes", async () => {
  const f = await fixture();
  const request = { ...f.args, expectedGeneration: 0, baseRevision: 2, draft };
  const first = await f.client.mutation(ref("save"), request);
  const second = await f.client.mutation(ref("save"), { ...request, expectedGeneration: first.generation, draft: { ...draft, title: "Newer window" } });
  await expect(f.client.mutation(ref("save"), request)).rejects.toMatchObject({ data: { code: "DRAFT_CONFLICT" } });
  await expect(f.client.mutation(ref("discard"), { ...f.args, expectedGeneration: first.generation })).rejects.toMatchObject({ data: { code: "DRAFT_CONFLICT" } });
  const cleared = await f.client.mutation(ref("discard"), { ...f.args, expectedGeneration: second.generation });
  expect(cleared.draft).toBeNull();expect(cleared.generation).toBe(3);
  await expect(f.client.mutation(ref("save"), request)).rejects.toMatchObject({ data: { code: "DRAFT_CONFLICT" } });
  expect(await f.client.mutation(ref("discard"), { ...f.args, expectedGeneration: second.generation })).toEqual(cleared);
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { blocksRevision: 3, title: "Another author saved" }));
  await expect(f.client.mutation(ref("save"), { ...request, expectedGeneration: cleared.generation })).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  expect((await f.client.query(ref("get"), f.args)).draft).toBeNull();
});

test("every draft operation requires current document authority and the exact site instance", async () => {
  const f = await fixture();
  const save = { ...f.args, expectedGeneration: 0, baseRevision: 2, draft };
  await f.client.mutation(ref("save"), save);
  for (const client of [f.t, f.as(f.ids.denied)]) {
    await expect(client.query(ref("get"), f.args)).rejects.toThrow();
    await expect(client.mutation(ref("save"), save)).rejects.toThrow();
    await expect(client.mutation(ref("discard"), { ...f.args, expectedGeneration: 1 })).rejects.toThrow();
  }
  for (const expectedScope of [{ ...scope, websiteKey: "foreign" }, { ...scope, instanceKey: "live" }]) {
    await expect(f.client.query(ref("get"), { ...f.args, expectedScope })).rejects.toMatchObject({ data: { code: "WRONG_SITE_SCOPE" } });
    await expect(f.client.mutation(ref("save"), { ...save, expectedScope })).rejects.toMatchObject({ data: { code: "WRONG_SITE_SCOPE" } });
  }
  await f.t.run(ctx => ctx.db.patch("roles", f.ids.role, { capabilities: [] }));
  await expect(f.client.query(ref("get"), f.args)).rejects.toThrow();
  await expect(f.client.mutation(ref("save"), save)).rejects.toThrow();
  expect((await f.content()).post?.blocksRevision).toBe(2);
});

test("malformed trees and oversized drafts are refused without changing a retained draft", async () => {
  const f = await fixture();
  const args = { ...f.args, expectedGeneration: 0, baseRevision: 2, draft };
  const first = await f.client.mutation(ref("save"), args);
  for (const value of [{ ...draft, blocks: [draft.blocks[0], draft.blocks[0]] }, { ...draft, title: "x".repeat(1024 * 1024) }]) {
    await expect(f.client.mutation(ref("save"), { ...args, expectedGeneration: first.generation, draft: value })).rejects.toThrow();
    expect(await f.client.query(ref("get"), f.args)).toEqual(first);
  }
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { status: "trash" }));
  await expect(f.client.query(ref("get"), f.args)).rejects.toThrow();
});

test("private draft media uses existing attachment and reference guards, including discard", async () => {
  const f = await fixture();
  const mediaId = await f.t.run(ctx => ctx.db.insert("media", { title: "Draft image", fileName: "draft.png", slug: "draft-image", url: "https://example.invalid/draft.png", mimeType: "image/png", fileSize: 68, mediaType: "image", status: "active", uploadedBy: f.ids.user, createdAt: 1, updatedAt: 1 }));
  const value = { ...draft, blocks: [{ id: "image", name: "core/image", version: 2, attrs: { mediaId } }] };
  const args = { ...f.args, expectedGeneration: 0, baseRevision: 2, draft: value };
  const saved = await f.client.mutation(ref("save"), args);
  expect(await f.t.run(async ctx => collectMediaReferenceIds(ctx, "canonicalDocumentDrafts", (await ctx.db.query("canonicalDocumentDrafts").first())!))).toEqual([mediaId]);
  await f.t.run(ctx => ctx.db.patch("media", mediaId, { status: "trashed" }));
  await expect(f.client.mutation(ref("save"), { ...args, expectedGeneration: saved.generation, draft: { ...value, title: "Later input" } })).rejects.toMatchObject({ data: { code: "MEDIA_UNAVAILABLE" } });
  expect(await f.client.query(ref("get"), f.args)).toEqual(saved);
  await f.client.mutation(ref("discard"), { ...f.args, expectedGeneration: saved.generation });
  expect(await f.t.run(async ctx => collectMediaReferenceIds(ctx, "canonicalDocumentDrafts", (await ctx.db.query("canonicalDocumentDrafts").first())!))).toEqual([]);
});

test("permanent document cleanup removes private drafts in bounded batches", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    for (let index = 0; index < 130; index++) {
      const userId = await ctx.db.insert("users", { authSource: "local", email: `draft-${index}@example.invalid`, emailVerified: true, roleId: f.ids.role, status: "active", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("canonicalDocumentDrafts", { postId: f.ids.post, userId, generation: 1, baseRevision: 2, draft, updatedAt: 1 });
    }
  });
  await f.t.mutation(makeFunctionReference<any, any, any>("revisions/internals:deleteByParent"), { parentId: f.ids.post });
  // Bun uses real timers here; convex-test's advanceTimers callback expects
  // synchronous fake timers and can otherwise return before a job starts.
  for (let attempt = 0; attempt < 100; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1));
    await f.t.finishInProgressScheduledFunctions();
    if (!(await f.t.run(ctx => ctx.db.query("canonicalDocumentDrafts").take(1))).length) break;
  }
  expect(await f.t.run(ctx => ctx.db.query("canonicalDocumentDrafts").collect())).toEqual([]);
});
