import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../_generated/api";
// These upgrade/refusal cases deliberately begin with pre-retirement live records.
import { legacyPostSchema as schema } from "../../canonicalDocuments/__tests__/legacyPostSchema";

const modules = {
  "./convex/canonicalDocuments.ts": () => import("../../canonicalDocuments"),
  "./convex/posts/authorCounts.ts": () => import("../authorCounts"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/posts/mutations.ts": () => import("../mutations"),
  "./convex/revisions/internals.ts": () => import("../../revisions/internals"),
  "./convex/settings/internals.ts": () => import("../../settings/internals"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
};

async function fixture(level = 80) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const roleId = await ctx.db.insert("roles", {
      name: "Editor", slug: "editor", description: "Fixture", level,
      type: "internal", status: "active", isDefault: false, isProtected: false,
      capabilities: ["post.duplicate", "post.update", "page.update"],
      pageAccess: [], createdAt: 1, updatedAt: 1,
    });
    const user = { emailVerified: true, status: "active" as const, authSource: "local" as const, roleId, createdAt: 1, updatedAt: 1 };
    const authorId = await ctx.db.insert("users", { ...user, email: "source@example.test" });
    const editorId = await ctx.db.insert("users", { ...user, email: "editor@example.test" });
    const postId = await ctx.db.insert("posts", {
      type: "page", title: "Protected page", slug: "protected", content: "Article fallback",
      excerpt: "Excerpt", status: "publish", visibility: "password", password: "fixture-only",
      authorId, commentStatus: "closed", createdAt: 1, updatedAt: 1,
      contentMode: "blocks", blocksVersion: 1, blocksRevision: 19,
      blocks: [{ id: "one", name: "core/paragraph", version: 1, attrs: { body: "Preserve me" },
        layout: { tone: "contrast", padding: "spacious" }, lock: { move: true },
        innerBlocks: [{ id: "nested", name: "core/paragraph", version: 1, attrs: { body: "Nested" }, lock: { edit: true } }] }],
      hero: { title: "Hero" }, topics: [{ title: "Topic" }], summary: { content: "Summary" },
      sources: "Source", tableOfContents: "Contents", pageSections: [{ type: "hero", title: "Section" }],
      pageTemplate: "landing", hideHeader: true, hideFooter: true, layoutId: "layout-fixture", pagePrompt: "Prompt",
      path: "/parent/protected", depth: 1, scheduledAt: 100, autosaveContent: "Do not copy autosave",
    });
    await ctx.db.insert("postMeta", { postId, key: "_seo_title", value: "SEO title" });
    await ctx.db.insert("postMeta", { postId, key: "_scheduled_fn", value: "source-job" });
    await ctx.db.insert("postMeta", { postId, key: "_edit_lock", value: "source-lock" });
    return { authorId, editorId, postId };
  });
  const editor = t.withIdentity({ subject: ids.editorId, issuer: "https://convexpress-admin.local" });
  return { t, editor, ...ids };
}

test("author reassignment requires an active site user and leaves authority unchanged", async () => {
  const { t, editor, postId, editorId, authorId } = await fixture();
  await t.run(async ctx => {
    await ctx.db.patch(postId, { type: "post", status: "draft", visibility: "public", password: undefined,
      content: "", blocks: [], blocksVersion: 2, blocksRevision: 1, scheduledAt: undefined });
    await ctx.db.insert("convexpress_siteIdentity", { identityKey: "site-identity", websiteKey: "fixture", instanceKey: "fixture-stage", environmentKind: "staging", deploymentOrigin: "https://fixture.convex.cloud", managementOrigin: "https://fixture.convex.site", siteOrigin: "https://fixture.example.invalid", siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: {membershipEnabled:false}, updatedAt: 1, updatedBy: editorId });
    await ctx.db.insert("settings", { section: "appearance.template", values: {active:"core",overrides:{},variants:{},settings:{}}, legacyAppearanceMigration:{version:2,migratedAt:1}, updatedAt: 1, updatedBy: editorId });
  });
  for (const state of ["management", "inactive", "deleted"] as const) {
    const targetId = await t.run(async ctx => {
      const id = await ctx.db.insert("users", {
        email: `${state}@example.test`, emailVerified: true,
        status: state === "inactive" ? "inactive" : "active",
        authSource: state === "management" ? "management" : "local",
        createdAt: 1, updatedAt: 1,
      });
      if (state === "deleted") await ctx.db.delete(id);
      return id;
    });
    await expect(editor.mutation(api.canonicalDocuments.updateMetadata, { postId, expectedRevision: 1, authorId: targetId }))
      .rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    expect((await t.run(ctx => ctx.db.get(postId)))?.authorId).toBe(authorId);
  }
  const userBefore = await t.run(ctx => ctx.db.get(editorId));
  await editor.mutation(api.canonicalDocuments.updateMetadata, { postId, expectedRevision: 1, authorId: editorId });
  expect((await t.run(ctx => ctx.db.get(postId)))?.authorId).toBe(editorId);
  expect(await t.run(ctx => ctx.db.get(editorId))).toEqual(userBefore);
});

