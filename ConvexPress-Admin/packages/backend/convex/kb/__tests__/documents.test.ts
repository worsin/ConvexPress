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
  "./convex/kb/contentMigration.ts": () => import("../contentMigration"),
  "./convex/kb/internals.ts": () => import("../internals"),
  "./convex/kb/mutations.ts": () => import("../mutations"),
  "./convex/kb/publicCounts.ts": () => import("../publicCounts"),
  "./convex/kb/queries.ts": () => import("../queries"),
  "./convex/kb/searchJobs.ts": () => import("../searchJobs"),
  "./convex/kb/searchJobWorker.ts": () => import("../searchJobWorker"),
  "./convex/kb/siteSetup.ts": () => import("../siteSetup"),
  "./convex/kb/templates.ts": () => import("../templates"),
  "./convex/kb/visibilityTransitions.ts": () => import("../visibilityTransitions"),
};

const ISSUER = "https://convexpress-admin.local";
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const docJson = (...content: unknown[]) => JSON.stringify({ type: "doc", content });

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const role = (slug: string, capabilities: string[]) =>
      ctx.db.insert("roles", { name: slug, slug, description: "Fixture", level: 50, type: "internal", status: "active", isDefault: false, isProtected: false, pageAccess: [], capabilities, createdAt: 1, updatedAt: 1 });
    const user = (email: string, roleId?: Id<"roles">) =>
      ctx.db.insert("users", { authSource: "local", email, emailVerified: true, status: "active", ...(roleId ? { roleId } : {}), createdAt: 1, updatedAt: 1 });
    const editor = await user("editor@example.invalid", await role("kb-editor", ["kb.view", "kb.create", "kb.edit", "kb.editOwn", "kb.publish", "kb.delete", "kb.manageTemplates"]));
    // Can edit any article but was never given kb.editOwn.
    const editorWithoutOwn = await user("any-editor@example.invalid", await role("kb-any-editor", ["kb.view", "kb.create", "kb.edit"]));
    const ownOnly = await user("own@example.invalid", await role("kb-own", ["kb.view", "kb.create", "kb.editOwn"]));
    await ctx.db.insert("settings", { section: "plugins", values: { knowledgeBaseEnabled: true, membershipEnabled: false }, updatedBy: editor, updatedAt: 1 });
    const category = await ctx.db.insert("kb_categories", { name: "Account", slug: "account", order: 0, isActive: true, isPublished: true, articleCount: 0, createdAt: 1, updatedAt: 1 });
    const image = await ctx.db.insert("media", {
      title: "Cases list", fileName: "cases.png", slug: "cases-png", url: "https://cdn.example.com/cases.png", mimeType: "image/png", fileSize: 1000, mediaType: "image",
      width: 1600, height: 900, altText: "The cases list", status: "active", uploadedBy: editor, createdAt: 1, updatedAt: 1,
    } as never);
    return { editor, editorWithoutOwn, ownOnly, category, image };
  });
  const as = (id: Id<"users">) => t.withIdentity({ subject: id, issuer: ISSUER });
  return { t, ids, editor: as(ids.editor), editorWithoutOwn: as(ids.editorWithoutOwn), ownOnly: as(ids.ownOnly) };
}

test("an HTML body is stored as a document; plain text, outline and safe HTML are derived", async () => {
  const f = await fixture();
  const articleId = await f.editor.mutation(api.kb.mutations.create, {
    title: "Filtering cases",
    categoryId: f.ids.category,
    content: `<p>The <strong>cases list</strong> filters by status.</p><h2>Statuses</h2><ul><li>Treating</li></ul><script>steal()</script><p><a href="javascript:x()">bad</a> <img src=x onerror=alert(1)></p>`,
  });
  const stored = await f.t.run((ctx) => ctx.db.get(articleId));
  expect(stored!.contentVersion).toBe(1);
  expect(JSON.parse(stored!.content).type).toBe("doc");
  expect(stored!.contentPlainText).toBe("The cases list filters by status.\nStatuses\nTreating\nbad");
  expect(stored!.outline).toEqual([{ id: "statuses", level: 2, text: "Statuses" }]);
  expect(stored!.excerpt).toBe("The cases list filters by status.");

  const admin = await f.editor.query(api.kb.queries.getById, { articleId });
  expect(admin!.html).toBe('<p>The <strong>cases list</strong> filters by status.</p><h2 id="statuses">Statuses</h2><ul><li>Treating</li></ul><p>bad</p>');
  expect(admin!.content).toBe(stored!.content);

  await f.editor.mutation(api.kb.mutations.publish, { articleId });
  const reader = await f.t.query(api.kb.queries.getBySlug, { slug: stored!.slug });
  expect(reader!.html).toBe(admin!.html);
  expect(reader!.outline).toEqual(stored!.outline!);
});

test("writers can't supply plain text", async () => {
  const f = await fixture();
  await expect(f.editor.mutation(api.kb.mutations.create, { title: "Spam", content: docJson(paragraph("real")), contentPlainText: "keyword stuffing" } as never)).rejects.toThrow(/contentPlainText/);
});

