import { isPublicVariant, resolvePrice, type PriceAmount, type PriceInput } from "@/templates/sdk/block-data/portable/commercePricing";
export type PricedVariant = { status?: string; price?: PriceAmount; salePrice?: PriceAmount; salePriceFrom?: number; salePriceTo?: number };
export type PricedProduct = { basePrice?: PriceAmount; salePrice?: PriceAmount; salePriceFrom?: number; salePriceTo?: number; displayPrice?: number; compareAtPrice?: number };
const valid = (amount: unknown): amount is number => typeof amount === "number" && Number.isFinite(amount) && amount >= 0;
export function productPriceInputs(product: PricedProduct | null, variants: readonly PricedVariant[]): PriceInput[] {
  const inputs: PriceInput[] = [];
  if (product?.basePrice && valid(product.basePrice.amount)) inputs.push({ ...product, price: product.basePrice });
  for (const variant of variants) if (isPublicVariant(variant) && variant.price && valid(variant.price.amount)) inputs.push({ ...variant, price: variant.price });
  return inputs;
}
export function productPricing(product: PricedProduct | null, current: PricedVariant | null, variants: readonly PricedVariant[], isVariable: boolean, now: number) {
  let price: number | undefined, regularPrice: number | undefined;
  if (current) {
    if (isPublicVariant(current) && current.price && valid(current.price.amount)) {
      price = resolvePrice(current.price, current.salePrice, current, now).amount;
      regularPrice = current.price.amount;
    }
  } else if (!isVariable && product?.basePrice && valid(product.basePrice.amount)) {
    price = resolvePrice(product.basePrice, product.salePrice, product, now).amount;
    regularPrice = product.basePrice.amount;
  } else if (!isVariable) {
    // Older deployments may still return only displayPrice during a rolling upgrade.
    price = valid(product?.displayPrice) ? product.displayPrice : undefined;
    regularPrice = valid(product?.compareAtPrice) ? product.compareAtPrice : undefined;
  }
  const amounts = isVariable ? productPriceInputs(null, variants).map(input => resolvePrice(input.price, input.salePrice, input, now).amount) : [];
  return { price, regularPrice, showCompare: valid(price) && valid(regularPrice) && regularPrice > price,
    priceRange: amounts.length ? { min: Math.min(...amounts), max: Math.max(...amounts) } : null };
}
