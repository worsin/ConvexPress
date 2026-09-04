/**
 * Journal · dashboard.orders — order history as rule-separated rows: the
 * order number, a small-caps source · date line, the status pill and the
 * total in display type. Each row links to the order detail, as in Core.
 */
import { Link } from "@tanstack/react-router";

import { formatMoney } from "@/lib/commerce/format";
import type { DashboardOrdersSurfaceData } from "@/templates/packs/core/surfaces/dashboard.orders";
import type { SurfaceProps } from "@/templates/sdk/types";

import { EmptyState, LinkButton, SmallCaps } from "../parts";
import { PageHeading, RowSkeleton, StatusPill, dashDate } from "../parts/extra-dashboard";

const SOURCE_LABELS: Record<string, string> = {
  storefront_order: "Storefront",
  form_order: "Form order",
  subscription_signup: "Subscription",
  subscription_invoice: "Invoice",
};

function formatSource(sourceType?: string) {
  return sourceType ? (SOURCE_LABELS[sourceType] ?? sourceType.replace(/_/g, " ")) : "Order";
}

export default function JournalDashboardOrders({ data }: SurfaceProps<DashboardOrdersSurfaceData>) {
  const { orders, hrefs } = data;

  return (
    <div data-slot="dashboard-orders" className="flex flex-col gap-10">
      <PageHeading eyebrow="Purchases" title="Orders" lede="Review your recent orders and open the order detail page for status and line items." />

      {orders === undefined ? (
        <RowSkeleton rows={4} />
      ) : orders.length === 0 ? (
        <EmptyState
          eyebrow="Orders"
          title="No orders found."
          action={
            <LinkButton to="/products" variant="ghost">
              Browse the shop
            </LinkButton>
          }
        />
      ) : (
        <ul role="list" aria-label="Your orders" className="flex flex-col divide-y divide-border border-y border-border">
          {orders.map((order) => (
            <li key={order._id}>
              <Link to={hrefs.order(order._id) as any} className="group grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-8">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="truncate text-base font-medium text-foreground transition-colors group-hover:text-primary">{order.orderNumber || order._id}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <SmallCaps>{formatSource(order.sourceType)}</SmallCaps>
                    {order.sourceLabel ? (
                      <>
                        <Dot />
                        <SmallCaps className="normal-case tracking-normal">{order.sourceLabel}</SmallCaps>
                      </>
                    ) : null}
                    <Dot />
                    <SmallCaps as="time" className="tabular-nums" {...({ dateTime: new Date(order.createdAt).toISOString() } as object)}>
                      {dashDate(order.createdAt)}
                    </SmallCaps>
                  </p>
                </div>
                <StatusPill status={order.status} className="justify-self-start sm:justify-self-auto" />
                <p className="font-display text-xl tabular-nums text-foreground sm:text-right">{formatMoney(order.totalAmount, order.currencyCode || "USD")}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Dot() {
  return (
    <span className="text-muted-foreground/60" aria-hidden="true">
      ·
    </span>
  );
}
