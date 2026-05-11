/**
 * Custom Field System - Type-Specific Value Validation
 *
 * Validates field values based on their type-specific constraints.
 * Provides per-type validation logic beyond basic required/JSON checks.
 *
 * Used by mutations.ts to validate values before persisting them.
 */

// ─── Validation Result ──────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const OK: ValidationResult = { valid: true };

function fail(error: string): ValidationResult {
  return { valid: false, error };
}

// ─── Email Validation ───────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── URL Validation ─────────────────────────────────────────────────────────

const URL_REGEX = /^https?:\/\/.+/;

// ─── Per-Type Validators ────────────────────────────────────────────────────

/**
 * Validate a field value based on its type and settings.
 *
 * @param type - The field type slug
 * @param value - The stored value (string)
 * @param settings - The field's settings JSON (parsed)
 * @param required - Whether the field is required
 */
export function validateFieldValue(
  type: string,
  value: string,
  settings: Record<string, unknown>,
  required: boolean,
): ValidationResult {
  // Empty value check
  if (!value || value === "" || value === "[]" || value === "{}") {
    if (required) return fail("This field is required.");
    return OK; // Empty optional field is valid
  }

  switch (type) {
    case "text":
      return validateText(value, settings);
    case "textarea":
      return validateTextarea(value, settings);
    case "number":
      return validateNumber(value, settings);
    case "range":
      return validateRange(value, settings);
    case "email":
      return validateEmail(value);
    case "url":
    case "oembed":
      return validateUrl(value);
    case "password":
      return validatePassword(value, settings);
    case "select":
      return validateSelect(value, settings);
    case "checkbox":
      return validateCheckbox(value, settings);
    case "radio":
    case "button_group":
      return validateRadio(value, settings);
    case "true_false":
      return validateTrueFalse(value);
    case "date_picker":
      return validateDate(value);
    case "date_time_picker":
      return validateDateTime(value);
    case "time_picker":
      return validateTime(value);
    case "color_picker":
      return validateColor(value);
    case "link":
      return validateLink(value);
    case "relationship":
      return validateRelationship(value, settings);
    case "gallery":
      return validateGallery(value, settings);
    case "repeater":
      return validateRepeater(value, settings);
    case "flexible_content":
      return validateFlexibleContent(value, settings);
    // Types that accept any string value
    case "image":
    case "file":
    case "wysiwyg":
    case "post_object":
    case "page_link":
    case "taxonomy":
    case "user":
    case "group":
      return OK;
    // Layout types (no value)
    case "message":
    case "accordion":
    case "tab":
      return OK;
    default:
      return OK;
  }
}

// ─── Type-Specific Validators ───────────────────────────────────────────────

function validateText(value: string, settings: Record<string, unknown>): ValidationResult {
  const maxLength = typeof settings.maxLength === "number" ? settings.maxLength : 0;
  if (maxLength > 0 && value.length > maxLength) {
    return fail(`Value must be ${maxLength} characters or fewer.`);
  }
  return OK;
}

function validateTextarea(value: string, settings: Record<string, unknown>): ValidationResult {
  const maxLength = typeof settings.maxLength === "number" ? settings.maxLength : 0;
  if (maxLength > 0 && value.length > maxLength) {
    return fail(`Value must be ${maxLength} characters or fewer.`);
  }
  return OK;
}

function validateNumber(value: string, settings: Record<string, unknown>): ValidationResult {
  const num = Number(value);
  if (isNaN(num)) return fail("Value must be a valid number.");
  const min = typeof settings.min === "number" ? settings.min : undefined;
  const max = typeof settings.max === "number" ? settings.max : undefined;
  if (min !== undefined && num < min) return fail(`Value must be at least ${min}.`);
  if (max !== undefined && num > max) return fail(`Value must be at most ${max}.`);
  return OK;
}

function validateRange(value: string, settings: Record<string, unknown>): ValidationResult {
  return validateNumber(value, settings);
}

function validateEmail(value: string): ValidationResult {
  if (!EMAIL_REGEX.test(value)) return fail("Value must be a valid email address.");
  return OK;
}

function validateUrl(value: string): ValidationResult {
  if (!URL_REGEX.test(value)) return fail("Value must be a valid URL starting with http:// or https://.");
  return OK;
}

function validatePassword(value: string, settings: Record<string, unknown>): ValidationResult {
  const minLength = typeof settings.minLength === "number" ? settings.minLength : 0;
  if (minLength > 0 && value.length < minLength) {
    return fail(`Password must be at least ${minLength} characters.`);
  }
  return OK;
}

function validateSelect(value: string, settings: Record<string, unknown>): ValidationResult {
  const choices = Array.isArray(settings.choices) ? settings.choices : [];
  const multiple = settings.multiple === true;

  if (multiple) {
    try {
      const selected: string[] = JSON.parse(value);
      if (!Array.isArray(selected)) return fail("Value must be a JSON array.");
      const validValues = new Set(choices.map((c: { value: string }) => c.value));
      for (const v of selected) {
        if (!validValues.has(v)) return fail(`Invalid choice: "${v}".`);
      }
    } catch {
      return fail("Value must be valid JSON.");
    }
  } else {
    const validValues = new Set(choices.map((c: { value: string }) => c.value));
    if (value && !validValues.has(value)) return fail(`Invalid choice: "${value}".`);
  }
  return OK;
}

