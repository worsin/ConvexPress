import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { readKnowledgeSearch } from "../../canonicalDocuments/knowledgeBase";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/settings/internals.ts": () => import("../../settings/internals"),
  "./convex/settings/queries.ts": () => import("../../settings/queries"),
  "./convex/support/internals.ts": () => import("../../support/internals"),
  "./convex/support/deflection.ts": () => import("../../support/deflection"),
  "./convex/kb/analytics.ts": () => import("../analytics"),
  "./convex/kb/bookmarks.ts": () => import("../bookmarks"),
  "./convex/kb/categories.ts": () => import("../categories"),
  "./convex/kb/categoryAccess.ts": () => import("../categoryAccess"),
  "./convex/kb/collections.ts": () => import("../collections"),
  "./convex/kb/comments.ts": () => import("../comments"),
  "./convex/kb/feedback.ts": () => import("../feedback"),
  "./convex/kb/internals.ts": () => import("../internals"),
  "./convex/kb/meilisearch.ts": () => import("../meilisearch"),
  "./convex/kb/mutations.ts": () => import("../mutations"),
  "./convex/kb/progress.ts": () => import("../progress"),
  "./convex/kb/publicCounts.ts": () => import("../publicCounts"),
  "./convex/kb/queries.ts": () => import("../queries"),
  "./convex/kb/rag.ts": () => import("../rag"),
  "./convex/kb/search.ts": () => import("../search"),
  "./convex/kb/searchCandidates.ts": () => import("../searchCandidates"),
  "./convex/kb/searchJobWorker.ts": () => import("../searchJobWorker"),
  "./convex/kb/searchJobs.ts": () => import("../searchJobs"),
  "./convex/kb/searchSecurity.ts": () => import("../searchSecurity"),
  "./convex/kb/tags.ts": () => import("../tags"),
  "./convex/kb/visibilityTransitions.ts": () => import("../visibilityTransitions"),
  "./convex/kb/workflows.ts": () => import("../workflows"),
};

const ISSUER = "https://convexpress-admin.local";
const BODY = '{"type":"doc","content":[]}';
const EDITOR_CAPABILITIES = ["kb.view", "kb.create", "kb.edit", "kb.editOwn", "kb.publish", "kb.delete", "kb.manageTags", "kb.manageCollections", "kb.moderateComments", "manage_options"];

/** A public and an internal article, both published in one category, tagged
 * with one tag and listed in one public collection, created by the real
 * mutations. The writer may edit but not publish; the reader is a website
 * account with no capabilities. */
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const role = (slug: string, capabilities: string[]) => ctx.db.insert("roles", {
      name: slug, slug, description: "Fixture", level: 50, type: "internal", status: "active",
      isDefault: false, isProtected: false, pageAccess: [], capabilities, createdAt: 1, updatedAt: 1,
    });
    const user = (email: string, roleId?: Id<"roles">) => ctx.db.insert("users", {
      authSource: "local", email, emailVerified: true, status: "active", ...(roleId ? { roleId } : {}), createdAt: 1, updatedAt: 1,
    });
    const editor = await user("editor@example.invalid", await role("kb-editor", EDITOR_CAPABILITIES));
    const writer = await user("writer@example.invalid", await role("kb-writer", ["kb.view", "kb.edit", "kb.editOwn"]));
    const reader = await user("reader@example.invalid");
    await ctx.db.insert("settings", { section: "plugins", values: { knowledgeBaseEnabled: true, membershipEnabled: false, ticketsEnabled: true }, updatedBy: editor, updatedAt: 1 });
    const category = await ctx.db.insert("kb_categories", { name: "Guides", slug: "guides", order: 0, isActive: true, isPublished: true, articleCount: 0, createdAt: 1, updatedAt: 1 });
    const tag = await ctx.db.insert("kb_tags", { name: "Billing", slug: "billing", articleCount: 0, publicArticleCount: 0, createdAt: 1, updatedAt: 1 });
    const internalTag = await ctx.db.insert("kb_tags", { name: "Staff only", slug: "staff-only", articleCount: 0, publicArticleCount: 0, createdAt: 1, updatedAt: 1 });
    const collection = await ctx.db.insert("kb_collections", { name: "Start here", slug: "start-here", type: "manual", isPublic: true, articleCount: 0, publicArticleCount: 0, createdBy: editor, createdAt: 1, updatedAt: 1 });
    return { editor, writer, reader, category, tag, internalTag, collection };
  });
  const as = (id: Id<"users">) => t.withIdentity({ subject: id, issuer: ISSUER });
  const editor = as(ids.editor), writer = as(ids.writer), reader = as(ids.reader);
  async function article(title: string, visibility: "public" | "internal") {
    const articleId = await editor.mutation(api.kb.mutations.create, {
      title, content: BODY, contentPlainText: `${title} visibility guide body`, categoryId: ids.category, visibility,
    });
    await editor.mutation(api.kb.tags.addToArticle, { articleId, tagId: ids.tag });
    await editor.mutation(api.kb.collections.addArticle, { collectionId: ids.collection, articleId });
    await editor.mutation(api.kb.mutations.publish, { articleId });
    await editor.mutation(api.kb.mutations.toggleFeatured, { articleId });
    return articleId;
  }
  const publicId = await article("Public guide", "public");
  const internalId = await article("Internal guide", "internal");
  await editor.mutation(api.kb.tags.addToArticle, { articleId: internalId, tagId: ids.internalTag });
  const counts = () => t.run(async ctx => ({
    category: (await ctx.db.get(ids.category))!.articleCount,
    tag: (await ctx.db.get(ids.tag))!.publicArticleCount,
    tagUsage: (await ctx.db.get(ids.tag))!.articleCount,
    internalTag: (await ctx.db.get(ids.internalTag))!.publicArticleCount,
    collection: (await ctx.db.get(ids.collection))!.publicArticleCount,
    collectionUsage: (await ctx.db.get(ids.collection))!.articleCount,
  }));
  return { t, ids: { ...ids, publicId, internalId }, editor, writer, reader, counts };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