test("duplicate preserves the complete legacy authoring tree and protection, with a fresh draft lifecycle", async () => {
  const { t, editor, postId, editorId } = await fixture();
  const source = await t.run(ctx => ctx.db.get(postId));
  const copyId = await editor.mutation(api.posts.mutations.duplicate, { postId });
  const copy = await t.run(ctx => ctx.db.get(copyId));
  for (const key of ["content", "excerpt", "contentMode", "blocks", "blocksVersion", "hero", "topics", "summary", "sources", "tableOfContents", "pageSections", "pageTemplate", "hideHeader", "hideFooter", "layoutId", "pagePrompt", "visibility", "password"] as const) {
    expect(copy?.[key]).toEqual(source?.[key]);
  }
  expect(copy).toMatchObject({ title: "Protected page (Copy)", authorId: editorId, status: "draft", blocksRevision: 1, depth: 0 });
  expect(copy?.path).toBe(`/${copy?.slug}`);
  expect(copy?.scheduledAt).toBeUndefined();
  expect(copy?.autosaveContent).toBeUndefined();
  const metadata = await t.run(ctx => ctx.db.query("postMeta").withIndex("by_post", q => q.eq("postId", copyId)).collect());
  expect(metadata.map(meta => meta.key)).toEqual(["_seo_title"]);
  expect(await t.run(ctx => ctx.db.get(postId))).toEqual(source);
});

test("a non-editor cannot clone somebody else's published protected body", async () => {
  const { t, editor, postId } = await fixture(50);
  await expect(editor.mutation(api.posts.mutations.duplicate, { postId })).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  expect(await t.run(ctx => ctx.db.query("posts").collect())).toHaveLength(1);
});

test("copying a newly disabled nested block refuses the whole transaction", async () => {
  const { t, editor, postId, editorId } = await fixture();
  await t.run(ctx => ctx.db.insert("settings", { section: "blocks", values: { disabledBlockNames: ["core/paragraph"] }, updatedAt: 1, updatedBy: editorId }));
  await expect(editor.mutation(api.posts.mutations.duplicate, { postId })).rejects.toBeDefined();
  expect(await t.run(ctx => ctx.db.query("posts").collect())).toHaveLength(1);
});

test("unsupported block document versions cannot silently become empty drafts", async () => {
  const { t, editor, postId } = await fixture();
  await t.run(ctx => ctx.db.patch(postId, { blocksVersion: 2 }));
  await expect(editor.mutation(api.posts.mutations.duplicate, { postId })).rejects.toBeDefined();
  expect(await t.run(ctx => ctx.db.query("posts").collect())).toHaveLength(1);
});

test("document membership rules, taxonomy and custom-field values follow the copy", async () => {
  const { t, editor, postId, editorId } = await fixture();
  const termId = await t.run(async ctx => {
    const termId = await ctx.db.insert("terms", { name: "Category", slug: "category", taxonomy: "category", count: 1, isDefault: false, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("termRelationships", { postId, termId, order: 2 });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "page", resourceIdOrKey: String(postId), ruleMode: "deny_if_missing", planIds: [], requiredCapabilities: ["premium.read"], teaserMode: "hide", loginRequired: true, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("fieldValues", { entityType: "page", entityId: String(postId), fieldKey: "intro", fieldName: "intro", value: JSON.stringify("Custom introduction"), updatedBy: "source", updatedAt: 1 });
    return termId;
  });
  const copyId = await editor.mutation(api.posts.mutations.duplicate, { postId });
  const values = await t.run(async ctx => ({
    terms: await ctx.db.query("termRelationships").withIndex("by_post", q => q.eq("postId", copyId)).collect(),
    rules: await ctx.db.query("membership_restriction_rules").withIndex("by_resource", q => q.eq("resourceType", "page").eq("resourceIdOrKey", String(copyId))).collect(),
    fields: await ctx.db.query("fieldValues").withIndex("by_entity", q => q.eq("entityType", "page").eq("entityId", String(copyId))).collect(),
  }));
  expect(values.terms).toMatchObject([{ termId, order: 2 }]);
  expect(values.rules).toMatchObject([{ ruleMode: "deny_if_missing", requiredCapabilities: ["premium.read"], loginRequired: true, teaserMode: "hide" }]);
  expect(values.fields).toMatchObject([{ fieldKey: "intro", value: JSON.stringify("Custom introduction"), updatedBy: String(editorId) }]);
});

test("oversized metadata refuses atomically without creating a partial draft", async () => {
  const { t, editor, postId } = await fixture();
  await t.run(async ctx => {
    for (let i = 0; i < 254; i++) await ctx.db.insert("postMeta", { postId, key: `extra-${i}`, value: "Value" });
  });
  await expect(editor.mutation(api.posts.mutations.duplicate, { postId })).rejects.toMatchObject({ data: { code: "LIMIT_EXCEEDED" } });
  expect(await t.run(ctx => ctx.db.query("posts").collect())).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query("events").collect())).toHaveLength(0);
});

