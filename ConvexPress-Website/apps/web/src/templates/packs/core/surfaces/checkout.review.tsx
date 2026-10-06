/** Core · checkout.review — step 4: review, place order, and (for card) the Stripe payment step. */
import { useMemo, useState } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { Stripe as StripeType } from "@stripe/stripe-js";

import {
  CheckoutProgress,
  CheckoutStatusNotice,
} from "@/components/commerce/CheckoutProgress";
import { getCartLineTitle, getCartLineSubtitle, getCartLineSku } from "@/components/commerce/cartLine";
import type { SurfaceProps } from "@/templates/sdk/types";

export type CheckoutReviewStep = "review" | "processing" | "stripe";

export interface CheckoutReviewSurfaceData {
  /** False until the commerce session token is available (skeleton state). */
  isReady: boolean;
  /** Cart; `undefined` while loading, `null` when missing. */
  cart: any;
  /** Checkout session; `undefined` while loading, `null` when missing. */
  session: any;
  /** Which stage the page is in: reviewing, creating the order, or collecting card details. */
  paymentStep: CheckoutReviewStep;
  /** Stripe PaymentIntent client secret once the transaction is initialised. */
  clientSecret: string | null;
  /** `loadStripe(...)` promise once the publishable key is known. */
  stripePromise: Promise<StripeType | null> | null;
  /** Order id after `complete` succeeded (used for the Stripe return URL). */
  orderId: string | null;
  currencyCode: string;
  shippingLabel: string;
  paymentLabel: string;
  /** Blocking problems, in display order; the first one is toasted on submit. */
  checkoutIssues: string[];
  canPlaceOrder: boolean;
  isCardPayment: boolean;
  onPlaceOrder: () => Promise<void>;
  onStripeSuccess: () => void;
  onStripeError: (message: string) => void;
}

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

// ─── Surface ────────────────────────────────────────────────────────────────

export default function CoreCheckoutReview({ data }: SurfaceProps<CheckoutReviewSurfaceData>) {
  const {
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
    onPlaceOrder,
    onStripeSuccess,
    onStripeError,
  } = data;

  const formatCurrency = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode,
      }),
    [currencyCode],
  );

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 py-10 lg:py-12">
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
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_460px] xl:items-start">
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
                  onSuccess={onStripeSuccess}
                  onError={onStripeError}
                />
              </Elements>
            </div>
          </section>

          <aside className="rounded-[2rem] border border-border bg-card p-6 shadow-sm xl:sticky xl:top-28">
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
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_460px] xl:items-start">
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
                    {getCartLineSubtitle(item.metadata, item.variant) ? <p className="text-sm text-muted-foreground">{getCartLineSubtitle(item.metadata, item.variant)}</p> : null}
                    {getCartLineSku(item.product, item.metadata, item.variant) ? <p className="text-xs text-muted-foreground">SKU {getCartLineSku(item.product, item.metadata, item.variant)}</p> : null}
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

          <aside className="rounded-[2rem] border border-border bg-card p-6 shadow-sm xl:sticky xl:top-28">
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

            {checkoutIssues.length > 0 ? (
              <div className="mt-6 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
                <p className="font-medium">Checkout needs attention</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {checkoutIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void onPlaceOrder()}
              disabled={!canPlaceOrder}
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
