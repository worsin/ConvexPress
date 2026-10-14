import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { LegacyDocumentImportArgs } from "../legacyImportContracts";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/canonicalDocuments.ts": () => import("../../canonicalDocuments"),
  "./convex/canonicalDocuments/legacyImport.ts": () => import("../legacyImport"),
  "./convex/emails/internals.ts": () => import("../../emails/internals"),
  "./convex/posts/internals.ts": () => import("../../posts/internals"),
  "./convex/posts/authorCounts.ts": () => import("../../posts/authorCounts"),
  "./convex/syncedBlocks/legacy.ts": () => import("../../syncedBlocks/legacy"),
  "./convex/settings/queries.ts": () => import("../../settings/queries"),
  "./convex/blocks/queries.ts": () => import("../../blocks/queries"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};
const ORIGINAL_DATE = Date.UTC(2023, 4, 17, 14, 30);

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const role = (slug: string, capabilities: string[]) => ctx.db.insert("roles", {
      name: slug, slug, description: "Fixture", level: 80, type: "internal", isDefault: false, isProtected: false,
      capabilities, pageAccess: [], status: "active", createdAt: 1, updatedAt: 1,
    });
    const editor = await role("editor", ["post.create", "page.create", "post.publish", "page.publish", "page.set_parent"]);
    const contributor = await role("contributor", ["post.create", "page.create"]);
    const user = (email: string, roleId: Id<"roles">, extra: { status?: "active" | "inactive" | "banned"; authSource?: "local" | "management" } = {}) =>
      ctx.db.insert("users", { authSource: extra.authSource ?? "local", email, emailVerified: true, roleId, status: extra.status ?? "active", createdAt: 1, updatedAt: 1 });
    const author = await user("author@example.invalid", editor);
    const drafter = await user("drafter@example.invalid", contributor);
    const inactive = await user("inactive@example.invalid", editor, { status: "inactive" });
    const banned = await user("banned@example.invalid", editor, { status: "banned" });
    const management = await user("operator@example.invalid", editor, { authSource: "management" });
    await ctx.db.insert("convexpress_siteIdentity", {
      identityKey: "site-identity", websiteKey: "fixture", instanceKey: "fixture-stage", environmentKind: "staging",
      deploymentOrigin: "https://fixture.convex.cloud", managementOrigin: "https://fixture.convex.site", siteOrigin: "https://fixture.example.invalid",
      siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("settings", { section: "plugins", values: { membershipEnabled: false }, updatedAt: 1, updatedBy: author });
    await ctx.db.insert("settings", {
      section: "appearance.template", values: { active: "core", overrides: {}, variants: {}, settings: {} },
      legacyAppearanceMigration: { version: 2, migratedAt: 1 }, updatedAt: 1, updatedBy: author,
    });
    const media = await ctx.db.insert("media", {
      title: "Clinic", slug: "clinic", fileName: "clinic.jpg", mimeType: "image/jpeg", mediaType: "image", fileSize: 100,
      url: "https://images.example.invalid/clinic.jpg", altText: "Clinic entrance", status: "active", uploadedBy: author, createdAt: 1, updatedAt: 1,
    });
    return { author, drafter, inactive, banned, management, media };
  });
  const importDocument = (args: LegacyDocumentImportArgs) => t.mutation(internal.canonicalDocuments.legacyImport.importLegacyDocument, args);
  const state = () => t.run(async (ctx) => ({
    posts: await ctx.db.query("posts").collect(),
    meta: await ctx.db.query("postMeta").collect(),
    events: await ctx.db.query("events").collect(),
  }));
  const post = (id: Id<"posts">) => t.run(async (ctx) => (await ctx.db.get("posts", id))!);
  const meta = (id: Id<"posts">, key: string) => t.run(async (ctx) => (await ctx.db.query("postMeta").withIndex("by_post_key", (q) => q.eq("postId", id).eq("key", key)).unique())?.value);
  return { t, ids, importDocument, state, post, meta };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const tiptap = (...content: unknown[]) => JSON.stringify({ type: "doc", content });
