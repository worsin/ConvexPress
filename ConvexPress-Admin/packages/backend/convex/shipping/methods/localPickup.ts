/**
 * PRD B7 Local Pickup.
 * Zero or handling-fee cost. Customer selects pickup location.
 */

import type { NormalizedShippingQuote } from "../rates/types";

export type LocalPickupConfig = {
  _id: string;
  zoneId: string;
  name: string;
  label: string;
  allowedPickupLocationIds: string[];
  handlingFee?: number;
  pickupInstructions?: string;
  requirePickupLocationSelection?: boolean;
  enabled: boolean;
};

export type LocalPickupCartContext = {
  currencyCode: string;
  availablePickupLocationIds: string[]; // intersection of merchant-enabled and zone-allowed
  addressKey: string;
  cartKey: string;
};

export function calculateLocalPickup(
  config: LocalPickupConfig,
  cart: LocalPickupCartContext,
  quoteCacheTtlSeconds = 300,
): NormalizedShippingQuote[] {
  if (!config.enabled) return [];

  // At least one pickup location must still be enabled.
  const validLocations = config.allowedPickupLocationIds.filter((id) =>
    cart.availablePickupLocationIds.includes(id),
  );
  if (validLocations.length === 0) return [];

  const handlingFee = config.handlingFee ?? 0;

  return [
    {
      quoteKey: `pickup:${config._id}`,
      provider: "manual",
      carrierCode: "local_pickup",
      carrierName: config.label,
      serviceCode: config.name,
      serviceName: config.label,
      amount: Math.round(handlingFee * 100),
      currency: cart.currencyCode,
      isCheapest: false,
      isFastest: false,
      isBestValue: false,
      addressKey: cart.addressKey,
      cartKey: cart.cartKey,
      expiresAt: Date.now() + quoteCacheTtlSeconds * 1000,
    },
  ];
}
