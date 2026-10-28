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
  "./convex/kb/categoryAccess.ts": () => import("../categoryAccess"),
  "./convex/kb/help.ts": () => import("../help"),
  "./convex/kb/helpContexts.ts": () => import("../helpContexts"),
  "./convex/kb/internals.ts": () => import("../internals"),
  "./convex/kb/mutations.ts": () => import("../mutations"),
  "./convex/kb/publicCounts.ts": () => import("../publicCounts"),
  "./convex/kb/queries.ts": () => import("../queries"),
  "./convex/kb/searchJobs.ts": () => import("../searchJobs"),
  "./convex/kb/searchJobWorker.ts": () => import("../searchJobWorker"),
  "./convex/kb/siteSetup.ts": () => import("../siteSetup"),
  "./convex/kb/visibilityTransitions.ts": () => import("../visibilityTransitions"),
};

const ISSUER = "https://convexpress-admin.local";
const doc = (...content: unknown[]) => JSON.stringify({ type: "doc", content });
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const t = (text: string, ...marks: unknown[]) => ({ type: "text", text, ...(marks.length ? { marks } : {}) });
const DOCTOR = { audiences: ["doctor"], includeInternal: true };
const STAFF = { audiences: ["staff"], includeInternal: true };
const VISITOR = { audiences: [], includeInternal: false };

async function fixture() {
  const t0 = convexTest({ schema, modules });
  const ids = await t0.run(async (ctx) => {
    const role = (slug: string, capabilities: string[]) =>
      ctx.db.insert("roles", { name: slug, slug, description: "Fixture", level: 50, type: "internal", status: "active", isDefault: false, isProtected: false, pageAccess: [], capabilities, createdAt: 1, updatedAt: 1 });
    const user = (email: string, roleId: Id<"roles">) => ctx.db.insert("users", { authSource: "local", email, emailVerified: true, status: "active", roleId, createdAt: 1, updatedAt: 1 });
    const editor = await user("editor@example.invalid", await role("kb-editor", ["kb.view", "kb.create", "kb.edit", "kb.editOwn", "kb.publish", "kb.delete", "kb.manageHelp"]));
    const writer = await user("writer@example.invalid", await role("kb-writer", ["kb.view", "kb.create", "kb.edit", "kb.editOwn", "kb.publish"]));
    await ctx.db.insert("settings", { section: "plugins", values: { knowledgeBaseEnabled: true, membershipEnabled: false }, updatedBy: editor, updatedAt: 1 });
    const category = await ctx.db.insert("kb_categories", { name: "Portal", slug: "portal", order: 0, isActive: true, isPublished: false, articleCount: 0, createdAt: 1, updatedAt: 1 });
    return { editor, writer, category };
  });
  const as = (id: Id<"users">) => t0.withIdentity({ subject: id, issuer: ISSUER });
  const editor = as(ids.editor);
  async function article(title: string, options: { visibility?: "public" | "internal"; audiences?: string[]; helpContexts?: string[]; body?: string; publish?: boolean; featured?: boolean } = {}) {
    const articleId = await editor.mutation(api.kb.mutations.create, {
      title,
      categoryId: ids.category,
      content: options.body ?? doc(p(t(`${title} body`))),
      visibility: options.visibility ?? "internal",
      ...(options.audiences ? { audiences: options.audiences } : {}),
      ...(options.helpContexts ? { helpContexts: options.helpContexts } : {}),
    });
    if (options.publish !== false) await editor.mutation(api.kb.mutations.publish, { articleId });
    if (options.featured) await editor.mutation(api.kb.mutations.toggleFeatured, { articleId });
    return articleId;
  }
  return { t: t0, ids, editor, writer: as(ids.writer), article };
}