function validateCheckbox(value: string, settings: Record<string, unknown>): ValidationResult {
  try {
    const selected: string[] = JSON.parse(value);
    if (!Array.isArray(selected)) return fail("Value must be a JSON array.");
    const choices = Array.isArray(settings.choices) ? settings.choices : [];
    const validValues = new Set(choices.map((c: { value: string }) => c.value));
    for (const v of selected) {
      if (!validValues.has(v)) return fail(`Invalid choice: "${v}".`);
    }
  } catch {
    return fail("Value must be valid JSON.");
  }
  return OK;
}

function validateRadio(value: string, settings: Record<string, unknown>): ValidationResult {
  const choices = Array.isArray(settings.choices) ? settings.choices : [];
  const validValues = new Set(choices.map((c: { value: string }) => c.value));
  if (value && !validValues.has(value)) return fail(`Invalid choice: "${value}".`);
  return OK;
}

function validateTrueFalse(value: string): ValidationResult {
  if (!["0", "1", "true", "false"].includes(value)) {
    return fail('Value must be "0", "1", "true", or "false".');
  }
  return OK;
}

function validateDate(value: string): ValidationResult {
  // Expect YYYY-MM-DD format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail("Value must be in YYYY-MM-DD format.");
  const date = new Date(value);
  if (isNaN(date.getTime())) return fail("Value must be a valid date.");
  return OK;
}

function validateDateTime(value: string): ValidationResult {
  // Expect YYYY-MM-DDTHH:mm or YYYY-MM-DD HH:mm format
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) {
    return fail("Value must be in YYYY-MM-DD HH:mm format.");
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) return fail("Value must be a valid date and time.");
  return OK;
}

function validateTime(value: string): ValidationResult {
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return fail("Value must be in HH:mm format.");
  return OK;
}

function validateColor(value: string): ValidationResult {
  // Accept #hex format (3, 4, 6, or 8 hex digits)
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return OK;
  // Accept rgba() format: rgba(R, G, B, A) where R/G/B are 0-255 and A is 0-1
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/.test(value)) return OK;
  return fail("Value must be a valid color (e.g., #FF0000 or rgba(255, 0, 0, 0.5)).");
}

function validateLink(value: string): ValidationResult {
  try {
    const link = JSON.parse(value);
    if (typeof link !== "object" || link === null) return fail("Value must be a JSON object.");
    if (link.url && !URL_REGEX.test(link.url)) return fail("Link URL must be valid.");
  } catch {
    return fail("Value must be valid JSON.");
  }
  return OK;
}

function validateRelationship(value: string, settings: Record<string, unknown>): ValidationResult {
  try {
    const ids: string[] = JSON.parse(value);
    if (!Array.isArray(ids)) return fail("Value must be a JSON array.");
    const min = typeof settings.min === "number" ? settings.min : 0;
    const max = typeof settings.max === "number" ? settings.max : 0;
    if (min > 0 && ids.length < min) return fail(`Select at least ${min} items.`);
    if (max > 0 && ids.length > max) return fail(`Select at most ${max} items.`);
  } catch {
    return fail("Value must be valid JSON.");
  }
  return OK;
}

function validateGallery(value: string, settings: Record<string, unknown>): ValidationResult {
  try {
    const images: string[] = JSON.parse(value);
    if (!Array.isArray(images)) return fail("Value must be a JSON array.");
    const min = typeof settings.min === "number" ? settings.min : 0;
    const max = typeof settings.max === "number" ? settings.max : 0;
    if (min > 0 && images.length < min) return fail(`Add at least ${min} images.`);
    if (max > 0 && images.length > max) return fail(`Add at most ${max} images.`);
  } catch {
    return fail("Value must be valid JSON.");
  }
  return OK;
}

function validateRepeater(value: string, settings: Record<string, unknown>): ValidationResult {
  try {
    const rows: unknown[] = JSON.parse(value);
    if (!Array.isArray(rows)) return fail("Value must be a JSON array.");
    const min = typeof settings.min === "number" ? settings.min : 0;
    const max = typeof settings.max === "number" ? settings.max : 0;
    if (min > 0 && rows.length < min) return fail(`Add at least ${min} rows.`);
    if (max > 0 && rows.length > max) return fail(`Add at most ${max} rows.`);
  } catch {
    return fail("Value must be valid JSON.");
  }
  return OK;
}

function validateFlexibleContent(value: string, settings: Record<string, unknown>): ValidationResult {
  try {
    const layouts: unknown[] = JSON.parse(value);
    if (!Array.isArray(layouts)) return fail("Value must be a JSON array.");
    const min = typeof settings.min === "number" ? settings.min : 0;
    const max = typeof settings.max === "number" ? settings.max : 0;
    if (min > 0 && layouts.length < min) return fail(`Add at least ${min} layouts.`);
    if (max > 0 && layouts.length > max) return fail(`Add at most ${max} layouts.`);
  } catch {
    return fail("Value must be valid JSON.");
  }
  return OK;
}