/** A valid article ID whose article no longer exists. */
async function deletedArticleId(f: Fixture): Promise<Id<"kb_articles">> {
  return f.t.run(async ctx => {
    const { _id, _creationTime, ...article } = (await ctx.db.get(f.ids.publicId))!;
    const id = await ctx.db.insert("kb_articles", { ...article, slug: "deleted-guide" });
    await ctx.db.delete(id);
    return id;
  });
}

async function errorOf(run: () => Promise<unknown>): Promise<string> {
  try { await run(); } catch (error) { return String(error); }
  throw Error("Expected the call to fail");
}

async function drainScheduled(f: Fixture) {
  // Bun uses real timers: dispatch, then inspect the scheduler records.
  for (let n = 0; n < 200; n++) {
    await new Promise(resolve => setTimeout(resolve, 1));
    await f.t.finishInProgressScheduledFunctions();
    const scheduled = await f.t.run(ctx => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.filter(row => row.state.kind === "failed")).toHaveLength(0);
    if (scheduled.every(row => row.state.kind === "success")) return;
  }
  throw Error("Scheduled functions did not finish");
}

test("an internal article is invisible through every public article read, listing and search", async () => {
  const f = await fixture();
  const [publicSlug, internalSlug] = await f.t.run(async ctx => [(await ctx.db.get(f.ids.publicId))!.slug, (await ctx.db.get(f.ids.internalId))!.slug]);
  await f.t.run(ctx => ctx.db.insert("kb_relatedArticles", { sourceArticleId: f.ids.publicId, relatedArticleId: f.ids.internalId, relationType: "related", createdAt: 1 }));
  const only = [f.ids.publicId];
  for (const client of [f.t, f.reader]) {
    expect(await client.query(api.kb.queries.getBySlug, { slug: internalSlug })).toBeNull();
    const detail = await client.query(api.kb.queries.getBySlug, { slug: publicSlug });
    expect(detail?._id).toBe(f.ids.publicId);
    expect(detail?.relatedArticles).toEqual([]);
    for (const categoryId of [undefined, f.ids.category]) {
      const page = await client.query(api.kb.queries.listPublished, { categoryId, paginationOpts: { numItems: 10, cursor: null } });
      expect(page.page.map(a => a._id)).toEqual(only);
    }
    for (const list of [api.kb.queries.getPopular, api.kb.queries.getRecent, api.kb.queries.getFeatured])
      expect((await client.query(list, { limit: 10 }))?.map(a => a._id)).toEqual(only);
    expect((await client.query(api.kb.search.search, { query: "guide" }))?.results.map(a => a._id)).toEqual(only);
    expect((await client.query(api.kb.search.searchPage, { query: "guide", paginationOpts: { numItems: 10, cursor: null } })).page.map(a => a._id)).toEqual(only);
  }
  expect((await f.t.run(ctx => readKnowledgeSearch(ctx, { category: f.ids.category }))).articles.map(a => a.id)).toEqual(only);
  expect((await f.t.run(ctx => readKnowledgeSearch(ctx, {}))).articles.map(a => a.id)).toEqual(only);
  // External search and RAG hits are re-read through this gate.
  const readable = await f.t.query(internal.kb.searchCandidates.readable, { candidates: [{ id: f.ids.internalId }, { id: f.ids.publicId }] });
  expect(readable.map(a => a.articleId)).toEqual(only);
});

