import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/settings/internals.ts": () => import("../../settings/internals"),
  "./convex/settings/queries.ts": () => import("../../settings/queries"),
  "./convex/kb/health.ts": () => import("../health"),
  "./convex/kb/helpContexts.ts": () => import("../helpContexts"),
  "./convex/kb/internals.ts": () => import("../internals"),
  "./convex/kb/mutations.ts": () => import("../mutations"),
  "./convex/kb/publicCounts.ts": () => import("../publicCounts"),
  "./convex/kb/queries.ts": () => import("../queries"),
  "./convex/kb/trustedConsumers.ts": () => import("../trustedConsumers"),
};

const ISSUER = "https://convexpress-admin.local";
const DAY = 24 * 60 * 60 * 1000;
const doc = (...content: unknown[]) => JSON.stringify({ type: "doc", content });
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const t = (text: string, ...marks: unknown[]) => ({ type: "text", text, ...(marks.length ? { marks } : {}) });

async function fixture() {
  const t0 = convexTest({ schema, modules });
  const ids = await t0.run(async (ctx) => {
    const role = (slug: string, capabilities: string[]) =>
      ctx.db.insert("roles", { name: slug, slug, description: "Fixture", level: 50, type: "internal", status: "active", isDefault: false, isProtected: false, pageAccess: [], capabilities, createdAt: 1, updatedAt: 1 });
    const user = (email: string, roleId: Id<"roles">) => ctx.db.insert("users", { authSource: "local", email, emailVerified: true, status: "active", roleId, createdAt: 1, updatedAt: 1 });
    const editor = await user("editor@example.invalid", await role("kb-editor", ["kb.view", "kb.create", "kb.edit", "kb.editOwn", "kb.publish", "kb.viewAnalytics", "kb.manageHelp"]));
    const writer = await user("writer@example.invalid", await role("kb-writer", ["kb.view", "kb.create", "kb.edit", "kb.editOwn"]));
    await ctx.db.insert("settings", { section: "plugins", values: { knowledgeBaseEnabled: true, membershipEnabled: false }, updatedBy: editor, updatedAt: 1 });
    const image = await ctx.db.insert("media", { title: "Shot", fileName: "s.png", slug: "s-png", url: "https://cdn.example.com/s.png", mimeType: "image/png", fileSize: 1, mediaType: "image", status: "active", uploadedBy: editor, createdAt: 1, updatedAt: 1 } as never);
    return { editor, writer, image };
  });
  const as = (id: Id<"users">) => t0.withIdentity({ subject: id, issuer: ISSUER });
  const editor = as(ids.editor);
  const publish = async (title: string, content = doc(p(t(`${title} body`)))) => {
    const articleId = await editor.mutation(api.kb.mutations.create, { title, content, visibility: "public" });
    await editor.mutation(api.kb.mutations.publish, { articleId });
    return articleId;
  };
  return { t: t0, ids, editor, writer: as(ids.writer), publish };
}

test("articles past their review date are due; a review or a rewrite clears them", async () => {
  const f = await fixture();
  const old = await f.publish("Old guide");
  const fresh = await f.publish("Fresh guide");
  await f.t.run((ctx) => ctx.db.patch(old, { publishedAt: Date.now() - 200 * DAY }));
  await f.editor.mutation(api.kb.mutations.update, { articleId: fresh, reviewIntervalDays: 30 });
  await f.t.run((ctx) => ctx.db.patch(fresh, { publishedAt: Date.now() - 31 * DAY }));
  const due = async () => (await f.editor.query(api.kb.health.report, {}))!.dueForReview.map((row) => row.title);
  expect(await due()).toEqual(["Old guide", "Fresh guide"]);
  await f.editor.mutation(api.kb.mutations.markReviewed, { articleId: old });
  await f.editor.mutation(api.kb.mutations.update, { articleId: fresh, content: doc(p(t("Rewritten."))) });
  expect(await due()).toEqual([]);
  await expect(f.editor.mutation(api.kb.mutations.update, { articleId: fresh, reviewIntervalDays: 0 })).rejects.toThrow(/1 to 3,650/);
  await f.editor.mutation(api.kb.mutations.update, { articleId: fresh, ownerId: f.ids.writer });
  expect((await f.t.run((ctx) => ctx.db.get(fresh)))!.ownerId).toBe(f.ids.writer);
});

test("articles readers mostly say didn't help come with their reasons", async () => {
  const f = await fixture();
  const weak = await f.publish("Weak guide");
  const reasons = ["outdated", "outdated", "unclear", "incomplete", "other", undefined] as const;
  for (const [index, reason] of reasons.entries()) {
    await f.t.mutation(internal.kb.trustedConsumers.recordHelpfulFeedback, { articleId: weak, sessionId: `s${index}`, isHelpful: false, ...(reason ? { reason } : {}), ...(index === 0 ? { comment: "Screens look different now" } : {}) });
  }
  await f.t.mutation(internal.kb.trustedConsumers.recordHelpfulFeedback, { articleId: weak, sessionId: "happy", isHelpful: true, reason: "outdated" });
  const report = (await f.editor.query(api.kb.health.report, {}))!;
  expect(report.notHelping).toEqual([{ _id: weak, title: "Weak guide", helpfulVotes: 1, notHelpfulVotes: 6, reasons: { outdated: 2, incorrect: 0, unclear: 1, incomplete: 1, other: 1 }, comments: ["Screens look different now"] }]);
  // A helpful vote carries no reason.
  expect((await f.t.run((ctx) => ctx.db.query("kb_articleFeedback").filter((q) => q.eq(q.field("sessionId"), "happy")).first()))!.reason).toBeUndefined();
});

test("failed searches, empty help spots, broken links and images without alt text are listed", async () => {
  const f = await fixture();
  await f.t.run(async (ctx) => {
    for (const [query, resultCount] of [["Lien reduction", 0], ["lien  reduction", 0], ["billing", 3], ["fax", 0]] as const) {
      await ctx.db.insert("kb_searchQueries", { query, resultCount, source: "convex", createdAt: Date.now() });
    }
    await ctx.db.insert("kb_searchQueries", { query: "ancient", resultCount: 0, source: "convex", createdAt: Date.now() - 40 * DAY });
  });
  await f.t.mutation(internal.kb.helpContexts.syncManifest, { surface: "doctor-portal", spots: [{ key: "doctor.cases.list", label: "Cases" }, { key: "doctor.fax", label: "Fax" }] });
  const draft = await f.editor.mutation(api.kb.mutations.create, { title: "Draft target", content: doc(p(t("x"))), helpContexts: ["doctor.fax"] });
  const covered = await f.publish("Covered", doc(p(t("See "), t("the draft", { type: "link", attrs: { articleId: draft } })), { type: "figure", attrs: { mediaId: f.ids.image, alt: "" } }));
  await f.editor.mutation(api.kb.mutations.update, { articleId: covered, helpContexts: ["doctor.cases.list"] });

  const report = (await f.editor.query(api.kb.health.report, {}))!;
  expect(report.failedSearches.map(({ query, count }) => [query, count])).toEqual([["lien  reduction", 2], ["fax", 1]]);
  expect(report.emptyHelpSpots.map((spot) => spot.key)).toEqual(["doctor.fax"]);
  expect(report.brokenLinks).toEqual([{ _id: covered, title: "Covered", targets: [{ _id: draft, title: "Draft target", problem: "unpublished" }] }]);
  expect(report.imagesWithoutAlt).toEqual([{ _id: covered, title: "Covered", figures: 1 }]);
  await expect(f.writer.query(api.kb.health.report, {})).rejects.toThrow();
});
