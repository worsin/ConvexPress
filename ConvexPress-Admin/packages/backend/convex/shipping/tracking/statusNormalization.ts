/**
 * PRD D2 cross-carrier status normalization.
 * Carriers each use their own status codes. We normalize to 7 states.
 */

export type NormalizedTrackingStatus =
  | "pending"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "exception"
  | "returned";

/**
 * ShipStation (ShipEngine): 2-letter codes.
 * DE=Delivered, IT=In Transit, AC=Accepted/picked up, AT=Attempt (exception),
 * EX=Exception, UN=Unknown, NY=Not Yet In System (pending).
 */
export function normalizeShipStationStatus(code: string): NormalizedTrackingStatus {
  const c = code?.toUpperCase();
  if (c === "DE") return "delivered";
  if (c === "IT") return "in_transit";
  if (c === "AC") return "picked_up";
  if (c === "AT" || c === "EX") return "exception";
  if (c === "NY") return "pending";
  return "in_transit";
}

/**
 * FedEx: 2-letter codes from latestStatusDetail.code.
 * DL=Delivered, IT=In Transit, OD=Out for Delivery, DP=Departed, AR=Arrived,
 * PU=Picked Up, DE=Delayed (exception), CA=Cancelled.
 */
export function normalizeFedexStatus(code: string): NormalizedTrackingStatus {
  const c = code?.toUpperCase();
  if (c === "DL") return "delivered";
  if (c === "OD") return "out_for_delivery";
  if (c === "IT" || c === "DP" || c === "AR") return "in_transit";
  if (c === "PU") return "picked_up";
  if (c === "DE" || c === "CA") return "exception";
  return "in_transit";
}

/**
 * UPS: `currentStatus.description` strings (free-form).
 */
export function normalizeUpsStatus(description: string): NormalizedTrackingStatus {
  const d = description?.toLowerCase() ?? "";
  if (d.includes("delivered")) return "delivered";
  if (d.includes("out for delivery")) return "out_for_delivery";
  if (d.includes("picked up")) return "picked_up";
  if (d.includes("exception") || d.includes("problem")) return "exception";
  if (d.includes("return")) return "returned";
  return "in_transit";
}

/**
 * USPS: /tracking/v3/tracking eventType strings.
 * Order matters — check the more-specific phrases first.
 */
export function normalizeUspsStatus(eventType: string): NormalizedTrackingStatus {
  const e = eventType?.toLowerCase() ?? "";
  // Specific multi-word matches first.
  if (e.includes("out for delivery")) return "out_for_delivery";
  if (e.includes("return") || e.includes("refused")) return "returned";
  if (e.includes("undeliverable") || e.includes("exception")) return "exception";
  // Generic "delivered" comes after "out for delivery" check.
  if (e.includes("deliver")) return "delivered";
  if (e.includes("pickup") || e.includes("picked up") || e.includes("accept")) {
    return "picked_up";
  }
  return "in_transit";
}
