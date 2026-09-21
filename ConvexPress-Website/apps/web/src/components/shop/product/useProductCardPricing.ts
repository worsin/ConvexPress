import { useMemo } from "react";
import { resolvePrice, type PriceInput } from "@/templates/sdk/block-data/portable/commercePricing";
import { usePriceTime } from "./usePriceTime";
type Money = { amount: number; currencyCode: string };
export type CardPricing = { price: Money; compareAtPrice: Money | null; pricing?: PriceInput & { price: Money; pricedAt: number } };
/** Old deployment cards retain their received prices until the server supplies
 * the portable sale input. New cards advance without a page reload. */
export function useProductCardPricing<T extends CardPricing>(source: T): T {
  const prices = useMemo(() => source.pricing ? [source.pricing] : [], [source.pricing]);
  const now = usePriceTime(prices, source.pricing?.pricedAt);
  if (!source.pricing) return source;
  const regular = source.pricing.price;
  const active = resolvePrice(regular, source.pricing.salePrice, source.pricing, now);
  return { ...source, price: { ...regular, amount: active.amount }, compareAtPrice: active.amount < regular.amount ? regular : null };
}
