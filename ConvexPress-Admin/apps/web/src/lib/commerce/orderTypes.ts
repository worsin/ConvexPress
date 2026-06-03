/**
 * Commerce — Order list-table types.
 */

import type { Id } from "@backend/convex/_generated/dataModel";

export type OrderStatus =
  | "draft"
  | "pending"
  | "payment_pending"
  | "processing"
  | "paid"
  | "payment_failed"
  | "partially_refunded"
  | "fulfilled"
  | "completed"
  | "cancelled"
  | "refunded"
  | "failed";

export type PurchaseSourceType =
  | "storefront_order"
  | "form_order"
  | "subscription_signup"
  | "subscription_invoice"
  | "manual"
  | "api";

export interface OrderListItem {
  _id: Id<"purchase_orders">;
  orderNumber: string;
  sourceType: PurchaseSourceType;
  sourceId: string;
  sourceLabel?: string;
  sourceUrl?: string;
  commerceOrderId?: Id<"commerce_orders">;
  formId?: Id<"forms">;
  formSubmissionId?: Id<"form_submissions">;
  subscriptionId?: Id<"commerce_subscriptions">;
  subscriptionInvoiceId?: Id<"commerce_subscription_invoices">;
  status: OrderStatus;
  email?: string;
  customerName?: string;
  totalAmount: number;
  currencyCode: string;
  paymentStatus: string;
  fulfillmentStatus?: string;
  createdAt: number;
  placedAt?: number;
  paidAt?: number;
  customerId?: Id<"commerce_customer_profiles">;
  userId?: Id<"users">;
  lineCount: number;
  itemTotalQuantity: number;
  customer?: {
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
  payment_pending: number;
  pending: number;
  paid: number;
  payment_failed: number;
  partially_refunded: number;
  fulfilled: number;
  cancelled: number;
  refunded: number;
  storefront_order: number;
  form_order: number;
  subscription_signup: number;
  subscription_invoice: number;
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