test("public listings filter internal articles in the index, so pages stay full and pagination is exact", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    const { _id, _creationTime, ...base } = (await ctx.db.get(f.ids.publicId))!;
    for (let i = 0; i < 40; i++) await ctx.db.insert("kb_articles", { ...base, title: `Internal ${i}`, slug: `internal-${i}`, visibility: "internal", viewCount: 1000 + i, publishedAt: 1000 + i });
    for (let i = 0; i < 4; i++) await ctx.db.insert("kb_articles", { ...base, title: `Public ${i}`, slug: `public-${i}`, viewCount: i, publishedAt: i });
  });
  for (const categoryId of [undefined, f.ids.category]) {
    const seen: string[] = [];
    let cursor: string | null = null, pages = 0;
    do {
      const result: { page: { _id: string }[]; isDone: boolean; continueCursor: string } = await f.t.query(api.kb.queries.listPublished, { categoryId, paginationOpts: { numItems: 2, cursor } });
      if (!result.isDone) expect(result.page).toHaveLength(2);
      seen.push(...result.page.map(a => a._id));
      cursor = result.isDone ? null : result.continueCursor;
      if (++pages > 5) throw Error("Pagination did not converge");
    } while (cursor);
    expect(seen).toHaveLength(5);
    expect(pages).toBe(3);
  }
  // The most viewed and most recent articles are internal; previews still fill.
  for (const list of [api.kb.queries.getPopular, api.kb.queries.getRecent]) expect(await f.t.query(list, { limit: 5 })).toHaveLength(5);
  const search = await f.t.query(api.kb.search.searchPage, { query: "guide", paginationOpts: { numItems: 20, cursor: null } });
  expect(search.page).toHaveLength(5);
  expect(search.isDone).toBe(true);
});

test("counts shown publicly exclude internal articles and hide internal-only tags", async () => {
  const f = await fixture();
  expect(await f.counts()).toEqual({ category: 1, tag: 1, tagUsage: 2, internalTag: 0, collection: 1, collectionUsage: 2 });
  const categories = await f.t.query(api.kb.categories.listPublished, {});
  expect(categories?.map(c => c.articleCount)).toEqual([1]);
  expect((await f.t.query(api.kb.categories.getBySlug, { slug: "guides" }))?.articleCount).toBe(1);
  expect((await f.t.query(api.kb.categories.getHierarchy, {}))?.[0]?.articleCount).toBe(1);
  const tags = await f.t.query(api.kb.tags.list, {});
  expect(tags?.map(tag => [tag.slug, tag.articleCount])).toEqual([["billing", 1]]);
  expect(JSON.stringify(tags)).not.toContain("Staff only");
  expect(await f.t.query(api.kb.tags.getBySlug, { slug: "staff-only" })).toBeNull();
  expect((await f.t.query(api.kb.tags.getBySlug, { slug: "billing" }))?.articleCount).toBe(1);
  // Admins still see every tag with its full usage.
  expect((await f.editor.query(api.kb.tags.listAdmin, {}))?.map(tag => [tag.slug, tag.articleCount])).toEqual([["billing", 2], ["staff-only", 1]]);
  await expect(f.reader.query(api.kb.tags.listAdmin, {})).rejects.toThrow();
  expect((await f.t.query(api.kb.collections.listPublic, {}))?.map(c => c.articleCount)).toEqual([1]);
  const collection = await f.t.query(api.kb.collections.getBySlug, { slug: "start-here" });
  expect(collection?.articles.map(a => a._id)).toEqual([f.ids.publicId]);
  expect(collection?.articleCount).toBe(1);
  expect(JSON.stringify(collection)).not.toContain("Internal guide");
});

