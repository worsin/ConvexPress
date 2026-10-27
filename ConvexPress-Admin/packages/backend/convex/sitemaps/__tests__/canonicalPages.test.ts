/**
 * The pages sitemap lists each page at its canonical address (/page/<path>),
 * the one its canonical link names, and lists the static front page only as
 * the homepage.
 */
import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { internal } from "../../_generated/api";
import { buildContentUrl } from "../../helpers/sitemap";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/sitemaps/internals.ts": () => import("../internals"),
};

test("content URLs are the canonical addresses, nested paths included", () => {
  const site = "https://example.invalid/";
  expect(buildContentUrl(site, { type: "page", slug: "about" })).toBe("https://example.invalid/page/about");
  expect(buildContentUrl(site, { type: "page", slug: "cme", path: "/services/cme" })).toBe("https://example.invalid/page/services/cme");
  expect(buildContentUrl(site, { type: "post", slug: "hello" })).toBe("https://example.invalid/blog/hello");
});

test("the static front page is left out of the pages it lists", async () => {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const authorId = await ctx.db.insert("users", { authSource: "local", email: "admin@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "general", values: { siteUrl: "https://example.invalid" }, updatedAt: 1, updatedBy: authorId });
    const page = (slug: string, path?: string) =>
      ctx.db.insert("posts", {
        type: "page", title: slug, slug, ...(path ? { path } : {}), status: "publish", visibility: "public", authorId,
        commentStatus: "closed", publishedAt: 1, createdAt: 1, updatedAt: 1,
      });
    const home = await page("homepage", "/homepage");
    await page("about", "/about");
    await page("cme", "/services/cme");
    await ctx.db.insert("settings", { section: "reading", values: { homepageDisplays: "static_page", homepageId: home }, updatedAt: 1, updatedBy: authorId });
    return { home };
  });
  const data = await t.query(internal.sitemaps.internals.gatherSitemapData, { types: ["pages"] });
  const slugs = (data.pages ?? []).map((page) => page.slug).sort();
  expect(slugs).toEqual(["about", "cme"]);
  expect((data.pages ?? []).some((page) => page.id === String(ids.home))).toBe(false);
});
