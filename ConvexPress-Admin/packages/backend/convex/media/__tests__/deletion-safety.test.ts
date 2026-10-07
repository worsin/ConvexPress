import { expect, test } from "bun:test";
import { commerceHarness } from "../../commerce/__tests__/handlerHarness.test-support";
import { findMediaReferences } from "../references";
import * as mutations from "../mutations";
import * as referenceReads from "../referenceReads";

function fixture(seed: Record<string, any[]> = {}) {
  const ctx = commerceHarness({ roles: [{ _id: "role", slug: "administrator", level: 100, status: "active", type: "internal", capabilities: ["media.delete"] }], media: [{ _id: "m1", status: "active", uploadedBy: "admin", fileName: "a.mp4", mediaType: "video", fileSize: 10 }], ...seed });
  for (const [name, handler] of Object.entries(referenceReads)) ctx.handlers[`media/referenceReads:${name}`] = handler;
  ctx.db.system = { get: async () => null };
  const writes: string[] = [];
  for (const kind of ["insert", "patch", "delete"]) {
    const original = ctx.db[kind];
    ctx.db[kind] = async (...args: any[]) => { writes.push(kind); return original(...args); };
  }
  ctx.storage = { delete: async () => { writes.push("storage.delete"); } };
  return { ctx, writes };
}
async function code(run: () => Promise<unknown>) {
  try { await run(); return null; } catch (error: any) { return error.data?.code ?? error.message; }
}

test("actual reference scan includes LMS, variant galleries, revisions and nested canonical/legacy authored references", async () => {
  const { ctx } = fixture({ lms_nodes: [{ _id: "lesson", kind: "lesson", videoMediaId: "m1" }], commerce_product_variants: [{ _id: "variant", galleryMediaIds: ["m1"] }], revisions: [{ _id: "revision", featuredImageId: "m1" }], posts: [{ _id: "page", blocks: [{ attrs: {}, innerBlocks: [{ attrs: { media: { id: "m1" } } }] }], content: JSON.stringify({ type: "doc", content: [{ type: "image", attrs: { mediaId: "m1" } }] }) }] });
  const refs = await findMediaReferences(ctx, "m1" as any);
  expect(new Set(refs.map(ref => ref.table))).toEqual(new Set(["lms_nodes", "commerce_product_variants", "revisions", "posts"]));
});

test("actual force handler refuses watched lesson invariant before any write", async () => {
  const { ctx, writes } = fixture({ users: [{ _id: "admin", authSource: "local", status: "active", roleId: "role" }, { _id: "other", avatarMediaId: "m1" }], lms_nodes: [{ _id: "lesson", kind: "lesson", videoMediaId: "m1", requireVideoWatch: true }] });
  expect(await code(() => (mutations.remove as any)._handler(ctx, { mediaId: "m1", force: true }))).toBe("MEDIA_REFERENCE_UNCLEARABLE");
  expect(writes).toEqual([]);
});

test("actual remove refuses incomplete table before any write", async () => {
  const { ctx, writes } = fixture({ posts: Array.from({ length: 257 }, (_, i) => ({ _id: `p${i}` })) });
  expect(await code(() => (mutations.remove as any)._handler(ctx, { mediaId: "m1" }))).toBe("MEDIA_REFERENCE_BUDGET");
  expect(writes).toEqual([]);
});

test("opaque authored references and retained revision refs block force without guessed clearing", async () => {
  for (const seed of [{ posts: [{ _id: "p", blocks: [{ attrs: { imageId: "m1" } }] }] }, { revisions: [{ _id: "r", featuredImageId: "m1" }] }, { revisions: [{ _id: "r", autosaveContent: JSON.stringify({type:"doc",content:[{type:"image",attrs:{mediaId:"m1"}}]}) }] }]) {
    const { ctx, writes } = fixture(seed);
    expect(await code(() => (mutations.remove as any)._handler(ctx, { mediaId: "m1", force: true }))).toBe("MEDIA_REFERENCE_UNCLEARABLE");
    expect(writes).toEqual([]);
  }
});

