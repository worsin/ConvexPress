import { useQuery } from "convex/react";
import { createFileRoute } from "@tanstack/react-router";
import { api } from "@convexpress-website/backend/generated/api";

import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import CoreCheckoutConfirmation, {
  type CheckoutConfirmationSurfaceData,
} from "@/templates/packs/core/surfaces/checkout.confirmation";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute(
  "/_marketing/checkout/confirmation_/$orderId",
)({
  loader: () => ({ title: "Order confirmation" }),
  component: CheckoutConfirmationPage,
});

function CheckoutConfirmationPage() {
  const settings = useSettings();
  const { sessionToken, isReady } = useCommerceSessionToken();
  const { orderId } = Route.useParams();
  const order = useQuery(
    (api as any).commerce.orders.getByCheckoutSession,
    isReady && sessionToken
      ? {
          orderId: orderId as any,
          sessionToken,
        }
      : "skip",
  ) as any;

  if (order === null) {
    return <NotFoundPage />;
  }

  const surfaceData: CheckoutConfirmationSurfaceData = {
    orderId,
    order,
    currencyCode:
      settings?.commerceConfig?.currencyCode ||
      order?.currencyCode ||
      "USD",
  };

  return <Surface name="checkout.confirmation" data={surfaceData} fallback={CoreCheckoutConfirmation} />;
}
