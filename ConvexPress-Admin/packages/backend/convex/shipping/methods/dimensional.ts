/**
 * PRD B3 Dimensional (DIM Weight) Shipping calculator.
 * Billable = max(actual, DIM). DIM = (L*W*H) / divisor.
 * Standard divisors:
 *   139 = US domestic (UPS/FedEx/USPS)
 *   166 = international (UPS/FedEx)
 *   5000 = DHL metric (cm, kg)
 *   6000 = legacy international
 */

import type { NormalizedShippingQuote } from "../rates/types";
import type { WeightTier } from "./weightBased";
import { calculateWeightBased } from "./weightBased";

export type DimensionalConfig = {
  _id: string;
  zoneId: string;
  name: string;
  label: string;
  divisor: number;
  /** PRD §4.1 — inches vs centimeters for dims. */
  dimensionUnit?: "in" | "cm";
  weightUnit: "oz" | "g" | "lb" | "kg";
  /** PRD §4.1 — rounding policy for billable weight. */
  roundingMode?: "up" | "nearest" | "up_half";
  /** PRD §4.1 — floor applied to billable weight before tier lookup. */
  minBillableWeight?: number;
  /** PRD §4.1 — per-zone divisor override (rarely used). */
  perZoneDivisors?: Array<{ zoneId: string; divisor: number }>;
  tiers: WeightTier[];
  enabled: boolean;
};

export type PackageDims = {
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
  actualWeight: number; // in same weightUnit as config
};

export type DimensionalCartContext = {
  currencyCode: string;
  packages: PackageDims[];
  classes: string[];
  addressKey: string;
  cartKey: string;
  /** Optional — enables perZoneDivisors lookup. */
  matchedZoneId?: string;
};

function roundBillable(
  raw: number,
  mode: "up" | "nearest" | "up_half" | undefined,
): number {
  switch (mode) {
    case "nearest":
      return Math.round(raw);
    case "up_half":
      return Math.ceil(raw * 2) / 2;
    case "up":
    default:
      return Math.ceil(raw);
  }
}

export function computeDimWeight(
  dimensions: { lengthIn?: number; widthIn?: number; heightIn?: number },
  divisor: number,
  dimensionUnit: "in" | "cm" = "in",
): number {
  if (!dimensions.lengthIn || !dimensions.widthIn || !dimensions.heightIn) {
    return 0;
  }
  // When dimensions arrive in cm, the carrier divisor (typically 5000/6000)
  // already assumes cm. When inches, use the divisor as-is.
  const _ = dimensionUnit; // reserved for future unit normalization
  const volume = dimensions.lengthIn * dimensions.widthIn * dimensions.heightIn;
  return volume / divisor;
}

export function computeBillableWeight(
  pkg: PackageDims,
  divisor: number,
  opts: {
    dimensionUnit?: "in" | "cm";
    roundingMode?: "up" | "nearest" | "up_half";
    minBillableWeight?: number;
  } = {},
): number {
  const dim = computeDimWeight(pkg, divisor, opts.dimensionUnit ?? "in");
  const raw = Math.max(pkg.actualWeight, dim);
  const rounded = roundBillable(raw, opts.roundingMode ?? "up");
  return Math.max(rounded, opts.minBillableWeight ?? 0);
}

export function calculateDimensional(
  config: DimensionalConfig,
  cart: DimensionalCartContext,
  quoteCacheTtlSeconds = 300,
): NormalizedShippingQuote[] {
  if (!config.enabled) return [];

  // Per-zone divisor override (PRD §4.1) — otherwise use the method default.
  const effectiveDivisor =
    cart.matchedZoneId && config.perZoneDivisors
      ? (config.perZoneDivisors.find((p) => p.zoneId === cart.matchedZoneId)
          ?.divisor ?? config.divisor)
      : config.divisor;

  const totalBillableWeight = cart.packages.reduce(
    (sum, pkg) =>
      sum +
      computeBillableWeight(pkg, effectiveDivisor, {
        dimensionUnit: config.dimensionUnit,
        roundingMode: config.roundingMode,
        minBillableWeight: config.minBillableWeight,
      }),
    0,
  );

  const quotes = calculateWeightBased(
    {
      _id: config._id,
      zoneId: config.zoneId,
      name: config.name,
      label: config.label,
      weightUnit: config.weightUnit,
      tiers: config.tiers,
      enabled: config.enabled,
    },
    {
      currencyCode: cart.currencyCode,
      totalWeight: totalBillableWeight,
      classes: cart.classes,
      addressKey: cart.addressKey,
      cartKey: cart.cartKey,
    },
    quoteCacheTtlSeconds,
  );

  // Rewrite quote identity to indicate it's DIM-based.
  return quotes.map((q) => ({
    ...q,
    quoteKey: `dim:${config._id}`,
    carrierCode: "dimensional",
  }));
}
