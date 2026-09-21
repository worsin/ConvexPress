import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { patchWithMediaReferences } from "../attachmentGuard";
import { currentReferenceGeneration, readIndexedReferences } from "../reverseIndex";
import { MEDIA_REVERSE_EPOCH_VARIABLE } from "../reverseIndexVersion";
import { referenceTables } from "../referenceScan";
const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/media/reverseBackfill.ts": () => import("../reverseBackfill"),
  "./convex/media/referenceReads.ts": () => import("../referenceReads"),
  "./convex/media/mutations.ts": () => import("../mutations"),
  "./convex/settings/internals.ts": () => import("../../settings/internals"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
async function fixture(run: (f: Awaited<ReturnType<typeof seed>>) => Promise<void>) {
  const previous = process.env[MEDIA_REVERSE_EPOCH_VARIABLE];
  process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = "backfill_fixture_epoch_2026";
  try { await run(await seed()); } finally { if (previous === undefined) delete process.env[MEDIA_REVERSE_EPOCH_VARIABLE]; else process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = previous; }
}
async function seed() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const roleId = await ctx.db.insert("roles", { name: "Administrator", slug: "administrator", description: "Fixture", level: 100, type: "internal", status: "active", isDefault: false, isProtected: false, capabilities: ["manage_options", "media.delete"], pageAccess: [], createdAt: 1, updatedAt: 1 });
    const userId = await ctx.db.insert("users", { authSource: "local", email: "index@example.invalid", emailVerified: true, roleId, status: "active", createdAt: 1, updatedAt: 1 });
    const mediaId = await ctx.db.insert("media", { title: "Fixture", fileName: "fixture.png", slug: "fixture", url: "https://example.invalid/fixture", mimeType: "image/png", fileSize: 10, mediaType: "image", status: "active", uploadedBy: userId, createdAt: 1, updatedAt: 1 });
    return { userId, mediaId };
  });
  const operator = t.withIdentity({ subject: ids.userId, issuer: "https://convexpress-admin.local" });
  return { t, operator, ...ids };
}
async function complete(operator: Awaited<ReturnType<typeof seed>>["operator"]) {
  let progress = await operator.mutation(api.media.reverseBackfill.begin, {});
  for (let attempt = 0; progress.status === "building" && attempt < 200; attempt++) progress = await operator.mutation(api.media.reverseBackfill.step, { generation: progress.generation!, expectedSequence: progress.sequence });
  expect(progress.status).toBe("ready"); return progress;
}

test("actual resumable backfill covers a library above legacy scan limits; indexed remove needs no whole-owner scan", async () => fixture(async ({ t, operator, userId, mediaId }) => {
  await t.run(async ctx => { for (let i = 0; i < 300; i++) await ctx.db.insert("posts", { type: "post", title: `Unrelated ${i}`, slug: `unrelated-${i}`, status: "draft", visibility: "public", authorId: userId, commentStatus: "closed", createdAt: 1, updatedAt: 1 }); });
  const begun = await operator.mutation(api.media.reverseBackfill.begin, {});
  await expect(t.run(ctx => readIndexedReferences(ctx, mediaId))).rejects.toThrow("indexing must complete");
  const advanced = await operator.mutation(api.media.reverseBackfill.step, { generation: begun.generation!, expectedSequence: begun.sequence });
  expect(await operator.mutation(api.media.reverseBackfill.step, { generation: begun.generation!, expectedSequence: begun.sequence })).toEqual(advanced);
  const ready = await complete(operator);
  expect(ready.completedOwners).toBe(referenceTables.length);
  expect(ready.documents).toBeGreaterThanOrEqual(301);
  const budget = { rows: 0, bytes: 0, queries: 0 };
  expect((await t.run(ctx => readIndexedReferences(ctx, mediaId, budget)))?.references).toEqual([]);
  expect(budget.queries).toBe(2); expect(budget.rows).toBe(1);
  const result = await operator.mutation(api.media.mutations.remove, { mediaId });
  expect(result.success).toBe(true);
  expect((await t.run(ctx => ctx.db.get("media", mediaId)))?.status).toBe("trashed");
}));

