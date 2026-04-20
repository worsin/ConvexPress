import { describe, expect, test } from "bun:test";

import {
  postcodeMatchesRule,
  validatePostcodeRule,
  zoneMatchesAddress,
  slugifyZoneName,
} from "../helpers/zoneMatching";

describe("validatePostcodeRule", () => {
  test("accepts exact codes", () => {
    expect(validatePostcodeRule("90210")).toBeNull();
    expect(validatePostcodeRule("SW1A 1AA")).toBeNull();
    expect(validatePostcodeRule("K1A 0B1")).toBeNull();
  });

  test("accepts wildcard suffix", () => {
    expect(validatePostcodeRule("902*")).toBeNull();
    expect(validatePostcodeRule("M5V*")).toBeNull();
  });

  test("accepts numeric ranges", () => {
    expect(validatePostcodeRule("90000...96199")).toBeNull();
    expect(validatePostcodeRule("10000...19999")).toBeNull();
  });

  test("accepts CSV", () => {
    expect(validatePostcodeRule("90210,90211,90212")).toBeNull();
    expect(validatePostcodeRule("M5V*,M6G*")).toBeNull();
  });

  test("rejects empty rule", () => {
    expect(validatePostcodeRule("")).toContain("Empty");
    expect(validatePostcodeRule("   ")).toContain("Empty");
  });

  test("rejects bare wildcard", () => {
    expect(validatePostcodeRule("*")).toContain("Wildcard-only");
    expect(validatePostcodeRule("**")).toContain("Wildcard-only");
  });

  test("rejects mid-string wildcard", () => {
    expect(validatePostcodeRule("90*10")).toContain("suffix wildcard");
    expect(validatePostcodeRule("9*210")).toContain("suffix wildcard");
  });

  test("rejects non-numeric range", () => {
    expect(validatePostcodeRule("SW1A...SW9Z")).toContain("numeric");
  });

  test("rejects inverted range", () => {
    expect(validatePostcodeRule("99999...10000")).toContain("low must be");
  });
});

describe("postcodeMatchesRule", () => {
  test("exact match", () => {
    expect(postcodeMatchesRule("90210", "90210")).toBe(true);
    expect(postcodeMatchesRule("90211", "90210")).toBe(false);
  });

  test("case-insensitive + whitespace-tolerant", () => {
    expect(postcodeMatchesRule("sw1a 1aa", "SW1A 1AA")).toBe(true);
    expect(postcodeMatchesRule("  90210  ", "90210")).toBe(true);
  });

  test("wildcard suffix", () => {
    expect(postcodeMatchesRule("90210", "902*")).toBe(true);
    expect(postcodeMatchesRule("90299", "902*")).toBe(true);
    expect(postcodeMatchesRule("90100", "902*")).toBe(false);
    expect(postcodeMatchesRule("M5V 3K2", "M5V*")).toBe(true);
  });

  test("numeric range", () => {
    expect(postcodeMatchesRule("90000", "90000...96199")).toBe(true);
    expect(postcodeMatchesRule("96199", "90000...96199")).toBe(true);
    expect(postcodeMatchesRule("96200", "90000...96199")).toBe(false);
    expect(postcodeMatchesRule("89999", "90000...96199")).toBe(false);
  });

  test("range rejects non-numeric postcodes", () => {
    expect(postcodeMatchesRule("SW1A 1AA", "00000...99999")).toBe(false);
  });

  test("CSV expansion", () => {
    expect(postcodeMatchesRule("90211", "90210,90211,90212")).toBe(true);
    expect(postcodeMatchesRule("90213", "90210,90211,90212")).toBe(false);
    expect(postcodeMatchesRule("M5V 3K2", "M5V*,M6G*")).toBe(true);
    expect(postcodeMatchesRule("M6G 1A1", "M5V*,M6G*")).toBe(true);
  });
});

describe("zoneMatchesAddress", () => {
  test("country must match", () => {
    expect(
      zoneMatchesAddress({ countries: ["US"] }, { countryCode: "US" }),
    ).toBe(true);
    expect(
      zoneMatchesAddress({ countries: ["US"] }, { countryCode: "CA" }),
    ).toBe(false);
  });

  test("state filter when set", () => {
    const zone = { countries: ["US"], states: ["CA", "NY"] };
    expect(
      zoneMatchesAddress(zone, { countryCode: "US", state: "CA" }),
    ).toBe(true);
    expect(
      zoneMatchesAddress(zone, { countryCode: "US", state: "TX" }),
    ).toBe(false);
    expect(zoneMatchesAddress(zone, { countryCode: "US" })).toBe(false);
  });

  test("postcode rules when set", () => {
    const zone = {
      countries: ["US"],
      postalCodeRules: ["90000...96199"],
    };
    expect(
      zoneMatchesAddress(zone, { countryCode: "US", postalCode: "90210" }),
    ).toBe(true);
    expect(
      zoneMatchesAddress(zone, { countryCode: "US", postalCode: "10001" }),
    ).toBe(false);
  });

  test("postcode required when rules set", () => {
    const zone = {
      countries: ["US"],
      postalCodeRules: ["902*"],
    };
    expect(zoneMatchesAddress(zone, { countryCode: "US" })).toBe(false);
  });

  test("empty states + empty postcodes = match all in country", () => {
    const zone = { countries: ["US"], states: [], postalCodeRules: [] };
    expect(
      zoneMatchesAddress(zone, { countryCode: "US", state: "WA", postalCode: "98101" }),
    ).toBe(true);
  });
});

describe("slugifyZoneName", () => {
  test("basic cases", () => {
    expect(slugifyZoneName("US Continental")).toBe("us-continental");
    expect(slugifyZoneName("California")).toBe("california");
    expect(slugifyZoneName("EU 27")).toBe("eu-27");
  });

  test("strips special chars", () => {
    expect(slugifyZoneName("Zone #1!")).toBe("zone-1");
    expect(slugifyZoneName("US (lower 48)")).toBe("us-lower-48");
  });

  test("collapses dashes", () => {
    expect(slugifyZoneName("zone   -- name")).toBe("zone-name");
    expect(slugifyZoneName("--leading--trailing--")).toBe("leading-trailing");
  });
});
