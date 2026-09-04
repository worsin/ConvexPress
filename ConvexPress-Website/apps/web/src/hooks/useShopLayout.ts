/**
 * Which storefront layout presets are active.
 *
 * Presets come from Settings › Shop layouts (`layoutConfig` in public settings).
 * The admin's preview button opens the site with `?layout=` / `?productLayout=`
 * so a preset can be seen before it is saved; those overrides never persist.
 */

import { useSearch } from "@tanstack/react-router";

import { useSettings } from "@/contexts/SettingsContext";

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

export function useShopLayout(): ShopLayout {
  const settings = useSettings();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const stored = settings?.layoutConfig ?? null;

  const base = {
    shopLayout: pick(stored?.shopLayout, SHOP_LAYOUT_IDS, DEFAULTS.shopLayout),
    productLayout: pick(stored?.productLayout, PRODUCT_LAYOUT_IDS, DEFAULTS.productLayout),
    cartPanel: pick(stored?.cartPanel, ["persistent", "drawer"] as const, DEFAULTS.cartPanel),
    gridDensity: pick(stored?.gridDensity, ["comfortable", "dense"] as const, DEFAULTS.gridDensity),
  };

  const shopOverride = pick(search.layout, SHOP_LAYOUT_IDS, base.shopLayout);
  const productOverride = pick(search.productLayout, PRODUCT_LAYOUT_IDS, base.productLayout);
  const cartOverride = pick(search.cartPanel, ["persistent", "drawer"] as const, base.cartPanel);
  const previewing = shopOverride !== base.shopLayout || productOverride !== base.productLayout || cartOverride !== base.cartPanel;

  return {
    ...base,
    shopLayout: shopOverride,
    productLayout: productOverride,
    cartPanel: cartOverride,
    previewing,
  };
}
