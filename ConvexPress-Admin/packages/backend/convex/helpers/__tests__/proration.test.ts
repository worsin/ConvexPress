/**
 * Proration helper — unit tests.
 *
 * Run with: bun test convex/helpers/__tests__/proration.test.ts
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import { applyDiscount, computeProration } from "../proration";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Anchor at UTC midnight to avoid any DST/TZ drift in test math.
const CYCLE_START = Date.UTC(2026, 0, 1); // Jan 1 2026 00:00:00 UTC
const CYCLE_END_30D = CYCLE_START + 30 * MS_PER_DAY;

describe("computeProration", () => {
  test("mid-cycle upgrade produces positive netCharge", () => {
    const result = computeProration({
      cycleStart: CYCLE_START,
      cycleEnd: CYCLE_END_30D,
      now: CYCLE_START + 15 * MS_PER_DAY, // halfway
      oldOfferPrice: 1000,
      newOfferPrice: 2000,
    });

    expect(result.daysInCycle).toBe(30);
    expect(result.daysRemaining).toBe(15);
    expect(result.unusedOldAmount).toBe(500);
    expect(result.proratedNewAmount).toBe(1000);
    expect(result.netCharge).toBe(500);
  });

  test("mid-cycle downgrade produces negative netCharge (credit, NOT clamped)", () => {
    const result = computeProration({
      cycleStart: CYCLE_START,
      cycleEnd: CYCLE_END_30D,
      now: CYCLE_START + 15 * MS_PER_DAY, // halfway
      oldOfferPrice: 2000,
      newOfferPrice: 1000,
    });

    expect(result.unusedOldAmount).toBe(1000);
    expect(result.proratedNewAmount).toBe(500);
    expect(result.netCharge).toBe(-500); // negative = downgrade credit, must not be clamped
  });

  test("day 0 of cycle: full-cycle proration (daysRemaining = daysInCycle)", () => {
    const result = computeProration({
      cycleStart: CYCLE_START,
      cycleEnd: CYCLE_END_30D,
      now: CYCLE_START,
      oldOfferPrice: 1000,
      newOfferPrice: 2000,
    });

    expect(result.daysRemaining).toBe(30);
    expect(result.daysInCycle).toBe(30);
    expect(result.unusedOldAmount).toBe(1000);
    expect(result.proratedNewAmount).toBe(2000);
    expect(result.netCharge).toBe(1000);
  });

  test("last day of cycle: daysRemaining = 0, netCharge is 0 regardless of prices", () => {
    const result = computeProration({
      cycleStart: CYCLE_START,
      cycleEnd: CYCLE_END_30D,
      now: CYCLE_END_30D,
      oldOfferPrice: 999,
      newOfferPrice: 12345,
    });

    expect(result.daysRemaining).toBe(0);
    expect(result.unusedOldAmount).toBe(0);
    expect(result.proratedNewAmount).toBe(0);
    expect(result.netCharge).toBe(0);
  });

  test("now past cycleEnd: daysRemaining clamped at 0 (never negative)", () => {
    const result = computeProration({
      cycleStart: CYCLE_START,
      cycleEnd: CYCLE_END_30D,
      now: CYCLE_END_30D + 5 * MS_PER_DAY, // 5 days past end
      oldOfferPrice: 1000,
      newOfferPrice: 2000,
    });

    expect(result.daysRemaining).toBe(0);
    expect(result.netCharge).toBe(0);
  });

  test("rounding: results are clamped to at most 2 decimal places", () => {
    // A price of 999, newPrice 1333, 13 days remaining of a 30-day cycle
    // would naively yield: unusedOld = 999 * 13/30 = 432.9, prorated = 1333 * 13/30 = 577.633..
    // so netCharge = 144.733... → rounded to 2dp.
    const result = computeProration({
      cycleStart: CYCLE_START,
      cycleEnd: CYCLE_END_30D,
      now: CYCLE_START + 17 * MS_PER_DAY, // 13 days remaining
      oldOfferPrice: 999,
      newOfferPrice: 1333,
    });

    expect(result.daysRemaining).toBe(13);

    // All three money outputs must have at most 2 decimal places.
    for (const v of [
      result.unusedOldAmount,
      result.proratedNewAmount,
      result.netCharge,
    ]) {
      const scaled = v * 100;
      // If rounded correctly, scaled should be an integer (within float fuzz).
      expect(Math.abs(scaled - Math.round(scaled))).toBeLessThan(1e-9);
    }

    // Sanity-check the math hits the expected values.
    expect(result.unusedOldAmount).toBe(432.9);
    expect(result.proratedNewAmount).toBe(577.63);
    // netCharge = round2(577.63 - 432.9) = round2(144.73) = 144.73
    expect(result.netCharge).toBe(144.73);
  });

  test("degenerate cycle (cycleEnd <= cycleStart): daysInCycle floored at 1, daysRemaining = 0", () => {
    const result = computeProration({
      cycleStart: CYCLE_START,
      cycleEnd: CYCLE_START, // zero-length cycle
      now: CYCLE_START,
      oldOfferPrice: 1000,
      newOfferPrice: 2000,
    });

    expect(result.daysInCycle).toBe(1); // floor
    expect(result.daysRemaining).toBe(0);
    expect(result.netCharge).toBe(0);
  });
});

describe("applyDiscount", () => {
  test("percent discount: 25% off 100 = 75", () => {
    expect(applyDiscount(100, "percent", 25)).toBe(75);
  });

  test("fixed discount: 30 off 100 = 70", () => {
    expect(applyDiscount(100, "fixed", 30)).toBe(70);
  });

  test("fixed discount floors at 0: 50 off 30 = 0 (never negative)", () => {
    expect(applyDiscount(30, "fixed", 50)).toBe(0);
  });

  test("percent discount: 100% off anything = 0", () => {
    expect(applyDiscount(250, "percent", 100)).toBe(0);
  });

  test("percent discount: 0% off = unchanged", () => {
    expect(applyDiscount(100, "percent", 0)).toBe(100);
  });

  test("fixed discount rounds to 2dp", () => {
    // 100 - 33.33 = 66.67; rounded result has at most 2dp.
    const result = applyDiscount(100, "fixed", 33.33);
    expect(result).toBe(66.67);
    // Any value must be ≤ 2 decimal places.
    const scaled = result * 100;
    expect(Math.abs(scaled - Math.round(scaled))).toBeLessThan(1e-9);
  });
});
