/**
 * Order detail loader: commerce gate, the purchase ledger row, the storefront
 * order, return eligibility and existing returns, handed to the
 * `dashboard.order` surface.
 */
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useDashboardPath } from "@/hooks/useDashboardConfig";
import CoreDashboardOrder, { type DashboardOrderSurfaceData } from "@/templates/packs/core/surfaces/dashboard.order";
import { Surface } from "@/templates/sdk/Surface";

export function DashboardOrderDetailPage({ orderId }: { orderId: string }) {
  const { to } = useDashboardPath();
  const settings = useQuery(api.settings.queries.getPublic) as any;
  const returnsEnabled =
    settings !== undefined &&
    settings?.plugins?.commerceReturnsEnabled === true;
  const purchase = useQuery((api as any).purchases.queries.getMineByAnyId, {
    id: orderId,
  }) as any;
  const storefrontOrderId =
    purchase?.commerceOrderId ??
    (purchase?.sourceType === "storefront_order" ? purchase.sourceId : null) ??
    (purchase === null ? orderId : null);
  const order = useQuery(
    api.commerce.orders.getMineById,
    storefrontOrderId ? { orderId: storefrontOrderId as any } : "skip",
  ) as any;
  const eligibility = useQuery(
    api.commerceReturns.queries.getMyOrderEligibility,
    returnsEnabled && storefrontOrderId
      ? { orderId: storefrontOrderId as any }
      : "skip",
  ) as any;
  const existingReturns = useQuery(
    api.commerceReturns.queries.getMineByOrder,
    returnsEnabled && storefrontOrderId
      ? { orderId: storefrontOrderId as any }
      : "skip",
  ) as any;

  const data: DashboardOrderSurfaceData = {
    orderId,
    purchase,
    order,
    eligibility,
    existingReturns,
    hrefs: {
      orders: to("/orders"),
      requestReturn: to(`/orders/${encodeURIComponent(storefrontOrderId ?? orderId)}/return`),
      returnDetail: (returnId: string) => to(`/returns/${encodeURIComponent(returnId)}`),
    },
  };

  return (
    <PublicPluginGate pluginId="commerce">
      <Surface name="dashboard.order" data={data} fallback={CoreDashboardOrder} />
    </PublicPluginGate>
  );
}
