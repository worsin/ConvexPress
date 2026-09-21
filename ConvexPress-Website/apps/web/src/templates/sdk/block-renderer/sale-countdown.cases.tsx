import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import sale from "../../../../../../../blocks/commerce/sale-countdown/render";
import { prepareBlocks } from "./model";
import { createDemoContentPageHost } from "../block-data/demo-channel";
import { resolveCanonicalData } from "../block-data/portable/resolve";
import { planCanonicalData } from "../block-data/portable/planner";
import { productCollectionArgsSchema } from "../block-data/portable/productCollectionContracts";
const policy = { enabledPlugins: ["commerce"], capabilities: [], disabledBlocks: [] };
const current = { scope: { websiteKey: "sale-test", instanceKey: "isolated" }, documentKey: "sale", revision: "1", viewerKey: "public" };
const card = { id: "notebook", title: "Notes & <script>ideas</script>", href: "/products/notebook", excerpt: null, createdAt: 1, image: null,
  pricing: { price: { amount: 2400, currencyCode: "USD" }, salePrice: { amount: 1800, currencyCode: "USD" }, salePriceFrom: 100, salePriceTo: 2000, pricedAt: 1000 }, rating: null, cart: null };
const treeFor = (attrs: Record<string, unknown>) => [{ id: "sale", name: "commerce/sale-countdown", version: 1, attrs }];
async function install(attrs: Record<string, unknown>, items: unknown[]) {
  const tree = treeFor(attrs);
  const envelope = await resolveCanonicalData(tree, current.scope, policy, async () => null, undefined, undefined, undefined, {}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, async () => ({ items, groups: [] }));
  const host = createDemoContentPageHost(), grant = host.install({ tree, context: current, policy, envelope });
  return { host, render: () => renderToStaticMarkup(prepareBlocks(tree, { "commerce/sale-countdown": sale }, policy, { media: {} }, { grant, current })) };
}
test("sale binding fixes sale selection and public price-only disclosures while honoring the authored limit", () => {
  const job = planCanonicalData(treeFor({ limit: 48, target: "2040-06-01T18:00:00Z" }), current.scope, policy).jobs[0]!;
  expect(job.resolver).toBe("commerce.productCollection");
  expect(job.args).toEqual({ mode: "sale", count: 48, showPrice: true, showRating: false, showAddToCart: false, productIds: [], categorySlug: "", tagSlug: "", groups: [] });
  expect(productCollectionArgsSchema.safeParse({ mode: "recent", count: 48 }).success).toBe(false);
  expect(() => planCanonicalData(treeFor({ mode: "manual", productIds: ["private"] }), current.scope, policy)).toThrow();
  expect(() => planCanonicalData(treeFor({}), current.scope, { ...policy, enabledPlugins: [] })).toThrow();
});
test("sale renders verified discounts and escaped copy without claiming cart or checkout actions", async () => {
  const { render, host } = await install({ title: "A little less", target: "2040-06-01T18:00:00Z" }, [card]);
  const html = render();
  for (const text of ["$18.00", "$24.00", "2040-06-01T18:00:00.000Z", 'href="/products/notebook"']) expect(html).toContain(text);
  expect(html).not.toContain("<script>"); expect(html).not.toContain("Add to cart");
  expect(html).not.toContain('aria-label="Time remaining"'); // SSR is a stable date, not a sampled tick.
  host.invalidate(); expect(render).toThrow();
});
test("sale does not manufacture urgency or discounts from missing, future, expired or ordinary prices", async () => {
  for (const pricing of [null, { ...card.pricing, salePrice: null }, { ...card.pricing, salePriceFrom: 1500 }, { ...card.pricing, salePriceTo: 500 }, { ...card.pricing, salePrice: { amount: 2600, currencyCode: "USD" } }]) {
    const { render } = await install({ target: "2040-06-01T18:00:00Z" }, [{ ...card, pricing }]);
    const html = render(); expect(html).toContain("No offers right now."); expect(html).not.toContain("Campaign ends"); expect(html).not.toContain('href="/products/notebook"');
  }
});
test("sale campaign expiry removes product links; zero-dollar offers remain valid before expiry", async () => {
  const ended = await install({ target: "1970-01-01T00:00:00.500Z" }, [card]);
  expect(ended.render()).toContain("This campaign has ended."); expect(ended.render()).not.toContain('href="/products/notebook"');
  const free = await install({}, [{ ...card, pricing: { ...card.pricing, salePrice: { amount: 0, currencyCode: "USD" } } }]);
  expect(free.render()).toContain("$0.00"); expect(free.render()).not.toContain("Campaign ends");
});
