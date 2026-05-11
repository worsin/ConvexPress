/**
 * Helper: resolve the effective shippingClassId for a cart line item.
 * PRD A2 §5.2 variant inheritance rule:
 *  - variant.shippingClassId = undefined → inherit from parent product
 *  - variant.shippingClassId = null (explicit) → no class (overrides product)
 *  - variant.shippingClassId = <id> → that class
 * Pure function — no ctx.
 */
export function resolveShippingClassId(
  product:
    | { shippingClassId?: string | null }
    | null
    | undefined,
  variant:
    | {
        shippingClassId?: string | null;
        shippingClassOverrideNone?: boolean;
      }
    | null
    | undefined,
): string | null {
  // Explicit "no class" override on variant wins.
  if (variant?.shippingClassOverrideNone) return null;
  // Variant specifies a class → use it.
  if (variant && variant.shippingClassId) return variant.shippingClassId;
  // Otherwise fall back to parent product's class.
  return product?.shippingClassId ?? null;
}

/**
 * Slugify a class name: lowercase, whitespace → dash, strip non-alphanumeric-dash,
 * collapse repeated dashes, trim leading/trailing dashes.
 */
export function slugifyClassName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
