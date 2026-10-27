/**
 * Field formats: named shapes a text field's answer must have (phone number,
 * US state, ZIP code, NPI, digits), checked identically in the browser and on
 * the server, plus the input hints (keyboard, autofill) that go with them.
 *
 * Pure and dependency-free: the website receives an exact copy
 * (packages/backend/generated/fieldFormats.ts, by generate-site-contracts).
 * Named formats instead of author-supplied regular expressions keep the server
 * free of untrusted patterns.
 */

export const FIELD_FORMATS = ["phone", "us-state", "us-zip", "us-npi", "digits"] as const;
export type FieldFormat = (typeof FIELD_FORMATS)[number];

export const FIELD_FORMAT_LABELS: Readonly<Record<FieldFormat, string>> = {
  phone: "Phone number (US)",
  "us-state": "US state (two-letter code)",
  "us-zip": "US ZIP code",
  "us-npi": "NPI (National Provider Identifier)",
  digits: "Digits only",
};

/** USPS codes: the states, DC and the inhabited territories. */
export const US_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" }, { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" }, { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" }, { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
  { code: "AS", name: "American Samoa" }, { code: "GU", name: "Guam" }, { code: "MP", name: "Northern Mariana Islands" },
  { code: "PR", name: "Puerto Rico" }, { code: "VI", name: "U.S. Virgin Islands" },
];
const US_STATE_CODES: ReadonlySet<string> = new Set(US_STATES.map((state) => state.code));

export function isFieldFormat(value: unknown): value is FieldFormat {
  return typeof value === "string" && (FIELD_FORMATS as readonly string[]).includes(value);
}

/** The 10 digits of a US phone number, or null (accepts formatting and a leading +1/1). */
export function usPhoneDigits(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  // NANP: area code and exchange start with 2–9.
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(national) ? national : null;
}

/**
 * NPI check digit (Luhn over the 9-digit base with the 80840 health-industry
 * prefix, as CMS specifies).
 */
export function isValidNpi(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const digits = `80840${value.slice(0, 9)}`;
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return (10 - (sum % 10)) % 10 === Number(value[9]);
}

/** Why a non-empty answer doesn't have the format, or null when it does. */
export function fieldFormatError(format: FieldFormat, raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  switch (format) {
    case "phone":
      return usPhoneDigits(value) ? null : "Enter a 10-digit US phone number, for example (702) 555-0123.";
    case "us-state":
      return US_STATE_CODES.has(value.toUpperCase()) ? null : "Enter the two-letter state code, for example NV.";
    case "us-zip":
      return /^\d{5}(?:-\d{4})?$/.test(value) ? null : "Enter a 5-digit ZIP code (or ZIP+4).";
    case "us-npi":
      if (!/^\d{10}$/.test(value)) return "An NPI is 10 digits.";
      return isValidNpi(value) ? null : "This NPI's check digit doesn't match. Check the number on the NPI Registry.";
    case "digits":
      return /^\d+$/.test(value) ? null : "Use digits only.";
  }
}

/** The stored form of a valid answer: phone as (702) 555-0123, state upper-case. */
export function normalizeFieldFormat(format: FieldFormat, raw: string): string {
  const value = raw.trim();
  if (format === "phone") {
    const digits = usPhoneDigits(value);
    return digits ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : value;
  }
  if (format === "us-state") return value.toUpperCase();
  return value;
}

export type FieldInputHints = {
  type: "text" | "tel" | "email" | "url";
  inputMode?: "text" | "numeric" | "tel" | "email" | "url";
  autoComplete?: string;
  maxLength?: number;
};

/** Keyboard and autofill hints for a text field with this format (an explicit autocomplete token wins). */
export function fieldInputHints(format: FieldFormat | undefined, autoComplete?: string): FieldInputHints {
  const hints: FieldInputHints = (() => {
    switch (format) {
      case "phone":
        return { type: "tel", inputMode: "tel", autoComplete: "tel" };
      case "us-state":
        return { type: "text", autoComplete: "address-level1", maxLength: 2 };
      case "us-zip":
        return { type: "text", inputMode: "numeric", autoComplete: "postal-code", maxLength: 10 };
      case "us-npi":
        return { type: "text", inputMode: "numeric", maxLength: 10 };
      case "digits":
        return { type: "text", inputMode: "numeric" };
      default:
        return { type: "text" };
    }
  })();
  return autoComplete && isAutocompleteToken(autoComplete) ? { ...hints, autoComplete } : hints;
}

/** HTML autofill field names a form field may declare (WHATWG "autofill detail tokens"). */
export const AUTOCOMPLETE_TOKENS = [
  "name", "given-name", "family-name", "honorific-prefix", "organization", "organization-title",
  "email", "tel", "url", "street-address", "address-line1", "address-line2", "address-level2",
  "address-level1", "postal-code", "country", "country-name", "bday", "off",
] as const;
export type AutocompleteToken = (typeof AUTOCOMPLETE_TOKENS)[number];

export function isAutocompleteToken(value: unknown): value is AutocompleteToken {
  return typeof value === "string" && (AUTOCOMPLETE_TOKENS as readonly string[]).includes(value);
}

// ─── Signatures ─────────────────────────────────────────────────────────────

/**
 * A typed signature compares equal to the name it signs regardless of case,
 * spacing and punctuation: "Dr.  Avery Quinn," signs "dr avery quinn".
 */
export function normalizeSignature(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.,'’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The field keys a signature field's settings name (`signatureOf`), whose answers it must spell. */
export function signatureFieldKeys(settings: unknown): string[] {
  if (!settings || typeof settings !== "object") return [];
  const keys: unknown = Reflect.get(settings, "signatureOf");
  return Array.isArray(keys) ? keys.filter((key): key is string => typeof key === "string" && key.length > 0) : [];
}

/** The name a signature must match: the named fields' answers, in order. */
export function expectedSignature(keys: readonly string[], values: Readonly<Record<string, unknown>>): string {
  return keys
    .map((key) => values[key])
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");
}

/** Why a typed signature doesn't sign the expected name, or null. Empty answers are the required rule's concern. */
export function signatureError(value: string, expected: string): string | null {
  if (value.trim() === "" || expected === "") return null;
  return normalizeSignature(value) === normalizeSignature(expected) ? null : `Type your full name as you entered it: ${expected}.`;
}

/**
 * Signature errors across a form's answers: for each visible field whose
 * settings name `signatureOf` fields, the typed answer must match them.
 */
export function signatureErrors(
  fields: ReadonlyArray<{ key: string; settings?: unknown }>,
  values: Readonly<Record<string, unknown>>,
  isVisible: (key: string) => boolean,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (!isVisible(field.key)) continue;
    const keys = signatureFieldKeys(typeof field.settings === "string" ? parseSettingsObject(field.settings) : field.settings);
    if (keys.length === 0) continue;
    const value = values[field.key];
    const error = typeof value === "string" ? signatureError(value, expectedSignature(keys, values)) : null;
    if (error) errors[field.key] = error;
  }
  return errors;
}

function parseSettingsObject(settings: string): unknown {
  try {
    return JSON.parse(settings);
  } catch {
    return null;
  }
}
