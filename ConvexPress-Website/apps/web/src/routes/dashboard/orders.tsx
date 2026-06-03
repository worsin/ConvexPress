import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";

export const Route = createFileRoute("/dashboard/orders")({
  component: DashboardOrdersPage,
});

function DashboardOrdersPage() {
  const orders = useQuery((api as any).purchases.queries.listMine, {}) as
    | Array<{
        _id: string;
        orderNumber?: string;
        sourceType?: string;
        sourceLabel?: string;
        status: string;
        totalAmount: number;
        currencyCode?: string;
        createdAt: number;
      }>
    | undefined;

  return (
    <PublicPluginGate pluginId="commerce">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Review your recent orders and open the order detail page for status
            and line items.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="grid grid-cols-[160px_160px_120px_140px_160px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <div>Order</div>
            <div>Source</div>
            <div>Status</div>
            <div>Total</div>
            <div>Created</div>
          </div>

          {orders === undefined ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No orders found.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {orders.map((order) => (
                <Link
                  key={order._id}
                  to="/dashboard/orders/$orderId"
                  params={{ orderId: order._id }}
                  className="grid grid-cols-[160px_160px_120px_140px_160px] gap-4 px-5 py-4 transition-colors hover:bg-muted/30"
                >
                  <div className="font-medium text-foreground">
                    {order.orderNumber || order._id}
                  </div>
                  <div className="text-muted-foreground">
                    {formatSource(order.sourceType)}
                    {order.sourceLabel ? (
                      <span className="block text-xs">{order.sourceLabel}</span>
                    ) : null}
                  </div>
                  <div className="text-muted-foreground">{order.status}</div>
                  <div className="text-foreground">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: order.currencyCode || "USD",
                    }).format(order.totalAmount / 100)}
                  </div>
                  <div className="text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </PublicPluginGate>
  );
}

function formatSource(sourceType?: string) {
  const labels: Record<string, string> = {
    storefront_order: "Storefront",
    form_order: "Form order",
    subscription_signup: "Subscription",
    subscription_invoice: "Invoice",
  };
  return sourceType ? (labels[sourceType] ?? sourceType.replace(/_/g, " ")) : "Order";
}
