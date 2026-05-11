import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CustomerListTable } from "@/components/commerce/CustomerListTable";

const customerSearchSchema = z.object({
  status: z.enum(["all", "with_orders", "no_orders", "guests", "registered"]).optional(),
  search: z.string().optional(),
  orderBy: z.enum(["name", "email", "orders", "spent", "date"]).optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
  page: z.number().min(1).optional(),
  perPage: z.number().min(1).max(100).optional(),
});

export const Route = createFileRoute("/_authenticated/_admin/commerce/customers")({
  validateSearch: customerSearchSchema,
  component: CommerceCustomersPage,
});

function CommerceCustomersPage() {
  return <CustomerListTable />;
}
