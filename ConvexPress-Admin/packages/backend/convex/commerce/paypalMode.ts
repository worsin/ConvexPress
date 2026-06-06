export const PAYPAL_PRODUCTION_BASE_URL = "https://api-m.paypal.com";
export const PAYPAL_SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";

export type PayPalMode = "sandbox" | "production";

export function normalizePayPalMode(
  mode: string | null | undefined,
): PayPalMode {
  const normalized = mode?.trim().toLowerCase();
  if (normalized === "production" || normalized === "live") {
    return "production";
  }
  return "sandbox";
}

export function getPayPalBaseUrl(mode: string | null | undefined): string {
  return normalizePayPalMode(mode) === "production"
    ? PAYPAL_PRODUCTION_BASE_URL
    : PAYPAL_SANDBOX_BASE_URL;
}
