/** Shared stock ownership and availability policy. No database or UI dependencies. */
export type StockMode = "yes" | "no" | "parent";
export type StockStatus = "instock" | "outofstock" | "onbackorder";
export type BackorderMode = "yes" | "no" | "notify";
export interface ProductStock {
  trackInventory?: boolean;
  stockQuantity?: number;
  allowBackorders?: boolean;
}
export interface VariantStock {
  manageStock?: StockMode;
  stockQuantity?: number;
  stockStatus?: StockStatus;
  backorders?: BackorderMode;
}

/** Before explicit modes existed, tracked products kept quantity on each variant. */
export function effectiveStockMode(product: ProductStock, variant: VariantStock): StockMode {
  return variant.manageStock ?? (product.trackInventory ? "yes" : "no");
}

export function resolveStockPolicy(product: ProductStock, variant?: VariantStock | null, reserved = 0) {
  const mode = variant ? effectiveStockMode(product, variant) : "parent";
  const tracked = mode === "yes" || (mode === "parent" && product.trackInventory === true);
  const owner: "product" | "variant" | null = tracked ? (mode === "yes" ? "variant" : "product") : null;
  const inheritedBackorders: BackorderMode = product.allowBackorders ? "yes" : "no";
  const backorders: BackorderMode = !variant || mode === "parent"
    ? inheritedBackorders
    : variant.backorders ?? (variant.manageStock === undefined ? inheritedBackorders : "no");
  // Untracked variants still retain their own editable physical quantity.
  const source = variant && mode !== "parent" ? variant : product;
  const stockQuantity = source?.stockQuantity ?? 0;
  if (!Number.isSafeInteger(stockQuantity) || !Number.isSafeInteger(reserved) || reserved < 0)
    throw new Error("Inventory quantities must be safe whole numbers.");
  const available = stockQuantity - reserved;
  if (!Number.isSafeInteger(available)) throw new Error("Inventory quantity exceeds the supported range.");
  const manualStatus = variant && mode === "no" ? variant.stockStatus ?? "instock" : "instock";
  const allowBackorders = backorders !== "no" || (!tracked && manualStatus === "onbackorder");
  const stockStatus: StockStatus = tracked
    ? available > 0 ? "instock" : allowBackorders ? "onbackorder" : "outofstock"
    : manualStatus;
  return { mode, tracked, owner, stockQuantity, available, backorders, allowBackorders, stockStatus };
}

export function canOrderQuantity(stock: ReturnType<typeof resolveStockPolicy>, quantity: number): boolean {
  return Number.isSafeInteger(quantity) && quantity > 0 && stock.stockStatus !== "outofstock" &&
    (!stock.tracked || stock.allowBackorders || quantity <= stock.available);
}
