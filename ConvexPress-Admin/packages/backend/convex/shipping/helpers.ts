/**
 * Shipping System - Shared Helpers
 *
 * Provides:
 *   - SHIPPING_PROVIDERS: canonical list of supported shipping providers
 *   - assertShippingProvider: guard that throws on unknown provider codes
 *   - requireShippingAdmin: permission guard for shipping admin actions
 *   - getShippingSettingsSection: returns the settings section key for shipping
 *   - rankShippingQuotes: annotates an array of quotes with cheapest/fastest/best-value flags
 *
 * Usage:
 *   import { rankShippingQuotes, SHIPPING_PROVIDERS } from "./helpers";
 */

import { ConvexError } from "convex/values";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

// ─── Provider Registry ───────────────────────────────────────────────────────

/**
 * All supported shipping provider codes.
 * Used for validation, UI display, and settings keys.
 */
export const SHIPPING_PROVIDERS = [
  "ups",
  "usps",
  "fedex",
  "dhl",
  "shipstation",
] as const;

export type ShippingProvider = (typeof SHIPPING_PROVIDERS)[number];

// ─── NormalizedShippingQuote ─────────────────────────────────────────────────

/**
 * Carrier-agnostic normalized shipping quote.
 * All amounts are in cents (integer) to avoid floating-point issues.
 */
export type NormalizedShippingQuote = {
  /** Unique key for deduplication: "{provider}:{carrierCode}:{serviceCode}" */
  quoteKey: string;
  /** Provider code: "ups" | "fedex" | "usps" | "dhl" | "shipstation" */
  provider: ShippingProvider;
  /** Raw carrier code from the provider (e.g. "UPS", "FEDEX") */
  carrierCode: string;
  /** Human-readable carrier name (e.g. "UPS", "FedEx") */
  carrierName: string;
  /** Raw service code from the provider (e.g. "03", "FEDEX_GROUND") */
  serviceCode: string;
  /** Human-readable service name (e.g. "UPS Ground", "FedEx Ground") */
  serviceName: string;
  /** Total shipping cost in cents */
  amount: number;
  /** Currency code (e.g. "USD") */
  currency: string;
  /** Minimum estimated delivery days (optional) */
  estimatedDaysMin?: number;
  /** Maximum estimated delivery days (optional) */
  estimatedDaysMax?: number;
  /** Annotated by rankShippingQuotes */
  isCheapest: boolean;
  /** Annotated by rankShippingQuotes */
  isFastest: boolean;
  /** Annotated by rankShippingQuotes */
  isBestValue: boolean;
};

// ─── assertShippingProvider ──────────────────────────────────────────────────

/**
 * Asserts that a given string is a known shipping provider code.
 * Throws ConvexError if the provider is not recognized.
 *
 * @param provider - The provider string to validate
 * @returns The validated ShippingProvider
 * @throws ConvexError if provider is not in SHIPPING_PROVIDERS
 */
export function assertShippingProvider(provider: string): ShippingProvider {
  if (!(SHIPPING_PROVIDERS as readonly string[]).includes(provider)) {
    throw new ConvexError({
      message: `Unknown shipping provider: "${provider}". Must be one of: ${SHIPPING_PROVIDERS.join(", ")}`,
      code: "INVALID_SHIPPING_PROVIDER",
    });
  }
  return provider as ShippingProvider;
}

// ─── requireShippingAdmin ────────────────────────────────────────────────────

/**
 * Permission guard for shipping admin actions.
 * Returns the current authenticated user or throws if not authorized.
 *
 * @param ctx - Convex action/mutation/query context
 * @returns The current user identity
 * @throws ConvexError if user is not authenticated
 */
export async function requireShippingAdmin(
  ctx: ActionCtx | MutationCtx | QueryCtx,
): Promise<{ tokenIdentifier: string }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      message: "Authentication required for shipping administration",
      code: "UNAUTHENTICATED",
    });
  }
  return identity;
}

// ─── getShippingSettingsSection ───────────────────────────────────────────────

/**
 * Returns the settings section key used to store shipping configuration.
 * Centralizes the string so it stays in sync across queries and mutations.
 */
export function getShippingSettingsSection(): string {
  return "shipping";
}

// ─── rankShippingQuotes ───────────────────────────────────────────────────────

/**
 * Annotate an array of normalized shipping quotes with:
 *   - isCheapest: true for the quote(s) with the lowest amount
 *   - isFastest: true for the quote(s) with the lowest estimatedDaysMin
 *   - isBestValue: true for the quote with the best combined cost/speed score
 *                  (60% cost weight, 40% speed weight)
 *
 * Quotes without estimatedDaysMin are excluded from the "fastest" and
 * speed component of best-value scoring.
 *
 * Returns a new array — does not mutate the input.
 *
 * @param quotes - Array of quotes without ranking flags
 * @returns New array of quotes with isCheapest, isFastest, isBestValue set
 */
export function rankShippingQuotes(
  quotes: Omit<NormalizedShippingQuote, "isCheapest" | "isFastest" | "isBestValue">[],
): NormalizedShippingQuote[] {
  if (quotes.length === 0) return [];

  // ── Find cheapest ────────────────────────────────────────────────────────────
  const minAmount = Math.min(...quotes.map((q) => q.amount));

  // ── Find fastest ─────────────────────────────────────────────────────────────
  const quotesWithDays = quotes.filter(
    (q) => q.estimatedDaysMin !== undefined,
  );
  const minDays =
    quotesWithDays.length > 0
      ? Math.min(...quotesWithDays.map((q) => q.estimatedDaysMin!))
      : undefined;

  // ── Best value score ─────────────────────────────────────────────────────────
  // Normalise cost and speed independently then combine with 60/40 weighting.
  // Lower score = better value.
  const maxAmount = Math.max(...quotes.map((q) => q.amount));
  const costRange = maxAmount - minAmount;

  const maxDays =
    quotesWithDays.length > 0
      ? Math.max(...quotesWithDays.map((q) => q.estimatedDaysMin!))
      : undefined;
  const daysRange =
    maxDays !== undefined && minDays !== undefined ? maxDays - minDays : 0;

  function bestValueScore(
    q: Omit<NormalizedShippingQuote, "isCheapest" | "isFastest" | "isBestValue">,
  ): number {
    // Normalised cost: 0 = cheapest, 1 = most expensive
    const normCost = costRange > 0 ? (q.amount - minAmount) / costRange : 0;

    // Normalised speed: 0 = fastest, 1 = slowest (only if days available)
    let normSpeed = 0;
    if (
      q.estimatedDaysMin !== undefined &&
      daysRange > 0 &&
      minDays !== undefined
    ) {
      normSpeed = (q.estimatedDaysMin - minDays) / daysRange;
    }

    // Lower is better: cost weighted 60%, speed 40%
    return normCost * 0.6 + normSpeed * 0.4;
  }

  const scores = quotes.map((q) => bestValueScore(q));
  const bestScore = Math.min(...scores);

  return quotes.map((q, i) => ({
    ...q,
    isCheapest: q.amount === minAmount,
    isFastest: minDays !== undefined && q.estimatedDaysMin === minDays,
    isBestValue: scores[i] === bestScore,
  }));
}
