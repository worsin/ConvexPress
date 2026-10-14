import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import type { Id } from "@convexpress-website/backend/generated/dataModel";
import { toast } from "sonner";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe as StripeType } from "@stripe/stripe-js";

import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import CoreCheckoutReview, {
  type CheckoutReviewStep,
  type CheckoutReviewSurfaceData,
} from "@/templates/packs/core/surfaces/checkout.review";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/checkout/review")({
  component: CheckoutReviewPage,
});

const IMPLEMENTED_CHECKOUT_PAYMENT_METHODS = new Set([
  "card",
  "manual_invoice",
  "cash_on_delivery",
]);

function CheckoutReviewPage() {
  const settings = useSettings();
  const currencyCode = settings?.commerceConfig?.currencyCode || "USD";
  const router = useRouter();
  const { sessionToken, isReady } = useCommerceSessionToken();
  const cart = useQuery(
    api.commerce.cart.getMine,
    isReady && sessionToken ? { sessionToken } : "skip",
  );
  const session = useQuery(
    api.commerce.checkout.getSession,
    isReady && sessionToken ? { sessionToken } : "skip",
  );
  const completeCheckout = useMutation(api.commerce.checkout.complete);
  const initiatePayment = useMutation(api.commerce.payments.initiatePayment);

  // Payment state
  const [paymentStep, setPaymentStep] = useState<CheckoutReviewStep>("review");
  const [orderId, setOrderId] = useState<Id<"commerce_orders"> | null>(null);
  const [transactionId, setTransactionId] =
    useState<Id<"commerce_payment_transactions"> | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<StripeType | null> | null>(null);
  const stripeInitialized = useRef(false);

  // Poll transaction status to get clientSecret. The checkout session token
  // proves this browser placed the order; the server hides the payment from
  // anyone else.
  const transactionStatus = useQuery(
    api.commerce.payments.getTransactionStatus,
    transactionId && sessionToken ? { transactionId, sessionToken } : "skip",
  );

  const clientSecret = transactionStatus?.clientSecret ?? null;

  // Load Stripe when payment settings are available
  const paymentSettings = useQuery(
    api.commerce.payments.getSettings,
  );

  useEffect(() => {
    if (
      paymentSettings?.stripePublishableKey &&
      !stripeInitialized.current
    ) {
      stripeInitialized.current = true;
      setStripePromise(loadStripe(paymentSettings.stripePublishableKey));
    }
  }, [paymentSettings?.stripePublishableKey]);

  // When we have clientSecret, transition to stripe step
  useEffect(() => {
    if (paymentStep === "processing" && clientSecret) {
      setPaymentStep("stripe");
    }
  }, [paymentStep, clientSecret]);

  // Also handle failure during processing
  useEffect(() => {
    if (
      paymentStep === "processing" &&
      transactionStatus?.status === "failed"
    ) {
      toast.error(
        transactionStatus.failureMessage || "Payment initialization failed",
      );
      setPaymentStep("review");
    }
  }, [paymentStep, transactionStatus?.status, transactionStatus?.failureMessage]);

  const shippingLabel =
    session?.selectedShippingMethodLabel ??
    settings?.commerceConfig?.shippingMethods?.find(
      (method) => method.code === session?.selectedShippingMethodCode,
    )?.label ??
    session?.selectedShippingMethodCode ??
    "Not required";
  const paymentLabel =
    session?.selectedPaymentMethodLabel ??
    settings?.commerceConfig?.paymentMethods?.find(
      (method) => method.code === session?.selectedPaymentMethodCode,
    )?.label ??
    session?.selectedPaymentMethodCode ??
    "---";

  const selectedPaymentCode = session?.selectedPaymentMethodCode ?? "";
  const isImplementedPaymentMethod =
    selectedPaymentCode === "" ||
    IMPLEMENTED_CHECKOUT_PAYMENT_METHODS.has(selectedPaymentCode);
  const isCardPayment = selectedPaymentCode === "card";
  const stripeAvailable = Boolean(paymentSettings?.stripePublishableKey);
  const requiresShipping =
    settings?.commerceConfig?.shippingEnabled !== false &&
    (cart?.items ?? []).some((item) => item.product?.isVirtual !== true);
  const checkoutIssues = useMemo(() => {
    if (!session || !cart) return [];

    const issues: string[] = [];
    if (!session.email) issues.push("Add a contact email.");
    if (!session.billingAddress) issues.push("Add a billing address.");
    if (requiresShipping) {
      if (!session.shippingAddress) issues.push("Add a shipping address.");
      if (!session.selectedShippingMethodCode) {
        issues.push("Select a shipping method.");
      }
    }
    if (!session.selectedPaymentMethodCode) {
      issues.push("Select a payment method.");
    }
    if (!isImplementedPaymentMethod) {
      issues.push("Choose an available payment method.");
    }
    if (isCardPayment && !stripeAvailable) {
      issues.push("Choose an available payment method.");
    }
    if (
      issues.length === 0 &&
      session.status &&
      session.status !== "ready_for_review"
    ) {
      issues.push("Complete the checkout steps before placing the order.");
    }
    return issues;
  }, [
    cart,
    isCardPayment,
    isImplementedPaymentMethod,
    requiresShipping,
    session,
    stripeAvailable,
  ]);
  const canPlaceOrder = paymentStep === "review" && checkoutIssues.length === 0;

  const handlePlaceOrder = useCallback(async () => {
    if (!sessionToken) return;
    if (checkoutIssues.length > 0) {
      toast.error(checkoutIssues[0]);
      return;
    }
    if (isCardPayment && !stripeAvailable) {
      toast.error("Card payments are not currently available.");
      return;
    }
    if (!isImplementedPaymentMethod) {
      toast.error("Choose an available payment method before placing the order.");
      return;
    }
    try {
      setPaymentStep("processing");
      const newOrderId = await completeCheckout({ sessionToken });
      setOrderId(newOrderId);

      if (isCardPayment) {
        // Initiate Stripe payment
        const result = await initiatePayment({
          orderId: newOrderId,
          sessionToken,
        });
        setTransactionId(result.transactionId);
        // Now we wait for clientSecret via polling (useQuery)
      } else {
        // Non-card payment (manual invoice, COD, etc.) — go straight to confirmation
        toast.success("Order created");
        router.navigate({
          to: "/checkout/confirmation/$orderId",
          params: { orderId: newOrderId },
        });
      }
    } catch (error: any) {
      toast.error(
        error?.data?.message ?? "Failed to complete checkout",
      );
      setPaymentStep("review");
    }
  }, [
    sessionToken,
    completeCheckout,
    initiatePayment,
    isCardPayment,
    isImplementedPaymentMethod,
    stripeAvailable,
    checkoutIssues,
    router,
  ]);

  function handleStripeSuccess() {
    toast.success("Payment successful");
    if (orderId) {
      router.navigate({
        to: "/checkout/confirmation/$orderId",
        params: { orderId },
      });
    }
  }

  function handleStripeError(message: string) {
    toast.error(message);
    // Keep on stripe step so user can retry
  }

  const surfaceData: CheckoutReviewSurfaceData = {
    isReady,
    cart,
    session,
    paymentStep,
    clientSecret,
    stripePromise,
    orderId,
    currencyCode,
    shippingLabel,
    paymentLabel,
    checkoutIssues,
    canPlaceOrder,
    isCardPayment,
    onPlaceOrder: handlePlaceOrder,
    onStripeSuccess: handleStripeSuccess,
    onStripeError: handleStripeError,
  };

  return <Surface name="checkout.review" data={surfaceData} fallback={CoreCheckoutReview} />;
}
