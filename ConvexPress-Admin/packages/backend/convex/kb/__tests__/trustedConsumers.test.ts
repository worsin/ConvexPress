import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/membership/policyReads.ts": () => import("../../membership/policyReads"),
  "./convex/kb/analytics.ts": () => import("../analytics"),
  "./convex/kb/feedback.ts": () => import("../feedback"),
  "./convex/kb/trustedConsumers.ts": () => import("../trustedConsumers"),
};

/** One published internal article, one published public article and one
 * internal draft, otherwise identical. */
async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const author = await ctx.db.insert("users", { authSource: "local", email: "author@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "plugins", values: { knowledgeBaseEnabled: true, membershipEnabled: false }, updatedBy: author, updatedAt: 1 });
    const base = {
      excerpt: "Summary", content: '{"type":"doc"}', contentPlainText: "Body", authorId: author, contributors: [], keywords: [],
      viewCount: 0, uniqueViewCount: 0, helpfulVotes: 0, notHelpfulVotes: 0, readingTimeMinutes: 1, version: 1,
      isFeatured: false, sortOrder: 0, meilisearchSynced: false, ragSynced: false, createdAt: 1, updatedAt: 1,
    };
    return {
      internalArticle: await ctx.db.insert("kb_articles", { ...base, title: "Panel help", slug: "panel-help", status: "published", publishedAt: 1, visibility: "internal", audiences: ["staff"] }),
      publicArticle: await ctx.db.insert("kb_articles", { ...base, title: "Website help", slug: "website-help", status: "published", publishedAt: 1 }),
      draft: await ctx.db.insert("kb_articles", { ...base, title: "Draft help", slug: "draft-help", status: "draft", visibility: "internal" }),
    };
  });
  const counters = (articleId: Id<"kb_articles">) => t.run(async ctx => {
    const article = (await ctx.db.get(articleId))!;
    return { views: article.viewCount, unique: article.uniqueViewCount, helpful: article.helpfulVotes, notHelpful: article.notHelpfulVotes };
  });
  return { t, ids, counters };
}

test("recordHelpfulFeedback records feedback on a published internal article with the public path's counters", async () => {
  const f = await fixture();
  const record = (sessionId: string, isHelpful: boolean, comment?: string) =>
    f.t.mutation(internal.kb.trustedConsumers.recordHelpfulFeedback, { articleId: f.ids.internalArticle, sessionId, isHelpful, comment });
  const first = await record("panel-1", true, "Clear");
  expect(await f.counters(f.ids.internalArticle)).toEqual({ views: 0, unique: 0, helpful: 1, notHelpful: 0 });
  // The same session changing its answer updates its feedback in place.
  expect(await record("panel-1", false)).toEqual(first);
  expect(await f.counters(f.ids.internalArticle)).toEqual({ views: 0, unique: 0, helpful: 0, notHelpful: 1 });
  expect(await record("panel-1", false)).toEqual(first);
  await record("panel-2", true);
  expect(await f.counters(f.ids.internalArticle)).toEqual({ views: 0, unique: 0, helpful: 1, notHelpful: 1 });
  const feedback = await f.t.run(ctx => ctx.db.get(first.feedbackId));
  expect(feedback).toMatchObject({ articleId: f.ids.internalArticle, sessionId: "panel-1", isHelpful: false });
  expect(feedback && "userId" in feedback).toBe(false);

  // The public mutation applies the identical sequence to a public article.
  const publicRecord = (sessionId: string, isHelpful: boolean) => f.t.mutation(api.kb.feedback.submitHelpful, { articleId: f.ids.publicArticle, sessionId, isHelpful });
  await publicRecord("web-1", true); await publicRecord("web-1", false); await publicRecord("web-1", false); await publicRecord("web-2", true);
  expect(await f.counters(f.ids.publicArticle)).toEqual(await f.counters(f.ids.internalArticle));
  // ...and still refuses the internal article.
  await expect(f.t.mutation(api.kb.feedback.submitHelpful, { articleId: f.ids.internalArticle, sessionId: "web-1", isHelpful: true })).rejects.toThrow("Article not found");
});

test("recordHelpfulFeedback rejects unpublished articles and invalid input", async () => {
  const f = await fixture();
  await expect(f.t.mutation(internal.kb.trustedConsumers.recordHelpfulFeedback, { articleId: f.ids.draft, sessionId: "panel-1", isHelpful: true })).rejects.toThrow("Article not found");
  for (const sessionId of ["", "x".repeat(129)])
    await expect(f.t.mutation(internal.kb.trustedConsumers.recordHelpfulFeedback, { articleId: f.ids.internalArticle, sessionId, isHelpful: true })).rejects.toThrow("Invalid session ID");
  await expect(f.t.mutation(internal.kb.trustedConsumers.recordHelpfulFeedback, { articleId: f.ids.internalArticle, sessionId: "panel-1", isHelpful: true, comment: "x".repeat(1001) })).rejects.toThrow("Comment too long");
  expect(await f.counters(f.ids.draft)).toEqual({ views: 0, unique: 0, helpful: 0, notHelpful: 0 });
  expect(await f.counters(f.ids.internalArticle)).toEqual({ views: 0, unique: 0, helpful: 0, notHelpful: 0 });
});