const text = (value: string, marks?: { type: string }[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const blogPost = (f: Fixture, patch: Partial<LegacyDocumentImportArgs> = {}): LegacyDocumentImportArgs => ({
  type: "post", title: "Why records matter", slug: "why-records-matter", status: "publish", publishedAt: ORIGINAL_DATE,
  authorId: f.ids.author, sourceRef: "fixture:post-1",
  source: { contentMode: "article", content: tiptap({ type: "heading", attrs: { level: 2 }, content: [text("Records")] }, { type: "paragraph", content: [text("Complete records ", [{ type: "bold" }]), text("shorten every case.")] }) },
  ...patch,
});
const createdId = (result: Awaited<ReturnType<Fixture["importDocument"]>>) => {
  if (!result.ok || !result.created) throw new Error(`Expected a created document, received ${JSON.stringify(result)}`);
  return result.postId;
};

test("a legacy blocks page keeps its blocks, reports inactive settings and archives the exact source", async () => {
  const f = await fixture();
  const blocks = [
    { id: "intro-heading", name: "core/heading", version: 1, attrs: { text: "Our services", level: 2 }, layout: { tone: "muted" as const } },
    { id: "locked-heading", name: "core/heading", version: 1, attrs: { text: "Record retrieval", level: 3 }, lock: { remove: true } },
  ];
  const args: LegacyDocumentImportArgs = {
    type: "page", title: "Services", slug: "services", status: "publish", publishedAt: ORIGINAL_DATE, authorId: f.ids.author,
    featuredImageId: f.ids.media, menuOrder: 2, sourceRef: "fixture:page-services",
    source: { contentMode: "blocks", blocks, content: "Hidden article text from an earlier mode" },
  };
  const result = await f.importDocument(args);
  expect(result).toEqual({
    ok: true, postId: createdId(result), created: true,
    inactiveSettings: [
      { blockId: "intro-heading", name: "core/heading", layout: { tone: "muted" } },
      { blockId: "locked-heading", name: "core/heading", lock: { remove: true } },
    ],
  });
  const page = await f.post(createdId(result));
  expect(page).toMatchObject({ type: "page", title: "Services", slug: "services", path: "/services", depth: 0, menuOrder: 2, status: "publish", publishedAt: ORIGINAL_DATE, featuredImageId: f.ids.media, blocksVersion: 2, blocksRevision: 1, authorId: f.ids.author });
  expect(page.blocks?.map((block) => block.id)).toEqual(["intro-heading", "locked-heading"]);
  for (const key of ["content", "contentMode", "pageSections"]) expect(Object.hasOwn(page, key)).toBe(false);
  const serialized = JSON.stringify(page.blocks);
  expect(serialized).toContain("Record retrieval");
  expect(serialized).not.toContain("Hidden article text");
  expect(serialized).not.toContain("muted");
  // The original stays recoverable, including the hidden body and inactive settings.
  const archive = JSON.parse((await f.meta(page._id, "_convexpress_legacy_source"))!);
  expect(archive).toEqual({ ...args, hasPassword: false });
  const rendered = await f.t.query(api.canonicalDocuments.getForRender, { postId: page._id });
  expect(rendered?.state).toBe("ready");
  if (rendered?.state === "ready") expect(rendered.document.blocks).toEqual(page.blocks!);
});

test("a sections page converts its visible sections and nests under an imported parent", async () => {
  const f = await fixture();
  const parent = createdId(await f.importDocument({
    type: "page", title: "Services", slug: "services", status: "draft", authorId: f.ids.author, sourceRef: "fixture:page-services",
    source: { contentMode: "blocks", pageSectionsJson: "[]" },
  }));
  expect((await f.post(parent)).blocks).toEqual([]);
  const sections = [{ id: "saved-section", type: "rich-text", data: { heading: "Visible section", body: "Original section body" } }];
  const result = await f.importDocument({
    type: "page", title: "Record retrieval", slug: "record-retrieval", status: "draft", authorId: f.ids.author, parentId: parent,
    pageTemplate: "default", sourceRef: "fixture:page-records", source: { contentMode: "blocks", blocks: [], pageSectionsJson: JSON.stringify(sections), content: "Hidden fallback" },
  });
  expect(result).toEqual({ ok: true, postId: createdId(result), created: true });
  const page = await f.post(createdId(result));
  expect(page).toMatchObject({ parentId: parent, path: "/services/record-retrieval", depth: 1, status: "draft", pageTemplate: "default" });
  expect(page.publishedAt).toBeUndefined();
  expect(page.blocks?.map((block) => block.id)).toEqual(["saved-section"]);
  expect(JSON.stringify(page.blocks)).toContain("Original section body");
  expect(JSON.stringify(page.blocks)).not.toContain("Hidden fallback");
});

test("an HTML post with a bullet list is imported as canonical lists and keeps its original publication date", async () => {
  const f = await fixture();
  const result = await f.importDocument(blogPost(f, {
    excerpt: "How we work.", commentStatus: "closed", featuredImageId: f.ids.media,
    source: { contentMode: "article", content: "<p>Our <strong>approach</strong>:</p><ul><li><strong>Records</strong> retrieved</li><li>Summaries written</li></ul>" },
  }));
  expect(result).toEqual({ ok: true, postId: createdId(result), created: true, importedContent: "html" });
  const post = await f.post(createdId(result));
  expect(post).toMatchObject({ type: "post", slug: "why-records-matter", status: "publish", publishedAt: ORIGINAL_DATE, excerpt: "How we work.", commentStatus: "closed", featuredImageId: f.ids.media, authorId: f.ids.author });
  expect(post.blocks?.map((block) => block.name)).toEqual(["core/paragraph", "core/list"]);
  const serialized = JSON.stringify(post.blocks);
  for (const value of ["approach", "Records", "Summaries written", "\"bold\""]) expect(serialized).toContain(value);
  const rendered = await f.t.query(api.canonicalDocuments.getForRender, { postId: post._id });
  expect(rendered?.state).toBe("ready");
});

test("a TipTap JSON post converts without an import notice and publication events carry the original date", async () => {
  const f = await fixture();
  const result = await f.importDocument(blogPost(f));
  expect(result).toEqual({ ok: true, postId: createdId(result), created: true });
  const post = await f.post(createdId(result));
  expect(post.blocks?.map((block) => block.name)).toEqual(["core/heading", "core/paragraph"]);
  expect(JSON.stringify(post.blocks)).toContain("shorten every case.");
  expect(post.publishedAt).toBe(ORIGINAL_DATE);
  const events = (await f.state()).events;
  const created = events.find((event) => event.code === "post.created");
  const published = events.find((event) => event.code === "post.published");
  expect(JSON.parse(created!.payload)).toMatchObject({ postId: post._id, authorId: f.ids.author, status: "publish" });
  expect(JSON.parse(published!.payload)).toMatchObject({ postId: post._id, authorId: f.ids.author, publishedAt: ORIGINAL_DATE, url: "/blog/why-records-matter", imported: true });
});

test("the author is the actor: capabilities are checked and inactive or management authors are refused without writes", async () => {
  const f = await fixture();
  const before = await f.state();
  for (const authorId of [f.ids.inactive, f.ids.banned, f.ids.management]) {
    await expect(f.importDocument(blogPost(f, { authorId }))).rejects.toMatchObject({ data: { code: "IMPORT_AUTHOR_INVALID" } });
  }
  await expect(f.importDocument(blogPost(f, { authorId: f.ids.drafter }))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  expect(await f.state()).toEqual(before);
  const draft = createdId(await f.importDocument(blogPost(f, { authorId: f.ids.drafter, status: "draft", publishedAt: undefined })));
  expect(await f.post(draft)).toMatchObject({ authorId: f.ids.drafter, status: "draft" });
});

test("a repeated sourceRef returns the created document and changes nothing", async () => {
  const f = await fixture();
  const args = blogPost(f);
  const postId = createdId(await f.importDocument(args));
  const receipt = JSON.parse((await f.meta(postId, "_convexpress_legacy_import:fixture:post-1"))!);
  expect(receipt).toMatchObject({ contract: "convexpress-legacy-import-v1", sourceRef: "fixture:post-1" });
  expect(receipt.requestDigest).toMatch(/^[a-f0-9]{64}$/u);
  const before = await f.state();
  expect(await f.importDocument(args)).toEqual({ ok: true, postId, created: false, sourceChanged: false });
  expect(await f.importDocument({ ...args, title: "Edited at the source", source: { contentMode: "article", content: "<p>Changed</p>" } })).toEqual({ ok: true, postId, created: false, sourceChanged: true });
  expect(await f.state()).toEqual(before);
  await expect(f.importDocument({ ...args, type: "page" })).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  expect(await f.state()).toEqual(before);
});

test("content the converters cannot represent is returned as a refusal with its path, and nothing is written", async () => {
  const f = await fixture();
  const before = await f.state();
  const refusals: [LegacyDocumentImportArgs["source"], LegacyDocumentImportArgs["type"], (string | number)[]][] = [
    [{ contentMode: "blocks", blocks: [{ id: "h", name: "core/heading", version: 1, attrs: { text: "Title", level: 2, mystery: "kept somewhere" } }] }, "page", ["blocks", 0, "attrs", "mystery"]],
    [{ contentMode: "blocks", pageSectionsJson: "[{\"id\":" }, "page", ["pageSections"]],
    [{ contentMode: "blocks", pageSectionsJson: JSON.stringify([{ id: "s", type: "rich-text", data: { heading: "H", future: "field" } }]) }, "page", ["pageSections", 0, "data", "future"]],
    [{ contentMode: "article", content: "<p>Intro</p><iframe src=\"https://unreviewed.invalid\"></iframe>" }, "post", ["content"]],
    [{ contentMode: "article", content: tiptap({ type: "image", attrs: { src: "https://images.example.invalid/x.png" } }) }, "post", ["content", 0]],
  ];
  for (const [source, type, path] of refusals) {
    const result = await f.importDocument({ ...blogPost(f, { type, slug: "refused", status: "draft", publishedAt: undefined }), source });
    expect(result).toMatchObject({ ok: false, code: "LEGACY_CONVERSION_REQUIRED", path });
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  }
  expect(await f.state()).toEqual(before);
});

test("imports keep the source route and publication time or refuse them", async () => {
  const f = await fixture();
  createdId(await f.importDocument(blogPost(f)));
  const before = await f.state();
  const refused: [Partial<LegacyDocumentImportArgs>, string][] = [
    [{ sourceRef: "fixture:post-2" }, "IMPORT_SLUG_UNAVAILABLE"],
    [{ sourceRef: "fixture:post-3", slug: "Why Records Matter" }, "INVALID_IMPORT_SLUG"],
    [{ sourceRef: "fixture:post-4", slug: "later", publishedAt: Date.now() + 86_400_000 }, "INVALID_PUBLICATION_TIME"],
    [{ sourceRef: "fixture:post-5", slug: "later", status: "future", publishedAt: undefined }, "INVALID_PUBLICATION_TIME"],
    [{ sourceRef: "fixture:post-6", slug: "later", scheduledAt: Date.now() + 86_400_000 }, "INVALID_PUBLICATION_TIME"],
    [{ sourceRef: "fixture:post-7", slug: "later", menuOrder: 1 }, "IMPORT_FIELD_INVALID"],
    [{ sourceRef: "has space", slug: "later" }, "INVALID_IMPORT_SOURCE_REF"],
    [{ sourceRef: "fixture:post-8", slug: "later", source: { contentMode: "article", content: "x".repeat(800 * 1024) } }, "IMPORT_RECORD_TOO_LARGE"],
  ];
  for (const [patch, code] of refused) await expect(f.importDocument(blogPost(f, patch))).rejects.toMatchObject({ data: { code } });
  expect(await f.state()).toEqual(before);
  const scheduledAt = Date.now() + 86_400_000;
  const future = createdId(await f.importDocument(blogPost(f, { sourceRef: "fixture:post-9", slug: "later", status: "future", publishedAt: undefined, scheduledAt })));
  expect(await f.post(future)).toMatchObject({ status: "future", scheduledAt });
});

test("a password is applied to the document but never copied into its archive", async () => {
  const f = await fixture();
  const secret = "fixture-page-passphrase";
  const pageId = createdId(await f.importDocument({
    type: "page", title: "Partners", slug: "partners", status: "publish", visibility: "password", password: secret, authorId: f.ids.author,
    sourceRef: "fixture:page-partners", source: { contentMode: "article", content: tiptap({ type: "paragraph", content: [text("Partner notes")] }) },
  }));
  expect(await f.post(pageId)).toMatchObject({ visibility: "password", password: secret });
  const meta = await f.t.run((ctx) => ctx.db.query("postMeta").withIndex("by_post", (q) => q.eq("postId", pageId)).collect());
  expect(meta.map((row) => row.key).sort()).toEqual(["_convexpress_legacy_import:fixture:page-partners", "_convexpress_legacy_source"]);
  for (const row of meta) expect(row.value).not.toContain(secret);
  expect(JSON.parse(meta.find((row) => row.key === "_convexpress_legacy_source")!.value)).toMatchObject({ visibility: "password", hasPassword: true });
});

test("an imported post is not announced to subscribers as new", async () => {
  const f = await fixture();
  await f.t.run(async (ctx) => {
    const subscriber = await ctx.db.insert("roles", { name: "Subscriber", slug: "subscriber", description: "Fixture", level: 10, type: "internal", isDefault: true, isProtected: false, capabilities: [], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("users", { authSource: "local", email: "reader@example.invalid", emailVerified: true, roleId: subscriber, status: "active", createdAt: 1, updatedAt: 1 });
    for (const slug of ["post-published-author", "post-published-subscribers"]) await ctx.db.insert("emailTemplates", {
      slug, name: slug, subjectTemplate: "{post_title}", bodyHtml: "<p>{post_url}</p>", availableVariables: [], priority: "batched", recipientType: "customer",
      isActive: true, eventCode: "post.published", isCustomized: false, defaultSubjectTemplate: "{post_title}", defaultBodyHtml: "<p>{post_url}</p>", category: "content", totalSent: 0, createdAt: 1, updatedAt: 1,
    });
  });
  createdId(await f.importDocument(blogPost(f)));
  const imported = (await f.state()).events.find((event) => event.code === "post.published")!;
  await f.t.mutation(internal.emails.internals.onPostPublished, { eventId: imported._id });
  expect(await f.t.run((ctx) => ctx.db.query("emailQueue").collect())).toEqual([]);
  // The same event without the import marker is announced, so the empty queue
  // above is the import marker's doing rather than a missing fixture.
  const { _id, _creationTime, ...event } = imported;
  const { imported: _marker, ...payload } = JSON.parse(imported.payload);
  const ordinary = await f.t.run((ctx) => ctx.db.insert("events", { ...event, payload: JSON.stringify(payload) }));
  await f.t.mutation(internal.emails.internals.onPostPublished, { eventId: ordinary });
  const queued = await f.t.run((ctx) => ctx.db.query("emailQueue").collect());
  expect(queued.map((row) => row.to).sort()).toEqual(["author@example.invalid", "reader@example.invalid"]);
});
