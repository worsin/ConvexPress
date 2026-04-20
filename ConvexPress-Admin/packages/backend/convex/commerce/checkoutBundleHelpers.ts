import { getBundlePurchaseDelta } from "../commerceBundles/runtime";

export function collectBundlePurchaseCounts(items: any[]) {
  const bundleQuantities = new Map<string, { bundleId: any; quantity: number }>();

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
