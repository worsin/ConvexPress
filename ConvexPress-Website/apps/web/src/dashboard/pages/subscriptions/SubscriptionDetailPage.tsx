/**
 * Subscription detail loader: subscriptions gate, the customer portal's
 * `getMyContract` (summary, invoices, plain-words timeline) and its lifecycle
 * mutations with their toasts, handed to the `dashboard.subscription` surface.
 * The customer portal (not the admin API) serves this page, so the customer
 * sees only customer-safe fields and only the actions the server allows.
 *
 * The loading and not-found states render outside the plugin gate, exactly as
 * before, so the gate's NotFound only applies once a subscription resolves.
 */
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useSettings } from "@/contexts/SettingsContext";
import { useDashboardPath } from "@/hooks/useDashboardConfig";
import CoreDashboardSubscription, {
  type DashboardSubscriptionAction,
  type DashboardSubscriptionSurfaceData,
} from "@/templates/packs/core/surfaces/dashboard.subscription";
import { Surface } from "@/templates/sdk/Surface";
import { idFromString } from "@/lib/ids";
import { getErrorMessage } from "@/lib/utils";

const SUCCESS: Record<DashboardSubscriptionAction, string> = {
  pause: "Subscription paused",
  resume: "Subscription resumed",
  keep: "Your subscription will continue",
  schedule_cancel: "Cancellation scheduled for the end of the billing period",
  cancel_now: "Subscription cancelled",
};

export function DashboardSubscriptionDetailPage({ subscriptionId }: { subscriptionId: string }) {
  const settings = useSettings();
  const { to } = useDashboardPath();
  const subscriptionsEnabled = settings?.plugins?.commerceSubscriptionsEnabled === true;
  const contractId = idFromString<"commerce_subscriptions">(subscriptionId);

  const subscription = useQuery(
    api.commerceSubscriptions.portal.getMyContract,
    subscriptionsEnabled ? { contractId } : "skip",
  );

  const pauseMutation = useMutation(api.commerceSubscriptions.portal.requestPauseContract);
  const resumeMutation = useMutation(api.commerceSubscriptions.portal.requestResumeContract);
  const keepMutation = useMutation(api.commerceSubscriptions.portal.requestKeepContract);
  const cancelMutation = useMutation(api.commerceSubscriptions.portal.requestCancelContract);

  const [busy, setBusy] = useState(false);

  async function run(action: DashboardSubscriptionAction): Promise<boolean> {
    setBusy(true);
    try {
      if (action === "pause") await pauseMutation({ contractId });
      else if (action === "resume") await resumeMutation({ contractId });
      else if (action === "keep") await keepMutation({ contractId });
      else if (action === "schedule_cancel") await cancelMutation({ contractId });
      else await cancelMutation({ contractId, immediate: true });
      toast.success(SUCCESS[action]);
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error, "Something went wrong"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const data: DashboardSubscriptionSurfaceData = {
    subscriptionId,
    subscription,
    busy,
    hrefs: { subscriptions: to("/subscriptions") },
    actions: { run },
  };

  const surface = <Surface name="dashboard.subscription" data={data} fallback={CoreDashboardSubscription} />;

  if (subscription === undefined || subscription === null) {
    return surface;
  }

  return <PublicPluginGate pluginId="commerceSubscriptions">{surface}</PublicPluginGate>;
}
