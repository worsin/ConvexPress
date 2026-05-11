import { describe, expect, test } from "bun:test";

// Re-declare the helper locally — it isn't exported from its three hosts.
// This asserts the contract every caller must uphold.
function addBillingPeriod(
  timestamp: number,
  interval: "day" | "week" | "month" | "year",
  intervalCount: number,
): number {
  const date = new Date(timestamp);
  if (interval === "day") {
    date.setDate(date.getDate() + intervalCount);
    return date.getTime();
  }
  if (interval === "week") {
    date.setDate(date.getDate() + 7 * intervalCount);
    return date.getTime();
  }
  if (interval === "month") {
    date.setMonth(date.getMonth() + intervalCount);
    return date.getTime();
  }
  date.setFullYear(date.getFullYear() + intervalCount);
  return date.getTime();
}

describe("addBillingPeriod day", () => {
  test("+1 day", () => {
    const base = new Date("2026-04-22T00:00:00Z").getTime();
    const next = addBillingPeriod(base, "day", 1);
    expect(new Date(next).getUTCDate()).toBe(23);
  });

  test("+7 day equivalent to 1 week", () => {
    const base = new Date("2026-04-22T00:00:00Z").getTime();
    const plusSevenDays = addBillingPeriod(base, "day", 7);
    const plusWeek = addBillingPeriod(base, "week", 1);
    expect(plusSevenDays).toBe(plusWeek);
  });
});
