import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { patchDynamicWithMediaReferences, deleteDynamicWithMediaReferences, insertWithMediaReferences, patchWithMediaReferences, replaceWithMediaReferences, deleteWithMediaReferences } from "../attachmentGuard";
import { currentReferenceGeneration, requireReferenceIndexReady } from "../reverseIndex";
import { MEDIA_REVERSE_EPOCH_VARIABLE } from "../reverseIndexVersion";
import { referenceTables } from "../referenceScan";

async function withEpoch(run: () => Promise<void>) {
  const previous = process.env[MEDIA_REVERSE_EPOCH_VARIABLE];
  process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = "reverse_index_fixture_epoch";
  try { await run(); }
  finally { if (previous === undefined) delete process.env[MEDIA_REVERSE_EPOCH_VARIABLE]; else process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = previous; }
}
function database() {
  return convexTest({ schema, modules: { "./convex/_generated/server.js": () => import("../../_generated/server.js") } });
}
async function fixture() {
  const t = database();
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { authSource: "local", email: "fixture@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const media = (slug: string) => ctx.db.insert("media", { title: slug, fileName: `${slug}.png`, slug, url: `https://example.invalid/${slug}`, mimeType: "image/png", fileSize: 10, mediaType: "image", status: "active", uploadedBy: userId, createdAt: 1, updatedAt: 1 });
    return { userId, first: await media("first"), second: await media("second") };
  });
  return { t, ...ids };
}
async function errorCode(run: () => Promise<unknown>) {
  try { await run(); return null; } catch (error) { return (error as { data?: { code?: string } }).data?.code; }
}

test("real insert, patch, replace and delete maintain only the exact owner's media edges", async () => withEpoch(async () => {
  const { t, first, second } = await fixture();
  const value = { authSource: "local" as const, email: "owner@example.invalid", emailVerified: true, status: "active" as const, createdAt: 1, updatedAt: 1, avatarMediaId: first };
  const owner = await t.run(ctx => insertWithMediaReferences(ctx, "users", value));
  const sibling = await t.run(ctx => insertWithMediaReferences(ctx, "users", { ...value, email: "sibling@example.invalid" }));
  const read = () => t.run(ctx => ctx.db.query("media_reference_edges").collect());
  expect((await read()).map(edge => edge.mediaId)).toEqual([first, first]);
  await t.run(ctx => patchWithMediaReferences(ctx, "users", owner, { avatarMediaId: second }));
  expect((await read()).find(edge => edge.ownerId === owner)?.mediaId).toBe(second);
  expect((await read()).find(edge => edge.ownerId === sibling)?.mediaId).toBe(first);
  await t.run(ctx => replaceWithMediaReferences(ctx, "users", owner, { ...value, avatarMediaId: undefined }));
  expect((await read()).map(edge => edge.ownerId)).toEqual([sibling]);
  await t.run(ctx => deleteWithMediaReferences(ctx, "users", sibling));
  expect(await read()).toEqual([]);
  expect(await t.run(ctx => ctx.db.get("users", sibling))).toBeNull();
}));

test("a later transaction refusal rolls back both owner and edge updates", async () => withEpoch(async () => {
  const { t, userId, first } = await fixture();
  await expect(t.run(async ctx => {
    await patchWithMediaReferences(ctx, "users", userId, { avatarMediaId: first });
    expect((await ctx.db.query("media_reference_edges").collect())).toHaveLength(1);
    throw new Error("later validation refused");
  })).rejects.toThrow("later validation refused");
  expect(await t.run(ctx => ctx.db.query("media_reference_edges").collect())).toEqual([]);
  expect((await t.run(ctx => ctx.db.get("users", userId)))?.avatarMediaId).toBeUndefined();
}));

test("unavailable media is refused before either owner or reverse edge changes", async () => withEpoch(async () => {
  const { t, userId, first } = await fixture();
  await t.run(ctx => ctx.db.patch("media", first, { status: "trashed" }));
  expect(await errorCode(() => t.run(ctx => patchWithMediaReferences(ctx, "users", userId, { avatarMediaId: first })))).toBe("MEDIA_UNAVAILABLE");
  expect(await t.run(ctx => ctx.db.query("media_reference_edges").collect())).toEqual([]);
  expect((await t.run(ctx => ctx.db.get("users", userId)))?.avatarMediaId).toBeUndefined();
}));

test("a ready state from a different schema/writer version cannot claim absence", async () => withEpoch(async () => {
  const { t } = await fixture();
  const current = currentReferenceGeneration()!;
  await t.run(ctx => ctx.db.insert("media_reference_state", { key: "active", ...current, version: "obsolete-writer-version", status: "ready", ownerIndex: referenceTables.length, cursor: null, endCursor: null, pendingRanges: [], sequence: 1, pages: 1, documents: 0, startedAt: 1, updatedAt: 1 }));
  expect(await errorCode(() => t.run(ctx => requireReferenceIndexReady(ctx)))).toBe("MEDIA_INDEX_NOT_READY");
}));

