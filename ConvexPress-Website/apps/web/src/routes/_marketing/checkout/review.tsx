import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { Stripe as StripeType } from "@stripe/stripe-js";

import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import {
  CheckoutProgress,
  CheckoutStatusNotice,
} from "@/components/commerce/CheckoutProgress";
import { getCartLineTitle } from "@/components/commerce/cartLine";

export const Route = createFileRoute("/_marketing/checkout/review")({
  component: CheckoutReviewPage,
});

// ─── Stripe Payment Form (rendered inside Elements provider) ────────────────

function StripePaymentForm({
  orderId,
  onSuccess,
  onError,
}: {
  orderId: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [confirming, setConfirming] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setConfirming(true);
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout/confirmation/${orderId}`,
        },
        redirect: "if_required",
      });

      if (error) {
        onError(error.message || "Payment failed");
      } else {
        onSuccess();
      }
    } catch (err: any) {
      onError(err.message || "Payment failed");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || !elements || confirming}
        className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {confirming ? "Processing payment..." : "Pay now"}
      </button>
    </form>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

function CheckoutReviewPage() {
  const settings = useSettings();
  const currencyCode = settings?.commerceConfig?.currencyCode || "USD";
  const router = useRouter();
  const { sessionToken, isReady } = useCommerceSessionToken();
  const cart = useQuery(
    (api as any).commerce.cart.getMine,
    isReady && sessionToken ? { sessionToken } : "skip",
  ) as any;
  const session = useQuery(
    (api as any).commerce.checkout.getSession,
    isReady && sessionToken ? { sessionToken } : "skip",
  ) as any;
  const completeCheckout = useMutation(
    (api as any).commerce.checkout.complete,
  );
  const initiatePayment = useMutation(
    (api as any).commerce.payments.initiatePayment,
  );

  // Payment state
  const [paymentStep, setPaymentStep] = useState<
    "review" | "processing" | "stripe"
  >("review");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<StripeType | null> | null>(null);
  const stripeInitialized = useRef(false);

  // Poll transaction status to get clientSecret
  const transactionStatus = useQuery(
    (api as any).commerce.payments.getTransactionStatus,
    transactionId ? { transactionId: transactionId as any } : "skip",
  ) as any;

  const clientSecret = transactionStatus?.clientSecret ?? null;

  // Load Stripe when payment settings are available
  const paymentSettings = useQuery(
    (api as any).commerce.payments.getSettings,
  ) as any;

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
      (method: any) => method.code === session?.selectedShippingMethodCode,
    )?.label ??
    session?.selectedShippingMethodCode ??
    "Not required";
  const paymentLabel =
    session?.selectedPaymentMethodLabel ??
    settings?.commerceConfig?.paymentMethods?.find(
      (method: any) => method.code === session?.selectedPaymentMethodCode,
    )?.label ??
    session?.selectedPaymentMethodCode ??
    "---";

  const isCardPayment = session?.selectedPaymentMethodCode === "card";
  const stripeAvailable = Boolean(paymentSettings?.stripePublishableKey);

  const handlePlaceOrder = useCallback(async () => {
    if (!sessionToken) return;
    if (isCardPayment && !stripeAvailable) {
      toast.error("Card payments are not currently available.");
      return;
    }
    try {
      setPaymentStep("processing");
      const newOrderId = await completeCheckout({ sessionToken });
      setOrderId(newOrderId);

      if (isCardPayment) {
        // Initiate Stripe payment
        const result = await initiatePayment({
          orderId: newOrderId as any,
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
    stripeAvailable,
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

  const formatCurrency = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode,
      }),
    [currencyCode],
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 py-12">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">
          {paymentStep === "stripe" ? "Complete Payment" : "Review Order"}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {paymentStep === "stripe"
            ? "Enter your payment details to complete the order."
            : "Review checkout details and submit the order."}
        </p>
      </div>
      <CheckoutProgress currentStep="review" />

      {!isReady || cart === undefined || session === undefined ? (
        <div className="h-48 animate-pulse rounded-[2rem] bg-muted" />
      ) : !cart || !session ? (
        <div className="rounded-[2rem] border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Checkout data is incomplete.
        </div>
      ) : ["failed", "abandoned"].includes(session.status) ? (
        <CheckoutStatusNotice
          status={session.status}
          failureReason={session.failureReason}
        />
      ) : paymentStep === "stripe" && clientSecret && stripePromise ? (
        // ─── Stripe Payment Step ──────────────────────────────────────
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Payment details</h2>
            <div className="mt-6">
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: "stripe",
                    variables: {
                      borderRadius: "12px",
                    },
                  },
                }}
              >
                <StripePaymentForm
                  orderId={orderId!}
                  onSuccess={handleStripeSuccess}
                  onError={handleStripeError}
                />
              </Elements>
            </div>
          </section>

          <aside className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Order summary</h2>
            <dl className="mt-6 space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-medium text-foreground">
                  {formatCurrency.format(
                    (session.subtotalAmount ?? cart.subtotalAmount) / 100,
                  )}
                </dd>
              </div>
              {(session.discountAmount ?? 0) > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">
                    Discount
                    {session.appliedDiscountCode
                      ? ` (${session.appliedDiscountCode})`
                      : ""}
                  </dt>
                  <dd className="font-medium text-foreground">
                    -{formatCurrency.format(session.discountAmount / 100)}
                  </dd>
                </div>
              )}
              {(session.shippingAmount ?? 0) > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Shipping</dt>
                  <dd className="font-medium text-foreground">
                    {formatCurrency.format(session.shippingAmount / 100)}
                  </dd>
                </div>
              )}
              {(session.taxAmount ?? 0) > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Tax</dt>
                  <dd className="font-medium text-foreground">
                    {formatCurrency.format(session.taxAmount / 100)}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border pt-4">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="text-lg font-semibold text-foreground">
                  {formatCurrency.format(
                    (session.totalAmount ?? cart.totalAmount) / 100,
                  )}
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      ) : paymentStep === "processing" ? (
        // ─── Processing Step ──────────────────────────────────────────
        <div className="flex flex-col items-center justify-center rounded-[2rem] border border-border bg-card p-12 shadow-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-sm text-muted-foreground">
            Setting up your payment...
          </p>
        </div>
      ) : (
        // ─── Review Step (default) ────────────────────────────────────
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Order items</h2>
            <div className="mt-6 space-y-4">
              {(cart.items ?? []).map((item: any) => (
                <div
                  key={item._id}
                  className="flex items-center justify-between gap-4 border-b border-border pb-4"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {getCartLineTitle(item.product, item.metadata)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Quantity {item.quantity}
                    </p>
                  </div>
                  <p className="font-medium text-foreground">
                    {formatCurrency.format(item.lineTotalAmount / 100)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <aside className="rounded-[2rem] border border-border bg-card p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Checkout summary</h2>
            <dl className="mt-6 space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium text-foreground">
                  {session.email || "---"}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Shipping</dt>
                <dd className="font-medium text-foreground">
                  {shippingLabel}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Payment</dt>
                <dd className="font-medium text-foreground">
                  {paymentLabel}
                </dd>
              </div>
              {session.discountAmount > 0 ? (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">
                    Discount
                    {session.appliedDiscountCode
                      ? ` (${session.appliedDiscountCode})`
                      : ""}
                  </dt>
                  <dd className="font-medium text-foreground">
                    -{formatCurrency.format(session.discountAmount / 100)}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="text-lg font-semibold text-foreground">
                  {formatCurrency.format(
                    (session.totalAmount ?? cart.totalAmount) / 100,
                  )}
                </dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={() => void handlePlaceOrder()}
              disabled={paymentStep !== "review" || (isCardPayment && !stripeAvailable)}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {isCardPayment ? "Place order & pay" : "Place order"}
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
