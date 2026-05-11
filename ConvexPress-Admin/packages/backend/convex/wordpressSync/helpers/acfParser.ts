/**
 * Advanced Custom Fields (ACF) Parser
 *
 * Parses ACF field data from WordPress post meta.
 *
 * ACF stores fields in postmeta with a two-field pattern:
 *   - `field_name` = value (the actual data)
 *   - `_field_name` = field key (e.g., "field_5f123abc")
 *
 * The field key references the field configuration in ACF,
 * which we preserve for potential future field type detection.
 */

import { isSerialized, unserializePHP, type PHPValue } from "./phpUnserialize";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ACFField {
  /** The field name */
  name: string;
  /** The ACF field key (e.g., "field_5f123abc") */
  key: string;
  /** The field value (parsed from PHP serialized if needed) */
  value: PHPValue;
  /** Original raw value before parsing */
  rawValue: string | number | boolean | Record<string, unknown>;
}

export interface ACFData {
  /** Parsed ACF fields keyed by field name */
  fields: Record<string, ACFField>;
  /** List of field names found */
  fieldNames: string[];
}

export interface WPMetaItem {
  key: string;
  value: string | number | boolean | Record<string, unknown>;
}

// ─── Parsing ───────────────────────────────────────────────────────────────

/**
 * Parse ACF fields from WordPress post meta.
 *
 * @param metaItems - Array of meta key/value pairs from WordPress
 * @returns Parsed ACF data
 */
export function parseACFFields(metaItems: WPMetaItem[]): ACFData {
  const fields: Record<string, ACFField> = {};
  const fieldKeys = new Map<string, string>(); // fieldName -> ACF key

  // First pass: collect ACF field keys (entries starting with _)
  for (const meta of metaItems) {
    if (
      meta.key.startsWith("_") &&
      typeof meta.value === "string" &&
      meta.value.startsWith("field_")
    ) {
      // This is an ACF field key reference
      const fieldName = meta.key.slice(1); // Remove leading underscore
      fieldKeys.set(fieldName, meta.value);
    }
  }

  // Second pass: collect field values
  for (const meta of metaItems) {
    // Skip internal meta keys
    if (meta.key.startsWith("_")) continue;

    // Check if this field has an ACF key (making it an ACF field)
    const acfKey = fieldKeys.get(meta.key);
    if (!acfKey) continue;

    // Parse the value
    let parsedValue: PHPValue;
    const rawValue = meta.value;

    if (typeof rawValue === "string" && isSerialized(rawValue)) {
      try {
        parsedValue = unserializePHP(rawValue);
      } catch {
        parsedValue = rawValue;
      }
    } else if (typeof rawValue === "string") {
      parsedValue = rawValue;
    } else if (typeof rawValue === "number" || typeof rawValue === "boolean") {
      parsedValue = rawValue;
    } else {
      // Object or complex value
      parsedValue = rawValue as PHPValue;
    }

    fields[meta.key] = {
      name: meta.key,
      key: acfKey,
      value: parsedValue,
      rawValue,
    };
  }

  return {
    fields,
    fieldNames: Object.keys(fields),
  };
}

/**
 * Check if any ACF fields exist in the meta.
 */
export function hasACFFields(metaItems: WPMetaItem[]): boolean {
  for (const meta of metaItems) {
    if (
      meta.key.startsWith("_") &&
      typeof meta.value === "string" &&
      meta.value.startsWith("field_")
    ) {
      return true;
    }
  }
  return false;
}

// ─── Field Type Handling ───────────────────────────────────────────────────

/**
 * Attempt to determine ACF field type from the value structure.
 * This is a heuristic since we don't have access to field configuration.
 */