test("metadata overflow and storage ownership failure precede any force clearing", async () => {
  const { ctx, writes } = fixture({ users: [{ _id: "admin", authSource: "local", status: "active", roleId: "role", avatarMediaId: "m1" }], mediaMeta: Array.from({ length: 257 }, (_, i) => ({ _id: `meta${i}`, mediaId: "m1" })) });
  expect(await code(() => (mutations.permanentlyDelete as any)._handler(ctx, { mediaId: "m1", force: true }))).toBe("MEDIA_REFERENCE_BUDGET");
  expect(writes).toEqual([]);
});

test("single oversized document, split metadata, aggregate bytes and unknown deep structures all refuse", async () => {
  for (const mode of ["large", "split", "aggregate", "deep"]) {
    const { ctx, writes } = fixture();
    if (mode === "large") ctx.tables.posts = [{ _id: "p", content: "x".repeat(512 * 1024) }];
    if (mode === "aggregate") for (const table of ["posts", "revisions", "settings", "appearance_drafts", "legacyAppearanceArchives", "blockDefinitionVersions", "lms_courses", "lms_nodes", "lms_lessonVersions"]) ctx.tables[table] = [{ _id: table, payload: "x".repeat(480 * 1024) }];
    if (mode === "deep") { let tree: any = "none"; for (let i = 0; i < 66; i++) tree = { child: tree }; ctx.tables.posts = [{ _id: "p", blocks: tree }]; }
    if (mode === "split") { const base = ctx.db.query; ctx.db.query = (table: string) => { const q = base(table); if (table === "posts") q.paginate = async () => ({ page: [], isDone: true, continueCursor: "c", pageStatus: "SplitRecommended", splitCursor: "s" }); return q; }; }
    expect(await code(() => (mutations.remove as any)._handler(ctx, { mediaId: "m1" }))).toBe("MEDIA_REFERENCE_BUDGET");
    expect(writes).toEqual([]);
  }
});

test("bulk shares authored scan and clears duplicate gallery entries without corrupting sibling refs", async () => {
  const { ctx } = fixture({ media: [{ _id: "m1", status: "active", uploadedBy: "admin" }, { _id: "m2", status: "active", uploadedBy: "admin" }, { _id: "keep", status: "active", uploadedBy: "admin" }], commerce_product_variants: [{ _id: "variant", galleryMediaIds: ["m1", "keep", "m2", "m1"] }] });
  const result = await (mutations.bulkDelete as any)._handler(ctx, { mediaIds: ["m1", "m2", "m1"], force: true });
  expect(result).toEqual({ trashed: 2, errors: [] });
  expect(ctx.tables.commerce_product_variants[0].galleryMediaIds).toEqual(["keep"]);
  expect(ctx.calls.filter((call: any) => call.name === "media/referenceReads:scan" && call.args.table === "posts").length).toBe(1);
});

test("force gallery removal decrements album count once per junction and preserves existing cover patch", async () => {
  const { ctx } = fixture({ gallery_albums: [{ _id: "album", itemCount: 3, coverMediaId: "m1", updatedAt: 1 }], gallery_albumItems: [{ _id: "i1", albumId: "album", mediaId: "m1" }, { _id: "i2", albumId: "album", mediaId: "m1" }, { _id: "i3", albumId: "album", mediaId: "keep" }] });
  await (mutations.remove as any)._handler(ctx, { mediaId: "m1", force: true });
  expect(ctx.tables.gallery_albumItems.map((row: any) => row._id)).toEqual(["i3"]);
  expect(ctx.tables.gallery_albums[0].itemCount).toBe(1);
  expect(ctx.tables.gallery_albums[0].coverMediaId).toBeUndefined();
});

test("shared original/size blobs survive; exclusively owned existing blobs deleted once", async () => {
  const { ctx, writes } = fixture({ media: [{ _id: "m1", status: "active", uploadedBy: "admin", storageId: "blob" }, { _id: "other", status: "active", uploadedBy: "admin", storageId: "blob" }], mediaSizes: [{ _id: "size1", mediaId: "m1", storageId: "blob" }, { _id: "size2", mediaId: "m1", storageId: "own" }, { _id: "size3", mediaId: "m1", storageId: "own" }] });
  ctx.db.system.get = async (_table: string, id: string) => ({ _id: id, size: 10 });
  const blobs: string[] = []; ctx.storage.delete = async (id: string) => { blobs.push(id); writes.push("storage.delete"); };
  await (mutations.permanentlyDelete as any)._handler(ctx, { mediaId: "m1" });
  expect(blobs).toEqual(["own"]);
  expect(ctx.tables.media.map((row: any) => row._id)).toEqual(["other"]);
  expect(ctx.tables.mediaSizes).toEqual([]);
});

