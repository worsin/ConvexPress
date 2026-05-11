/**
 * Commerce — Product list-table types.
 */

import type { Id } from "@backend/convex/_generated/dataModel";

export type ProductStatus = "draft" | "publish" | "private" | "trash";
export type ProductType = "simple" | "variable" | "external" | "grouped";

export interface ProductListItem {
  _id: Id<"commerce_products">;
  title: string;
  slug: string;
  sku?: string;
  status: ProductStatus;
  productType?: ProductType;
  description?: string;
  excerpt?: string;
  displayPrice?: number;
  currencyCode?: string;
  trackInventory?: boolean;
  stockQuantity?: number;
  authorId?: Id<"users">;
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
  categories?: Array<{ _id: string; name: string }>;
}

export interface ProductListResult {
  items: ProductListItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface ProductCounts {
  all: number;
  draft: number;
  publish: number;
  private: number;
  trash: number;
  published?: number; // alias
  [key: string]: number | undefined;
}

/** Map UI sort column key → backend orderBy field. */
export const PRODUCT_SORT_FIELD_MAP: Record<string, string> = {
  title: "title",
  sku: "sku",
  status: "status",
  date: "updatedAt",
  created: "createdAt",
};