test("opaque serialized and adjoining text references produce conservative edges", async () => withEpoch(async () => {
  const { t, userId, first, second } = await fixture();
  const owner = await t.run(ctx => insertWithMediaReferences(ctx, "settings", { section: "general", values: { serialized: JSON.stringify({ pluginImage: first }), text: `prefix${second}suffix` }, updatedBy: userId, updatedAt: 1 }));
  const edges = await t.run(ctx => ctx.db.query("media_reference_edges").withIndex("by_owner_generation", q => q.eq("ownerId", owner)).collect());
  expect(new Set(edges.map(edge => edge.mediaId))).toEqual(new Set([first, second]));
  expect(edges.every(edge => edge.references.some(reference => reference.opaque))).toBe(true);
}));

test("legacy authoring wrappers refuse canonical body edits before changing owner or edges", async () => withEpoch(async () => {
  const { t, userId, first } = await fixture();
  const postId = await t.run(ctx => ctx.db.insert("posts", { type: "post", title: "Canonical draft", slug: "canonical-draft", status: "draft", visibility: "public", authorId: userId, commentStatus: "closed", blocksVersion: 2, createdAt: 1, updatedAt: 1 }));
  expect(await errorCode(() => t.run(ctx => patchWithMediaReferences(ctx, "posts", postId, { title: "Unpermitted edit", featuredImageId: first })))).toBe("CANONICAL_AUTHORING_REQUIRED");
  expect((await t.run(ctx => ctx.db.get("posts", postId)))?.title).toBe("Canonical draft");
  expect(await t.run(ctx => ctx.db.query("media_reference_edges").collect())).toEqual([]);
  await t.run(ctx => patchWithMediaReferences(ctx, "posts", postId, { updatedAt: 2 }));
  expect((await t.run(ctx => ctx.db.get("posts", postId)))?.updatedAt).toBe(2);
}));


test("dynamic writes resolve actual owner identity and preserve nonowner writes", async () => withEpoch(async () => {
  const { t, userId, first } = await fixture();
  await t.run(ctx => patchDynamicWithMediaReferences(ctx, userId, { avatarMediaId: first }));
  expect((await t.run(ctx => ctx.db.query("media_reference_edges").collect()))[0]?.ownerId).toBe(userId);
  await t.run(ctx => patchDynamicWithMediaReferences(ctx, first, { title: "Media metadata update" }));
  expect((await t.run(ctx => ctx.db.get("media", first)))?.title).toBe("Media metadata update");
  expect(await t.run(ctx => ctx.db.query("media_reference_edges").collect())).toHaveLength(1);
  await t.run(ctx => deleteDynamicWithMediaReferences(ctx, userId));
  expect(await t.run(ctx => ctx.db.query("media_reference_edges").collect())).toEqual([]);
  expect(await t.run(ctx => ctx.db.get("users", userId))).toBeNull();
}));

test("dynamic owner patches cannot bypass unavailable media or canonical authoring fences", async () => withEpoch(async () => {
  const { t, userId, first } = await fixture();
  await t.run(ctx => ctx.db.patch("media", first, { status: "trashed" }));
  expect(await errorCode(() => t.run(ctx => patchDynamicWithMediaReferences(ctx, userId, { avatarMediaId: first })))).toBe("MEDIA_UNAVAILABLE");
  const postId = await t.run(ctx => ctx.db.insert("posts", { type: "post", title: "Canonical draft", slug: "dynamic-canonical-draft", status: "draft", visibility: "public", authorId: userId, commentStatus: "closed", blocksVersion: 2, createdAt: 1, updatedAt: 1 }));
  expect(await errorCode(() => t.run(ctx => patchDynamicWithMediaReferences(ctx, postId, { content: "legacy overwrite" })))).toBe("CANONICAL_AUTHORING_REQUIRED");
  expect((await t.run(ctx => ctx.db.get("posts", postId)))?.content).toBeUndefined();
  expect(await t.run(ctx => ctx.db.query("media_reference_edges").collect())).toEqual([]);
}));


test("canonical read ledger charges prior owner, media and reverse edges and rolls back at exhaustion", async () => withEpoch(async () => {
  const { t, userId, first } = await fixture();
  for (const queries of [1, 2]) {
    const ledger = new RequestReadLedger({ queries, documents: 100, bytes: 1024 * 1024, documentBytes: 512 * 1024 });
    expect(await errorCode(() => t.run(ctx => patchWithMediaReferences(ctx, "users", userId, { avatarMediaId: first }, undefined, ledger)))).toBe("CANONICAL_READ_BUDGET");
    expect(ledger.queries).toBe(queries);
    expect((await t.run(ctx => ctx.db.get("users", userId)))?.avatarMediaId).toBeUndefined();
    expect(await t.run(ctx => ctx.db.query("media_reference_edges").collect())).toEqual([]);
  }
  const ledger = new RequestReadLedger();
  await t.run(ctx => patchWithMediaReferences(ctx, "users", userId, { avatarMediaId: first }, undefined, ledger));
  expect(ledger.queries).toBe(3);
  expect(ledger.documents).toBe(2);
  expect(ledger.bytes).toBeGreaterThan(0);
}));

