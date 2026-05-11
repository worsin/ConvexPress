/**
 * Commerce — Customer list-table types.
 */

import type { Id } from "@backend/convex/_generated/dataModel";

export interface CustomerListItem {
  _id: Id<"commerce_customer_profiles">;
  userId?: Id<"users">;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isGuest?: boolean;
  totalOrders: number;
  totalSpentAmount: number;
  currencyCode: string;
  createdAt: number;
  updatedAt: number;
}

export interface CustomerListResult {
  items: CustomerListItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface CustomerCounts {
  all: number;
  with_orders: number;
  no_orders: number;
  guests: number;
  registered: number;
  [key: string]: number;
}

/** Map UI sort column key → backend orderBy. */
export const CUSTOMER_SORT_FIELD_MAP: Record<string, string> = {
  name: "name",
  email: "email",
  orders: "totalOrders",
  spent: "totalSpent",
  date: "createdAt",
};
