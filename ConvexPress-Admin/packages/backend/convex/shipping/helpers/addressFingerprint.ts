/**
 * Deterministic fingerprint for an address. Used by A5 validation cache
 * and by the rate pipeline's stale-quote detection (reuses the same shape
 * as addressKey in commerce/checkout.ts).
 */
export function computeAddressFingerprint(address: {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
}): string {
  return [
    (address.line1 ?? "").trim().toUpperCase(),
    (address.line2 ?? "").trim().toUpperCase(),
    (address.city ?? "").trim().toUpperCase(),
    (address.state ?? "").trim().toUpperCase(),
    (address.postalCode ?? "").trim().toUpperCase(),
    (address.countryCode ?? "").trim().toUpperCase(),
  ].join("|");
}
