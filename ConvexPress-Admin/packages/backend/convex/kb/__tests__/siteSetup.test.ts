/**
 * Knowledge base site setup (PR 077): a site's code writes its help
 * center's starting categories and articles. Repeats change nothing; changed
 * content refreshes what nobody edited; an editor's change or removal stands.
 */
import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { internal } from "../../_generated/api";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/kb/siteSetup.ts": () => import("../siteSetup"),
};

const doc = (...paragraphs: string[]) =>
  JSON.stringify({ type: "doc", content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })) });

async function fixture() {
  const t = convexTest({ schema, modules });
  const actorId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "setup@example.invalid", authSource: "local", status: "active", emailVerified: true, createdAt: 1, updatedAt: 1 }),
  );
  const category = (overrides: Partial<{ name: string; order: number }> = {}) =>
    t.mutation(internal.kb.siteSetup.writeCategory, { setupKey: "site:getting-started", name: "Getting started", slug: "getting-started", order: 1, actorId, ...overrides });
  return { t, actorId, category };
}

describe("knowledge base site setup", () => {
  test("writes a category and its article once, published and counted", async () => {
    const f = await fixture();
    const created = await f.category();
    expect(created.outcome).toBe("created");
    expect(await f.category()).toEqual({ outcome: "unchanged", categoryId: created.categoryId });
    if (!created.categoryId) throw new Error("category missing");
    const write = (content = doc("Choose a package, then pay.")) =>
      f.t.mutation(internal.kb.siteSetup.writeArticle, {
        setupKey: "site:signing-up", title: "Signing up", slug: "signing-up", excerpt: "How to sign up.", content, categoryId: created.categoryId!, sortOrder: 1, actorId: f.actorId,
      });
    const first = await write();
    expect(first.outcome).toBe("created");
    expect(await write()).toEqual({ outcome: "unchanged", articleId: first.articleId });
    const state = await f.t.run(async (ctx) => ({
      article: first.articleId ? await ctx.db.get("kb_articles", first.articleId) : null,
      category: await ctx.db.get("kb_categories", created.categoryId!),
    }));
    expect(state.article).toMatchObject({ status: "published", title: "Signing up", contentPlainText: "Choose a package, then pay.", version: 1 });
    expect(state.category).toMatchObject({ isPublished: true, articleCount: 1 });

    // New content refreshes an article nobody edited.
    expect((await write(doc("Choose a package, sign up, then pay."))).outcome).toBe("updated");
    // The counts setup changed don't read as an editor's edit of the category.
    expect((await f.category({ order: 2 })).outcome).toBe("updated");
  });

  test("keeps what an editor changed or removed, and never takes another record's slug", async () => {
    const f = await fixture();
    const { categoryId } = await f.category();
    if (!categoryId) throw new Error("category missing");
    const write = (text: string) =>
      f.t.mutation(internal.kb.siteSetup.writeArticle, {
        setupKey: "site:inviting", title: "Inviting your team", slug: "inviting-your-team", excerpt: "Invite staff.", content: doc(text), categoryId, sortOrder: 2, actorId: f.actorId,
      });
    const { articleId } = await write("From Staff, choose Invite.");
    if (!articleId) throw new Error("article missing");
    await f.t.run((ctx) => ctx.db.patch("kb_articles", articleId, { title: "Invite your team" }));
    expect((await write("From Staff, choose Invite someone.")).outcome).toBe("kept_edited");
    await f.t.run((ctx) => ctx.db.delete("kb_articles", articleId));
    expect(await write("Again")).toEqual({ outcome: "kept_removed", articleId: null });

    await f.t.run((ctx) => ctx.db.patch("kb_categories", categoryId, { name: "Start here" }));
    expect((await f.category({ order: 5 })).outcome).toBe("kept_edited");

    expect(
      (await f.t.mutation(internal.kb.siteSetup.writeCategory, { setupKey: "site:other", name: "Other", slug: "getting-started", order: 3, actorId: f.actorId })).outcome,
    ).toBe("slug_taken");
  });

  test("refuses what it can't write", async () => {
    const f = await fixture();
    const { categoryId } = await f.category();
    if (!categoryId) throw new Error("category missing");
    const base = { setupKey: "site:x", title: "X", slug: "x", excerpt: "", categoryId, sortOrder: 0, actorId: f.actorId };
    await expect(f.t.mutation(internal.kb.siteSetup.writeArticle, { ...base, content: "not json" })).rejects.toThrow(/TipTap/);
    await expect(f.t.mutation(internal.kb.siteSetup.writeArticle, { ...base, content: doc("ok"), slug: "Not A Slug" })).rejects.toThrow(/slug/);
    await expect(f.t.mutation(internal.kb.siteSetup.writeArticle, { ...base, content: doc("ok"), setupKey: "has space" })).rejects.toThrow(/setup key/);
  });
});
