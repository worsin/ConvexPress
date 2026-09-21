import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import shippingBlock from "../../../../../../../blocks/commerce/shipping-promise/render";
import { prepareBlocks } from "./model";
import { createDemoContentPageHost } from "../block-data/demo-channel";
import { planCanonicalData } from "../block-data/portable/planner";
import { shippingPolicyResultSchema } from "../block-data/portable/shippingPolicyContracts";
import { resolveShippingPolicyDemo, demoShippingPolicy } from "../../../../block-demo/shipping-policy-adapter";
const tree = [{ id: "shipping", name: "commerce/shipping-promise", version: 1, attrs: {} }];
const policy = { enabledPlugins: ["commerce"], capabilities: ["viewer.authorization"], disabledBlocks: [] };
const current = { scope: { websiteKey: "store", instanceKey: "staging" }, documentKey: "shipping", revision: "1", viewerKey: "visitor" };
async function installed(result = demoShippingPolicy) {
  const envelope = await resolveShippingPolicyDemo(tree, current.scope, policy, result);
  const host = createDemoContentPageHost(), grant = host.install({ tree, context: current, policy, envelope });
  return { host, render: (context = current) => renderToStaticMarkup(prepareBlocks(tree, { "commerce/shipping-promise": shippingBlock }, policy, { media: {} }, { grant, current: context })) };
}
test("shipping policies render only trusted configured copy with accessible links", async () => {
  const { render } = await installed(); const html = render();
  expect(html).toContain('aria-label="Store policies"');
  expect(html).toContain('href="/shipping"');
  expect(html.indexOf("Packed with care")).toBeLessThan(html.indexOf("A little reassurance"));
  expect(html).not.toContain("Free shipping"); expect(html).not.toContain("30-day");
  const escaped = await installed({ items: [{ icon: "check", title: "<script>bad</script>", body: "Safe <img> copy", href: null }] });
  expect(escaped.render()).not.toContain("<script>"); expect(escaped.render()).toContain("&lt;img&gt;");
});
test("empty and withdrawn policies make no public promises", async () => {
  const empty = await installed({ items: [] }); expect(empty.render()).not.toContain("Store policies");
  const { host, render } = await installed();
  expect(() => render({ ...current, viewerKey: "another" })).toThrow();
  host.invalidate(); expect(() => render()).toThrow();
});
test("shipping block rejects authored overrides and requires actual commerce authorization policy", () => {
  expect(planCanonicalData(tree, current.scope, policy).jobs[0]?.args).toEqual({});
  expect(() => planCanonicalData([{ ...tree[0], attrs: { items: [{ title: "Free worldwide delivery" }] } }], current.scope, policy)).toThrow();
  expect(() => planCanonicalData(tree, current.scope, { ...policy, enabledPlugins: [] })).toThrow();
  expect(() => planCanonicalData(tree, current.scope, { ...policy, capabilities: [] })).toThrow();
  expect(() => shippingPolicyResultSchema.parse({ items: [{ icon: "check", title: "Bad URL", body: "", href: "javascript:alert(1)" }] })).toThrow();
});
