import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import recent from "../../../../../../../blocks/commerce/recently-viewed/render";
import { prepareBlocks } from "./model";
import { createDemoContentPageHost } from "../block-data/demo-channel";
import { resolveCanonicalData } from "../block-data/portable/resolve";
import { planCanonicalData } from "../block-data/portable/planner";
const policy = { enabledPlugins: ["commerce"], capabilities: ["viewer.authorization"], disabledBlocks: [] };
const current = { scope: { websiteKey: "history-test", instanceKey: "isolated" }, documentKey: "history", revision: "1", viewerKey: "current-visitor" };
const card = (id: string) => ({ id, title: `A ${id} & <script>idea</script>`, href: `/products/${id}`, excerpt: null, createdAt: 1, image: null,
  pricing: { price: { amount: 2400, currencyCode: "USD" }, salePrice: null, salePriceFrom: null, salePriceTo: null, pricedAt: 1000 }, rating: null, cart: null });
const treeFor = (attrs: Record<string, unknown> = {}) => [{ id: "history", name: "commerce/recently-viewed", version: 1, attrs }];
async function install(items: unknown[]) {
  const tree = treeFor();
  const envelope = await resolveCanonicalData(tree, current.scope, policy, async () => null, undefined, undefined, undefined, {}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, async () => ({ items, groups: [] }));
  const host = createDemoContentPageHost(), grant = host.install({ tree, context: current, policy, envelope });
  return { host, render: (context = current) => renderToStaticMarkup(prepareBlocks(tree, { "commerce/recently-viewed": recent }, policy, { media: {} }, { grant, current: context })) };
}
test("recent history binding preserves all 48 candidates and cannot author visitor identity or selection", () => {
  const job = planCanonicalData(treeFor({limit:48}), current.scope, policy).jobs[0]!;
  expect(job.resolver).toBe("commerce.productCollection");
  expect(job.args).toEqual({mode:"recentlyViewed",count:48,showPrice:true,showRating:false,showAddToCart:false,productIds:[],categorySlug:"",tagSlug:"",groups:[]});
  for (const attrs of [{recentlyViewedIds:["other-account"]},{viewerKey:"other"},{productIds:["private"]},{mode:"manual"}]) expect(() => planCanonicalData(treeFor(attrs),current.scope,policy)).toThrow();
  for (const unavailable of [{...policy,enabledPlugins:[]},{...policy,capabilities:[]}]) expect(() => planCanonicalData(treeFor(),current.scope,unavailable)).toThrow();
});
test("recent history preserves trusted newest-first order, escapes content, and rejects another visitor or stale grant", async () => {
  const {render,host} = await install([card("notebook"),card("mug")]);
  const html=render();
  expect(html.indexOf('href="/products/notebook"')).toBeLessThan(html.indexOf('href="/products/mug"'));
  expect(html).toContain('aria-label="Recently viewed products, newest first"');
  expect(html).toContain("$24.00"); expect(html).not.toContain("<script>");
  expect(html).not.toContain("Add to cart"); expect(html).not.toContain("Clear history");
  expect(()=>render({...current,viewerKey:"another-visitor"})).toThrow();
  host.invalidate(); expect(()=>render()).toThrow();
});
test("empty history provides a usable shop link without fabricated cards or social proof", async () => {
  const {render} = await install([]); const html=render();
  expect(html).toContain("Your discoveries belong here.");
  expect(html).toContain('href="/products"'); expect(html).not.toContain("cp-collection-card");
  expect(html).not.toContain("$24.00"); expect(html).not.toContain("reviews");
});