test("completed index observes atomic new references and rejects corrupt or disappeared owner evidence", async () => fixture(async ({ t, operator, userId, mediaId }) => {
  await complete(operator);
  await t.run(ctx => patchWithMediaReferences(ctx, "users", userId, { avatarMediaId: mediaId }));
  expect((await t.run(ctx => readIndexedReferences(ctx, mediaId)))?.references).toMatchObject([{ documentId: userId, field: "avatarMediaId" }]);
  const edge = await t.run(ctx => ctx.db.query("media_reference_edges").first());
  await t.run(ctx => ctx.db.patch("media_reference_edges", edge!._id, { references: [] }));
  await expect(t.run(ctx => readIndexedReferences(ctx, mediaId))).rejects.toThrow("indexing must complete");
  await t.run(ctx => patchWithMediaReferences(ctx, "users", userId, { avatarMediaId: mediaId }));
  await t.run(ctx => ctx.db.patch("users", userId, { avatarMediaId: undefined }));
  await expect(t.run(ctx => readIndexedReferences(ctx, mediaId))).rejects.toThrow("indexing must complete");
}));

test("external import epoch invalidates a restored ready state before the next deletion and backfill restarts", async () => fixture(async ({ t, operator, mediaId }) => {
  const before = await complete(operator);
  process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = "new_import_epoch_2026";
  await expect(t.run(ctx => readIndexedReferences(ctx, mediaId))).rejects.toThrow("indexing must complete");
  const after = await operator.mutation(api.media.reverseBackfill.begin, {});
  expect(after.status).toBe("building"); expect(after.generation).not.toBe(before.generation); expect(after.sequence).toBe(0);
  await expect(operator.mutation(api.media.reverseBackfill.step, { generation: before.generation!, expectedSequence: before.sequence })).rejects.toThrow("current deployment generation");
  expect(currentReferenceGeneration()?.generation).toBe(after.generation!);
}));

test("an oversized owner's attachment fan-out blocks readiness and can resume after an explicit repair", async () => fixture(async ({ t, operator, userId, mediaId }) => {
  const setting = await t.run(async ctx => {
    const original = (await ctx.db.get("media", mediaId))!;
    const { _id, _creationTime, ...fields } = original;
    const attachments = [mediaId];
    for (let i = 0; i < 100; i++) attachments.push(await ctx.db.insert("media", { ...fields, slug: `fanout-${i}` }));
    return ctx.db.insert("settings", { section: "general", values: { attachments }, updatedBy: userId, updatedAt: 1 });
  });
  let progress = await operator.mutation(api.media.reverseBackfill.begin, {});
  for (let i = 0; progress.status === "building" && i < 200; i++) progress = await operator.mutation(api.media.reverseBackfill.step, { generation: progress.generation!, expectedSequence: progress.sequence });
  expect(progress.status).toBe("blocked"); expect(progress.errorCode).toBe("MEDIA_INDEX_OWNER_BUDGET");
  await expect(t.run(ctx => readIndexedReferences(ctx, mediaId))).rejects.toThrow("indexing must complete");
  await t.run(ctx => patchWithMediaReferences(ctx, "settings", setting, { values: { attachments: [mediaId] } }));
  const resumed = await operator.mutation(api.media.reverseBackfill.step, { generation: progress.generation!, expectedSequence: progress.sequence });
  expect(resumed.status).toBe("building");
  await complete(operator);
  expect((await t.run(ctx => readIndexedReferences(ctx, mediaId)))?.references.some(ref => ref.documentId === setting)).toBe(true);
}));

