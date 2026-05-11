/**
 * FedEx service code → friendly name. Both FEDEX_HOME_DELIVERY and
 * GROUND_HOME_DELIVERY map to "FedEx Home Delivery" per audit notes.
 */
export function getFedexServiceName(code: string): string {
  const serviceNames: Record<string, string> = {
    FEDEX_GROUND: "FedEx Ground",
    FEDEX_HOME_DELIVERY: "FedEx Home Delivery",
    GROUND_HOME_DELIVERY: "FedEx Home Delivery",
    FEDEX_2_DAY: "FedEx 2Day",
    FEDEX_2_DAY_AM: "FedEx 2Day A.M.",
    FEDEX_EXPRESS_SAVER: "FedEx Express Saver",
    STANDARD_OVERNIGHT: "FedEx Standard Overnight",
    PRIORITY_OVERNIGHT: "FedEx Priority Overnight",
    FIRST_OVERNIGHT: "FedEx First Overnight",
    INTERNATIONAL_PRIORITY: "FedEx International Priority",
    INTERNATIONAL_ECONOMY: "FedEx International Economy",
    INTERNATIONAL_FIRST: "FedEx International First",
  };
  return serviceNames[code] || code.replace(/_/g, " ");
}

export function parseFedexTransitDays(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const match = value.match(/\d+/);
  if (!match) return undefined;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}