test("normal and force role policies remain enforced", async () => {
  const { ctx, writes } = fixture({ lms_courses: [{ _id: "c", featuredImageId: "m1" }] });
  expect(await code(() => (mutations.remove as any)._handler(ctx, { mediaId: "m1" }))).toBe("MEDIA_IN_USE");
  ctx.tables.roles[0].level = 30; ctx.tables.roles[0].slug = "author";
  expect(await code(() => (mutations.remove as any)._handler(ctx, { mediaId: "m1", force: true }))).toBe("FORBIDDEN");
  expect(writes).toEqual([]);
});

test("unexpected writes are not swallowed into a partially successful bulk result", async () => {
  const { ctx } = fixture();
  ctx.db.patch = async () => { throw new Error("write failed"); };
  expect(await code(() => (mutations.bulkDelete as any)._handler(ctx, { mediaIds: ["m1"] }))).toBe("write failed");
});

test("late processing cannot revive trashed media and size replacement preserves shared original blob", async () => {
  const { ctx, writes } = fixture({ media: [{ _id: "m1", status: "active", uploadedBy: "admin", storageId: "original" }], mediaSizes: [{ _id: "size", mediaId: "m1", sizeName: "thumbnail", storageId: "original" }] });
  ctx.db.system.get = async (_table: string, id: string) => ({ _id: id, size: 10 });
  await (mutations.addSize as any)._handler(ctx, { mediaId: "m1", sizeName: "thumbnail", storageId: "replacement", url: "https://example.invalid/thumbnail", width: 10, height: 10 });
  expect(writes.includes("storage.delete")).toBe(false);
  ctx.tables.media[0].status = "trashed"; writes.length = 0;
  expect(await code(() => (mutations.updateStatus as any)._handler(ctx, { mediaId: "m1", status: "active" }))).toBe("MEDIA_UNAVAILABLE");
  expect(await code(() => (mutations.addSize as any)._handler(ctx, { mediaId: "m1", sizeName: "thumbnail", storageId: "replacement" }))).toBe("MEDIA_UNAVAILABLE");
  expect(writes).toEqual([]);
});

test("cron uses shared nonforce guard and advances past referenced first page", async () => {
  const { emptyTrashCron } = await import("../internals");
  const { ctx } = fixture({ media: Array.from({ length: 9 }, (_, i) => ({ _id: `m${i}`, status: "trashed", uploadedBy: "admin", updatedAt: 1 })), lms_courses: Array.from({ length: 8 }, (_, i) => ({ _id: `c${i}`, featuredImageId: `m${i}` })) });
  const first = await (emptyTrashCron as any)._handler(ctx, {});
  expect(first.deleted).toBe(0); expect(first.skippedReferenced).toBe(8);
  expect(ctx.tables.mediaMaintenance[0].cursor).toBe("8");
  const second = await (emptyTrashCron as any)._handler(ctx, {});
  expect(second.deleted).toBe(1); expect(ctx.tables.media).toHaveLength(8);
  expect(ctx.tables.mediaMaintenance[0].cursor).toBeNull();
});

test("actual product writer refuses stale/deleted media after a prior delete and allows processing", async () => {
  const products = await import("../../commerce/products");
  const { ctx } = fixture();
  ctx.tables.roles[0].capabilities.push("manage_options");
  for (const status of ["trashed", "failed", "validating"]) {
    ctx.tables.media[0].status = status;
    expect(await code(() => (products.create as any)._handler(ctx, { title: "A mug", basePrice: 3800, featuredMediaId: "m1", galleryMediaIds: [] }))).toBe("MEDIA_UNAVAILABLE");
    expect(ctx.tables.commerce_products ?? []).toEqual([]);
  }
  ctx.tables.media[0].status = "active";
  await (mutations.permanentlyDelete as any)._handler(ctx, { mediaId: "m1" });
  expect(await code(() => (products.create as any)._handler(ctx, { title: "A mug", basePrice: 3800, featuredMediaId: "m1" }))).toBe("MEDIA_UNAVAILABLE");
  ctx.tables.media.push({ _id: "m1", status: "processing" });
  const id = await (products.create as any)._handler(ctx, { title: "A mug", basePrice: 3800, featuredMediaId: "m1" });
  expect(ctx.tables.commerce_products[0]._id).toBe(id);
});

