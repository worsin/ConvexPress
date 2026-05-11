/**
 * Commerce — Discount list-table types.
 */

import type { Id } from "@backend/convex/_generated/dataModel";

export type DiscountStatus = "active" | "inactive";
export type DiscountType = "fixed_cart" | "percent" | "fixed_product" | "free_shipping";

export interface DiscountListItem {
  _id: Id<"commerce_discount_codes">;
  code: string;
  description?: string;
  status: DiscountStatus;
  discountType: DiscountType;
  amount: number;
  usageCount: number;
  usageLimit?: number;
  minimumSubtotalAmount?: number;
  startsAt?: number;
  endsAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DiscountListResult {
  items: DiscountListItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface DiscountCounts {
  all: number;
  active: number;
  inactive: number;
  scheduled: number;
  expired: number;
  [key: string]: number;
}

export const DISCOUNT_SORT_FIELD_MAP: Record<string, string> = {
  code: "code",
  amount: "amount",
  usage: "usage",
  status: "status",
  ends: "endsAt",
  date: "updatedAt",
};
