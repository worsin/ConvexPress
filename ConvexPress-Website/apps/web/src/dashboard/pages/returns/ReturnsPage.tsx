/**
 * Returns list loader: returns gate + the paginated getMyReturns query,
 * handed to the `dashboard.returns` surface.
 */
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useDashboardPath } from "@/hooks/useDashboardConfig";
import CoreDashboardReturns, { type DashboardReturnsSurfaceData } from "@/templates/packs/core/surfaces/dashboard.returns";
import { Surface } from "@/templates/sdk/Surface";

export function DashboardReturnsPage() {
  const { to } = useDashboardPath();
  const settings = useQuery(api.settings.queries.getPublic) as any;
  const returnsEnabled =
    settings !== undefined &&
    settings?.plugins?.commerceReturnsEnabled === true;
  const result = usePaginatedQuery(
    (api as any).commerceReturns.queries.getMyReturns,
    returnsEnabled ? {} : "skip",
    { initialNumItems: 10 },
  ) as any;

  const data: DashboardReturnsSurfaceData = {
    returns: result.results ?? [],
    status: result.status,
    hrefs: { returnDetail: (returnId: string) => to(`/returns/${encodeURIComponent(returnId)}`) },
    actions: { loadMore: () => result.loadMore(10) },
  };

  return (
    <PublicPluginGate pluginId="commerceReturns">
      <Surface name="dashboard.returns" data={data} fallback={CoreDashboardReturns} />
    </PublicPluginGate>
  );
}