test("an author may edit their own article with either kb.edit or kb.editOwn", async () => {
  const f = await fixture();
  const own = await f.editorWithoutOwn.mutation(api.kb.mutations.create, { title: "Mine", content: docJson(paragraph("v1")) });
  await f.editorWithoutOwn.mutation(api.kb.mutations.update, { articleId: own, content: docJson(paragraph("v2")) });
  const ownOnly = await f.ownOnly.mutation(api.kb.mutations.create, { title: "Also mine", content: docJson(paragraph("v1")) });
  await f.ownOnly.mutation(api.kb.mutations.update, { articleId: ownOnly, title: "Also mine, renamed" });
  // kb.editOwn alone does not reach someone else's article.
  await expect(f.ownOnly.mutation(api.kb.mutations.update, { articleId: own, title: "Not mine" })).rejects.toThrow();
});

test("a published article keeps its address when retitled; an explicit slug change leaves a redirect", async () => {
  const f = await fixture();
  const articleId = await f.editor.mutation(api.kb.mutations.create, { title: "Billing basics", categoryId: f.ids.category, content: docJson(paragraph("How billing works.")) });
  await f.editor.mutation(api.kb.mutations.update, { articleId, title: "Billing basics (draft retitle)" });
  expect((await f.t.run((ctx) => ctx.db.get(articleId)))!.slug).toBe("billing-basics-draft-retitle");
  await f.editor.mutation(api.kb.mutations.publish, { articleId });
  await f.editor.mutation(api.kb.mutations.update, { articleId, title: "How billing works" });
  expect((await f.t.run((ctx) => ctx.db.get(articleId)))!.slug).toBe("billing-basics-draft-retitle");

  await f.editor.mutation(api.kb.mutations.update, { articleId, slug: "How Billing Works!" });
  const article = (await f.t.run((ctx) => ctx.db.get(articleId)))!;
  expect(article.slug).toBe("how-billing-works");
  const viaOld = await f.t.query(api.kb.queries.getBySlug, { slug: "billing-basics-draft-retitle" });
  expect(viaOld?._id).toBe(articleId);
  expect(viaOld?.slug).toBe("how-billing-works");

  const other = await f.editor.mutation(api.kb.mutations.create, { title: "Other", content: docJson(paragraph("x")) });
  await expect(f.editor.mutation(api.kb.mutations.update, { articleId: other, slug: "how-billing-works" })).rejects.toThrow(/already uses/);
  await expect(f.editor.mutation(api.kb.mutations.update, { articleId: other, slug: "!!!" })).rejects.toThrow(/letter or number/);
});

test("figures render from the media library; a body naming unusable media is refused", async () => {
  const f = await fixture();
  const figure = (mediaId: string) => ({ type: "figure", attrs: { mediaId, alt: "", caption: "Filters sit above the table", frame: "screenshot", size: "wide" } });
  const articleId = await f.editor.mutation(api.kb.mutations.create, { title: "Screens", categoryId: f.ids.category, content: docJson(figure(f.ids.image)) });
  await f.editor.mutation(api.kb.mutations.publish, { articleId });
  const slug = (await f.t.run((ctx) => ctx.db.get(articleId)))!.slug;
  const reader = await f.t.query(api.kb.queries.getBySlug, { slug });
  expect(reader!.html).toBe(
    '<figure class="kb-figure kb-figure--wide kb-figure--screenshot"><img src="https://cdn.example.com/cases.png" alt="The cases list" width="1600" height="900" loading="lazy" decoding="async"><figcaption>Filters sit above the table</figcaption></figure>',
  );

  // Trashed media disappears from the rendered article and can't be added again.
  await f.t.run((ctx) => ctx.db.patch(f.ids.image, { status: "trashed" } as never));
  expect((await f.t.query(api.kb.queries.getBySlug, { slug }))!.html).toBe("");
  await expect(f.editor.mutation(api.kb.mutations.update, { articleId, content: docJson(figure(f.ids.image), paragraph("again")) })).rejects.toThrow(/MEDIA_UNAVAILABLE|media/i);
  // An id from another table is not an image.
  await expect(f.editor.mutation(api.kb.mutations.create, { title: "Bad", content: docJson(figure(f.ids.category)) })).rejects.toThrow(/media library/);
});

