/** Route-owned data and callbacks shared by bundle template surfaces. */
import type { FunctionReturnType } from "convex/server";
import type { api } from "@convexpress-website/backend/generated/api";
export type BundleData = NonNullable<FunctionReturnType<typeof api.commerceBundles.queries.getBySlug>>;
export type BundleComponent = BundleData["components"][number];
export type BundlePriceData = NonNullable<FunctionReturnType<typeof api.commerceBundles.queries.calculatePrice>>;
export type BundleSelection = BundlePriceData["selections"][number];

export interface BundleDetailSurfaceData {
  bundle: BundleData;
  currencyCode: string;
  /** True for mix-and-match / BOGO bundles where the shopper picks components. */
  isConfigurable: boolean;
  /** Live price from the backend for the current selections; `undefined` while loading. */
  priceData: BundlePriceData | undefined;
  /** Current component selections keyed by component id (owned by the route: it feeds the price query). */
  selections: Map<string, BundleSelection>;
  totalSelectedItems: number;
  meetsMinItems: boolean;
  canAddToCart: boolean;
  onToggleComponent: (component: BundleComponent) => void;
  onUpdateQuantity: (componentId: string, delta: number) => void;
  onSetVariant: (componentId: string, variantId: string | undefined) => void;
  onResetDefaults: () => void;
  onAddToCart: () => Promise<void>;
}