test("comments, feedback, page views, bookmarks and progress treat an internal article exactly like a missing one", async () => {
  const f = await fixture();
  const missing = await deletedArticleId(f);
  const { comment, view } = await f.t.run(async ctx => ({
    comment: await ctx.db.insert("kb_comments", { articleId: f.ids.internalId, userId: f.ids.reader, content: "Earlier comment", isApproved: true, isEdited: false, isDeleted: false, upvotes: 0, downvotes: 0, createdAt: 1, updatedAt: 1 }),
    view: await ctx.db.insert("kb_pageViews", { articleId: f.ids.internalId, sessionId: "s1", createdAt: 1 }),
  }));
  await f.t.run(async ctx => {
    await ctx.db.insert("kb_bookmarks", { userId: f.ids.reader, articleId: f.ids.internalId, createdAt: 1 });
    await ctx.db.insert("kb_userProgress", { userId: f.ids.reader, articleId: f.ids.internalId, progressPercent: 50, scrollPosition: 1, lastReadAt: 1, readTime: 1, completedRead: false });
  });
  const writes = (articleId: Id<"kb_articles">) => [
    () => f.reader.mutation(api.kb.comments.create, { articleId, content: "Hello" }),
    () => f.t.mutation(api.kb.feedback.submitHelpful, { articleId, sessionId: "s1", isHelpful: true }),
    () => f.t.mutation(api.kb.feedback.submitRating, { articleId, sessionId: "s1", rating: 5 }),
    () => f.t.mutation(api.kb.analytics.trackPageView, { articleId, sessionId: "s1" }),
    () => f.reader.mutation(api.kb.bookmarks.toggle, { articleId }),
    () => f.reader.mutation(api.kb.progress.trackProgress, { articleId, progressPercent: 10, scrollPosition: 1, readTime: 1 }),
  ];
  const internalErrors = await Promise.all(writes(f.ids.internalId).map(errorOf));
  const missingErrors = await Promise.all(writes(missing).map(errorOf));
  expect(internalErrors).toEqual(missingErrors);
  for (const error of internalErrors) expect(error).toContain("Article not found");
  expect(await errorOf(() => f.reader.mutation(api.kb.comments.vote, { commentId: comment, voteType: "up" }))).toContain("Comment not found");
  expect(await errorOf(() => f.reader.mutation(api.kb.comments.update, { commentId: comment, content: "Edited" }))).toContain("Comment not found");
  expect(await errorOf(() => f.t.mutation(api.kb.analytics.updateDuration, { pageViewId: view, duration: 5 }))).toContain("Page view not found");
  // A moderator can still moderate a comment left before the article became internal.
  await f.editor.mutation(api.kb.comments.deleteComment, { commentId: comment });

  expect(await f.t.query(api.kb.comments.listByArticle, { articleId: f.ids.internalId })).toEqual([]);
  expect(await f.t.query(api.kb.comments.getCount, { articleId: f.ids.internalId })).toBe(await f.t.query(api.kb.comments.getCount, { articleId: missing }));
  expect(await f.t.query(api.kb.feedback.getArticleStats, { articleId: f.ids.internalId })).toBeNull();
  expect(await f.t.query(api.kb.feedback.getUserFeedback, { articleId: f.ids.internalId, sessionId: "s1" })).toBeNull();
  expect(await f.reader.query(api.kb.bookmarks.isBookmarked, { articleId: f.ids.internalId })).toBe(false);
  expect(await f.reader.query(api.kb.bookmarks.list, {})).toEqual([]);
  expect(await f.reader.query(api.kb.progress.getProgress, { articleId: f.ids.internalId })).toBeNull();
  expect(await f.reader.query(api.kb.progress.getUserHistory, {})).toEqual([]);
  // Nothing was recorded against the internal article.
  const internalArticle = await f.t.run(ctx => ctx.db.get(f.ids.internalId));
  expect([internalArticle?.viewCount, internalArticle?.helpfulVotes, internalArticle?.notHelpfulVotes]).toEqual([0, 0, 0]);

  // The same calls work for the public article.
  await f.reader.mutation(api.kb.comments.create, { articleId: f.ids.publicId, content: "Hello" });
  expect(await f.t.query(api.kb.comments.getCount, { articleId: f.ids.publicId })).toBe(1);
  await f.reader.mutation(api.kb.bookmarks.toggle, { articleId: f.ids.publicId });
  expect((await f.reader.query(api.kb.bookmarks.list, {})).map(b => b.articleId)).toEqual([f.ids.publicId]);
});

test("support deflection only cites articles that pass the public gate", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    for (const articleId of [f.ids.internalId, f.ids.publicId]) await ctx.db.insert("kb_ragChunks", {
      articleId, articleSlug: "chunk-slug", content: "visibility guide body", chunkIndex: 0, embedding: [1],
      metadata: { title: "STALE CHUNK TITLE" }, createdAt: 1, updatedAt: 1,
    });
  });
  expect((await f.t.query(internal.support.internals.searchKbConvex, { query: "guide" })).map(a => a.id)).toEqual([f.ids.publicId]);
  const fallback = await f.t.query(internal.support.internals.searchKbKeywordFallback, { query: "visibility guide" });
  expect(fallback.map(a => [a.id, a.title])).toEqual([[f.ids.publicId, "Public guide"]]);
  const readable = await f.t.query(internal.support.internals.readableKbArticles, { candidates: [{ id: f.ids.internalId, score: 1 }, { id: f.ids.publicId, score: 0.5 }] });
  expect(readable.map(a => a.id)).toEqual([f.ids.publicId]);
  const answer = await f.t.action(api.support.deflection.generateAnswer, { query: "guide", sessionId: "s1" });
  expect(answer.sourceArticles.map(a => a.id)).toEqual([f.ids.publicId]);
  expect(answer.answer).not.toContain("Internal guide");
});

