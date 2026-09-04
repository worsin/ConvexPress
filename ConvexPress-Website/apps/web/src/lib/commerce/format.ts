/** Money helpers for storefront components. Amounts are in minor units. */

export function formatMoney(amount: number, currencyCode = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currencyCode}`;
  }
}

export function percentOff(price: number, compareAt: number | null | undefined): number | null {
  if (!compareAt || compareAt <= price) return null;
  return Math.round((1 - price / compareAt) * 100);
}
