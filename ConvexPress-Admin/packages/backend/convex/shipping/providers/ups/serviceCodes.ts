/**
 * UPS service code map + helpers. Mirrors the pattern used by FedEx/USPS/DHL
 * provider modules so rate-fetching code can look up service names by code
 * without inlining the table.
 *
 * Code reference: UPS Rating API v2409 Service.Code enumeration.
 */

export const UPS_SERVICE_NAMES: Record<string, string> = {
  "01": "UPS Next Day Air",
  "02": "UPS 2nd Day Air",
  "03": "UPS Ground",
  "07": "UPS Worldwide Express",
  "08": "UPS Worldwide Expedited",
  "11": "UPS Standard",
  "12": "UPS 3 Day Select",
  "13": "UPS Next Day Air Saver",
  "14": "UPS Next Day Air Early",
  "54": "UPS Worldwide Express Plus",
  "59": "UPS 2nd Day Air A.M.",
  "65": "UPS Worldwide Saver",
};

export function getUpsServiceName(code: string, fallback?: string): string {
  return UPS_SERVICE_NAMES[code] ?? fallback ?? `UPS Service ${code}`;
}

/**
 * Parse UPS `BusinessTransitDays` from a rated-shipment response into a
 * numeric day count. Returns undefined when the response omits transit data.
 */
export function parseUpsTransitDays(rated: any): number | undefined {
  const raw =
    rated?.TimeInTransit?.ServiceSummary?.EstimatedArrival?.BusinessTransitDays;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
