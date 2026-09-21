/** Portable base-price contract. Contextual price lists, taxes and checkout
 * discounts are resolved separately. Sale end timestamps are inclusive. */
export type PriceAmount = { amount: number; currencyCode?: string };
export type SaleWindow = { salePriceFrom?: number; salePriceTo?: number };
export type PriceInput = SaleWindow & { price: PriceAmount; salePrice?: PriceAmount | null };
export type PriceDecision = { amount: number; saleActive: boolean; recheckAt: number | null };

export function resolvePrice(regular: PriceAmount, sale: PriceAmount | null | undefined, window: SaleWindow, now = Date.now()): PriceDecision {
  if (!Number.isFinite(regular.amount) || regular.amount < 0 || !Number.isFinite(now))
    throw new Error("Invalid regular price or pricing time");
  const fallback: PriceDecision = { amount: regular.amount, saleActive: false, recheckAt: null };
  if (!sale || !Number.isFinite(sale.amount) || sale.amount < 0) return fallback;
  if (regular.currencyCode && sale.currencyCode && regular.currencyCode !== sale.currencyCode) return fallback;
  const { salePriceFrom: from, salePriceTo: to } = window;
  if ((from !== undefined && !Number.isFinite(from)) ||
      (to !== undefined && !Number.isFinite(to)) ||
      (from !== undefined && to !== undefined && from > to)) return fallback;
  if (from !== undefined && now < from) return { ...fallback, recheckAt: Math.ceil(from) };
  if (to !== undefined && now > to) return fallback;
  return { amount: sale.amount, saleActive: true, recheckAt: to === undefined ? null : Math.floor(to) + 1 };
}
export function activePriceAmount(regular: PriceAmount, sale: PriceAmount | null | undefined, window: SaleWindow, now = Date.now()): number {
  return resolvePrice(regular, sale, window, now).amount;
}
export function isPublicVariant(variant: { status?: string }): boolean {
  return variant.status === undefined || variant.status === "publish";
}
export function nextPriceBoundary(prices: readonly PriceInput[], now: number): number | null {
  let next: number | null = null;
  for (const price of prices) {
    const boundary = resolvePrice(price.price, price.salePrice, price, now).recheckAt;
    if (boundary !== null && boundary > now) next = Math.min(next ?? boundary, boundary);
  }
  return next;
}
