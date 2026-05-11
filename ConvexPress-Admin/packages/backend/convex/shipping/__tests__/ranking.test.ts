/**
 * Shipping System - rankShippingQuotes Unit Tests
 *
 * Tests the rankShippingQuotes helper that annotates an array of
 * normalized shipping quotes with isCheapest, isFastest, and isBestValue flags.
 *
 * Run with: bun test packages/backend/convex/shipping/__tests__/ranking.test.ts
 */

import { describe, expect, test } from "bun:test";
import {
  rankShippingQuotes,
  type NormalizedShippingQuote,
} from "../helpers";

type InputQuote = Omit<
  NormalizedShippingQuote,
  "isCheapest" | "isFastest" | "isBestValue"
>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQuote(
  overrides: Partial<InputQuote> & { serviceCode: string; amount: number },
): InputQuote {
  return {
    quoteKey: `ups:UPS:${overrides.serviceCode}`,
    provider: "ups",
    carrierCode: "UPS",
    carrierName: "UPS",
    serviceName: overrides.serviceCode,
    currency: "USD",
    ...overrides,
  };
}

// ─── rankShippingQuotes ───────────────────────────────────────────────────────

describe("rankShippingQuotes", () => {
  test("returns empty array for empty input", () => {
    const result = rankShippingQuotes([]);
    expect(result).toEqual([]);
  });

  test("marks single quote as cheapest, fastest, and best value", () => {
    const quote = makeQuote({
      serviceCode: "03",
      serviceName: "UPS Ground",
      amount: 1250,
      estimatedDaysMin: 5,
      estimatedDaysMax: 5,
    });

    const [result] = rankShippingQuotes([quote]);

    expect(result.isCheapest).toBe(true);
    expect(result.isFastest).toBe(true);
    expect(result.isBestValue).toBe(true);
  });

  test("correctly identifies cheapest and fastest with multiple quotes", () => {
    const ground = makeQuote({
      serviceCode: "03",
      serviceName: "UPS Ground",
      amount: 1250, // $12.50
      estimatedDaysMin: 5,
    });
    const nextDay = makeQuote({
      serviceCode: "01",
      serviceName: "UPS Next Day Air",
      amount: 4500, // $45.00
      estimatedDaysMin: 1,
    });

    const results = rankShippingQuotes([ground, nextDay]);

    const groundResult = results.find((r) => r.serviceCode === "03")!;
    const nextDayResult = results.find((r) => r.serviceCode === "01")!;

    // Ground is cheapest
    expect(groundResult.isCheapest).toBe(true);
    expect(nextDayResult.isCheapest).toBe(false);

    // Next Day is fastest
    expect(nextDayResult.isFastest).toBe(true);
    expect(groundResult.isFastest).toBe(false);
  });

  test("best value favors cost (60%) over speed (40%)", () => {
    // Cheap and slow
    const cheap = makeQuote({
      serviceCode: "ground",
      serviceName: "Ground",
      amount: 1000, // $10.00
      estimatedDaysMin: 7,
    });
    // Mid price and mid speed
    const mid = makeQuote({
      serviceCode: "2day",
      serviceName: "2 Day",
      amount: 2500, // $25.00
      estimatedDaysMin: 3,
    });
    // Expensive and fast
    const fast = makeQuote({
      serviceCode: "overnight",
      serviceName: "Overnight",
      amount: 5000, // $50.00
      estimatedDaysMin: 1,
    });

    const results = rankShippingQuotes([cheap, mid, fast]);

    // Rank-based scoring: costRank * 0.6 + speedRank * 0.4 (lower = better)
    // Cost ranks: cheap=1, mid=2, fast=3
    // Speed ranks: fast=1, mid=2, cheap=3
    // Scores: cheap=1*0.6+3*0.4=1.8, mid=2*0.6+2*0.4=2.0, fast=3*0.6+1*0.4=2.2
    // Best value = cheapest (1.8) because cost weight (60%) dominates

    const cheapResult = results.find((r) => r.serviceCode === "ground")!;
    const midResult = results.find((r) => r.serviceCode === "2day")!;
    const fastResult = results.find((r) => r.serviceCode === "overnight")!;

    // cheap is cheapest
    expect(cheapResult.isCheapest).toBe(true);
    // fast is fastest
    expect(fastResult.isFastest).toBe(true);
    // cheap is best value (cost 60% weight dominates)
    expect(cheapResult.isBestValue).toBe(true);
    expect(midResult.isBestValue).toBe(false);
    expect(fastResult.isBestValue).toBe(false);
  });

  test("handles missing delivery estimates gracefully", () => {
    const withDays = makeQuote({
      serviceCode: "express",
      serviceName: "Express",
      amount: 3000,
      estimatedDaysMin: 2,
    });
    const withoutDays = makeQuote({
      serviceCode: "freight",
      serviceName: "Freight",
      amount: 800,
      // No estimatedDaysMin
    });

    const results = rankShippingQuotes([withDays, withoutDays]);

    const freightResult = results.find((r) => r.serviceCode === "freight")!;
    const expressResult = results.find((r) => r.serviceCode === "express")!;

    // freight is cheapest
    expect(freightResult.isCheapest).toBe(true);
    // express has days so it IS the fastest (only quote with days)
    expect(expressResult.isFastest).toBe(true);
    // freight has no days — cannot be fastest
    expect(freightResult.isFastest).toBe(false);

    // No errors thrown — graceful handling confirmed by test reaching here
    expect(results).toHaveLength(2);
  });

  test("handles cross-provider ranking", () => {
    const upsGround = makeQuote({
      quoteKey: "ups:03-0",
      provider: "ups",
      carrierCode: "ups",
      carrierName: "UPS",
      serviceCode: "03",
      serviceName: "UPS Ground",
      amount: 1250,
      estimatedDaysMin: 5,
    });
    const fedex2Day = makeQuote({
      quoteKey: "fedex:FEDEX_2_DAY-0",
      provider: "fedex",
      carrierCode: "fedex",
      carrierName: "FedEx",
      serviceCode: "FEDEX_2_DAY",
      serviceName: "FedEx 2Day",
      amount: 2250,
      estimatedDaysMin: 2,
    });
    const uspsPriority = makeQuote({
      quoteKey: "usps:PRIORITY_MAIL-0",
      provider: "usps",
      carrierCode: "usps",
      carrierName: "USPS",
      serviceCode: "PRIORITY_MAIL",
      serviceName: "USPS Priority Mail",
      amount: 1250,
      estimatedDaysMin: 2,
    });

    const results = rankShippingQuotes([upsGround, fedex2Day, uspsPriority]);

    const upsResult = results.find((r) => r.serviceCode === "03")!;
    const fedexResult = results.find((r) => r.serviceCode === "FEDEX_2_DAY")!;
    const uspsResult = results.find((r) => r.serviceCode === "PRIORITY_MAIL")!;

    // UPS and USPS tie for cheapest ($12.50)
    expect(upsResult.isCheapest).toBe(true);
    expect(uspsResult.isCheapest).toBe(true);

    // FedEx and USPS tie for fastest (2 days)
    expect(fedexResult.isFastest).toBe(true);
    expect(uspsResult.isFastest).toBe(true);

    // All 3 providers represented
    expect(results).toHaveLength(3);
    // Exactly one best value
    expect(results.filter((r) => r.isBestValue)).toHaveLength(1);
  });
});