test("a manifest registers spots; editors' summaries survive later syncs; prune removes dropped spots", async () => {
  const f = await fixture();
  const sync = (spots: Array<{ key: string; label: string; summary?: string; routeHint?: string }>, prune = false) =>
    f.t.mutation(internal.kb.helpContexts.syncManifest, { surface: "doctor-portal", spots, prune });
  expect(await sync([{ key: "doctor.cases.list", label: "Cases", summary: "Every case.", routeHint: "/cases" }, { key: "doctor.case.status", label: "Case status" }])).toEqual({ created: 2, updated: 0, unchanged: 0, pruned: 0 });
  await f.editor.mutation(api.kb.helpContexts.save, { key: "doctor.cases.list", label: "Cases list", summary: "All your practice's cases, newest first." });
  expect(await sync([{ key: "doctor.cases.list", label: "Cases list", summary: "Every case.", routeHint: "/cases" }, { key: "doctor.case.status", label: "Case status" }])).toEqual({ created: 0, updated: 0, unchanged: 2, pruned: 0 });
  expect((await f.t.query(internal.kb.help.spot, { key: "doctor.cases.list", ...DOCTOR })).spot?.summary).toBe("All your practice's cases, newest first.");
  expect(await sync([{ key: "doctor.cases.list", label: "Cases list", routeHint: "/cases" }], true)).toEqual({ created: 0, updated: 0, unchanged: 1, pruned: 1 });
  expect((await f.editor.query(api.kb.helpContexts.list, {})).map((spot) => spot.key)).toEqual(["doctor.cases.list"]);
  await expect(sync([{ key: "Not A Key", label: "x" }])).rejects.toThrow(/help spot key/);
});

test("a spot lists its readable articles in the editors' order", async () => {
  const f = await fixture();
  const first = await f.article("Filtering cases", { audiences: ["doctor"], helpContexts: ["doctor.cases.list"] });
  const second = await f.article("Case numbers", { helpContexts: ["doctor.cases.list"] });
  await f.article("Staff-only queue", { audiences: ["staff"], helpContexts: ["doctor.cases.list"] });
  await f.article("Draft guide", { helpContexts: ["doctor.cases.list"], publish: false });
  const titles = async (reader: typeof DOCTOR) => (await f.t.query(internal.kb.help.spot, { key: "doctor.cases.list", ...reader })).articles.map((a) => a.title);
  expect(await titles(DOCTOR)).toEqual(["Filtering cases", "Case numbers"]);
  expect(await titles(STAFF)).toEqual(["Case numbers", "Staff-only queue"]);
  expect(await titles(VISITOR)).toEqual([]);

  await f.editor.mutation(api.kb.helpContexts.setArticles, { key: "doctor.cases.list", articleIds: [second, first] });
  expect(await titles(DOCTOR)).toEqual(["Case numbers", "Filtering cases"]);
  // kb.manageHelp is needed to curate a spot; article editors set their own article's spots.
  await expect(f.writer.mutation(api.kb.helpContexts.setArticles, { key: "doctor.cases.list", articleIds: [first] })).rejects.toThrow();
  await f.writer.mutation(api.kb.mutations.update, { articleId: first, helpContexts: ["doctor.case.status"] });
  expect(await titles(DOCTOR)).toEqual(["Case numbers"]);
  expect((await f.editor.query(api.kb.helpContexts.forArticle, { articleId: first })).map((spot) => spot.key)).toEqual(["doctor.case.status"]);

  await f.editor.mutation(api.kb.mutations.remove, { articleId: second });
  expect(await titles(DOCTOR)).toEqual([]);
});

