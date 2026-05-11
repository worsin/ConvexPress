export type ShippingAddressFingerprintInput = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
} | null | undefined;

export type CartFingerprintItem = {
  productId: string;
  variantId?: string | null;
  quantity: number;
};

export type ShippingQuoteFingerprint = {
  addressKey?: string;
  cartKey?: string;
  expiresAt?: number;
};

export function computeAddressKey(address: ShippingAddressFingerprintInput): string {
  if (!address) return "";
  return [
    address.line1 ?? "",
    address.line2 ?? "",
    address.city ?? "",
    address.state ?? "",
    address.postalCode ?? "",
    address.countryCode ?? "",
  ].join("|");
}

export function computeCartKey(items: CartFingerprintItem[]): string {
  return [...items]
    .map((item) => `${item.productId}:${item.variantId ?? ""}:${item.quantity}`)
    .sort()
    .join(",");
}

export function isQuoteUsableForCheckout(
  quote: ShippingQuoteFingerprint,
  expectedAddressKey: string,
  expectedCartKey: string,
  now = Date.now(),
): boolean {
  if (Number(quote.expiresAt ?? 0) <= now) return false;
  if (quote.addressKey && quote.addressKey !== expectedAddressKey) return false;
  if (quote.cartKey && quote.cartKey !== expectedCartKey) return false;
  return true;
}
