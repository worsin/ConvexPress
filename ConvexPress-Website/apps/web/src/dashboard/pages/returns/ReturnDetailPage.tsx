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
import { idFromString } from "@/lib/ids";

export function DashboardReturnDetailPage({ returnId }: { returnId: string }) {
  const { to } = useDashboardPath();
  const settings = useQuery(api.settings.queries.getPublic);
  const returnsEnabled =
    settings !== undefined &&
    settings?.plugins?.commerceReturnsEnabled === true;
  const ret = useQuery(
    api.commerceReturns.queries.getMineById,
    returnsEnabled ? { returnId: idFromString<"commerce_return_requests">(returnId) } : "skip",
  );

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
