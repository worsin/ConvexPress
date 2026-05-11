/**
 * Custom Field System - Website SSR Helpers
 *
 * Provides WordPress-equivalent helper functions for retrieving custom field
 * values in TanStack Start server loaders and client components.
 *
 * Functions:
 *   - getField(entityType, entityId, fieldName)      - WP's get_field()
 *   - getFields(entityType, entityId)                - WP's get_fields()
 *   - getFieldObject(entityType, entityId, fieldName) - WP's get_field_object()
 *
 * These functions use Convex's `fetchQuery` for server-side rendering and
 * `useQuery` subscriptions for client-side real-time updates.
 *
 * Authentication: None required. These queries allow anonymous access for
 * published content. The backend queries handle auth checks internally.
 */

import { useQuery } from "convex/react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convexpress-website/backend/generated/api";
import {
  parseStringArray,
  parseObjectField,
  parseLinkField,
  parseRepeaterField,
} from "@/lib/schemas/content";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FieldValue {
  /** The unique field key (e.g., "field_abc123") */
  fieldKey: string;
  /** The human-readable field name (e.g., "hero_title") */
  fieldName: string;
  /** The field type slug (e.g., "text", "image", "repeater") */
  type: string;
  /** The stored value (always a string; may be JSON for complex types) */
  value: string;
}

export interface FieldObject {
  /** The full field definition (schema, settings, validation rules) */
  definition: {
    _id: string;
    groupId: string;
    label: string;
    name: string;
    key: string;
    type: string;
    instructions?: string;
    required: boolean;
    defaultValue?: string;
    settings: string;
    menuOrder: number;
  };
  /** The current stored value (or default value, or null) */
  value: string | null;
}

// ─── Typed Value Parsers ────────────────────────────────────────────────────

/**
 * Parse a field value based on its type.
 * Returns the appropriately typed value from the stored string.
 */
export function parseFieldValue(value: string, type: string): unknown {
  switch (type) {
    // Simple string types
    case "text":
    case "textarea":
    case "email":
    case "url":
    case "password":
    case "wysiwyg":
    case "oembed":
    case "color_picker":
    case "date_picker":
    case "date_time_picker":
    case "time_picker":
      return value;

    // Number types
    case "number":
    case "range":
      return value === "" ? null : Number(value);

    // Boolean type
    case "true_false":
      return value === "1" || value === "true";

    // JSON array types
    case "checkbox":
    case "gallery":
    case "relationship":
    case "taxonomy":
      return parseStringArray(value);

    // JSON object types - uses Zod-validated parsing
    case "link":
      return parseLinkField(value);
    case "group":
      return parseObjectField(value);

    // JSON array of objects - uses Zod-validated parsing
    case "repeater":
    case "flexible_content":
      return parseRepeaterField(value);

    // ID types (single reference)
    case "image":
    case "file":
    case "post_object":
    case "page_link":
    case "user":
    case "select":
      return value || null;

    // Layout types (no value)
    case "message":
    case "accordion":
    case "tab":
      return null;

    // Button group (single string value)
    case "button_group":
    case "radio":
      return value;

    default:
      return value;
  }
}

// ─── SSR Helper Functions (Server-Side) ─────────────────────────────────────

/**
 * Get a single custom field value on the server (SSR / TanStack Start loader).
 *
 * Equivalent to WordPress's `get_field()` in a server context.
 * Uses Convex's fetchQuery for one-shot server-side data fetching.
 *
 * @param entityType - The entity type ("post", "page", etc.)
 * @param entityId - The entity's Convex document ID
 * @param fieldName - The field name (human-readable slug, e.g., "hero_title")
 * @returns The parsed field value, or null if not found
 *
 * @example
 * ```ts
 * // In a TanStack Start loader
 * const heroTitle = await getField("post", postId, "hero_title");
 * ```
 */
export async function getField(
  entityType: string,
  entityId: string,
  fieldName: string,
): Promise<unknown | null> {
  try {
    const result = await fetchQuery(api.customFields.queries.getValue, {
      entityType,
      entityId,
      fieldName,
    });

    if (!result) return null;
    return parseFieldValue(result.value, result.type);
  } catch {
    return null;
  }
}

/**
 * Get all custom field values for an entity on the server (SSR).
 *
 * Equivalent to WordPress's `get_fields()` in a server context.
 *
 * @param entityType - The entity type ("post", "page", etc.)
 * @param entityId - The entity's Convex document ID
 * @returns Record of fieldName -> parsed value
 *
 * @example
 * ```ts
 * const fields = await getFields("post", postId);
 * const heroTitle = fields.hero_title as string;
 * ```
 */
export async function getFields(
  entityType: string,
  entityId: string,
): Promise<Record<string, unknown>> {
  try {
    const result = await fetchQuery(api.customFields.queries.getAllValues, {
      entityType,
      entityId,
    });

    if (!result) return {};

    const fields: Record<string, unknown> = {};
    for (const item of result) {
      fields[item.fieldName] = parseFieldValue(item.value, item.type);
    }
    return fields;
  } catch {
    return {};
  }
}