export function inferACFFieldType(
  value: PHPValue
): "text" | "textarea" | "wysiwyg" | "number" | "boolean" | "array" | "object" | "image" | "file" | "gallery" | "repeater" | "unknown" {
  if (value === null) return "text";

  if (typeof value === "string") {
    // Check for HTML content (WYSIWYG)
    if (/<[a-z][\s\S]*>/i.test(value)) {
      return "wysiwyg";
    }
    // Check for newlines (textarea)
    if (value.includes("\n")) {
      return "textarea";
    }
    return "text";
  }

  if (typeof value === "number") {
    return "number";
  }

  if (typeof value === "boolean") {
    return "boolean";
  }

  if (Array.isArray(value)) {
    // Check if it looks like a gallery (array of IDs or image objects)
    if (value.every((item) => typeof item === "number")) {
      return "gallery";
    }
    // Check if it's a repeater (array of objects)
    if (value.every((item) => typeof item === "object" && item !== null)) {
      return "repeater";
    }
    return "array";
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;

    // Check for image/file structure
    if ("url" in obj && "id" in obj) {
      if ("sizes" in obj || "width" in obj || "height" in obj) {
        return "image";
      }
      return "file";
    }

    return "object";
  }

  return "unknown";
}

// ─── Conversion to ConvexPress Format ──────────────────────────────────────

/**
 * Convert ACF data to ConvexPress custom field format for storage.
 * Returns an array of key-value pairs suitable for postMeta storage.
 */
export function acfToPostMeta(
  acfData: ACFData
): Array<{ key: string; value: string }> {
  const result: Array<{ key: string; value: string }> = [];

  for (const [fieldName, field] of Object.entries(acfData.fields)) {
    // Store the field data with ACF prefix
    result.push({
      key: `_acf_${fieldName}`,
      value: JSON.stringify({
        acfKey: field.key,
        value: field.value,
        type: inferACFFieldType(field.value),
      }),
    });
  }

  return result;
}

/**
 * Extract image URLs from ACF fields for media import.
 */
export function extractACFImageUrls(acfData: ACFData): string[] {
  const urls: string[] = [];

  function extractFromValue(value: PHPValue): void {
    if (!value) return;

    if (typeof value === "string") {
      // Check if it's an image URL
      if (isImageUrl(value)) {
        urls.push(value);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        extractFromValue(item);
      }
    } else if (typeof value === "object" && value !== null) {
      const obj = value as Record<string, unknown>;

      // Check for image structure
      if ("url" in obj && typeof obj.url === "string") {
        if (isImageUrl(obj.url)) {
          urls.push(obj.url);
        }
      }

      // Recurse into object values
      for (const val of Object.values(obj)) {
        extractFromValue(val as PHPValue);
      }
    }
  }

  for (const field of Object.values(acfData.fields)) {
    extractFromValue(field.value);
  }

  return [...new Set(urls)]; // Deduplicate
}

/**
 * Remap image URLs in ACF data after media import.
 */
export function remapACFImageUrls(
  acfData: ACFData,
  urlMapping: Map<string, string>
): ACFData {
  // Deep clone
  const remapped = JSON.parse(JSON.stringify(acfData)) as ACFData;

  function remapInValue(value: PHPValue): PHPValue {
    if (!value) return value;

    if (typeof value === "string") {
      if (urlMapping.has(value)) {
        return urlMapping.get(value)!;
      }
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => remapInValue(item));
    }

    if (typeof value === "object" && value !== null) {
      const obj = value as Record<string, PHPValue>;
      const result: Record<string, PHPValue> = {};

      for (const [key, val] of Object.entries(obj)) {
        if (key === "url" && typeof val === "string" && urlMapping.has(val)) {
          result[key] = urlMapping.get(val)!;
        } else {
          result[key] = remapInValue(val);
        }
      }

      return result;
    }

    return value;
  }

  for (const [fieldName, field] of Object.entries(remapped.fields)) {
    field.value = remapInValue(field.value);
  }

  return remapped;
}

// ─── Utility Functions ─────────────────────────────────────────────────────

function isImageUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;

  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i;
  if (imageExtensions.test(url)) return true;

  if (url.includes("/wp-content/uploads/")) return true;

  return false;
}
