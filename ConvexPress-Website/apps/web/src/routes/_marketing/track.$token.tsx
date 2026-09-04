import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useSettings } from "@/contexts/SettingsContext";
import { requirePublicPluginEnabled } from "@/lib/plugins/public-route-loader";
import CoreOrderTrack, { type OrderTrackSurfaceData } from "@/templates/packs/core/surfaces/order.track";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/track/$token")({
  loader: async ({ context: { queryClient } }) => {
    await requirePublicPluginEnabled(queryClient, "commerce");
  },
  component: TrackOrderPage,
});

function TrackOrderPage() {
  const { token } = Route.useParams();
  const settings = useSettings();
  const commerceEnabled = settings?.plugins?.commerceEnabled === true;
  const order = useQuery(
    (api as any).commerce.orders.getByTrackingToken,
    commerceEnabled ? { trackingToken: token } : "skip",
  ) as any;
  // PRD D2 §2.1 — pull per-shipment tracking timeline so the page shows
  // actual carrier scan history, not just order status.
  const trackingTimeline = useQuery(
    (api as any).shipping.tracking.queries.publicTracking,
    commerceEnabled ? { trackingToken: token } : "skip",
  ) as any;

  const surfaceData: OrderTrackSurfaceData = { order, trackingTimeline };

  return (
    <PublicPluginGate pluginId="commerce">
      <Surface name="order.track" data={surfaceData} fallback={CoreOrderTrack} />
    </PublicPluginGate>
  );
}