/**
 * Get a field definition + value on the server (SSR).
 *
 * Equivalent to WordPress's `get_field_object()` in a server context.
 *
 * @param entityType - The entity type ("post", "page", etc.)
 * @param entityId - The entity's Convex document ID
 * @param fieldName - The field name (human-readable slug)
 * @returns FieldObject with definition and value, or null
 */
export async function getFieldObject(
  entityType: string,
  entityId: string,
  fieldName: string,
): Promise<FieldObject | null> {
  try {
    const result = await fetchQuery(api.customFields.queries.getFieldWithValue, {
      entityType,
      entityId,
      fieldName,
    });

    if (!result) return null;

    return {
      definition: result.definition,
      value: result.value,
    } as FieldObject;
  } catch {
    return null;
  }
}

// ─── Client-Side Hooks ──────────────────────────────────────────────────────

/**
 * Get a single custom field value for an entity.
 *
 * Equivalent to WordPress's `get_field()`.
 *
 * @param entityType - The entity type ("post", "page", etc.)
 * @param entityId - The entity's Convex document ID
 * @param fieldName - The field name (human-readable slug, e.g., "hero_title")
 * @returns The parsed field value, or undefined if loading, or null if not found
 *
 * @example
 * ```tsx
 * function HeroSection({ postId }: { postId: string }) {
 *   const heroTitle = useField("post", postId, "hero_title");
 *   if (heroTitle === undefined) return <Skeleton />;
 *   return <h1>{heroTitle as string}</h1>;
 * }
 * ```
 */
export function useField(
  entityType: string,
  entityId: string,
  fieldName: string,
): unknown | undefined | null {
  const result = useQuery(api.customFields.queries.getValue, {
    entityType,
    entityId,
    fieldName,
  });

  if (result === undefined) return undefined; // Loading
  if (result === null) return null; // Not found

  return parseFieldValue(result.value, result.type);
}

/**
 * Get all custom field values for an entity as a key-value record.
 *
 * Equivalent to WordPress's `get_fields()`.
 *
 * @param entityType - The entity type ("post", "page", etc.)
 * @param entityId - The entity's Convex document ID
 * @returns Record of fieldName -> parsed value, or undefined if loading
 *
 * @example
 * ```tsx
 * function PostMeta({ postId }: { postId: string }) {
 *   const fields = useFields("post", postId);
 *   if (fields === undefined) return <Skeleton />;
 *   return (
 *     <div>
 *       <p>Author: {fields.author_name as string}</p>
 *       <p>Rating: {fields.rating as number}</p>
 *     </div>
 *   );
 * }
 * ```
 */
export function useFields(
  entityType: string,
  entityId: string,
): Record<string, unknown> | undefined {
  const result = useQuery(api.customFields.queries.getAllValues, {
    entityType,
    entityId,
  });

  if (result === undefined) return undefined;

  const fields: Record<string, unknown> = {};
  for (const item of result) {
    fields[item.fieldName] = parseFieldValue(item.value, item.type);
  }
  return fields;
}

/**
 * Get a field definition + its stored value for a specific entity and field.
 *
 * Equivalent to WordPress's `get_field_object()`.
 *
 * @param entityType - The entity type ("post", "page", etc.)
 * @param entityId - The entity's Convex document ID
 * @param fieldName - The field name (human-readable slug)
 * @returns FieldObject with definition and value, or undefined/null
 *
 * @example
 * ```tsx
 * function FieldDisplay({ postId }: { postId: string }) {
 *   const field = useFieldObject("post", postId, "hero_image");
 *   if (field === undefined) return <Skeleton />;
 *   if (field === null) return null;
 *   return (
 *     <div>
 *       <label>{field.definition.label}</label>
 *       <img src={field.value as string} alt="" />
 *     </div>
 *   );
 * }
 * ```
 */
export function useFieldObject(
  entityType: string,
  entityId: string,
  fieldName: string,
): FieldObject | undefined | null {
  const result = useQuery(api.customFields.queries.getFieldWithValue, {
    entityType,
    entityId,
    fieldName,
  });

  if (result === undefined) return undefined;
  if (result === null) return null;

  return {
    definition: result.definition,
    value: result.value,
  } as FieldObject;
}

// ─── Raw Value Hooks (No Parsing) ───────────────────────────────────────────

/**
 * Get the raw string value of a custom field.
 * Useful when you need the unparsed value (e.g., for JSON manipulation).
 */
export function useRawField(
  entityType: string,
  entityId: string,
  fieldName: string,
): FieldValue | undefined | null {
  return useQuery(api.customFields.queries.getValue, {
    entityType,
    entityId,
    fieldName,
  });
}

/**
 * Get all raw field values for an entity.
 * Returns the array of FieldValue objects without parsing.
 */
export function useRawFields(
  entityType: string,
  entityId: string,
): FieldValue[] | undefined {
  return useQuery(api.customFields.queries.getAllValues, {
    entityType,
    entityId,
  });
}
