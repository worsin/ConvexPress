/**
 * Commerce — Order list-table types.
 */

import type { Id } from "@backend/convex/_generated/dataModel";

export type OrderStatus =
  | "pending"
  | "processing"
  | "paid"
  | "fulfilled"
  | "completed"
  | "cancelled"
  | "refunded"
  | "failed";

export interface OrderListItem {
  _id: Id<"commerce_orders">;
  orderNumber: string;
  status: OrderStatus;
  email: string;
  totalAmount: number;
  currencyCode: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: number;
  paidAt?: number;
  customerId?: Id<"commerce_customer_profiles">;
  userId?: Id<"users">;
  itemCount: number;
  itemTotalQuantity: number;
  customer: {
    _id: Id<"commerce_customer_profiles">;
    email: string;
    firstName?: string;
    lastName?: string;
  } | null;
}

export interface OrderListResult {
  items: OrderListItem[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export interface OrderCounts {
  all: number;
  pending: number;
  processing: number;
  paid: number;
  fulfilled: number;
  completed: number;
  cancelled: number;
  refunded: number;
  failed: number;
  [key: string]: number;
}

/** Map UI sort column key → backend orderBy field. */
export const ORDER_SORT_FIELD_MAP: Record<string, string> = {
  date: "createdAt",
  orderNumber: "orderNumber",
  customer: "email",
  total: "totalAmount",
  status: "status",
};
