/**
 * USPS mail class display names. Audit-corrected: rate.description
 * from API response is preferred, this map is the fallback.
 */
export function getUspsServiceName(code: string): string {
  const serviceNames: Record<string, string> = {
    USPS_GROUND_ADVANTAGE: "USPS Ground Advantage",
    PRIORITY_MAIL: "USPS Priority Mail",
    PRIORITY_MAIL_EXPRESS: "USPS Priority Mail Express",
    MEDIA_MAIL: "USPS Media Mail",
    LIBRARY_MAIL: "USPS Library Mail",
    PARCEL_SELECT: "USPS Parcel Select",
  };
  return serviceNames[code] || code.replace(/_/g, " ");
}

/**
 * Parse USPS expectedDeliveryDays / serviceStandards into a number.
 * Field can be a number or a string like "2-3 business days".
 */
export function parseUspsBusinessDays(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/\d+/);
    if (match) {
      const parsed = Number.parseInt(match[0], 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}