test("admin reads and edits internal articles, and filters the list by visibility", async () => {
  const f = await fixture();
  const article = await f.editor.query(api.kb.queries.getById, { articleId: f.ids.internalId });
  expect(article?.visibility).toBe("internal");
  expect((await f.editor.query(api.kb.queries.getById, { articleId: f.ids.publicId }))?.visibility).toBe("public");
  await f.writer.mutation(api.kb.mutations.update, { articleId: f.ids.internalId, title: "Internal guide revised" });
  expect((await f.editor.query(api.kb.queries.getById, { articleId: f.ids.internalId }))?.title).toBe("Internal guide revised");
  for (const search of [undefined, "guide"]) {
    for (const [visibility, expected] of [["internal", f.ids.internalId], ["public", f.ids.publicId]] as const) {
      const result = await f.editor.query(api.kb.queries.list, { visibility, search, paginationOpts: { numItems: 10, cursor: null } });
      expect(result.page.map(a => a._id)).toEqual([expected]);
      expect(result.page[0]?.visibility).toBe(visibility);
    }
    const withStatus = await f.editor.query(api.kb.queries.list, { visibility: "internal", status: "published", search, paginationOpts: { numItems: 10, cursor: null } });
    expect(withStatus.page.map(a => a._id)).toEqual([f.ids.internalId]);
  }
  const collection = await f.editor.query(api.kb.collections.getById, { collectionId: f.ids.collection });
  expect(collection?.articles.map(a => a?.article.visibility).sort()).toEqual(["internal", "public"]);
  // Admin-only reads that expose internal content refuse website accounts.
  await expect(f.reader.query(api.kb.queries.getVersions, { articleId: f.ids.internalId })).rejects.toThrow();
  await expect(f.reader.query(api.kb.collections.getById, { collectionId: f.ids.collection })).rejects.toThrow();
  await expect(f.reader.query(api.kb.collections.list, {})).rejects.toThrow();
  await expect(f.reader.mutation(api.kb.workflows.startWorkflow, { articleId: f.ids.publicId })).rejects.toThrow();
  expect(await f.editor.query(api.kb.queries.getVersions, { articleId: f.ids.internalId })).toEqual([]);
});

test("audiences are trimmed, lowercased, deduplicated, validated and capped", async () => {
  const f = await fixture();
  const update = (audiences: string[]) => f.editor.mutation(api.kb.mutations.update, { articleId: f.ids.internalId, audiences });
  const read = async () => (await f.editor.query(api.kb.queries.getById, { articleId: f.ids.internalId }))?.audiences;
  await update([" Doctor ", "staff", "DOCTOR", "front_desk-2"]);
  expect(await read()).toEqual(["doctor", "staff", "front_desk-2"]);
  for (const invalid of [["Bad Label"], [""], ["-leading"], ["x".repeat(49)], ["café"]])
    await expect(update(invalid)).rejects.toThrow("is invalid");
  await expect(update(Array.from({ length: 17 }, (_, i) => `group-${i}`))).rejects.toThrow("at most 16");
  await update(Array.from({ length: 16 }, (_, i) => `group-${i % 16}`).concat(["GROUP-0"]));
  expect(await read()).toHaveLength(16);
  await update([]);
  expect(await read()).toEqual([]);
  expect(await f.t.run(async ctx => "audiences" in (await ctx.db.get(f.ids.internalId))!)).toBe(false);
  const created = await f.editor.mutation(api.kb.mutations.create, { title: "New internal", visibility: "internal", audiences: ["Staff"] });
  expect(await f.t.run(ctx => ctx.db.get(created))).toMatchObject({ visibility: "internal", audiences: ["staff"] });
  await expect(f.editor.mutation(api.kb.mutations.create, { title: "Bad", audiences: ["no spaces allowed"] })).rejects.toThrow("is invalid");
  // Audiences never reach a public read.
  await f.editor.mutation(api.kb.mutations.update, { articleId: f.ids.publicId, audiences: ["doctor"] });
  const slug = await f.t.run(async ctx => (await ctx.db.get(f.ids.publicId))!.slug);
  expect(JSON.stringify(await f.t.query(api.kb.queries.getBySlug, { slug }))).not.toContain("doctor");
});

