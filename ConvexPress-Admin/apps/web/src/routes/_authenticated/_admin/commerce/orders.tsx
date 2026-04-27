import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";

export const Route = createFileRoute("/_authenticated/_admin/commerce/orders")({
  component: CommerceOrdersPage,
});

function CommerceOrdersPage() {
  const orders = useQuery((api as any).commerce.orders.list, {}) as
    | Array<{
        _id: string;
        orderNumber?: string;
        status: string;
        totalAmount?: number;
        currencyCode?: string;
        email?: string;
        createdAt: number;
        items?: Array<{ quantity?: number }>;
      }>
    | undefined;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Canonical order list backed by the new commerce order tables. Detail
          pages, fulfillment actions, and refund operations will layer on top of
          this surface.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid grid-cols-[160px_120px_140px_1fr_160px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <div>Order</div>
          <div>Status</div>
          <div>Total</div>
          <div>Customer</div>
          <div>Created</div>
        </div>

        {orders === undefined ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-16 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No orders exist yet.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {orders.map((order) => (
              <Link
                key={order._id}
                to="/commerce/orders/$orderId"
                params={{ orderId: order._id }}
                className="grid grid-cols-[160px_120px_140px_1fr_160px] gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">
                    {order.orderNumber || order._id}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {(order.items ?? []).reduce(
                      (sum, item) => sum + (item.quantity ?? 0),
                      0,
                    )}{" "}
                    items
                  </div>
                </div>
                <div className="text-sm text-foreground">{order.status}</div>
                <div className="text-sm text-foreground">
                  {typeof order.totalAmount === "number"
                    ? new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: order.currencyCode || "USD",
                      }).format(order.totalAmount / 100)
                    : "—"}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {order.email || "Guest checkout"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {new Date(order.createdAt).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