test("authors can duplicate their own article and private status stays private on the draft", async () => {
  const { t, editor, postId, editorId } = await fixture(50);
  await t.run(ctx => ctx.db.patch(postId, { type: "post", authorId: editorId, status: "private", visibility: "public", contentMode: "article", blocks: undefined, blocksVersion: undefined, blocksRevision: undefined }));
  const copyId = await editor.mutation(api.posts.mutations.duplicate, { postId });
  expect(await t.run(ctx => ctx.db.get(copyId))).toMatchObject({ contentMode: "article", content: "Article fallback", status: "draft", visibility: "private" });
});

test("duplicate refuses a page path reserved for the customer dashboard", async () => {
  const { t, editor, postId, editorId } = await fixture();
  await t.run(ctx => ctx.db.insert("settings", { section: "dashboard", values: { basePath: "/protected-page-copy" }, updatedAt: 1, updatedBy: editorId }));
  await expect(editor.mutation(api.posts.mutations.duplicate, { postId })).rejects.toMatchObject({ data: { code: "RESERVED_PAGE_ROUTE" } });
  expect(await t.run(ctx => ctx.db.query("posts").collect())).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query("events").collect())).toHaveLength(0);
});

test("a maximum-length source produces a valid editable copy title", async () => {
  const { t, editor, postId } = await fixture();
  await t.run(ctx => ctx.db.patch(postId, { title: "A".repeat(500) }));
  const copyId = await editor.mutation(api.posts.mutations.duplicate, { postId });
  const copy = await t.run(ctx => ctx.db.get(copyId));
  expect(copy?.title.length).toBeLessThanOrEqual(500);
  expect(copy?.title.endsWith(" (Copy)")).toBe(true);
});

test("metadata byte overflow refuses before creating a draft", async () => {
  const { t, editor, postId } = await fixture();
  await t.run(async ctx => {
    for (let i = 0; i < 3; i++) await ctx.db.insert("postMeta", { postId, key: `large-${i}`, value: "é".repeat(360000) });
  });
  await expect(editor.mutation(api.posts.mutations.duplicate, { postId })).rejects.toMatchObject({ data: { code: "LIMIT_EXCEEDED" } });
  expect(await t.run(ctx => ctx.db.query("posts").collect())).toHaveLength(1);
});

test("the row budget spans individually valid collections", async () => {
  const { t, editor, postId } = await fixture();
  await t.run(async ctx => {
    const termId = await ctx.db.insert("terms", { name: "Category", slug: "category", taxonomy: "category", count: 1, isDefault: false, createdAt: 1, updatedAt: 1 });
    for (let i = 0; i < 253; i++) await ctx.db.insert("postMeta", { postId, key: `meta-${i}`, value: "value" });
    for (let i = 0; i < 256; i++) await ctx.db.insert("termRelationships", { postId, termId, order: i });
    await ctx.db.insert("fieldValues", { entityType: "page", entityId: String(postId), fieldKey: "extra", fieldName: "extra", value: "value", updatedBy: "source", updatedAt: 1 });
  });
  await expect(editor.mutation(api.posts.mutations.duplicate, { postId })).rejects.toMatchObject({ data: { code: "LIMIT_EXCEEDED" } });
  expect(await t.run(ctx => ctx.db.query("posts").collect())).toHaveLength(1);
});

test("an unavailable copied custom-field media reference rolls back earlier inserts", async () => {
  const { t, editor, postId, editorId } = await fixture();
  await t.run(async ctx => {
    const mediaId = await ctx.db.insert("media", { title: "Unavailable", fileName: "fixture.png", slug: "fixture", url: "https://example.test/fixture.png", mimeType: "image/png", fileSize: 68, mediaType: "image", status: "trashed", uploadedBy: editorId, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("fieldValues", { entityType: "page", entityId: String(postId), fieldKey: "image", fieldName: "image", value: JSON.stringify(mediaId), updatedBy: "source", updatedAt: 1 });
  });
  await expect(editor.mutation(api.posts.mutations.duplicate, { postId })).rejects.toMatchObject({ data: { code: "MEDIA_UNAVAILABLE" } });
  expect(await t.run(ctx => ctx.db.query("posts").collect())).toHaveLength(1);
  expect(await t.run(ctx => ctx.db.query("postMeta").collect())).toHaveLength(3);
  expect(await t.run(ctx => ctx.db.query("events").collect())).toHaveLength(0);
});
