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

    // Cheapest should also be best value because cost is weighted 60%
    // cheap: normCost=0 (min), normSpeed=1 (slowest) → 0*0.6 + 1*0.4 = 0.4
    // mid:   normCost=0.375, normSpeed=0.333 → 0.375*0.6 + 0.333*0.4 ≈ 0.358
    // fast:  normCost=1 (max), normSpeed=0   → 1*0.6 + 0*0.4 = 0.6
    // Wait, mid has a LOWER score than cheap in this case, let's verify:
    // cost range: 5000-1000=4000; day range: 7-1=6
    // cheap: normCost=(1000-1000)/4000=0, normSpeed=(7-1)/6=1 → 0*0.6+1*0.4=0.40
    // mid:   normCost=(2500-1000)/4000=0.375, normSpeed=(3-1)/6=0.333 → 0.225+0.133=0.358
    // fast:  normCost=(5000-1000)/4000=1.0, normSpeed=(1-1)/6=0 → 0.6+0=0.60
    // Best value: mid (score 0.358) — since cost is 60% weighted, mid balances well

    const cheapResult = results.find((r) => r.serviceCode === "ground")!;
    const midResult = results.find((r) => r.serviceCode === "2day")!;
    const fastResult = results.find((r) => r.serviceCode === "overnight")!;

    // cheap is cheapest
    expect(cheapResult.isCheapest).toBe(true);
    // fast is fastest
    expect(fastResult.isFastest).toBe(true);
    // mid is best value (balanced score beats pure-cheap-but-slow)
    expect(midResult.isBestValue).toBe(true);
    expect(cheapResult.isBestValue).toBe(false);
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
      quoteKey: "ups:UPS:03",
      provider: "ups",
      carrierCode: "UPS",
      carrierName: "UPS",
      serviceCode: "03",
      serviceName: "UPS Ground",
      amount: 1250,
      estimatedDaysMin: 5,
    });
    const fedexGround: InputQuote = {
      quoteKey: "fedex:FEDEX:FEDEX_GROUND",
      provider: "fedex",
      carrierCode: "FEDEX",
      carrierName: "FedEx",
      serviceCode: "FEDEX_GROUND",
      serviceName: "FedEx Ground",
      amount: 1275,
      currency: "USD",
      estimatedDaysMin: 5,
    };
    const uspsGround: InputQuote = {
      quoteKey: "usps:USPS:USPS_GROUND_ADVANTAGE",
      provider: "usps",
      carrierCode: "USPS",
      carrierName: "USPS",
      serviceCode: "USPS_GROUND_ADVANTAGE",
      serviceName: "USPS Ground Advantage",
      amount: 475,
      currency: "USD",
      estimatedDaysMin: 5,
    };

    const results = rankShippingQuotes([upsGround, fedexGround, uspsGround]);

    // USPS is cheapest at $4.75
    const uspsResult = results.find(
      (r) => r.serviceCode === "USPS_GROUND_ADVANTAGE",
    )!;
    const upsResult = results.find((r) => r.serviceCode === "03")!;
    const fedexResult = results.find((r) => r.serviceCode === "FEDEX_GROUND")!;

    expect(uspsResult.isCheapest).toBe(true);
    expect(upsResult.isCheapest).toBe(false);
    expect(fedexResult.isCheapest).toBe(false);

    // All same speed — all fastest
    expect(uspsResult.isFastest).toBe(true);
    expect(upsResult.isFastest).toBe(true);
    expect(fedexResult.isFastest).toBe(true);

    // USPS cheapest — will be best value (same speed for all, only cost differs)
    expect(uspsResult.isBestValue).toBe(true);

    // Total of 3 results
    expect(results).toHaveLength(3);
  });
});
