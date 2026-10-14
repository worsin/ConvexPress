import { describe, expect, test } from "bun:test";
import { addBillingPeriod } from "../lifecycle";

const at = (iso: string) => new Date(iso).getTime();
const iso = (timestamp: number) => new Date(timestamp).toISOString();

describe("addBillingPeriod", () => {
  test("days and weeks are exact", () => {
    expect(iso(addBillingPeriod(at("2026-04-22T00:00:00Z"), "day", 1))).toBe("2026-04-23T00:00:00.000Z");
    expect(addBillingPeriod(at("2026-04-22T00:00:00Z"), "day", 7)).toBe(addBillingPeriod(at("2026-04-22T00:00:00Z"), "week", 1));
  });

  test("a month keeps the day and time of day", () => {
    expect(iso(addBillingPeriod(at("2026-10-14T09:30:00Z"), "month", 1))).toBe("2026-11-14T09:30:00.000Z");
    expect(iso(addBillingPeriod(at("2026-11-14T09:30:00Z"), "month", 3))).toBe("2027-02-14T09:30:00.000Z");
  });

  test("month ends clamp instead of rolling into the next month", () => {
    expect(iso(addBillingPeriod(at("2027-01-31T12:00:00Z"), "month", 1))).toBe("2027-02-28T12:00:00.000Z");
    expect(iso(addBillingPeriod(at("2028-01-31T12:00:00Z"), "month", 1))).toBe("2028-02-29T12:00:00.000Z");
    expect(iso(addBillingPeriod(at("2026-08-31T12:00:00Z"), "month", 1))).toBe("2026-09-30T12:00:00.000Z");
  });

  test("a year from Feb 29 ends Feb 28", () => {
    expect(iso(addBillingPeriod(at("2028-02-29T00:00:00Z"), "year", 1))).toBe("2029-02-28T00:00:00.000Z");
  });
});
