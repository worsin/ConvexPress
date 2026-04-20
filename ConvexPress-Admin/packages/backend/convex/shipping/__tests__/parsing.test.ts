/**
 * Shipping System - Carrier Parsing Unit Tests
 *
 * Tests for carrier-specific parsing logic.
 *
 * The parsing functions (parseFedexTransitDays, parseUspsBusinessDays,
 * parseUpsBusinessDays) and service name lookup maps live in actions.ts
 * as private implementation details. This test file replicates the logic
 * inline so it can be tested in isolation without Convex context.
 *
 * Run with: bun test packages/backend/convex/shipping/__tests__/parsing.test.ts
 */

import { describe, expect, test } from "bun:test";

// ─── FedEx Transit Day Parsing ────────────────────────────────────────────────
//
// FedEx returns transit days as enum strings (e.g. "FIVE_DAYS") in the
// commit.transitDays field of rate reply details.
//
// Replicated from actions.ts: parseFedexTransitDays

const FEDEX_TRANSIT_DAY_MAP: Record<string, number> = {
  SAME_DAY: 0,
  ONE_DAY: 1,
  TWO_DAYS: 2,
  THREE_DAYS: 3,
  FOUR_DAYS: 4,
  FIVE_DAYS: 5,
  SIX_DAYS: 6,
  SEVEN_DAYS: 7,
  EIGHT_DAYS: 8,
  NINE_DAYS: 9,
  TEN_DAYS: 10,
  ELEVEN_DAYS: 11,
  TWELVE_DAYS: 12,
};

function parseFedexTransitDays(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim().toUpperCase();

    // Try the enum map first
    if (trimmed in FEDEX_TRANSIT_DAY_MAP) {
      return FEDEX_TRANSIT_DAY_MAP[trimmed];
    }

    // Fall back to numeric string
    const parsed = parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

describe("parseFedexTransitDays", () => {
  test("parses SAME_DAY to 0", () => {
    expect(parseFedexTransitDays("SAME_DAY")).toBe(0);
  });

  test("parses ONE_DAY to 1", () => {
    expect(parseFedexTransitDays("ONE_DAY")).toBe(1);
  });

  test("parses TWO_DAYS to 2", () => {
    expect(parseFedexTransitDays("TWO_DAYS")).toBe(2);
  });

  test("parses THREE_DAYS to 3", () => {
    expect(parseFedexTransitDays("THREE_DAYS")).toBe(3);
  });

  test("parses FIVE_DAYS to 5", () => {
    expect(parseFedexTransitDays("FIVE_DAYS")).toBe(5);
  });

  test("parses TEN_DAYS to 10", () => {
    expect(parseFedexTransitDays("TEN_DAYS")).toBe(10);
  });

  test("parses numeric value directly", () => {
    expect(parseFedexTransitDays(3)).toBe(3);
    expect(parseFedexTransitDays(0)).toBe(0);
  });

  test("parses string number fallback", () => {
    expect(parseFedexTransitDays("4")).toBe(4);
  });

  test("returns undefined for undefined input", () => {
    expect(parseFedexTransitDays(undefined)).toBeUndefined();
  });

  test("returns undefined for null input", () => {
    expect(parseFedexTransitDays(null)).toBeUndefined();
  });

  test("returns undefined for unparseable string", () => {
    expect(parseFedexTransitDays("UNKNOWN_ENUM")).toBeUndefined();
    expect(parseFedexTransitDays("N/A")).toBeUndefined();
    expect(parseFedexTransitDays("")).toBeUndefined();
  });

  test("is case-insensitive for enum strings", () => {
    expect(parseFedexTransitDays("five_days")).toBe(5);
    expect(parseFedexTransitDays("Five_Days")).toBe(5);
  });
});

// ─── USPS Business Day Parsing ────────────────────────────────────────────────
//
// USPS returns expected delivery days as an integer or string in
// the prices[].expectedDeliveryDays field.
//
// Replicated from actions.ts: parseUspsBusinessDays

function parseUspsBusinessDays(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;

  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : undefined;
  }

  if (typeof value === "string") {
    // Handle strings like "3 days", "3", "  2  "
    const match = value.match(/\d+/);
    if (match) {
      return parseInt(match[0], 10);
    }
  }

  return undefined;
}

describe("parseUspsBusinessDays", () => {
  test("parses integer directly", () => {
    expect(parseUspsBusinessDays(3)).toBe(3);
    expect(parseUspsBusinessDays(1)).toBe(1);
    expect(parseUspsBusinessDays(5)).toBe(5);
  });

  test("parses string with number", () => {
    expect(parseUspsBusinessDays("3 days")).toBe(3);
    expect(parseUspsBusinessDays("1 business day")).toBe(1);
  });

  test("parses numeric string", () => {
    expect(parseUspsBusinessDays("5")).toBe(5);
  });

  test("returns undefined for non-numeric string", () => {
    expect(parseUspsBusinessDays("express")).toBeUndefined();
    expect(parseUspsBusinessDays("")).toBeUndefined();
  });

  test("returns undefined for null", () => {
    expect(parseUspsBusinessDays(null)).toBeUndefined();
  });

  test("returns undefined for undefined", () => {
    expect(parseUspsBusinessDays(undefined)).toBeUndefined();
  });
});

// ─── UPS Business Day Parsing ─────────────────────────────────────────────────
//
// UPS returns transit days in GuaranteedDelivery.BusinessDaysInTransit as
// a string (e.g. "5") or sometimes an integer.
//
// Replicated from actions.ts: parseUpsBusinessDays

