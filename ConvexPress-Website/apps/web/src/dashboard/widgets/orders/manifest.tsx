/**
 * Recent orders (purchases.queries.listMine) with status and totals; `limit`
 * is a widget setting.
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import type { DashboardWidgetModule, DashboardWidgetProps } from "../../contracts";
import { WidgetEmpty, WidgetSkeleton } from "../../grid/WidgetCard";
import { useDashboardShell } from "../../shell/DashboardShellContext";
import { Pill, ViewAllLink, formatMoney, formatShortDate, rowsForSize, statusTone } from "../_shared";

interface PurchaseRow {
  _id: string;
  orderNumber?: string;
  status: string;
  totalAmount: number;
  currencyCode?: string;
  createdAt: number;
}

function OrdersWidget({ settings, size }: DashboardWidgetProps) {
  const { to } = useDashboardShell();
  const orders = useQuery(api.purchases.queries.listMine, {}) as PurchaseRow[] | undefined;
  if (orders === undefined) return <WidgetSkeleton rows={4} />;
  if (orders.length === 0) {
    return (
      <WidgetEmpty
        icon="shopping-bag"
        title="No orders yet"
        description="Your purchases and their status will show up here."
        action={
          <Link to="/products" className="font-medium text-primary hover:underline">
            Browse the shop
          </Link>
        }
      />
    );
  }
  const limit = Math.max(2, Math.min(10, Number(settings.limit) || 4));
  const rows = orders.slice(0, Math.min(limit, rowsForSize(size, limit)));
  return (
    <ul role="list" className="divide-y divide-border">
      {rows.map((order) => (
        <li key={order._id}>
          <Link
            to={to(`/orders/${order._id}`)}
            className="flex items-center gap-3 py-2 text-xs transition-colors hover:bg-muted/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-foreground">{order.orderNumber || order._id}</span>
              <span className="block text-[10px] text-muted-foreground">{formatShortDate(order.createdAt)}</span>
            </span>
            {size !== "md" && <Pill tone={statusTone(order.status)}>{order.status.replace(/_/g, " ")}</Pill>}
            <span className="shrink-0 tabular-nums text-foreground">{formatMoney(order.totalAmount, order.currencyCode)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Actions() {
  const { to } = useDashboardShell();
  return <ViewAllLink to={to("/orders")} />;
}

const module: DashboardWidgetModule = {
  id: "orders",
  Widget: OrdersWidget,
  Actions,
};

export default module;
