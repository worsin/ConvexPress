/** Resolve template Shop settings and supported preview overrides without persisting them. */
export const SHOP_LAYOUT_IDS = ["boutique", "marketplace"] as const;
export type ShopLayoutId = (typeof SHOP_LAYOUT_IDS)[number];

export const PRODUCT_LAYOUT_IDS = ["classic", "marketplace", "split", "showcase", "minimal"] as const;
export type ProductLayoutId = (typeof PRODUCT_LAYOUT_IDS)[number];

export interface ShopLayout {
  shopLayout: ShopLayoutId;
  productLayout: ProductLayoutId;
  cartPanel: "persistent" | "drawer";
  gridDensity: "comfortable" | "dense";
  /** True when a preview override from the URL is in effect. */
  previewing: boolean;
}

const DEFAULTS: Omit<ShopLayout, "previewing"> = {
  shopLayout: "boutique",
  productLayout: "classic",
  cartPanel: "persistent",
  gridDensity: "comfortable",
};

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}


export function resolveShopLayout(
  variants: Record<string, string>,
  shop: Record<string, unknown>,
  search: Record<string, unknown> = {},
  previewing = false,
): ShopLayout {
  const base = {
    shopLayout: pick(variants["shop.catalog"] ?? shop.catalogVariant, SHOP_LAYOUT_IDS, DEFAULTS.shopLayout),
    productLayout: pick(variants["shop.product"] ?? shop.productVariant, PRODUCT_LAYOUT_IDS, DEFAULTS.productLayout),
    cartPanel: pick(shop.cartPanel, ["persistent", "drawer"] as const, DEFAULTS.cartPanel),
    gridDensity: pick(shop.gridDensity, ["comfortable", "dense"] as const, DEFAULTS.gridDensity),
  };
  const shopOverride = pick(search.layout, SHOP_LAYOUT_IDS, base.shopLayout);
  const productOverride = pick(search.productLayout, PRODUCT_LAYOUT_IDS, base.productLayout);
  const cartOverride = pick(search.cartPanel, ["persistent", "drawer"] as const, base.cartPanel);
  return {
    ...base,
    shopLayout: shopOverride,
    productLayout: productOverride,
    cartPanel: cartOverride,
    previewing: previewing || shopOverride !== base.shopLayout || productOverride !== base.productLayout || cartOverride !== base.cartPanel,
  };
}
