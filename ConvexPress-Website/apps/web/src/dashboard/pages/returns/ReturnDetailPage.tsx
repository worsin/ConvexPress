/**
 * Return detail loader: returns gate + commerceReturns.queries.getMineById,
 * handed to the `dashboard.return` surface.
 */
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useDashboardPath } from "@/hooks/useDashboardConfig";
import CoreDashboardReturn, { type DashboardReturnSurfaceData } from "@/templates/packs/core/surfaces/dashboard.return";
import { Surface } from "@/templates/sdk/Surface";

export function DashboardReturnDetailPage({ returnId }: { returnId: string }) {
  const { to } = useDashboardPath();
  const settings = useQuery(api.settings.queries.getPublic) as any;
  const returnsEnabled =
    settings !== undefined &&
    settings?.plugins?.commerceReturnsEnabled === true;
  const ret = useQuery(
    (api as any).commerceReturns.queries.getMineById,
    returnsEnabled ? { returnId: returnId as any } : "skip",
  ) as any;

  const data: DashboardReturnSurfaceData = {
    returnId,
    ret,
    hrefs: { returns: to("/returns") },
  };

  return (
    <PublicPluginGate pluginId="commerceReturns">
      <Surface name="dashboard.return" data={data} fallback={CoreDashboardReturn} />
    </PublicPluginGate>
  );
}
