import { expect, test } from "bun:test";
import { resolveShopLayout } from "./shop-layout";
test("active pack Shop settings control cart and density", () => {
  expect(resolveShopLayout({}, { catalogVariant: "marketplace", productVariant: "split", cartPanel: "drawer", gridDensity: "dense" })).toEqual({ shopLayout: "marketplace", productLayout: "split", cartPanel: "drawer", gridDensity: "dense", previewing: false });
});
test("surface variants including Customizer draft win over saved module variants", () => {
  const saved = { "shop.catalog": "boutique" };
  const draft = { "shop.catalog": "marketplace" };
  const variants = { ...saved, ...draft };
  expect(resolveShopLayout(variants, { catalogVariant: "boutique" }, {}, true).shopLayout).toBe("marketplace");
  expect(resolveShopLayout(variants, {}, {}, true).previewing).toBe(true);
});
test("legacy preview URLs still override and invalid input falls back", () => {
  const state = resolveShopLayout({ "shop.catalog": "marketplace" }, { gridDensity: "invalid" }, { layout: "boutique", productLayout: "not-a-layout", cartPanel: "drawer" });
  expect(state).toEqual({ shopLayout: "boutique", productLayout: "classic", cartPanel: "drawer", gridDensity: "comfortable", previewing: true });
});