test("real Convex transaction sees pending attachment through nested indexed query and rolls back refusal", async () => {
  const { convexTest } = await import("convex-test");
  const { default: schema } = await import("../../schema");
  const { deleteMediaInternal } = await import("../internals");
  const t = convexTest({ schema, modules: {
    "./convex/_generated/api.js": () => import("../../_generated/api.js"),
    "./convex/_generated/server.js": () => import("../../_generated/server.js"),
    "./convex/media/referenceReads.ts": () => import("../referenceReads"),
  } });
  const { userId, mediaId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { authSource: "local", email: "fixture@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const mediaId = await ctx.db.insert("media", { title: "Image", fileName: "image.png", slug: "image", url: "https://example.invalid/image", mimeType: "image/png", fileSize: 10, mediaType: "image", status: "active", uploadedBy: userId, createdAt: 1, updatedAt: 1 });
    return { userId, mediaId };
  });
  expect(await code(() => t.run(async ctx => {
    await ctx.db.patch("users", userId, { avatarMediaId: mediaId });
    const refs = await findMediaReferences(ctx as any, mediaId);
    expect(refs.some(ref => ref.documentId === userId)).toBe(true);
    await (deleteMediaInternal as any)._handler(ctx, { mediaId });
  }))).toBe("MEDIA_IN_USE");
  const result = await t.run(async ctx => ({ user: await ctx.db.get("users", userId), media: await ctx.db.get("media", mediaId) }));
  expect(result.user?.avatarMediaId).toBeUndefined();
  expect(result.media?._id).toBe(mediaId);
});

test("indexed scalar checks exclude large unrelated owners and descriptor inventory covers current schema", async () => {
  const { ctx } = fixture({ users: Array.from({ length: 600 }, (_, i) => ({ _id: `u${i}`, avatarMediaId: `other${i}` })) });
  expect(await findMediaReferences(ctx, "m1" as any)).toEqual([]);
  const { default: schema } = await import("../../schema");
  const { typedMediaReferences } = await import("../referenceInventory.generated");
  const found: Record<string, string[]> = {};
  function walk(node: any, path: string[], paths: string[]) { if (node.type === "id" && node.tableName === "media") paths.push(path.join(".")); if (node.type === "object") for (const [key, field] of Object.entries<any>(node.value)) walk(field.fieldType, [...path, key], paths); if (node.type === "array") walk(node.value, [...path, "*"], paths); if (node.type === "union") for (const value of node.value) walk(value, path, paths); }
  for (const [table, definition] of Object.entries(schema.tables)) { const paths: string[] = []; walk(definition.validator.json, [], paths); if (paths.length) found[table] = paths; }
  expect(found).toEqual(Object.fromEntries(Object.entries(typedMediaReferences).map(([table, paths]) => [table, paths.map(path => path.path.join("."))])));
});

test("HTTP deletion and failed-upload cleanup preserve actual referenced files", async () => {
  const { deleteMediaInternal, cleanupExpiredMedia } = await import("../internals");
  const { ctx, writes } = fixture({ media: [{ _id: "m1", status: "failed", uploadedBy: "admin", createdAt: 1 }], lms_courses: [{ _id: "course", featuredImageId: "m1" }] });
  expect(await code(() => (deleteMediaInternal as any)._handler(ctx, { mediaId: "m1" }))).toBe("MEDIA_IN_USE");
  expect(writes).toEqual([]);
  expect((await (cleanupExpiredMedia as any)._handler(ctx, {})).cleaned).toBe(0);
  expect(ctx.tables.media).toHaveLength(1);
});

test("opaque writer guard detects nested and serialized IDs and preserves unrelated text", async () => {
  const { assertMediaAttachments } = await import("../attachmentGuard");
  const mediaId = "m".repeat(32);
  const { ctx } = fixture({ media: [{ _id: mediaId, status: "trashed" }] });
  for (const [owner, content] of [["posts", { blocks: [{ children: [{ attrs: { unknownPluginImage: mediaId } }] }] }], ["revisions", { content: JSON.stringify({ type: "image", attrs: { mediaId } }) }]] as const) {
    expect(await code(() => assertMediaAttachments(ctx, owner, content))).toBe("MEDIA_UNAVAILABLE");
  }
  expect(await code(() => assertMediaAttachments(ctx, "revisions", { content: "This is ordinary prose, without media identifiers." }))).toBeNull();
});