function parseUpsBusinessDays(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

describe("parseUpsBusinessDays", () => {
  test("parses integer value", () => {
    expect(parseUpsBusinessDays(5)).toBe(5);
    expect(parseUpsBusinessDays(1)).toBe(1);
  });

  test("parses string number", () => {
    expect(parseUpsBusinessDays("5")).toBe(5);
    expect(parseUpsBusinessDays("2")).toBe(2);
    expect(parseUpsBusinessDays("1")).toBe(1);
  });

  test("handles whitespace in string", () => {
    expect(parseUpsBusinessDays("  3  ")).toBe(3);
  });

  test("returns undefined for non-numeric string", () => {
    expect(parseUpsBusinessDays("GROUND")).toBeUndefined();
    expect(parseUpsBusinessDays("")).toBeUndefined();
  });

  test("returns undefined for null", () => {
    expect(parseUpsBusinessDays(null)).toBeUndefined();
  });

  test("returns undefined for undefined", () => {
    expect(parseUpsBusinessDays(undefined)).toBeUndefined();
  });
});

// ─── Service Name Lookups ─────────────────────────────────────────────────────
//
// Each carrier maps raw service codes to human-readable names.
// Replicated from actions.ts service name maps.

const UPS_SERVICE_NAMES: Record<string, string> = {
  "01": "UPS Next Day Air",
  "02": "UPS 2nd Day Air",
  "03": "UPS Ground",
  "07": "UPS Worldwide Express",
  "08": "UPS Worldwide Expedited",
  "11": "UPS Standard",
  "12": "UPS 3 Day Select",
  "13": "UPS Next Day Air Saver",
  "14": "UPS Next Day Air Early",
  "54": "UPS Worldwide Express Plus",
  "59": "UPS 2nd Day Air A.M.",
  "65": "UPS Worldwide Saver",
};

const FEDEX_SERVICE_NAMES: Record<string, string> = {
  FEDEX_GROUND: "FedEx Ground",
  FEDEX_HOME_DELIVERY: "FedEx Home Delivery",
  FEDEX_2_DAY: "FedEx 2Day",
  FEDEX_2_DAY_AM: "FedEx 2Day A.M.",
  FEDEX_EXPRESS_SAVER: "FedEx Express Saver",
  STANDARD_OVERNIGHT: "FedEx Standard Overnight",
  PRIORITY_OVERNIGHT: "FedEx Priority Overnight",
  FIRST_OVERNIGHT: "FedEx First Overnight",
  INTERNATIONAL_ECONOMY: "FedEx International Economy",
  INTERNATIONAL_PRIORITY: "FedEx International Priority",
};

const USPS_SERVICE_NAMES: Record<string, string> = {
  USPS_GROUND_ADVANTAGE: "USPS Ground Advantage",
  PRIORITY_MAIL: "USPS Priority Mail",
  PRIORITY_MAIL_EXPRESS: "USPS Priority Mail Express",
  FIRST_CLASS_PACKAGE_INTERNATIONAL_SERVICE:
    "USPS First-Class Package International",
  PRIORITY_MAIL_INTERNATIONAL: "USPS Priority Mail International",
  PRIORITY_MAIL_EXPRESS_INTERNATIONAL:
    "USPS Priority Mail Express International",
};

function lookupServiceName(
  map: Record<string, string>,
  code: string,
  prefix: string,
): string {
  return map[code] ?? `${prefix} ${code}`;
}

describe("Service name lookups", () => {
  describe("UPS service names", () => {
    test("code 03 maps to UPS Ground", () => {
      expect(lookupServiceName(UPS_SERVICE_NAMES, "03", "UPS")).toBe(
        "UPS Ground",
      );
    });

    test("code 01 maps to UPS Next Day Air", () => {
      expect(lookupServiceName(UPS_SERVICE_NAMES, "01", "UPS")).toBe(
        "UPS Next Day Air",
      );
    });

    test("code 02 maps to UPS 2nd Day Air", () => {
      expect(lookupServiceName(UPS_SERVICE_NAMES, "02", "UPS")).toBe(
        "UPS 2nd Day Air",
      );
    });

    test("unknown code falls back to prefix + code", () => {
      expect(lookupServiceName(UPS_SERVICE_NAMES, "99", "UPS")).toBe("UPS 99");
    });
  });

  describe("FedEx service names", () => {
    test("FEDEX_GROUND maps to FedEx Ground", () => {
      expect(
        lookupServiceName(FEDEX_SERVICE_NAMES, "FEDEX_GROUND", "FedEx"),
      ).toBe("FedEx Ground");
    });

    test("STANDARD_OVERNIGHT maps correctly", () => {
      expect(
        lookupServiceName(FEDEX_SERVICE_NAMES, "STANDARD_OVERNIGHT", "FedEx"),
      ).toBe("FedEx Standard Overnight");
    });

    test("unknown code falls back to prefix + code", () => {
      expect(
        lookupServiceName(FEDEX_SERVICE_NAMES, "UNKNOWN_SERVICE", "FedEx"),
      ).toBe("FedEx UNKNOWN_SERVICE");
    });
  });

  describe("USPS service names", () => {
    test("PRIORITY_MAIL maps to USPS Priority Mail", () => {
      expect(
        lookupServiceName(USPS_SERVICE_NAMES, "PRIORITY_MAIL", "USPS"),
      ).toBe("USPS Priority Mail");
    });

    test("USPS_GROUND_ADVANTAGE maps correctly", () => {
      expect(
        lookupServiceName(
          USPS_SERVICE_NAMES,
          "USPS_GROUND_ADVANTAGE",
          "USPS",
        ),
      ).toBe("USPS Ground Advantage");
    });

    test("unknown code falls back to prefix + code", () => {
      expect(
        lookupServiceName(USPS_SERVICE_NAMES, "UNKNOWN_CLASS", "USPS"),
      ).toBe("USPS UNKNOWN_CLASS");
    });
  });
});
