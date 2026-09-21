import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { courseCatalogEntries, courseCatalogIsReady } from "../courseCatalog";
import { rebuildCourseCatalog } from "../courseCatalogRecovery";
import { readCourseCatalogPage } from "../courseCatalogReader";
import { insertWithMediaReferences, patchWithMediaReferences, replaceWithMediaReferences, deleteWithMediaReferences, insertDynamicWithMediaReferences, patchDynamicWithMediaReferences, deleteDynamicWithMediaReferences } from "../../media/attachmentGuard";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { write as writePromoted } from "../../contentPromotion/shared";
const modules = { "./convex/_generated/api.js": () => import("../../_generated/api.js"), "./convex/_generated/server.js": () => import("../../_generated/server.js") };
const scope = { websiteKey: "school", instanceKey: "staging" };
async function fixture(count = 0) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { authSource: "local", email: "catalog@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const setting = await ctx.db.insert("settings", { section: "plugins", values: { lmsEnabled: true }, updatedBy: user, updatedAt: 1 });
    const courses = [];
    for (let i = 0; i < count; i++) courses.push(await ctx.db.insert("lms_courses", { title: `Course ${i}`, slug: `course-${i}`, status: "published", authorId: user, categoryIds: i % 2 ? ["Ceramics", "ceramics"] : ["Wood"], createdAt: Math.floor(i / 3), updatedAt: 1 }));
    return { user, setting, courses };
  });
  return { t, ids, read: (args: unknown = {}, bind = scope, document = "page") => t.run(ctx => readCourseCatalogPage(ctx, args, bind, document)) };
}

test("course catalog recovery is bounded, resumable, idempotent and never serves a partial index", async () => {
  const { t, read } = await fixture(27);
  expect((await read()).state).toBe("preparing");
  expect(await t.run(rebuildCourseCatalog)).toEqual({ processed: 10, done: false });
  expect((await read()).state).toBe("preparing");
  expect(await t.run(rebuildCourseCatalog)).toEqual({ processed: 10, done: false });
  expect(await t.run(rebuildCourseCatalog)).toEqual({ processed: 7, done: true });
  expect(await t.run(rebuildCourseCatalog)).toEqual({ processed: 0, done: true });
  expect(await t.run(ctx => courseCatalogIsReady(ctx))).toBe(true);
  expect((await read()).courses).toHaveLength(6);
});

test("course catalog traverses more than 500 courses and indexed categories without duplicate ties", async () => {
  const { t, ids, read } = await fixture(517);
  while (!(await t.run(rebuildCourseCatalog)).done) { /* Each call is a separate bounded transaction. */ }
  for (const category of [undefined, "CERAMICS", "wood", "missing"]) {
    const seen: string[] = []; let cursor: string | null = null;
    do { const page = await read({ category, limit: 23, cursor }); expect(page.courses.length).toBeLessThanOrEqual(23); seen.push(...page.courses.map(c => c._id)); cursor = page.nextCursor; } while (cursor);
    const expected = await t.run(async ctx => (await ctx.db.query("lms_course_catalog").withIndex("by_selection_created", q => q.eq("kind", category ? "category" : "recent").eq("key", category?.toLowerCase() ?? "")).order("desc").collect()).map(row => row.courseId));
    expect(seen).toEqual(expected); expect(new Set(seen).size).toBe(seen.length);
    if (!category) expect(seen).toHaveLength(ids.courses.length);
  }
});

