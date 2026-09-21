import { resolveCanonicalData } from "../src/templates/sdk/block-data/portable/resolve";
import type { DataScope, ResolverPolicy } from "../src/templates/sdk/block-data/portable/contracts";
import type { ShippingPolicyResult } from "../src/templates/sdk/block-data/portable/shippingPolicyContracts";
/** Isolated, clearly labelled demo copy. Never installed as a store default. */
export const demoShippingPolicy: ShippingPolicyResult = { items: [
  { icon: "clock", title: "Packed with care", body: "Our small team prepares each order by hand, with considered packaging and a note from the house.", href: "/shipping" },
  { icon: "heart", title: "A little reassurance", body: "Questions about an order? Talk to a person who knows the collection and can help with the next step.", href: "/contact" },
  { icon: "check", title: "Made to be kept", body: "A few good things, chosen for everyday use. Read our care notes to keep yours at their best.", href: "/care" },
] };
export function resolveShippingPolicyDemo(tree: unknown, scope: DataScope, policy: ResolverPolicy, result = demoShippingPolicy) {
  return resolveCanonicalData(tree, scope, policy, async () => null, undefined, undefined, undefined, {}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, async () => result);
}