test("obsolete generation cleanup is bounded, retry-safe, and preserves current refs/content", async () => fixture(async ({ t, operator, userId, mediaId }) => {
  await t.run(ctx => patchWithMediaReferences(ctx, "users", userId, { avatarMediaId: mediaId }));
  const ready = await complete(operator);
  await t.run(async ctx => { for (let i = 0; i < 19; i++) await ctx.db.insert("media_reference_edges", { generation: i % 2 ? "aaa-obsolete" : "zzz-obsolete", mediaId, ownerId: userId, ownerTable: "users", references: [], updatedAt: 1 }); });
  let result = await operator.mutation(api.media.reverseBackfill.cleanupObsolete, { generation: ready.generation! });
  expect(result.deleted).toBe(8); expect(result.remaining).toBe(true);
  let deleted = result.deleted;
  for (let i = 0; result.remaining && i < 10; i++) { result = await operator.mutation(api.media.reverseBackfill.cleanupObsolete, { generation: ready.generation! }); deleted += result.deleted; expect(result.deleted).toBeLessThanOrEqual(8); }
  expect(deleted).toBe(19); expect(result).toEqual({ deleted: 0, remaining: false });
  expect((await t.run(ctx => ctx.db.query("media_reference_edges").collect()))).toHaveLength(1);
  expect((await t.run(ctx => ctx.db.get("users", userId)))?.avatarMediaId).toBe(mediaId);
  await expect(operator.mutation(api.media.reverseBackfill.cleanupObsolete, { generation: "old-review" })).rejects.toThrow("Refresh current index progress");
}));

test("registered progress cannot advertise ready with an unfinished range and unauthenticated maintenance cannot write", async () => fixture(async ({ t, operator, mediaId }) => {
  await expect(t.mutation(api.media.reverseBackfill.begin, {})).rejects.toThrow();
  expect(await t.run(ctx => ctx.db.query("media_reference_state").collect())).toEqual([]);
  const ready = await complete(operator);
  const state = await t.run(ctx => ctx.db.query("media_reference_state").unique());
  await t.run(ctx => ctx.db.patch("media_reference_state", state!._id, { pendingRanges: [{ cursor: "unread", endCursor: null }] }));
  expect((await operator.query(api.media.reverseBackfill.status, {})).status).toBe("blocked");
  await expect(t.run(ctx => readIndexedReferences(ctx, mediaId))).rejects.toThrow("indexing must complete");
  await expect(t.mutation(api.media.reverseBackfill.cleanupObsolete, { generation: ready.generation! })).rejects.toThrow();
  expect((await t.run(ctx => ctx.db.get("media_reference_state", state!._id)))?.pendingRanges).toEqual([{ cursor: "unread", endCursor: null }]);
}));

test("import-in-progress external epoch makes real status visibly blocked and forbids begin, step, deletion and attachment writes", async () => fixture(async ({ t, operator, userId, mediaId }) => {
  const ready = await complete(operator);
  process.env[MEDIA_REVERSE_EPOCH_VARIABLE] = `mi_pending_${"a".repeat(24)}_${"b".repeat(32)}_knownimport`;
  expect(await operator.query(api.media.reverseBackfill.status, {})).toMatchObject({ status: "blocked", generation: null, errorCode: "MEDIA_INDEX_IMPORT_IN_PROGRESS" });
  await expect(operator.mutation(api.media.reverseBackfill.begin, {})).rejects.toThrow("Snapshot import is unresolved");
  await expect(operator.mutation(api.media.reverseBackfill.step, { generation: ready.generation!, expectedSequence: ready.sequence })).rejects.toThrow("Snapshot import is unresolved");
  await expect(operator.mutation(api.media.mutations.remove, { mediaId })).rejects.toThrow("Snapshot import is unresolved");
  await expect(t.run(ctx => patchWithMediaReferences(ctx, "users", userId, { avatarMediaId: mediaId }))).rejects.toThrow("Snapshot import is unresolved");
  expect((await t.run(ctx => ctx.db.get("users", userId)))?.avatarMediaId).toBeUndefined();
  expect((await t.run(ctx => ctx.db.get("media", mediaId)))?.status).toBe("active");
}));
