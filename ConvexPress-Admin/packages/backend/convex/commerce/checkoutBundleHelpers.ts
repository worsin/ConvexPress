import { getBundlePurchaseDelta } from "../commerceBundles/runtime";
import type { Id } from "../_generated/dataModel";

export function collectBundlePurchaseCounts(items: Array<{ metadata?: unknown; quantity: number }>) {
  const bundleQuantities = new Map<string, { bundleId: Id<"commerce_bundles">; quantity: number }>();

  for (const item of items) {
    const delta = getBundlePurchaseDelta(item.metadata, item.quantity);
    if (!delta) continue;

    const key = delta.bundleId.toString();
    const existing = bundleQuantities.get(key);
    if (existing) {
      existing.quantity += delta.quantity;
    } else {
      bundleQuantities.set(key, delta);
    }
  }

  return Array.from(bundleQuantities.values());
}
