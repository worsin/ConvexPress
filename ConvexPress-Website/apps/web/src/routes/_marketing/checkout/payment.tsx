import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";

import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import CoreCheckoutPayment, {
  type CheckoutPaymentMethodOption,
  type CheckoutPaymentSurfaceData,
} from "@/templates/packs/core/surfaces/checkout.payment";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/checkout/payment")({
  component: CheckoutPaymentPage,
});

const IMPLEMENTED_CHECKOUT_PAYMENT_METHODS = new Set([
  "card",
  "manual_invoice",
  "cash_on_delivery",
]);

function CheckoutPaymentPage() {
  const settings = useSettings();
  const router = useRouter();
  const { sessionToken, isReady } = useCommerceSessionToken();
  const session = useQuery(
    (api as any).commerce.checkout.getSession,
    isReady && sessionToken ? { sessionToken } : "skip",
  ) as any;
  const updateSession = useMutation(
    (api as any).commerce.checkout.updateSession,
  );

  // Get payment settings for Stripe publishable key availability
  const paymentSettings = useQuery(
    (api as any).commerce.payments.getSettings,
  ) as any;

  const stripeAvailable = Boolean(paymentSettings?.stripePublishableKey);
  const paymentMethods = useMemo<CheckoutPaymentMethodOption[]>(() => {
    const configured =
      settings?.commerceConfig?.paymentMethods?.filter(
        (method: any) => method.enabled,
      ) ?? [
        { code: "manual_invoice", label: "Manual invoice", enabled: true },
    ];

    return configured.map((method: any) => {
      if (!IMPLEMENTED_CHECKOUT_PAYMENT_METHODS.has(method.code)) {
        return {
          ...method,
          unavailableReason:
            "This payment method is not available in checkout yet.",
        };
      }
      if (method.code === "card" && !stripeAvailable) {
        return {
          ...method,
          unavailableReason: "Card payments are currently unavailable.",
        };
      }
      return method;
    });
  }, [settings?.commerceConfig?.paymentMethods, stripeAvailable]);
  const availablePaymentMethods = useMemo(
    () => paymentMethods.filter((method) => !method.unavailableReason),
    [paymentMethods],
  );
  const [paymentMethod, setPaymentMethod] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const savedMethod = paymentMethods.find(
      (method) =>
        method.code === session?.selectedPaymentMethodCode &&
        !method.unavailableReason,
    );
    setPaymentMethod(savedMethod?.code ?? availablePaymentMethods[0]?.code ?? "");
  }, [availablePaymentMethods, paymentMethods, session?.selectedPaymentMethodCode]);

  async function handleContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionToken) return;

    // Warn if card is selected but Stripe is not configured
    if (paymentMethod === "card" && !stripeAvailable) {
      toast.error(
        "Card payments are not currently available. Please select a different payment method or try again later.",
      );
      return;
    }
    const selectedMethod = paymentMethods.find(
      (method) => method.code === paymentMethod,
    );
    if (!selectedMethod) {
      toast.error("Select a payment method before continuing.");
      return;
    }
    if (selectedMethod?.unavailableReason) {
      toast.error(selectedMethod.unavailableReason);
      return;
    }

    setIsSubmitting(true);
    try {
      await updateSession({
        sessionToken,
        selectedPaymentMethodCode: paymentMethod,
      });
      router.navigate({ to: "/checkout/review" });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to save payment method",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const surfaceData: CheckoutPaymentSurfaceData = {
    isReady,
    session,
    paymentMethods,
    availablePaymentMethods,
    paymentMethod,
    isSubmitting,
    onSelectMethod: setPaymentMethod,
    onSubmit: handleContinue,
  };

  return <Surface name="checkout.payment" data={surfaceData} fallback={CoreCheckoutPayment} />;
}