test("all typed and dynamic course writes keep category, lifecycle and deletion coordinates atomic", async () => {
  const { t, ids, read } = await fixture();
  const value = { title: "Workshop", slug: "workshop", status: "published" as const, authorId: ids.user, categoryIds: ["Wood"], createdAt: 1, updatedAt: 1 };
  const id = await t.run(ctx => insertWithMediaReferences(ctx, "lms_courses", value));
  expect((await read({ category: "wood" })).courses.map(c => c._id)).toEqual([id]);
  await t.run(ctx => patchWithMediaReferences(ctx, "lms_courses", id, { categoryIds: ["Clay"], createdAt: 2 }));
  expect((await read({ category: "wood" })).courses).toEqual([]);
  expect((await read({ category: "clay" })).courses[0]._id).toBe(id);
  await t.run(ctx => replaceWithMediaReferences(ctx, "lms_courses", id, { ...value, status: "archived" }));
  expect((await read()).courses).toEqual([]);
  await t.run(ctx => patchWithMediaReferences(ctx, "lms_courses", id, { status: "published" }));
  expect((await read()).courses).toHaveLength(1);
  await t.run(ctx => deleteWithMediaReferences(ctx, "lms_courses", id));
  const dynamic = await t.run(ctx => insertDynamicWithMediaReferences(ctx, "lms_courses", value));
  await t.run(ctx => patchDynamicWithMediaReferences(ctx, dynamic, { categoryIds: ["Paper"] }));
  expect((await read({ category: "paper" })).courses).toHaveLength(1);
  await t.run(ctx => deleteDynamicWithMediaReferences(ctx, dynamic));
  expect((await read()).courses).toEqual([]);
  expect(await t.run(ctx => ctx.db.query("lms_course_catalog").collect())).toEqual([]);
});

test("course pagination refuses foreign cursors and respects plugin withdrawal and real read budgets", async () => {
  const { t, ids, read } = await fixture(7); await t.run(rebuildCourseCatalog);
  const first = await read({ limit: 2 }); expect(first.nextCursor).not.toBeNull();
  for (const [args, bind, document] of [[{ limit: 3 }, scope, "page"], [{ limit: 2, category: "wood" }, scope, "page"], [{ limit: 2 }, { ...scope, instanceKey: "live" }, "page"], [{ limit: 2 }, scope, "other"]] as const)
    await expect(read({ ...args, cursor: first.nextCursor }, bind, document)).rejects.toThrow("Course cursor belongs");
  await t.run(ctx => ctx.db.patch(ids.courses[0], { status: "draft" })); // Simulate a stale coordinate after a raw import.
  const page = await read({ limit: 48 }); expect(page.courses.some(c => c._id === ids.courses[0])).toBe(false);
  await expect(t.run(ctx => readCourseCatalogPage(ctx, {}, scope, "page", new RequestReadLedger({ queries: 2, documents: 20, bytes: 10000, documentBytes: 10000 })))).rejects.toThrow("safe read budget");
  await t.run(ctx => ctx.db.patch(ids.setting, { values: { lmsEnabled: false } }));
  expect((await read()).courses).toEqual([]);
});

test("invalid oversized category changes refuse atomically instead of dropping assignments", async () => {
  const { t, ids, read } = await fixture();
  const value = { title: "Workshop", slug: "workshop", status: "published" as const, authorId: ids.user, categoryIds: ["Wood"], createdAt: 1, updatedAt: 1 };
  const id = await t.run(ctx => insertWithMediaReferences(ctx, "lms_courses", value));
  await expect(t.mutation(async ctx => patchWithMediaReferences(ctx, "lms_courses", id, { categoryIds: Array.from({ length: 65 }, (_, i) => `category-${i}`) }))).rejects.toThrow("64 category");
  expect((await read({ category: "wood" })).courses[0].categoryIds).toEqual(["Wood"]);
  expect(() => courseCatalogEntries({ ...value, categoryIds: [""] })).toThrow("nonempty");
  expect(() => courseCatalogEntries({ ...value, createdAt: NaN })).toThrow("timestamp");
});

test("promotion insert and updates rebuild local category coordinates without imported index identities", async () => {
  const { t, ids, read } = await fixture();
  const value = { title: "Promoted workshop", slug: "promoted-workshop", status: "published", authorId: ids.user, categoryIds: ["Wood"], createdAt: 1, updatedAt: 1 };
  const id = await t.run(ctx => writePromoted(ctx, "course", null, value));
  expect((await read({ category: "wood" })).courses.map(c => c._id)).toEqual([id]);
  await t.run(ctx => writePromoted(ctx, "course", id, { categoryIds: ["Paper"] }));
  expect((await read({ category: "wood" })).courses).toEqual([]);
  expect((await read({ category: "paper" })).courses.map(c => c._id)).toEqual([id]);
  await t.run(ctx => writePromoted(ctx, "course", id, { status: "archived" }));
  expect((await read()).courses).toEqual([]);
});
