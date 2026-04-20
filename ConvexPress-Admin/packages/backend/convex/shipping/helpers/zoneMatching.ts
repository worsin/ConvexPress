/**
 * Zone matching helpers for PRD A1 Shipping Zones System.
 * Pure functions — no Convex context, safe to unit test.
 *
 * Postcode rule grammar (WooCommerce parity):
 *   Exact:    "90210"
 *   Wildcard: "902*" (suffix wildcard only)
 *   Range:    "90000...90099" (numeric only)
 *   CSV:      "90210,90211,90212"
 */

export type ZoneShape = {
  countries: string[];
  states?: string[];
  postalCodeRules?: string[];
};

export type AddressShape = {
  countryCode: string;
  state?: string;
  postalCode?: string;
};

/**
 * Normalize a postcode for comparison: trim whitespace, uppercase.
 * Handles UK/Canadian codes like "SW1A 1AA" → "SW1A 1AA".
 */
export function normalizePostcode(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Validate a single postcode rule against the grammar. Returns null if valid,
 * or a string describing why it was rejected. Called at save time.
 */
export function validatePostcodeRule(rule: string): string | null {
  const trimmed = rule.trim();
  if (trimmed.length === 0) return "Empty postcode rule";
  if (trimmed === "**" || trimmed === "*") {
    return "Wildcard-only rule is not allowed; use an empty rules array instead";
  }

  // CSV expansion: validate each sub-entry.
  if (trimmed.includes(",")) {
    for (const entry of trimmed.split(",")) {
      const childReason = validatePostcodeRule(entry);
      if (childReason) return childReason;
    }
    return null;
  }

  // Range.
  if (trimmed.includes("...")) {
    const parts = trimmed.split("...");
    if (parts.length !== 2) return "Range must have exactly one '...' separator";
    const [low, high] = parts;
    if (!/^\d+$/.test(low!.trim()) || !/^\d+$/.test(high!.trim())) {
      return "Range endpoints must be numeric";
    }
    if (Number(low!.trim()) > Number(high!.trim())) {
      return "Range low must be <= high";
    }
    return null;
  }

  // Wildcard.
  if (trimmed.includes("*")) {
    const starIndex = trimmed.indexOf("*");
    // Only suffix wildcard allowed. Must be the last char, only one star.
    if (starIndex !== trimmed.length - 1 || trimmed.indexOf("*", starIndex + 1) !== -1) {
      return "Only suffix wildcard is allowed (e.g. '902*')";
    }
    if (starIndex === 0) {
      return "Wildcard requires a prefix (e.g. '902*', not '*')";
    }
    return null;
  }

  // Exact — any non-empty string with no special chars.
  return null;
}

/**
 * Check if a single postcode matches a single rule.
 * Assumes the rule has already been validated at save time.
 */
export function postcodeMatchesRule(postcode: string, rule: string): boolean {
  const normalizedPostcode = normalizePostcode(postcode);
  const normalizedRule = normalizePostcode(rule);

  if (normalizedRule.includes(",")) {
    return normalizedRule
      .split(",")
      .some((entry) => postcodeMatchesRule(normalizedPostcode, entry));
  }

  if (normalizedRule.includes("...")) {
    const [low, high] = normalizedRule.split("...");
    // Only numeric postcodes can match a range rule.
    if (!/^\d+$/.test(normalizedPostcode)) return false;
    const asNumber = Number(normalizedPostcode);
    return asNumber >= Number(low) && asNumber <= Number(high);
  }

  if (normalizedRule.endsWith("*")) {
    const prefix = normalizedRule.slice(0, -1);
    return normalizedPostcode.startsWith(prefix);
  }

  return normalizedPostcode === normalizedRule;
}

/**
 * Determine whether a zone matches an address.
 *
 * Country check: zone.countries MUST include address.countryCode.
 * State check: if zone.states non-empty, address.state MUST be in zone.states.
 * Postcode check: if zone.postalCodeRules non-empty, address.postalCode MUST
 *   match at least one rule.
 *
 * Fallback zones (empty countries) are handled by the caller in
 * matchZoneForAddress — this helper only evaluates non-fallback zones.
 */
export function zoneMatchesAddress(zone: ZoneShape, address: AddressShape): boolean {
  if (!zone.countries.includes(address.countryCode)) return false;

  if (zone.states && zone.states.length > 0) {
    if (!address.state) return false;
    if (!zone.states.includes(address.state)) return false;
  }

  if (zone.postalCodeRules && zone.postalCodeRules.length > 0) {
    if (!address.postalCode) return false;
    const matched = zone.postalCodeRules.some((rule) =>
      postcodeMatchesRule(address.postalCode!, rule),
    );
    if (!matched) return false;
  }

  return true;
}

/**
 * Slug from a zone name. Lowercases, replaces whitespace with '-', strips
 * non-alphanumeric chars except '-', collapses repeated dashes.
 */
export function slugifyZoneName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