test("an article reads rendered, with in-panel links only to articles the reader can read", async () => {
  const f = await fixture();
  const staffOnly = await f.article("Staff queue", { audiences: ["staff"] });
  const target = await f.article("Statuses", { audiences: ["doctor"], body: doc({ type: "heading", attrs: { level: 2 }, content: [t("Treating")] }), helpContexts: ["doctor.case.status"] });
  const body = doc(
    p(t("See "), t("statuses", { type: "link", attrs: { articleId: target, anchor: "treating" } }), t(" and "), t("the queue", { type: "link", attrs: { articleId: staffOnly } }), t(".")),
  );
  const source = await f.article("Reading a case", { audiences: ["doctor"], body, helpContexts: ["doctor.case.status"] });
  const read = await f.t.query(internal.kb.help.article, { articleId: source, ...DOCTOR });
  expect(read?.html).toBe(`<p>See <a href="#kb-article/${target}/treating" data-kb-article="${target}" data-kb-anchor="treating">statuses</a> and the queue.</p>`);
  expect(read?.related.map((a) => a.title)).toEqual(["Statuses"]);
  expect(read?.spots).toEqual([]);
  await f.t.mutation(internal.kb.helpContexts.syncManifest, { surface: "doctor-portal", spots: [{ key: "doctor.case.status", label: "Case status" }] });
  expect((await f.t.query(internal.kb.help.article, { articleId: source, ...DOCTOR }))?.spots).toEqual([{ key: "doctor.case.status", label: "Case status" }]);
  expect(await f.t.query(internal.kb.help.article, { articleId: source, ...STAFF })).toBeNull();
  const slug = (await f.t.run((ctx) => ctx.db.get(source)))!.slug;
  expect((await f.t.query(internal.kb.help.article, { slug, ...DOCTOR }))?._id).toBe(source);
});

test("search finds titles first and only what the reader can read; suggestions start with featured", async () => {
  const f = await fixture();
  await f.article("Billing basics", { audiences: ["doctor"], body: doc(p(t("Invoices and the case ledger."))) });
  await f.article("Ledger reference", { audiences: ["doctor"], body: doc(p(t("Every column of the case ledger, explained."))), featured: true });
  await f.article("Ledger for staff", { audiences: ["staff"], body: doc(p(t("The staff ledger."))) });
  await f.article("Public ledger guide", { visibility: "public", body: doc(p(t("A public ledger article."))) });
  const titles = async (query: string, reader: typeof DOCTOR) => (await f.t.query(internal.kb.help.search, { query, ...reader })).map((a) => a.title);
  expect((await titles("ledger", DOCTOR))[0]).toBe("Ledger reference");
  expect(new Set(await titles("ledger", DOCTOR))).toEqual(new Set(["Ledger reference", "Public ledger guide", "Billing basics"]));
  expect(await titles("ledger", VISITOR)).toEqual(["Public ledger guide"]);
  expect(await titles("l", DOCTOR)).toEqual([]);
  expect((await f.t.query(internal.kb.help.suggestions, { ...DOCTOR }))[0]?.title).toBe("Ledger reference");
});

test("site setup writes internal help articles with audiences and spots, and leaves edited ones alone", async () => {
  const f = await fixture();
  const write = (title: string) =>
    f.t.mutation(internal.kb.siteSetup.writeArticle, {
      setupKey: "help:doctor:filtering",
      title,
      slug: "filtering-cases",
      excerpt: "",
      content: doc(p(t("Use the filters above the list."))),
      categoryId: f.ids.category,
      sortOrder: 0,
      actorId: f.ids.editor,
      visibility: "internal",
      audiences: ["doctor"],
      helpContexts: ["doctor.cases.list"],
    });
  const created = await write("Filtering cases");
  expect(created.outcome).toBe("created");
  expect((await f.t.query(internal.kb.help.spot, { key: "doctor.cases.list", ...DOCTOR })).articles.map((a) => a.title)).toEqual(["Filtering cases"]);
  expect(await f.t.query(internal.kb.help.spot, { key: "doctor.cases.list", ...STAFF })).toEqual({ spot: null, articles: [] });
  expect((await write("Filtering cases")).outcome).toBe("unchanged");
  await f.editor.mutation(api.kb.mutations.update, { articleId: created.articleId!, audiences: ["doctor", "staff"] });
  expect((await write("Filtering your cases")).outcome).toBe("kept_edited");
});
