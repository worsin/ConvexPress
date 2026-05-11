/**
 * Content Validation Schemas
 *
 * Zod schemas for validating JSON content structures parsed from the database.
 * These provide type-safe validation for TipTap documents, custom field values,
 * and other JSON structures to prevent malformed data from propagating.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// TipTap Document Schemas
// ---------------------------------------------------------------------------

/**
 * Base TipTap mark schema (inline formatting).
 */
export const TipTapMarkSchema = z.object({
  type: z.string(),
  attrs: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Base TipTap node schema (block or inline element).
 * Recursive schema for nested content.
 */
export const TipTapNodeSchema: z.ZodType<TipTapNode> = z.lazy(() =>
  z.object({
    type: z.string(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(TipTapNodeSchema).optional(),
    text: z.string().optional(),
    marks: z.array(TipTapMarkSchema).optional(),
  })
);

export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/**
 * TipTap document root schema.
 * The top-level structure for block editor content.
 */
export const TipTapDocumentSchema = z.object({
  type: z.literal("doc"),
  content: z.array(TipTapNodeSchema).optional(),
});

export type TipTapDocument = z.infer<typeof TipTapDocumentSchema>;

// ---------------------------------------------------------------------------
// SEO Content Extraction Schemas
// ---------------------------------------------------------------------------

/**
 * Schema for block content when extracting plain text for SEO.
 * Used in SEO meta description generation.
 */
export const ContentBlockSchema = z.object({
  text: z.string().optional(),
  content: z.string().optional(),
});

export const ContentBlockArraySchema = z.array(ContentBlockSchema);

export const ContentDocumentSchema = z.object({
  content: z.union([z.string(), z.array(z.unknown())]).optional(),
});

// ---------------------------------------------------------------------------
// Custom Field Value Schemas
// ---------------------------------------------------------------------------

/**
 * Link field value schema.
 */
export const LinkFieldSchema = z.object({
  url: z.string().default(""),
  title: z.string().default(""),
  target: z.string().default(""),
});

export type LinkFieldValue = z.infer<typeof LinkFieldSchema>;

/**
 * String array schema (for checkbox, gallery, relationship, taxonomy fields).
 */
export const StringArraySchema = z.array(z.string());

/**
 * Generic object schema (for group fields).
 */
export const ObjectFieldSchema = z.record(z.string(), z.unknown());

/**
 * Repeater row schema (array of objects).
 */
export const RepeaterFieldSchema = z.array(z.record(z.string(), z.unknown()));

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Safely parse JSON with Zod validation.
 * Returns null on parse error or validation failure.
 *
 * @param jsonString - The JSON string to parse
 * @param schema - The Zod schema to validate against
 * @returns The validated data or null
 */
export function safeJsonParse<T>(
  jsonString: string,
  schema: z.ZodType<T>,
): T | null {
  try {
    const parsed = JSON.parse(jsonString);
    const result = schema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    console.warn("JSON validation failed:", result.error.message);
    return null;
  } catch {
    return null;
  }
}

/**
 * Safely parse JSON to a TipTap document.
 * Returns null if parsing fails or structure is invalid.
 *
 * @param json - JSON string or already-parsed object
 * @returns Validated TipTap document or null
 */
export function parseTipTapDocument(
  json: string | TipTapNode | null | undefined,
): TipTapDocument | null {
  if (!json) return null;

  let parsed: unknown;
  if (typeof json === "string") {
    try {
      parsed = JSON.parse(json);
    } catch {
      return null;
    }
  } else {
    parsed = json;
  }

  const result = TipTapDocumentSchema.safeParse(parsed);
  if (result.success) {
    return result.data;
  }

  console.warn("Invalid TipTap document structure:", result.error.message);
  return null;
}

/**
 * Parse string array from JSON (for checkbox, gallery, etc.).
 * Returns empty array on failure.
 */
export function parseStringArray(value: string): string[] {
  const result = safeJsonParse(value || "[]", StringArraySchema);
  return result ?? [];
}

/**
 * Parse object from JSON (for group fields, link fields).
 * Returns empty object on failure.
 */
export function parseObjectField(value: string): Record<string, unknown> {
  const result = safeJsonParse(value || "{}", ObjectFieldSchema);
  return result ?? {};
}

/**
 * Parse link field value from JSON.
 * Returns default link object on failure.
 */
export function parseLinkField(value: string): LinkFieldValue {
  const result = safeJsonParse(value || "{}", LinkFieldSchema);
  return result ?? { url: "", title: "", target: "" };
}

/**
 * Parse repeater/flexible content from JSON.
 * Returns empty array on failure.
 */
export function parseRepeaterField(value: string): Record<string, unknown>[] {
  const result = safeJsonParse(value || "[]", RepeaterFieldSchema);
  return result ?? [];
}

/**
 * Extract plain text from content for SEO purposes.
 * Handles both array format and document format.
 */
export function extractSeoText(content: string | null | undefined, maxLength = 160): string {
  if (!content) return "";

  let text = content;

  try {
    const parsed = JSON.parse(content);

    // Array of blocks format
    const arrayResult = ContentBlockArraySchema.safeParse(parsed);
    if (arrayResult.success) {
      text = arrayResult.data
        .map((block) => block.text || block.content || "")
        .join(" ");
    }
    // Document format with content property
    else {
      const docResult = ContentDocumentSchema.safeParse(parsed);
      if (docResult.success && typeof docResult.data.content === "string") {
        text = docResult.data.content;
      }
    }
  } catch {
    // Not JSON - treat as raw text/HTML
  }

  // Strip HTML tags
  text = text.replace(/<[^>]*>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  // Truncate to maxLength
  if (text.length > maxLength) {
    const truncated = text.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");
    text = lastSpace > maxLength * 0.7 ? truncated.substring(0, lastSpace) : truncated;
  }

  return text;
}
