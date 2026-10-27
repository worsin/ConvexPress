import { mock } from "bun:test";
import assert from "node:assert/strict";
import { getFunctionName } from "convex/server";

// Route loaders for content that may not exist, with their reads faked.
const router = await import("@tanstack/react-router");
const reads = {};
mock.module("@tanstack/react-router", () => ({ ...router, createFileRoute: () => (options) => ({ options }) }));
mock.module("@convex-dev/react-query", () => ({ convexQuery: (ref, args) => ({ name: getFunctionName(ref), args }) }));
mock.module("@/templates/sdk/registry", () => ({
  TEMPLATE_PACKS: new Map(), DEFAULT_TEMPLATE_CONFIG: { active: "core", overrides: {}, variants: {}, settings: {} },
  prepareTemplateHydration: async () => {}, listTemplatePacks: () => [], getTemplatePack: () => undefined,
  resolveSurface: () => ({ packId: "core", component: () => null }), resolveVariant: () => undefined,
}));
mock.module("@/templates/sdk/Surface", () => ({ Surface: () => null }));
const queryClient = { ensureQueryData: async ({ name }) => reads[name] ?? null };
const outcome = (promise) => promise.then((value) => ({ value }), (error) => ({ error }));

const article = (await import("../../routes/_marketing/help/$categorySlug/$articleSlug")).Route.options.loader;
const category = (await import("../../routes/_marketing/help/$categorySlug/index")).Route.options.loader;
const collection = (await import("../../routes/_marketing/help/collections/$slug")).Route.options.loader;
const author = (await import("../../routes/_marketing/author/$slug")).Route.options.loader;
const datedPost = (await import("../../routes/_marketing/blog/$year/$month/$slug")).Route.options.loader;
const datedDayPost = (await import("../../routes/_marketing/blog/$year/$month/$day/$slug")).Route.options.loader;
let cases = 0;
const isNotFound = (result) => { cases++; return result.error && router.isNotFound(result.error); };

reads["settings/queries:getPublic"] = { plugins: { knowledgeBaseEnabled: true } };
// Missing help content answers 404.
assert.ok(isNotFound(await outcome(article({ context: { queryClient }, params: { categorySlug: "start-here", articleSlug: "missing" } }))));
assert.ok(isNotFound(await outcome(category({ context: { queryClient }, params: { categorySlug: "missing" }, deps: {} }))));
assert.ok(isNotFound(await outcome(collection({ context: { queryClient }, params: { slug: "missing" } }))));
assert.ok(isNotFound(await outcome(author({ context: { queryClient }, params: { slug: "nobody" } }))));
assert.ok(isNotFound(await outcome(datedPost({ context: { queryClient }, params: { year: "2031", month: "01", slug: "missing" } }))));
assert.ok(isNotFound(await outcome(datedDayPost({ context: { queryClient }, params: { year: "2031", month: "01", day: "02", slug: "missing" } }))));

// An article under another category's address goes to its own.
reads["kb/queries:getBySlug"] = { _id: "a", title: "Signing up", slug: "signing-up", excerpt: "How to join.", category: { _id: "c", name: "Start here", slug: "start-here" } };
const moved = await outcome(article({ context: { queryClient }, params: { categorySlug: "wrong", articleSlug: "signing-up" } }));
cases++;
assert.ok(moved.error && router.isRedirect(moved.error));
assert.deepEqual(moved.error.options.params, { categorySlug: "start-here", articleSlug: "signing-up" });

// At its own address it renders, with a canonical link to that address.
const found = await outcome(article({ context: { queryClient }, params: { categorySlug: "start-here", articleSlug: "signing-up" } }));
cases++;
assert.equal(found.value.title, "Signing up");
assert.ok(found.value.seoHead.links.some((link) => link.rel === "canonical" && link.href.endsWith("/help/start-here/signing-up")));

// With the help center switched off, its pages answer 404 too.
reads["settings/queries:getPublic"] = { plugins: { knowledgeBaseEnabled: false } };
assert.ok(isNotFound(await outcome(article({ context: { queryClient }, params: { categorySlug: "start-here", articleSlug: "signing-up" } }))));
assert.ok(isNotFound(await outcome(category({ context: { queryClient }, params: { categorySlug: "start-here" }, deps: {} }))));

console.log(JSON.stringify({ cases }));