test("recordPageView deduplicates within the window and counts views like the public path", async () => {
  const f = await fixture();
  const record = (sessionId: string, durationMs?: number) =>
    f.t.mutation(internal.kb.trustedConsumers.recordPageView, { articleId: f.ids.internalArticle, sessionId, referrer: "/app/help", durationMs });
  const first = await record("panel-1");
  expect(first.deduplicated).toBe(false);
  expect(await f.counters(f.ids.internalArticle)).toEqual({ views: 1, unique: 1, helpful: 0, notHelpful: 0 });
  // A repeat inside the window returns the same view and records its duration.
  expect(await record("panel-1", 4000)).toEqual({ viewId: first.viewId, deduplicated: true });
  expect(await f.counters(f.ids.internalArticle)).toEqual({ views: 1, unique: 1, helpful: 0, notHelpful: 0 });
  expect(await f.t.run(ctx => ctx.db.get(first.viewId))).toMatchObject({ duration: 4, referrer: "/app/help" });
  await record("panel-2");
  expect(await f.counters(f.ids.internalArticle)).toEqual({ views: 2, unique: 2, helpful: 0, notHelpful: 0 });
  // After the window the same session counts again, but not as a new unique view.
  await f.t.run(ctx => ctx.db.patch(first.viewId, { createdAt: Date.now() - 31 * 60 * 1000 }));
  const later = await record("panel-1");
  expect(later.deduplicated).toBe(false);
  expect(await f.counters(f.ids.internalArticle)).toEqual({ views: 3, unique: 2, helpful: 0, notHelpful: 0 });
  // The window compares against the latest view, not the first one ever.
  expect((await record("panel-1")).viewId).toBe(later.viewId);
  const view = await f.t.run(ctx => ctx.db.get(later.viewId));
  expect(view && "userId" in view).toBe(false);

  // The public mutation applies the identical sequence to a public article.
  const track = (sessionId: string) => f.t.mutation(api.kb.analytics.trackPageView, { articleId: f.ids.publicArticle, sessionId });
  const web = await track("web-1"); expect(await track("web-1")).toBe(web); await track("web-2");
  await f.t.run(ctx => ctx.db.patch(web, { createdAt: Date.now() - 31 * 60 * 1000 }));
  const webLater = await track("web-1"); expect(await track("web-1")).toBe(webLater);
  expect(await f.counters(f.ids.publicArticle)).toEqual(await f.counters(f.ids.internalArticle));
  await expect(f.t.mutation(api.kb.analytics.trackPageView, { articleId: f.ids.internalArticle, sessionId: "web-1" })).rejects.toThrow("Article not found");
});

test("recordPageView rejects unpublished articles and invalid durations", async () => {
  const f = await fixture();
  await expect(f.t.mutation(internal.kb.trustedConsumers.recordPageView, { articleId: f.ids.draft, sessionId: "panel-1" })).rejects.toThrow("Article not found");
  for (const durationMs of [-1, 3_600_001, Number.NaN, Number.POSITIVE_INFINITY])
    await expect(f.t.mutation(internal.kb.trustedConsumers.recordPageView, { articleId: f.ids.internalArticle, sessionId: "panel-1", durationMs })).rejects.toThrow("Duration");
  await expect(f.t.mutation(internal.kb.trustedConsumers.recordPageView, { articleId: f.ids.internalArticle, sessionId: "" })).rejects.toThrow("Invalid session ID");
  expect(await f.counters(f.ids.draft)).toEqual({ views: 0, unique: 0, helpful: 0, notHelpful: 0 });
  expect(await f.counters(f.ids.internalArticle)).toEqual({ views: 0, unique: 0, helpful: 0, notHelpful: 0 });
  await f.t.run(async ctx => {
    const plugins = (await ctx.db.query("settings").withIndex("by_section", q => q.eq("section", "plugins")).unique())!;
    await ctx.db.patch(plugins._id, { values: { knowledgeBaseEnabled: false } });
  });
  await expect(f.t.mutation(internal.kb.trustedConsumers.recordPageView, { articleId: f.ids.internalArticle, sessionId: "panel-1" })).rejects.toThrow();
});
