/**
 * Subscriptions overview loader (Wave 5 Task 5.2): subscriptions gate, the
 * enriched `portal.getMyActiveContracts` payload and `listOffersForPricing`
 * (fetched once at page level), handed to the `dashboard.subscriptions`
 * surface. Pause / resume / cancel live inside `<CustomerPortalCard />`.
 */
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useSettings } from "@/contexts/SettingsContext";
import CoreDashboardSubscriptions, {
  type DashboardSubscriptionContract,
  type DashboardSubscriptionOffer,
  type DashboardSubscriptionsSurfaceData,
} from "@/templates/packs/core/surfaces/dashboard.subscriptions";
import { Surface } from "@/templates/sdk/Surface";

export function DashboardSubscriptionsPage() {
  const settings = useSettings();
  const subscriptionsEnabled =
    settings?.plugins?.commerceSubscriptionsEnabled === true;

  const contracts = useQuery(
    (api as any).commerceSubscriptions.portal.getMyActiveContracts,
    subscriptionsEnabled ? {} : "skip",
  ) as DashboardSubscriptionContract[] | undefined;

  const offers = useQuery(
    (api as any).commerceSubscriptions.offers.listOffersForPricing,
    subscriptionsEnabled ? {} : "skip",
  ) as DashboardSubscriptionOffer[] | undefined;

  const data: DashboardSubscriptionsSurfaceData = { contracts, offers };

  return (
    <PublicPluginGate pluginId="commerceSubscriptions">
      <Surface name="dashboard.subscriptions" data={data} fallback={CoreDashboardSubscriptions} />
    </PublicPluginGate>
  );
}
