import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { OrderListTable } from "@/components/commerce/OrderListTable";

const orderSearchSchema = z.object({
  status: z
    .enum([
      "draft",
      "pending",
      "payment_pending",
      "paid",
      "payment_failed",
      "partially_refunded",
      "fulfilled",
      "cancelled",
      "refunded",
    ])
    .optional(),
  sourceType: z
    .enum([
      "storefront_order",
      "form_order",
      "subscription_signup",
      "subscription_invoice",
      "manual",
      "api",
    ])
    .optional(),
  search: z.string().optional(),
  orderBy: z
    .enum(["orderNumber", "customer", "total", "status", "date"])
    .optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
  customerId: z.string().optional(),
  userId: z.string().optional(),
  dateFrom: z.number().optional(),
  dateTo: z.number().optional(),
  paymentStatus: z.string().optional(),
  fulfillmentStatus: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/_admin/commerce/orders")({
  validateSearch: orderSearchSchema,
  component: CommerceOrdersPage,
});

function CommerceOrdersPage() {
  return <OrderListTable />;
}