test("public→internal withdraws counts and RAG chunks; internal→public needs publishing authority and restores them", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    for (let i = 0; i < 150; i++) await ctx.db.insert("kb_ragChunks", { articleId: f.ids.publicId, articleSlug: "public-guide", content: `chunk ${i}`, chunkIndex: i, embedding: [1], metadata: { title: "Public guide" }, createdAt: 1, updatedAt: 1 });
  });
  await f.writer.mutation(api.kb.mutations.update, { articleId: f.ids.publicId, visibility: "internal" });
  expect(await f.counts()).toEqual({ category: 0, tag: 0, tagUsage: 2, internalTag: 0, collection: 0, collectionUsage: 2 });
  await drainScheduled(f);
  expect(await f.t.run(ctx => ctx.db.query("kb_ragChunks").collect())).toHaveLength(0);
  const stored = await f.t.run(ctx => ctx.db.get(f.ids.publicId));
  expect(stored).toMatchObject({ visibility: "internal", ragSynced: false, meilisearchSynced: false });
  expect(await f.t.query(api.kb.queries.getBySlug, { slug: stored!.slug })).toBeNull();
  // No provider was configured, so no external removal job could be made.
  expect(await f.t.run(ctx => ctx.db.query("kb_search_jobs").collect())).toEqual([]);

  // Making a published article public publishes it: edit rights are not enough.
  await expect(f.writer.mutation(api.kb.mutations.update, { articleId: f.ids.publicId, visibility: "public" })).rejects.toThrow();
  expect((await f.t.run(ctx => ctx.db.get(f.ids.publicId)))?.visibility).toBe("internal");
  await f.editor.mutation(api.kb.mutations.update, { articleId: f.ids.publicId, visibility: "public" });
  expect(await f.counts()).toEqual({ category: 1, tag: 1, tagUsage: 2, internalTag: 0, collection: 1, collectionUsage: 2 });
  // Public storage is canonical: the field is absent, never the "public" literal.
  expect((await f.t.run(ctx => ctx.db.get(f.ids.publicId)))?.visibility).toBeUndefined();

  // A draft internal article can be made public by an editor without publishing rights.
  const draft = await f.writer.mutation(api.kb.mutations.update, { articleId: f.ids.internalId, title: "Internal guide" });
  await f.editor.mutation(api.kb.mutations.unpublish, { articleId: draft });
  expect(await f.counts()).toEqual({ category: 1, tag: 1, tagUsage: 2, internalTag: 0, collection: 1, collectionUsage: 2 });
  await f.writer.mutation(api.kb.mutations.update, { articleId: f.ids.internalId, visibility: "public" });
  await f.editor.mutation(api.kb.mutations.publish, { articleId: f.ids.internalId });
  expect(await f.counts()).toEqual({ category: 2, tag: 2, tagUsage: 2, internalTag: 1, collection: 2, collectionUsage: 2 });

  // Archive, category moves and deletion keep every public count exact.
  await f.editor.mutation(api.kb.mutations.archive, { articleId: f.ids.internalId });
  expect(await f.counts()).toEqual({ category: 1, tag: 1, tagUsage: 2, internalTag: 0, collection: 1, collectionUsage: 2 });
  await f.editor.mutation(api.kb.mutations.remove, { articleId: f.ids.publicId });
  expect(await f.counts()).toEqual({ category: 0, tag: 0, tagUsage: 1, internalTag: 0, collection: 0, collectionUsage: 1 });
});

test("starting a workflow on a published article takes it out of public counts", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.insert("kb_workflows", { name: "Review", steps: [{ name: "Review", type: "review", requiredApprovals: 1 }], isDefault: true, isActive: true, createdAt: 1, updatedAt: 1 }));
  const workflow = await f.editor.mutation(api.kb.workflows.startWorkflow, { articleId: f.ids.publicId });
  expect((await f.counts()).category).toBe(0);
  await f.editor.mutation(api.kb.workflows.approveStep, { articleWorkflowId: workflow });
  expect(await f.counts()).toEqual({ category: 1, tag: 1, tagUsage: 2, internalTag: 0, collection: 1, collectionUsage: 2 });
});

test("the recount rebuilds every public count from source", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    await ctx.db.patch(f.ids.category, { articleCount: 7 });
    await ctx.db.patch(f.ids.tag, { publicArticleCount: undefined });
    await ctx.db.patch(f.ids.internalTag, { publicArticleCount: undefined });
    await ctx.db.patch(f.ids.collection, { publicArticleCount: 9 });
  });
  // Until the recount runs, an uninitialized tag is hidden publicly.
  expect(await f.t.query(api.kb.tags.list, {})).toEqual([]);
  await f.t.mutation(internal.kb.publicCounts.recount, {});
  await drainScheduled(f);
  expect(await f.counts()).toEqual({ category: 1, tag: 1, tagUsage: 2, internalTag: 0, collection: 1, collectionUsage: 2 });
});

