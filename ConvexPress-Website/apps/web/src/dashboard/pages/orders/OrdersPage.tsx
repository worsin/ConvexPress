/**
 * Orders list loader: commerce gate + purchases.queries.listMine, handed to
 * the `dashboard.orders` surface.
 */
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useDashboardPath } from "@/hooks/useDashboardConfig";
import CoreDashboardOrders, {
  type DashboardOrderRow,
  type DashboardOrdersSurfaceData,
} from "@/templates/packs/core/surfaces/dashboard.orders";
import { Surface } from "@/templates/sdk/Surface";

export function DashboardOrdersPage() {
  const { to } = useDashboardPath();
  const orders = useQuery((api as any).purchases.queries.listMine, {}) as DashboardOrderRow[] | undefined;

  const data: DashboardOrdersSurfaceData = useMemo(
    () => ({
      orders,
      hrefs: { order: (orderId: string) => to(`/orders/${encodeURIComponent(orderId)}`) },
    }),
    [orders, to],
  );

  return (
    <PublicPluginGate pluginId="commerce">
      <Surface name="dashboard.orders" data={data} fallback={CoreDashboardOrders} />
    </PublicPluginGate>
  );
}