// Convex accepts legacy 22-character strings, including this real product slug,
// as IDs. convex-test uses synthetic IDs, so model that normalization explicitly.
function legacyNormalizer(ctx: any, aliases: Record<string, string>) {
  const original = ctx.db.normalizeId.bind(ctx.db);
  ctx.db.normalizeId = (table: string, value: string) => table === "media" && aliases[value] ? aliases[value] : original(table, value);
}

test("ordinary legacy-shaped prose saves without creating ghost media edges", async () => withEpoch(async () => {
  const { t, userId, first } = await fixture();
  await t.run(ctx => ctx.db.delete("media", first));
  const owner = await t.run(ctx => {
    legacyNormalizer(ctx, { pricingwindowacceptance: first });
    return insertWithMediaReferences(ctx, "settings", { section: "general", values: { slug: "pricingwindowacceptance" }, updatedBy: userId, updatedAt: 1 });
  });
  expect(await t.run(ctx => ctx.db.get("settings", owner))).not.toBeNull();
  expect(await t.run(ctx => ctx.db.query("media_reference_edges").collect())).toEqual([]);
}));

test("typed legacy and opaque canonical missing references remain refused", async () => withEpoch(async () => {
  const { assertMediaAttachments } = await import("../attachmentGuard");
  const { t, first } = await fixture();
  await t.run(ctx => ctx.db.delete("media", first));
  for (const value of [{ avatarMediaId: "pricingwindowacceptance" }, { avatarMediaId: first }]) {
    expect(await errorCode(() => t.run(ctx => {
      legacyNormalizer(ctx, { pricingwindowacceptance: first });
      return assertMediaAttachments(ctx, "users", value);
    }))).toBe("MEDIA_UNAVAILABLE");
  }
  expect(await errorCode(() => t.run(ctx => assertMediaAttachments(ctx, "settings", { values: { image: first } })))).toBe("MEDIA_UNAVAILABLE");
}));

test("real legacy media aliases maintain reverse edges and deletion evidence", async () => withEpoch(async () => {
  const { readIndexedReferences } = await import("../reverseIndex");
  const { t, userId, first } = await fixture();
  const owner = await t.run(ctx => {
    legacyNormalizer(ctx, { pricingwindowacceptance: first });
    return insertWithMediaReferences(ctx, "settings", { section: "general", values: { image: "pricingwindowacceptance", serialized: JSON.stringify({ image: "pricingwindowacceptance" }) }, updatedBy: userId, updatedAt: 1 });
  });
  const edges = await t.run(ctx => ctx.db.query("media_reference_edges").collect());
  expect(edges).toHaveLength(1);
  expect(edges[0].mediaId).toBe(first);
  expect(edges[0].references).toHaveLength(2);
  const current = currentReferenceGeneration()!;
  await t.run(ctx => ctx.db.insert("media_reference_state", { key: "active", ...current, status: "ready", ownerIndex: referenceTables.length, cursor: null, endCursor: null, pendingRanges: [], sequence: 1, pages: 1, documents: 1, startedAt: 1, updatedAt: 1 }));
  const result = await t.run(ctx => {
    legacyNormalizer(ctx, { pricingwindowacceptance: first });
    return readIndexedReferences(ctx, first);
  });
  expect(result?.references).toHaveLength(2);
  expect(result?.references.every(ref => ref.documentId === owner && ref.opaque)).toBe(true);
  await t.run(ctx => ctx.db.patch("media", first, { status: "trashed" }));
  expect(await errorCode(() => t.run(ctx => {
    legacyNormalizer(ctx, { pricingwindowacceptance: first });
    return patchWithMediaReferences(ctx, "settings", owner, { values: { image: "pricingwindowacceptance" } });
  }))).toBe("MEDIA_UNAVAILABLE");
}));

test("ambiguous legacy reads obey the canonical request ledger", async () => withEpoch(async () => {
  const { t, userId, first } = await fixture();
  const ledger = new RequestReadLedger({ queries: 1, documents: 100, bytes: 1024 * 1024, documentBytes: 512 * 1024 });
  expect(await errorCode(() => t.run(ctx => {
    legacyNormalizer(ctx, { pricingwindowacceptance: first });
    return insertWithMediaReferences(ctx, "settings", { section: "general", values: { image: "pricingwindowacceptance" }, updatedBy: userId, updatedAt: 1 }, undefined, ledger);
  }))).toBe("CANONICAL_READ_BUDGET");
  expect(ledger.queries).toBe(1);
  expect(await t.run(ctx => ctx.db.query("settings").collect())).toEqual([]);
  expect(await t.run(ctx => ctx.db.query("media_reference_edges").collect())).toEqual([]);
}));
