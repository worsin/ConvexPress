/**
 * Settings › Reading › "Discourage search engines" (upstream PR 063): robots.txt
 * disallows everything and the sitemaps list nothing while it's set.
 */
import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../_generated/api";
import schema from "../../schema";

const modules = {
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/sitemaps/queries.ts": () => import("../queries"),
};

async function fixture(searchEngineVisibility?: boolean) {
  const t = convexTest({ schema, modules });
  await t.run(async (ctx) => {
    const user = await ctx.db.insert("users", { authSource: "local", email: "admin@example.invalid", emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("settings", { section: "general", values: { siteUrl: "https://preview.example.invalid" }, updatedAt: 1, updatedBy: user });
    if (searchEngineVisibility !== undefined) {
      await ctx.db.insert("settings", { section: "reading", values: { searchEngineVisibility }, updatedAt: 1, updatedBy: user });
    }
    await ctx.db.insert("sitemapCache", { type: "index", page: 0, xml: "<sitemapindex><sitemap>cached</sitemap></sitemapindex>", generatedAt: 5, urlCount: 9, generationDurationMs: 1, contentHash: "hash", isStale: false });
  });
  return t;
}

test("a site that discourages search engines disallows everything and lists no pages", async () => {
  const t = await fixture(false);
  expect(await t.query(api.sitemaps.queries.getRobotsContent, {})).toBe("User-agent: *\nDisallow: /\n");
  const index = await t.query(api.sitemaps.queries.getIndex, {});
  expect(index?.urlCount).toBe(0);
  expect(index?.xml).not.toContain("cached");
  expect((await t.query(api.sitemaps.queries.getSubSitemap, { type: "pages", page: 1 }))?.xml).toContain("<urlset");
});

test("a visible site keeps its own robots rules and cached sitemap", async () => {
  for (const visible of [true, undefined]) {
    const t = await fixture(visible);
    expect(await t.query(api.sitemaps.queries.getRobotsContent, {})).not.toBe("User-agent: *\nDisallow: /\n");
    const index = await t.query(api.sitemaps.queries.getIndex, {});
    expect(index === null || index.xml.includes("cached")).toBe(true);
  }
});
