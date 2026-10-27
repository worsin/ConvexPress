import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../_generated/api";
import schema from "../../schema";

const modules = {
  "./convex/_generated/server.js": () => import("../../_generated/server.js"),
  "./convex/_generated/api.js": () => import("../../_generated/api.js"),
  "./convex/routing/public.ts": () => import("../public"),
};

async function fixture() {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async ctx => {
    const base = { source: "manual" as const, enabled: true, hitCount: 7, note: "PRIVATE_NOTE", createdAt: 1, updatedAt: 1 };
    const exact = await ctx.db.insert("redirects", { ...base, sourceUrl: "/old", targetUrl: "/new", statusCode: 301, matchType: "exact" });
    const prefix = await ctx.db.insert("redirects", { ...base, sourceUrl: "/docs/", targetUrl: "/help/", statusCode: 308, matchType: "prefix" });
    await ctx.db.insert("redirects", { ...base, sourceUrl: "/off", targetUrl: "/never", statusCode: 302, matchType: "exact", enabled: false });
    return { exact, prefix };
  });
  return { t, ids };
}

test("a matched rule resolves to its public projection, never the stored document", async () => {
  const { t, ids } = await fixture();
  const exact = await t.query(api.routing.public.resolveRedirect, { url: "/old" });
  expect(exact).toEqual({ _id: ids.exact, sourceUrl: "/old", targetUrl: "/new", statusCode: 301, matchType: "exact" });
  expect(JSON.stringify(exact)).not.toContain("PRIVATE_NOTE");
  const prefix = await t.query(api.routing.public.resolveRedirect, { url: "/docs/setup" });
  expect(prefix).toEqual({ _id: ids.prefix, sourceUrl: "/docs/", targetUrl: "/help/", statusCode: 308, matchType: "prefix", _resolvedTargetUrl: "/help/setup" });
  expect(await t.query(api.routing.public.resolveRedirect, { url: "/off" })).toBeNull();
});

test("the resolved id records a hit", async () => {
  const { t, ids } = await fixture();
  const exact = await t.query(api.routing.public.resolveRedirect, { url: "/old" });
  await t.mutation(api.routing.public.recordRedirectHit, { redirectId: exact!._id });
  expect((await t.run(ctx => ctx.db.get("redirects", ids.exact)))?.hitCount).toBe(8);
});

test("a rule matches its address with or without a trailing slash", async () => {
  const { t, ids } = await fixture();
  // "/old" was saved without one; "/docs/" with one.
  expect((await t.query(api.routing.public.resolveRedirect, { url: "/old/" }))?._id).toBe(ids.exact);
  expect((await t.query(api.routing.public.resolveRedirect, { url: "/docs" }))?._resolvedTargetUrl).toBe("/help/");
  expect((await t.query(api.routing.public.resolveRedirect, { url: "/docs/setup?ref=mail" }))?._resolvedTargetUrl).toBe("/help/setup?ref=mail");
  // A rule saved with one still matches the address the site now serves.
  await t.run(async (ctx) => {
    await ctx.db.insert("redirects", { source: "permalink_change", enabled: true, hitCount: 0, createdAt: 1, updatedAt: 1, sourceUrl: "/2024/01/hello/", targetUrl: "/blog/hello", statusCode: 301, matchType: "exact" });
  });
  expect((await t.query(api.routing.public.resolveRedirect, { url: "/2024/01/hello" }))?.targetUrl).toBe("/blog/hello");
  expect(await t.query(api.routing.public.resolveRedirect, { url: "/off/" })).toBeNull();
});