test("RAG never stores an internal article", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    await ctx.db.insert("settings", { section: "kb.search", values: { ragEnabled: true, ragApiKey: "b64:c3ludGhldGljLWtleQ==", ragProvider: "openai" }, updatedBy: f.ids.editor, updatedAt: 1 });
    await ctx.db.insert("kb_ragChunks", { articleId: f.ids.internalId, articleSlug: "internal-guide", content: "old chunk", chunkIndex: 0, embedding: [1], metadata: { title: "Internal guide" }, createdAt: 1, updatedAt: 1 });
  });
  const old = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw Error("An internal article must not reach the embedding provider"); }) as typeof fetch;
  try {
    expect(await f.editor.action(api.kb.rag.ingestArticle, { articleId: f.ids.internalId })).toEqual({ success: true, chunksCreated: 0 });
  } finally { globalThis.fetch = old; }
  expect(calls).toBe(0);
  await drainScheduled(f);
  expect(await f.t.run(ctx => ctx.db.query("kb_ragChunks").collect())).toEqual([]);
  await expect(f.editor.mutation(internal.kb.internals.insertRagChunk, {
    articleId: f.ids.internalId, articleSlug: "internal-guide", content: "late chunk", chunkIndex: 0, embedding: [1], metadata: { title: "Internal guide" }, now: 1,
  })).rejects.toThrow("KB_ARTICLE_INTERNAL");
});

// ─── External search (Meilisearch) ──────────────────────────────────────────

async function withSearchProvider(f: Fixture) {
  await f.t.run(async ctx => {
    await ctx.db.insert("settings", { section: "kb.search", values: { meilisearchEnabled: true, meilisearchUrl: "https://search.example.invalid", meilisearchApiKey: "b64:c3ludGhldGljLWtleQ==" }, updatedBy: f.ids.editor, updatedAt: 1 });
    await ctx.db.insert("convexpress_siteIdentity", { identityKey: "site-identity", websiteKey: "kb-site", instanceKey: "kb-staging", environmentKind: "staging", deploymentOrigin: "https://backend.example.invalid", managementOrigin: "https://backend-site.example.invalid", siteOrigin: "https://site.example.invalid", siteContractVersion: "1", schemaVersion: "1", engineVersion: "1", managementCapabilities: [], initializedAt: 1, updatedAt: 1 });
  });
  return f.t.query(internal.kb.searchSecurity.meilisearchIndex, {});
}

/** A fake provider that records every request and acknowledges every write. */
function fakeProvider(indexName: string, onSettingsRead?: () => Promise<void>, onTaskRead?: (uid: number) => Promise<void>) {
  const requests: { method: string; path: string; body: string }[] = [];
  let task = 0;
  const handler = async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname, method = init?.method ?? "GET";
    requests.push({ method, path, body: String(init?.body ?? "") });
    if (path.endsWith("/settings/filterable-attributes")) { await onSettingsRead?.(); return Response.json(["status", "categorySlug", "id"]); }
    if (path.startsWith("/tasks/")) { await onTaskRead?.(Number(path.slice(7))); return Response.json({ uid: Number(path.slice(7)), indexUid: indexName, status: "succeeded" }); }
    return Response.json({ taskUid: ++task, indexUid: indexName, status: "enqueued" });
  };
  return { requests, fetch: handler as typeof fetch };
}

async function settleJobs(f: Fixture, articleId: Id<"kb_articles">, count: number) {
  for (let i = 0; i < 200; i++) {
    await new Promise(resolve => setTimeout(resolve, 1));
    await f.t.finishInProgressScheduledFunctions();
    const jobs = await f.t.run(ctx => ctx.db.query("kb_search_jobs").withIndex("by_article", q => q.eq("articleId", articleId)).collect());
    if (jobs.length >= count && jobs.every(job => job.status !== "running")) return jobs;
  }
  throw Error("Search jobs did not settle");
}

test("making an article internal removes it from external search without provider authority", async () => {
  const f = await fixture();
  const oldFetch = globalThis.fetch, oldUrl = process.env.CONVEX_CLOUD_URL;
  process.env.CONVEX_CLOUD_URL = "https://runtime.example.invalid";
  try {
    const provider = fakeProvider(await withSearchProvider(f));
    globalThis.fetch = provider.fetch;
    await f.t.run(ctx => ctx.db.patch(f.ids.publicId, { meilisearchSynced: true, meilisearchSyncedAt: 1 }));
    // The writer can edit articles but holds no manage_options authority.
    await f.writer.mutation(api.kb.mutations.update, { articleId: f.ids.publicId, visibility: "internal" });
    const [job] = await settleJobs(f, f.ids.publicId, 1);
    expect(job).toMatchObject({ operation: "remove", reason: "visibility", status: "complete" });
    expect(job!.actor.subject).toBe(f.ids.writer);
    const writes = provider.requests.filter(r => r.method !== "GET");
    expect(writes.map(r => r.path)).toEqual([expect.stringMatching(/\/documents\/delete$/)]);
    expect(writes[0]!.body).toContain(f.ids.publicId);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.CONVEX_CLOUD_URL; else process.env.CONVEX_CLOUD_URL = oldUrl;
  }
});

