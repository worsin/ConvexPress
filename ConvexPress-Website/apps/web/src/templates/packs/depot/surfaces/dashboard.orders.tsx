/**
 * Depot · dashboard.orders — the member's order history as a dense
 * `DataTable`: order number, source, status badge, tabular total, date.
 * Every row links to the order detail, as in Core.
 */
import { Link } from "@tanstack/react-router";

import { formatMoney } from "@/lib/commerce/format";
import type { DashboardOrdersSurfaceData } from "@/templates/packs/core/surfaces/dashboard.orders";
import type { SurfaceProps } from "@/templates/sdk/types";

import { DataTable, EmptyState, LinkButton, Td, Th } from "../parts";
import { DashboardPageHeader, StatusBadge, TableSkeleton, dateOrDash } from "../parts/extra-dashboard";

const SOURCE_LABELS: Record<string, string> = {
  storefront_order: "Storefront",
  form_order: "Form order",
  subscription_signup: "Subscription",
  subscription_invoice: "Invoice",
};

function formatSource(sourceType?: string) {
  return sourceType ? (SOURCE_LABELS[sourceType] ?? sourceType.replace(/_/g, " ")) : "Order";
}

export default function DepotDashboardOrders({ data }: SurfaceProps<DashboardOrdersSurfaceData>) {
  const { orders, hrefs } = data;

  return (
    <div data-slot="dashboard-orders" data-pack="depot" className="flex flex-col gap-4">
      <DashboardPageHeader
        eyebrow="Shop"
        title="Orders"
        description="Review your recent orders and open the order detail page for status and line items."
        meta={orders ? `${orders.length} ${orders.length === 1 ? "order" : "orders"}` : undefined}
      />

      {orders === undefined ? (
        <TableSkeleton rows={4} />
      ) : orders.length === 0 ? (
        <EmptyState title="No orders found." description="Orders you place show up here with their status and line items." action={<LinkButton to="/products">Browse products</LinkButton>} />
      ) : (
        <DataTable caption="Your orders">
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Source</Th>
              <Th>Status</Th>
              <Th className="text-right">Total</Th>
              <Th className="text-right">Created</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order._id} className="border-t border-border transition-colors hover:bg-muted/40">
                <Td className="whitespace-nowrap">
                  <Link to={hrefs.order(order._id)} className="font-semibold tabular-nums text-foreground hover:text-primary">
                    {order.orderNumber || order._id}
                  </Link>
                </Td>
                <Td className="text-muted-foreground">
                  {formatSource(order.sourceType)}
                  {order.sourceLabel ? <span className="block text-xs">{order.sourceLabel}</span> : null}
                </Td>
                <Td>
                  <StatusBadge status={order.status} />
                </Td>
                <Td align="right" className="whitespace-nowrap font-semibold text-foreground">
                  {formatMoney(order.totalAmount, order.currencyCode || "USD")}
                </Td>
                <Td align="right" className="whitespace-nowrap text-muted-foreground">
                  {dateOrDash(order.createdAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
