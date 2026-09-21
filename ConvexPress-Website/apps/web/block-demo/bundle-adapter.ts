import { resolveCanonicalData } from "../src/templates/sdk/block-data/portable/resolve";
import type { DataScope, ResolverPolicy } from "../src/templates/sdk/block-data/portable/contracts";
import type { BundleOffer, BundleChoice, BundleQuote } from "../src/templates/sdk/block-data/portable/bundleOfferContracts";
import notebook from "./assets/aster-house-field-notebook.png";

/** Fictional set and prices. This module is never imported by production. */
export const bundleDemo: BundleOffer = {
  id: "demo-studio-set", productId: "demo-set-owner", name: "The Slow Morning Set", slug: "slow-morning-set", href: "/bundles/slow-morning-set/",
  description: "A fresh page. A favorite cup. The small things that make room for a good day.", images: [notebook.startsWith("/") ? notebook : `/${notebook}`],
  configurable: true, minItems: 1, maxItems: 5, currencyCode: "USD",
  components: [
    { id: "notebook", productId: "demo-notebook", title: "The Field Notebook", href: "/products/field-notebook/", quantity: 1, minQuantity: 1, maxQuantity: 3, required: true, selectedByDefault: true, allowVariantChange: true, variantId: "forest", unitPriceAmount: 2400,
      variants: [{ id: "forest", title: "Forest", unitPriceAmount: 2400, available: true }, { id: "ink", title: "Ink", unitPriceAmount: 2800, available: true }, { id: "sand", title: "Sand", unitPriceAmount: 2400, available: false }] },
    { id: "mug", productId: "demo-mug", title: "The Morning Mug", href: "/products/morning-mug/", quantity: 1, minQuantity: 1, maxQuantity: 2, required: false, selectedByDefault: true, allowVariantChange: false, unitPriceAmount: 3800, variants: [] },
    { id: "pencil", productId: "demo-pencil", title: "A Good Pencil", href: "/products/good-pencil/", quantity: 1, minQuantity: 1, maxQuantity: 3, required: false, selectedByDefault: false, allowVariantChange: false, unitPriceAmount: 600, variants: [] },
  ],
  defaults: [{ componentId: "notebook", variantId: "forest", quantity: 1 }, { componentId: "mug", quantity: 1 }],
  quote: { regularPrice: 6200, bundlePrice: 5580, savings: 620, currencyCode: "USD", available: true, pricedAt: 1, recheckAt: null },
};
export function demoBundleQuote(offer: BundleOffer, choices: BundleChoice[]): BundleQuote {
  const total = choices.reduce((sum, choice) => { const component = offer.components.find(item => item.id === choice.componentId)!; const price = component.variants.find(item => item.id === choice.variantId)?.unitPriceAmount ?? component.unitPriceAmount; return sum + price * choice.quantity; }, 0);
  const count = choices.reduce((sum, choice) => sum + choice.quantity, 0), bundlePrice = Math.round(total * .9);
  return { regularPrice: total, bundlePrice, savings: total - bundlePrice, currencyCode: "USD", available: offer.quote?.available === true && count >= (offer.minItems ?? 0) && count <= (offer.maxItems ?? Infinity), pricedAt: 1, recheckAt: null };
}
export function resolveBundleDemo(tree: unknown, scope: DataScope, policy: ResolverPolicy, scenario = "configurable") {
  const params: Parameters<typeof resolveCanonicalData> = [tree, scope, policy, async () => null];
  params[39] = async args => {
    if (args.bundle !== bundleDemo.id) return { bundle: null };
    const offer = { ...bundleDemo, configurable: scenario !== "fixed", defaults: scenario === "fixed" ? bundleDemo.components.map(component => ({ componentId: component.id, variantId: component.variantId, quantity: component.quantity })) : bundleDemo.defaults };
    offer.quote = demoBundleQuote(offer, offer.defaults);
    offer.quote.available = scenario !== "sold-out";
    return { bundle: offer };
  };
  return resolveCanonicalData(...params);
}
