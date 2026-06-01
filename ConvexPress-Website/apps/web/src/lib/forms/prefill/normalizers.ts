/**
 * Form Prefill — per-field value normalizers (registry).
 *
 * After `sanitizeInput`, a cleaned string is normalized into the EXACT string
 * encoding the renderer/submit contract expects for the field's type, OR
 * REJECTED (never coerced to junk). Pure + SSR-safe.
 *
 * String encodings (from FormFieldRenderer header + customFields/validators):
 *   text/textarea/email/url       → plain string
 *   number                        → numeric string (rejects non-numeric)
 *   date_picker                   → "YYYY-MM-DD" (rejects malformed)
 *   select(single)/radio/button_group → the chosen choice `value`
 *   select(multiple)/checkbox     → JSON array string of chosen `value`s
 *   true_false                    → "1" / "0"
 * Layout types message/accordion/tab/page_break (+ password) are never
 * populated (filtered upstream in parsePrefill).
 */

import { sanitizeEnum } from "./sanitize";
import { normalizeStateName } from "./states";
import type { PublicFormField } from "@/components/forms/FormFieldRenderer";

/** Sentinel: the value is illegal for this field — drop it, do not coerce. */
export const REJECT = Symbol("prefill-reject");
export type NormalizeOutput = string | typeof REJECT;

interface Choice {
  value: string;
  label: string;
}

interface ParsedSettings {
  choices?: Choice[];
  multiple?: boolean;
  /** Optional normalizer hint (e.g. "state", "slug") authored in settings. */
  normalize?: string;
}

/** Parse a field's settings JSON tolerantly. */
function parseSettings(settings: string): ParsedSettings {
  try {
    const parsed = JSON.parse(settings);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** The choice `value`s for a choice-based field. */
function choiceValues(settings: ParsedSettings): string[] {
  return (settings.choices ?? []).map((c) => c.value);
}

const TRUTHY = new Set(["1", "true", "yes", "on", "checked"]);
const FALSY = new Set(["0", "false", "no", "off", "unchecked", ""]);

/**
 * Normalize a cleaned string into the field's string encoding. Returns the
 * encoded value, or `REJECT` when the value is illegal for the field. The
 * caller (parsePrefill) maps REJECT → the `rejected` list.
 */
export function normalizeForField(
  field: PublicFormField,
  clean: string,
): NormalizeOutput {
  const settings = parseSettings(field.settings);

  // ── Explicit normalizer hints (extensible registry by name) ──────────────
  const hint = settings.normalize?.toLowerCase();
  if (hint === "state") {
    const full = normalizeStateName(clean);
    return full ?? REJECT;
  }
  if (hint === "slug" || hint === "enum") {
    // Map slug/enum against the choice value set.
    const matched = sanitizeEnum(clean, choiceValues(settings));
    return matched ?? REJECT;
  }

  // ── Type-driven encoding (the default path) ──────────────────────────────
  switch (field.type) {
    case "text":
    case "textarea":
    case "email":
    case "url":
      return clean;

    case "number": {
      // Accept a numeric string only.
      const n = Number(clean);
      return Number.isFinite(n) && clean.trim() !== "" ? String(n) : REJECT;
    }

    case "date_picker": {
      // Strictly "YYYY-MM-DD".
      if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return REJECT;
      const d = new Date(`${clean}T00:00:00Z`);
      return Number.isNaN(d.getTime()) ? REJECT : clean;
    }

    case "select": {
      const values = choiceValues(settings);
      if (settings.multiple) {
        return normalizeMultiSelect(clean, values);
      }
      const matched = sanitizeEnum(clean, values);
      return matched ?? REJECT;
    }

    case "radio":
    case "button_group": {
      const matched = sanitizeEnum(clean, choiceValues(settings));
      return matched ?? REJECT;
    }

    case "checkbox": {
      return normalizeMultiSelect(clean, choiceValues(settings));
    }

    case "true_false": {
      const lower = clean.toLowerCase();
      if (TRUTHY.has(lower)) return "1";
      if (FALSY.has(lower)) return "0";
      return REJECT;
    }

    default:
      // Unknown / unsupported scalar-ish types: accept the cleaned string.
      // (Layout/password are filtered upstream, never reaching here.)
      return clean;
  }
}

/**
 * Normalize a comma-separated multi-value input into a JSON array string of
 * matched choice `value`s. Any token that doesn't match a choice is dropped;
 * an all-miss input → REJECT (no legal selection).
 */
function normalizeMultiSelect(clean: string, values: string[]): NormalizeOutput {
  const tokens = clean
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return REJECT;

  const matched: string[] = [];
  for (const token of tokens) {
    const hit = sanitizeEnum(token, values);
    if (hit && !matched.includes(hit)) matched.push(hit);
  }
  return matched.length > 0 ? JSON.stringify(matched) : REJECT;
}
