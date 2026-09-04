/**
 * Subscription detail loader: subscriptions gate, the getById query and the
 * pause / resume / scheduleCancel mutations with their toasts, handed to the
 * `dashboard.subscription` surface.
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

export function DashboardSubscriptionDetailPage({ subscriptionId }: { subscriptionId: string }) {
  const settings = useSettings();
  const { to } = useDashboardPath();
  const subscriptionsEnabled =
    settings?.plugins?.commerceSubscriptionsEnabled === true;

  const subscription = useQuery(
    (api as any).commerceSubscriptions.queries.getById,
    subscriptionsEnabled ? { subscriptionId: subscriptionId as any } : "skip",
  ) as any;

  const pauseMutation = useMutation(
    (api as any).commerceSubscriptions.mutations.pause,
  );
  const resumeMutation = useMutation(
    (api as any).commerceSubscriptions.mutations.resume,
  );
  const scheduleCancelMutation = useMutation(
    (api as any).commerceSubscriptions.mutations.scheduleCancel,
  );

  const [busy, setBusy] = useState(false);

  async function run(action: DashboardSubscriptionAction): Promise<boolean> {
    setBusy(true);
    try {
      const id = subscriptionId as any;
      if (action === "pause") {
        await pauseMutation({ subscriptionId: id });
        toast.success("Subscription paused");
      } else if (action === "resume") {
        await resumeMutation({ subscriptionId: id });
        toast.success("Subscription resumed");
      } else if (action === "schedule_cancel") {
        await scheduleCancelMutation({ subscriptionId: id });
        toast.success("Cancellation scheduled for end of billing period");
      }
      return true;
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Something went wrong",
      );
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