test("syncing an internal article removes it instead, and a sync never sends an article that became internal", async () => {
  const f = await fixture();
  const oldFetch = globalThis.fetch, oldUrl = process.env.CONVEX_CLOUD_URL;
  process.env.CONVEX_CLOUD_URL = "https://runtime.example.invalid";
  try {
    const indexName = await withSearchProvider(f);
    const direct = fakeProvider(indexName);
    globalThis.fetch = direct.fetch;
    const status = await f.editor.action(api.kb.meilisearch.syncArticle, { articleId: f.ids.internalId });
    expect(status.operation).toBe("remove");
    await settleJobs(f, f.ids.internalId, 1);
    expect(direct.requests.some(r => r.method === "POST" && r.path.endsWith("/documents"))).toBe(false);

    // The article turns internal after the sync started, before its document is prepared.
    const racing = fakeProvider(indexName, () => f.t.run(ctx => ctx.db.patch(f.ids.publicId, { visibility: "internal" })));
    globalThis.fetch = racing.fetch;
    await f.editor.action(api.kb.meilisearch.syncArticle, { articleId: f.ids.publicId });
    const jobs = await settleJobs(f, f.ids.publicId, 2);
    expect(jobs.map(job => [job.operation, job.status])).toEqual([["sync", "failed"], ["remove", "complete"]]);
    expect(racing.requests.some(r => r.method === "POST" && r.path.endsWith("/documents"))).toBe(false);
    expect(JSON.stringify(racing.requests)).not.toContain("Public guide visibility guide body");
    expect(racing.requests.some(r => r.path.endsWith("/documents/delete"))).toBe(true);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.CONVEX_CLOUD_URL; else process.env.CONVEX_CLOUD_URL = oldUrl;
  }
});

test("a document the provider accepted just before the article became internal is removed again", async () => {
  const f = await fixture();
  const oldFetch = globalThis.fetch, oldUrl = process.env.CONVEX_CLOUD_URL;
  process.env.CONVEX_CLOUD_URL = "https://runtime.example.invalid";
  try {
    const indexName = await withSearchProvider(f);
    // The article turns internal while the accepted document write is being confirmed.
    const provider = fakeProvider(indexName, undefined, async uid => {
      if (uid === 1) await f.t.run(ctx => ctx.db.patch(f.ids.publicId, { visibility: "internal" }));
    });
    globalThis.fetch = provider.fetch;
    await f.editor.action(api.kb.meilisearch.syncArticle, { articleId: f.ids.publicId });
    const jobs = await settleJobs(f, f.ids.publicId, 2);
    expect(jobs.map(job => [job.operation, job.status])).toEqual([["sync", "stale"], ["remove", "complete"]]);
    expect((await f.t.run(ctx => ctx.db.get(f.ids.publicId)))?.meilisearchSynced).toBe(false);
    const writes = provider.requests.filter(r => r.method !== "GET").map(r => r.path);
    expect(writes).toEqual([expect.stringMatching(/\/documents$/), expect.stringMatching(/\/documents\/delete$/)]);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.CONVEX_CLOUD_URL; else process.env.CONVEX_CLOUD_URL = oldUrl;
  }
});

test("a category lists its articles in their set order, the oldest first within a position (PR 080)", async () => {
  const f = await fixture();
  const write = async (title: string, sortOrder: number, viewCount: number) => {
    const articleId = await f.editor.mutation(api.kb.mutations.create, {
      title, content: BODY, contentPlainText: `${title} body`, categoryId: f.ids.category, visibility: "public",
    });
    await f.editor.mutation(api.kb.mutations.update, { articleId, sortOrder });
    await f.editor.mutation(api.kb.mutations.publish, { articleId });
    await f.t.run(ctx => ctx.db.patch(articleId, { viewCount }));
    return articleId;
  };
  // The fixture's public guide sits at position 0; the most viewed article is placed last.
  const third = await write("Third step", 3, 900);
  const first = await write("First step", 1, 5);
  const second = await write("Second step", 2, 50);
  const alsoFirst = await write("Also first", 1, 0);
  const page = await f.reader.query(api.kb.queries.listPublished, { categoryId: f.ids.category, paginationOpts: { numItems: 10, cursor: null } });
  expect(page.page.map(a => a._id)).toEqual([f.ids.publicId, first, alsoFirst, second, third]);
  // The whole help center still reads newest first.
  const all = await f.reader.query(api.kb.queries.listPublished, { paginationOpts: { numItems: 10, cursor: null } });
  expect(all.page[0]?._id).toBe(alsoFirst);
});