test("escaped JSON media identifiers cannot bypass legacy reference scan or attachment guard", async () => {
  const { assertMediaAttachments } = await import("../attachmentGuard");
  const encoded = String.raw`{"type":"image","attrs":{"mediaId":"\u006d1"}}`;
  const { ctx } = fixture({ media: [{ _id: "m1", status: "trashed" }], revisions: [{ _id: "r", content: encoded }] });
  expect((await findMediaReferences(ctx, "m1" as any)).some(ref => ref.table === "revisions" && ref.documentId === "r")).toBe(true);
  expect(await code(() => assertMediaAttachments(ctx, "revisions", { content: encoded }))).toBe("MEDIA_UNAVAILABLE");
});

test("schema-derived opaque roots cover commerce metadata and custom-field producers", async () => {
  const { ctx } = fixture({ commerce_products: [{ _id: "product", description: "m1", rawSourceMeta: JSON.stringify({ privateImage: "m1" }), productAttributes: { photo: "m1" } }], commerce_product_variants: [{ _id: "variant", description: "m1" }], commerce_product_categories: [{ _id: "category", description: "m1" }], fieldValues: [{ _id: "field", value: JSON.stringify(["m1"]) }], postMeta: [{ _id: "meta", value: JSON.stringify({ photo: "m1" }) }], reusableBlocks: [{ _id: "reusable", content: JSON.stringify({ type: "image", attrs: { mediaId: "m1" } }) }] });
  const refs = await findMediaReferences(ctx, "m1" as any);
  expect(new Set(refs.map(ref => ref.table))).toEqual(new Set(["commerce_products", "commerce_product_variants", "commerce_product_categories", "fieldValues", "postMeta", "reusableBlocks"]));
  const { opaqueMediaReferences } = await import("../referenceInventory.generated");
  const { default: schema } = await import("../../schema");
  for (const [table, fields] of Object.entries(opaqueMediaReferences)) {
    const actual = Object.entries<any>((schema.tables as any)[table].validator.json.value).filter(([, field]) => /"type":"(?:string|any)"/.test(JSON.stringify(field.fieldType))).map(([field]) => field).sort();
    expect(fields).toEqual(actual);
  }
});

test("exhausted source budgets refuse before starting another query", async () => {
  const { findMediaReferencesForIds } = await import("../references");
  for (const total of [{ rows: 2000, bytes: 0, queries: 0 }, { rows: 0, bytes: 4 * 1024 * 1024, queries: 0 }, { rows: 0, bytes: 0, queries: 160 }]) {
    const { ctx } = fixture();
    expect(await code(() => findMediaReferencesForIds(ctx, ["m1" as any], total))).toBe("MEDIA_REFERENCE_BUDGET");
    expect(ctx.calls).toEqual([]);
  }
});

test("size replacement preserves exact edit-backup storage references", async () => {
  const { ctx, writes } = fixture({ mediaSizes: [{ _id: "size", mediaId: "m1", sizeName: "thumbnail", storageId: "backup" }], mediaMeta: [{ _id: "saved", mediaId: "m1", key: "_original_storage_id", value: "backup" }] });
  ctx.db.system.get = async (_table: string, id: string) => ({ _id: id, size: 10 });
  await (mutations.addSize as any)._handler(ctx, { mediaId: "m1", sizeName: "thumbnail", storageId: "replacement", width: 10, height: 10 });
  expect(writes.includes("storage.delete")).toBe(false);
});

test("legacy aliases in opaque authored data block actual deletion and force clearing", async () => {
  for (const force of [false, true]) {
    const { ctx, writes } = fixture({ settings: [{ _id: "s1", section: "general", values: { image: "pricingwindowacceptance" } }] });
    const normalize = ctx.db.normalizeId.bind(ctx.db);
    ctx.db.normalizeId = (table: string, value: string) => table === "media" && value === "pricingwindowacceptance" ? "m1" : normalize(table, value);
    expect(await code(() => (mutations.remove as any)._handler(ctx, { mediaId: "m1", force }))).toBe(force ? "MEDIA_REFERENCE_UNCLEARABLE" : "MEDIA_IN_USE");
    expect(writes).toEqual([]);
  }
});
