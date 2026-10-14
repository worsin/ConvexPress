import type { FunctionReturnType } from "convex/server";
import type { api } from "@convexpress-website/backend/generated/api";
import { z } from "zod";

export type CartLineMetadata = {
  lineType?: string;
  bundleName?: string;
  variantTitle?: string;
  optionSummary?: string;
  variantSku?: string;
  selections?: Array<{
    componentId: string;
    componentLabel?: string;
    productTitle: string;
    quantity: number;
  }>;
};

const cartLineMetadataSchema = z.object({
  lineType: z.string().optional(),
  bundleName: z.string().optional(),
  variantTitle: z.string().optional(),
  optionSummary: z.string().optional(),
  variantSku: z.string().optional(),
  selections: z.array(z.object({
    componentId: z.string(),
    componentLabel: z.string().optional(),
    productTitle: z.string(),
    quantity: z.number(),
  })).optional(),
});

/** Cart item metadata is free-form on the backend (`v.any()`); read only the
 * display fields this module understands. Malformed metadata reads as none. */
export function parseCartLineMetadata(value: unknown): CartLineMetadata | undefined {
  const parsed = cartLineMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** The mine-cart query result with each line's free-form metadata parsed. */
export function parseCartLinesMetadata(cart: NonNullable<FunctionReturnType<typeof api.commerce.cart.getMine>>) {
  return { ...cart, items: cart.items.map((item) => ({ ...item, metadata: parseCartLineMetadata(item.metadata) })) };
}

export type CartLineProduct = {
  title?: string;
  sku?: string;
};

export function getCartLineTitle(
  product: CartLineProduct | null | undefined,
  metadata?: CartLineMetadata,
) {
  if (metadata?.lineType === "bundle") {
    return metadata.bundleName ?? product?.title ?? "Bundle";
  }

  return product?.title ?? "Product";
}

export type CartLineVariant = { title?: string; optionSummary?: string; sku?: string };

export function getCartLineSubtitle(metadata?: CartLineMetadata, variant?: CartLineVariant | null) {
  if (metadata?.lineType === "bundle") {
    return null;
  }

  if (variant) return variant.optionSummary || variant.title || null;

  if (metadata?.optionSummary) return metadata.optionSummary;
  if (metadata?.variantTitle) return metadata.variantTitle;
  return null;
}

export function getCartLineBundleSelections(metadata?: CartLineMetadata) {
  if (metadata?.lineType !== "bundle") return [];
  return metadata.selections ?? [];
}

export function getCartLineSku(
  product: CartLineProduct | null | undefined,
  metadata?: CartLineMetadata,
  variant?: CartLineVariant | null,
) {
  if (metadata?.lineType === "bundle") return null;
  if (variant) return variant.sku ?? product?.sku ?? null;
  return metadata?.variantSku ?? product?.sku ?? null;
}
