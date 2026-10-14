/**
 * Return request loader: returns gate, order eligibility, the requestReturn
 * mutation with its validation and toasts, handed to the
 * `dashboard.orderReturn` surface.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convexpress-website/backend/generated/api";

import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { useDashboardPath } from "@/hooks/useDashboardConfig";
import CoreDashboardOrderReturn, {
  type DashboardOrderReturnSurfaceData,
  type DashboardReturnRequestInput,
} from "@/templates/packs/core/surfaces/dashboard.orderReturn";
import { Surface } from "@/templates/sdk/Surface";
import { idFromString } from "@/lib/ids";

export function OrderReturnPage({ orderId }: { orderId: string }) {
  const navigate = useNavigate();
  const { to } = useDashboardPath();
  const settings = useQuery(api.settings.queries.getPublic);
  const returnsEnabled =
    settings !== undefined &&
    settings?.plugins?.commerceReturnsEnabled === true;

  const eligibility = useQuery(
    api.commerceReturns.queries.getMyOrderEligibility,
    returnsEnabled ? { orderId: idFromString<"commerce_orders">(orderId) } : "skip",
  );

  const requestReturn = useMutation(
    api.commerceReturns.mutations.requestReturn,
  );

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ returnNumber: string } | null>(null);

  async function submit(input: DashboardReturnRequestInput) {
    if (input.items.length === 0) {
      toast.error("Please select at least one item to return");
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestReturn({
        orderId: idFromString<"commerce_orders">(orderId),
        reason: input.reason,
        ...(input.reasonDetails ? { reasonDetails: input.reasonDetails } : {}),
        items: input.items.map((item) => ({
          orderItemId: idFromString<"commerce_order_items">(item.orderItemId),
          quantity: item.quantity,
          ...(item.reason ? { reason: item.reason } : {}),
        })),
      });
      setSubmitted({ returnNumber: result.returnNumber });
      toast.success("Return request submitted");
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to submit return request",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const data: DashboardOrderReturnSurfaceData = {
    orderId,
    eligibility,
    submitting,
    submitted,
    hrefs: { returns: to("/returns") },
    actions: {
      submit,
      backToDashboard: () => navigate({ to: to("") }),
    },
  };

  return (
    <PublicPluginGate pluginId="commerceReturns">
      <Surface name="dashboard.orderReturn" data={data} fallback={CoreDashboardOrderReturn} />
    </PublicPluginGate>
  );
}
