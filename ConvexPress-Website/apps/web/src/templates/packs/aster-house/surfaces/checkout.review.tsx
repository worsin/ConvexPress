/**
 * Aster · checkout.review — the last step of the receipt: lines as
 * rule-separated rows on the left, the summary with the total in display
 * type on the right, and one pill to place the order. Same flow as Core:
 * failed / abandoned sessions show the notice, "processing" waits for the
 * payment intent, and card payments continue into the Stripe Payment
 * Element with the same return URL.
 */
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useMemo, useState, type FormEvent } from "react";

import { getCartLineTitle, getCartLineSubtitle, getCartLineSku } from "@/components/commerce/cartLine";
import type { CheckoutReviewSurfaceData } from "@/templates/packs/core/surfaces/checkout.review";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Container, EmptyState, LinkButton, SectionHeading, SkeletonBlock, SmallCaps } from "../parts";
import { AsideHeading, CheckoutStatusNotice, CheckoutSteps, Notice, ReceiptList, ReceiptRow, ReceiptTotal, Spinner } from "../parts/extra-commerce";

/* ───────────────────────── Stripe form (inside Elements) ───────────────────────── */

function StripePaymentForm({ orderId, onSuccess, onError }: { orderId: string; onSuccess: () => void; onError: (message: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [confirming, setConfirming] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setConfirming(true);
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/checkout/confirmation/${orderId}` },
        redirect: "if_required",
      });
      if (error) onError(error.message || "Payment failed");
      else onSuccess();
    } catch (err: any) {
      onError(err?.message || "Payment failed");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-8">
      <PaymentElement />
      <Button type="submit" variant="primary" disabled={!stripe || !elements || confirming} className="w-full">
        {confirming ? "Processing payment…" : "Pay now"}
      </Button>
    </form>
  );
}

/* ───────────────────────── surface ───────────────────────── */

export default function AsterCheckoutReview({ data }: SurfaceProps<CheckoutReviewSurfaceData>) {
  const { isReady, cart, session, paymentStep, clientSecret, stripePromise, orderId, currencyCode, shippingLabel, paymentLabel, checkoutIssues, canPlaceOrder, isCardPayment, onPlaceOrder, onStripeSuccess, onStripeError } = data;

  const money = useMemo(() => {
    const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode });
    return (amount: number) => formatter.format(amount / 100);
  }, [currencyCode]);

  const isStripeStep = paymentStep === "stripe" && !!clientSecret && !!stripePromise;

  const summary =
    cart && session ? (
      <ReceiptList>
        {!isStripeStep ? (
          <>
            <ReceiptRow label="Email" value={<span className="normal-case">{session.email || "—"}</span>} />
            <ReceiptRow label="Shipping" value={shippingLabel} />
            <ReceiptRow label="Payment" value={paymentLabel} />
          </>
        ) : null}
        <ReceiptRow label="Subtotal" value={money(session.subtotalAmount ?? cart.subtotalAmount ?? 0)} />
        {(session.discountAmount ?? 0) > 0 ? <ReceiptRow label={`Discount${session.appliedDiscountCode ? ` (${session.appliedDiscountCode})` : ""}`} value={`-${money(session.discountAmount)}`} /> : null}
        {(session.shippingAmount ?? 0) > 0 ? <ReceiptRow label="Shipping cost" value={money(session.shippingAmount)} /> : null}
        {(session.taxAmount ?? 0) > 0 ? <ReceiptRow label="Tax" value={money(session.taxAmount)} /> : null}
        <ReceiptTotal value={money(session.totalAmount ?? cart.totalAmount ?? 0)} />
      </ReceiptList>
    ) : null;

  return (
    <Container data-slot="checkout-review" className="flex flex-col gap-10 py-6 md:gap-14 md:py-10">
      <SectionHeading level={1} eyebrow="Checkout" title={isStripeStep ? "Complete payment" : "Review"} lede={isStripeStep ? "Enter your payment details to complete the order." : "Check the details below, then place your order."} />
      <CheckoutSteps current="review" />

      {!isReady || cart === undefined || session === undefined ? (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16" aria-hidden="true">
          <SkeletonBlock className="h-56" />
          <SkeletonBlock className="h-64" />
        </div>
      ) : !cart || !session ? (
        <EmptyState
          eyebrow="Incomplete"
          title="Checkout data is incomplete."
          action={
            <LinkButton to="/cart" variant="primary">
              Return to cart
            </LinkButton>
          }
        />
      ) : ["failed", "abandoned"].includes(session.status) ? (
        <CheckoutStatusNotice status={session.status} failureReason={session.failureReason} />
      ) : isStripeStep ? (
        <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16 lg:items-start">
          <section className="flex flex-col gap-8">
            <SectionHeading level={2} title="Payment details" />
            <Elements stripe={stripePromise} options={{ clientSecret: clientSecret!, appearance: { theme: "stripe", variables: { borderRadius: "12px" } } }}>
              <StripePaymentForm orderId={orderId!} onSuccess={onStripeSuccess} onError={onStripeError} />
            </Elements>
          </section>
          <aside className="flex flex-col gap-8 lg:sticky lg:top-28" aria-label="Order summary">
            <AsideHeading>Order summary</AsideHeading>
            {summary}
          </aside>
        </div>
      ) : paymentStep === "processing" ? (
        <div className="flex flex-col items-center gap-5 border-y border-border py-14 text-center md:py-20" role="status" aria-live="polite">
          <Spinner />
          <p className="font-display text-2xl leading-snug text-foreground">Setting up your payment…</p>
        </div>
      ) : (
        <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16 lg:items-start">
          <section className="flex flex-col gap-8">
            <SectionHeading level={2} title="Order items" />
            <ul className="flex flex-col divide-y divide-border border-y border-border" aria-label="Order items">
              {(cart.items ?? []).map((item: any) => (
                <li key={item._id} className="flex items-start justify-between gap-6 py-5">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <p className="font-display text-xl leading-snug text-foreground">{getCartLineTitle(item.product, item.metadata)}</p>
                    {getCartLineSubtitle(item.metadata, item.variant) ? <p className="text-sm text-muted-foreground">{getCartLineSubtitle(item.metadata, item.variant)}</p> : null}
                    {getCartLineSku(item.product, item.metadata, item.variant) ? <p className="text-xs text-muted-foreground">SKU {getCartLineSku(item.product, item.metadata, item.variant)}</p> : null}
                    <SmallCaps className="tabular-nums">Qty {item.quantity}</SmallCaps>
                  </div>
                  <p className="shrink-0 font-display text-lg tabular-nums text-foreground">{money(item.lineTotalAmount)}</p>
                </li>
              ))}
            </ul>
          </section>

          <aside className="flex flex-col gap-8 lg:sticky lg:top-28" aria-label="Checkout summary">
            <AsideHeading>Checkout summary</AsideHeading>
            {summary}
            {checkoutIssues.length > 0 ? (
              <Notice tone="primary" title="Checkout needs attention">
                <ul className="list-disc space-y-1 pl-4">
                  {checkoutIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}
            <Button variant="primary" onClick={() => void onPlaceOrder()} disabled={!canPlaceOrder} className="w-full">
              {isCardPayment ? "Place order & pay" : "Place order"}
            </Button>
            <SmallCaps as="p" className="text-center">
              Step 4 of 4
            </SmallCaps>
          </aside>
        </div>
      )}
    </Container>
  );
}
