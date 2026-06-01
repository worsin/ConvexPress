/**
 * Form Prefill — US state normalization (EZ Entity Setup parity).
 *
 * Maps a loose state input (full name, prefix, or two-letter abbreviation) to a
 * canonical full state name, or `null` when it cannot be resolved. Pure +
 * SSR-safe. Used by the "state" normalizer in normalizers.ts.
 */

/** Canonical full state names + their two-letter abbreviations. */
export const US_STATES: ReadonlyArray<{ name: string; abbr: string }> = [
  { name: "Alabama", abbr: "AL" },
  { name: "Alaska", abbr: "AK" },
  { name: "Arizona", abbr: "AZ" },
  { name: "Arkansas", abbr: "AR" },
  { name: "California", abbr: "CA" },
  { name: "Colorado", abbr: "CO" },
  { name: "Connecticut", abbr: "CT" },
  { name: "Delaware", abbr: "DE" },
  { name: "Florida", abbr: "FL" },
  { name: "Georgia", abbr: "GA" },
  { name: "Hawaii", abbr: "HI" },
  { name: "Idaho", abbr: "ID" },
  { name: "Illinois", abbr: "IL" },
  { name: "Indiana", abbr: "IN" },
  { name: "Iowa", abbr: "IA" },
  { name: "Kansas", abbr: "KS" },
  { name: "Kentucky", abbr: "KY" },
  { name: "Louisiana", abbr: "LA" },
  { name: "Maine", abbr: "ME" },
  { name: "Maryland", abbr: "MD" },
  { name: "Massachusetts", abbr: "MA" },
  { name: "Michigan", abbr: "MI" },
  { name: "Minnesota", abbr: "MN" },
  { name: "Mississippi", abbr: "MS" },
  { name: "Missouri", abbr: "MO" },
  { name: "Montana", abbr: "MT" },
  { name: "Nebraska", abbr: "NE" },
  { name: "Nevada", abbr: "NV" },
  { name: "New Hampshire", abbr: "NH" },
  { name: "New Jersey", abbr: "NJ" },
  { name: "New Mexico", abbr: "NM" },
  { name: "New York", abbr: "NY" },
  { name: "North Carolina", abbr: "NC" },
  { name: "North Dakota", abbr: "ND" },
  { name: "Ohio", abbr: "OH" },
  { name: "Oklahoma", abbr: "OK" },
  { name: "Oregon", abbr: "OR" },
  { name: "Pennsylvania", abbr: "PA" },
  { name: "Rhode Island", abbr: "RI" },
  { name: "South Carolina", abbr: "SC" },
  { name: "South Dakota", abbr: "SD" },
  { name: "Tennessee", abbr: "TN" },
  { name: "Texas", abbr: "TX" },
  { name: "Utah", abbr: "UT" },
  { name: "Vermont", abbr: "VT" },
  { name: "Virginia", abbr: "VA" },
  { name: "Washington", abbr: "WA" },
  { name: "West Virginia", abbr: "WV" },
  { name: "Wisconsin", abbr: "WI" },
  { name: "Wyoming", abbr: "WY" },
  { name: "District of Columbia", abbr: "DC" },
];

/**
 * Normalize a loose state input to the canonical full name.
 *
 * Resolution order:
 *   1. Exact full-name match (case-insensitive).
 *   2. Two-letter abbreviation (`"tx"` → `"Texas"`).
 *   3. Unique prefix of a full name (`"calif"` → `"California"`).
 *   4. No match → `null`.
 */
export function normalizeStateName(input: string): string | null {
  const needle = input.trim().toLowerCase();
  if (!needle) return null;

  // 1. Exact full name.
  for (const s of US_STATES) {
    if (s.name.toLowerCase() === needle) return s.name;
  }

  // 2. Two-letter abbreviation.
  if (needle.length === 2) {
    for (const s of US_STATES) {
      if (s.abbr.toLowerCase() === needle) return s.name;
    }
  }

  // 3. Unique prefix.
  const prefixMatches = US_STATES.filter((s) =>
    s.name.toLowerCase().startsWith(needle),
  );
  if (prefixMatches.length === 1) return prefixMatches[0]!.name;

  return null;
}