test("links to another article point at it for readers who can see it, and are text otherwise", async () => {
  const f = await fixture();
  const target = await f.editor.mutation(api.kb.mutations.create, { title: "Refunds", categoryId: f.ids.category, content: docJson({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Partial refunds" }] }) });
  const link = { type: "paragraph", content: [{ type: "text", text: "See refunds", marks: [{ type: "link", attrs: { articleId: target, anchor: "partial-refunds" } }] }] };
  const source = await f.editor.mutation(api.kb.mutations.create, { title: "Billing", categoryId: f.ids.category, content: docJson(link) });
  await f.editor.mutation(api.kb.mutations.publish, { articleId: source });
  const sourceSlug = (await f.t.run((ctx) => ctx.db.get(source)))!.slug;
  expect((await f.t.run((ctx) => ctx.db.get(source)))!.linkedArticleIds).toEqual([target]);

  // The target is still a draft: readers get the words without the link.
  expect((await f.t.query(api.kb.queries.getBySlug, { slug: sourceSlug }))!.html).toBe("<p>See refunds</p>");
  await f.editor.mutation(api.kb.mutations.publish, { articleId: target });
  expect((await f.t.query(api.kb.queries.getBySlug, { slug: sourceSlug }))!.html).toBe(
    `<p><a href="/help/account/refunds#partial-refunds" data-kb-article="${target}" data-kb-anchor="partial-refunds">See refunds</a></p>`,
  );
});

test("each saved change keeps the previous text, and an unwritten excerpt follows the body", async () => {
  const f = await fixture();
  const articleId = await f.editor.mutation(api.kb.mutations.create, { title: "Steps", content: docJson(paragraph("First version.")) });
  await f.editor.mutation(api.kb.mutations.update, { articleId, content: docJson(paragraph("Second version.")), changeSummary: "Clarified" });
  await f.editor.mutation(api.kb.mutations.update, { articleId, keywords: ["steps"] });
  const versions = await f.editor.query(api.kb.queries.getVersions, { articleId });
  expect(versions.map((version) => [version.version, version.changeSummary, JSON.parse(version.content).content[0].content[0].text])).toEqual([[1, "Clarified", "First version."]]);
  const article = (await f.t.run((ctx) => ctx.db.get(articleId)))!;
  expect(article.version).toBe(2);
  expect(article.excerpt).toBe("Second version.");

  await f.editor.mutation(api.kb.mutations.update, { articleId, excerpt: "Written by hand." });
  await f.editor.mutation(api.kb.mutations.update, { articleId, content: docJson(paragraph("Third version.")) });
  expect((await f.t.run((ctx) => ctx.db.get(articleId)))!.excerpt).toBe("Written by hand.");
});

test("the migration converts legacy bodies once, keeps edits and setup receipts honest", async () => {
  const f = await fixture();
  const legacy = await f.t.run(async (ctx) => {
    const base = {
      excerpt: "", authorId: f.ids.editor, contributors: [], keywords: [], status: "published" as const, publishedAt: 1, viewCount: 0, uniqueViewCount: 0,
      helpfulVotes: 0, notHelpfulVotes: 0, readingTimeMinutes: 1, version: 1, isFeatured: false, sortOrder: 0, meilisearchSynced: true, ragSynced: true, createdAt: 1, updatedAt: 5,
    };
    const html = await ctx.db.insert("kb_articles", { ...base, title: "HTML", slug: "html", content: "<p>Old <em>HTML</em> body</p><h3>More</h3>", contentPlainText: "<p>Old <em>HTML</em> body</p>" });
    const tiptap = await ctx.db.insert("kb_articles", { ...base, title: "TipTap", slug: "tiptap", content: JSON.stringify({ type: "doc", content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Hi" }] }] }), contentPlainText: "Hi" });
    const plain = await ctx.db.insert("kb_articles", { ...base, title: "Plain", slug: "plain", excerpt: "Kept", content: "Line one\n\nLine two", contentPlainText: "Line one Line two" });
    return { html, tiptap, plain };
  });
  const result = await f.t.mutation(internal.kb.contentMigration.run, {});
  expect(result).toEqual({ articles: 3, templates: 0, done: true });
  const rows = await f.t.run(async (ctx) => Promise.all([legacy.html, legacy.tiptap, legacy.plain].map((id) => ctx.db.get(id))));
  for (const row of rows) {
    expect(row!.contentVersion).toBe(1);
    expect(row!.updatedAt).toBe(5);
  }
  expect(rows[0]!.contentPlainText).toBe("Old HTML body\nMore");
  expect(rows[0]!.meilisearchSynced).toBe(false);
  expect(rows[0]!.excerpt).toBe("Old HTML body");
  expect(rows[1]!.outline).toEqual([{ id: "hi", level: 2, text: "Hi" }]);
  expect(rows[2]!.excerpt).toBe("Kept");
  expect(await f.t.query(internal.kb.contentMigration.remaining, {})).toEqual({ legacyArticles: 0, version: 1 });
  // A second run finds nothing.
  expect(await f.t.mutation(internal.kb.contentMigration.run, {})).toEqual({ articles: 0, templates: 0, done: true });
});

test("normalizing a stored document again changes nothing", async () => {
  const f = await fixture();
  const articleId = await f.editor.mutation(api.kb.mutations.create, {
    title: "Idempotent",
    content: docJson(
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "A" }] },
      { type: "callout", attrs: { tone: "tip" }, content: [paragraph("Tip text")] },
      { type: "orderedList", attrs: { kind: "steps" }, content: [{ type: "listItem", content: [paragraph("One")] }] },
    ),
  });
  const first = (await f.t.run((ctx) => ctx.db.get(articleId)))!.content;
  await f.editor.mutation(api.kb.mutations.update, { articleId, content: first });
  const second = (await f.t.run((ctx) => ctx.db.get(articleId)))!;
  expect(second.content).toBe(first);
  expect(second.version).toBe(1);
});
