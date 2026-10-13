/**
 * Product "conversational attributes" — the structured facts the assistant and
 * product pages show (fit, dimensions, compatibility, use cases). Stored
 * untyped on the product; read through `productAttributesOf`, which keeps
 * scalar facts and lists of scalars and drops anything else.
 */

export type ProductAttributeScalar = string | number | boolean;
export type ProductAttributeValue = ProductAttributeScalar | ProductAttributeScalar[];
export type ProductAttributes = Record<string, ProductAttributeValue>;

function isScalar(value: unknown): value is ProductAttributeScalar {
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

export function productAttributesOf(value: unknown): ProductAttributes | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const attributes: ProductAttributes = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isScalar(entry)) attributes[key] = entry;
    else if (Array.isArray(entry)) attributes[key] = entry.filter(isScalar);
  }
  return attributes;
}
