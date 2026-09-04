/**
 * Depot · checkout.review — step 4: review the lines as a table, place the
 * order from the sticky summary, and (for card payments) collect the card in
 * Stripe's Payment Element. Same stages and gates as Core: skeleton,
 * incomplete data, failed / expired session, the processing spinner, the
 * blocking-issues list and the disabled place-order button.
 */
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useState, type FormEvent } from "react";

import { getCartLineBundleSelections, getCartLineSku, getCartLineSubtitle, getCartLineTitle } from "@/components/commerce/cartLine";
import { formatMoney } from "@/lib/commerce/format";
import type { CheckoutReviewSurfaceData } from "@/templates/packs/core/surfaces/checkout.review";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Button, Card, Container, DataTable, EmptyState, LinkButton, Skeleton, StickyPanel, Td, Th } from "../parts";
import { CheckoutNotice, CheckoutSteps, Notice, PageHeader } from "../parts/extra-commerce";

/* ─── Stripe payment form (inside the Elements provider) ─── */

function StripePaymentForm({ orderId, onSuccess, onError }: { orderId: string; onSuccess: () => void; onError: (message: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [confirming, setConfirming] = useState(false);

  async function submit(event: FormEvent) {
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
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      <PaymentElement />
      <Button type="submit" disabled={!stripe || !elements || confirming} className="w-full">
        {confirming ? "Processing payment..." : "Pay now"}
      </Button>
    </form>
  );
}

/* ─── Surface ─── */

export default function DepotCheckoutReview({ data }: SurfaceProps<CheckoutReviewSurfaceData>) {
  const { isReady, cart, session, paymentStep, clientSecret, stripePromise, orderId, currencyCode, shippingLabel, paymentLabel, checkoutIssues, canPlaceOrder, isCardPayment, onPlaceOrder, onStripeSuccess, onStripeError } = data;
  const money = (amount: number) => formatMoney(amount, currencyCode);
  const stripeStage = paymentStep === "stripe";

  const totals = session && cart
    ? [
        { key: "subtotal", cells: ["Subtotal", <span className="tabular-nums">{money(session.subtotalAmount ?? cart.subtotalAmount)}</span>] },
        ...((session.discountAmount ?? 0) > 0 ? [{ key: "discount", cells: [`Discount${session.appliedDiscountCode ? ` (${session.appliedDiscountCode})` : ""}`, <span className="tabular-nums">-{money(session.discountAmount)}</span>] }] : []),
        ...((session.shippingAmount ?? 0) > 0 ? [{ key: "shipping", cells: ["Shipping", <span className="tabular-nums">{money(session.shippingAmount)}</span>] }] : []),
        ...((session.taxAmount ?? 0) > 0 ? [{ key: "tax", cells: ["Tax", <span className="tabular-nums">{money(session.taxAmount)}</span>] }] : []),
        { key: "total", cells: [<span className="font-semibold text-foreground">Total</span>, <span className="text-lg font-semibold tabular-nums text-foreground">{money(session.totalAmount ?? cart.totalAmount)}</span>] },
      ]
    : [];

  return (
    <Container padded={false} data-slot="checkout-review" className="flex flex-col gap-4 py-6 md:py-8">
      <PageHeader label="Checkout" title={stripeStage ? "Complete payment" : "Review order"} description={stripeStage ? "Enter your payment details to complete the order." : "Review checkout details and submit the order."} />
      <CheckoutSteps current="review" />

      {!isReady || cart === undefined || session === undefined ? (
        <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <Skeleton className="h-64 xl:col-span-8" />
          <Skeleton className="h-64 xl:col-span-4" />
        </div>
      ) : !cart || !session ? (
        <EmptyState title="Checkout data is incomplete." action={<LinkButton to="/cart">Return to cart</LinkButton>} />
      ) : ["failed", "abandoned"].includes(session.status) ? (
        <CheckoutNotice status={session.status} failureReason={session.failureReason} />
      ) : stripeStage && clientSecret && stripePromise ? (
        <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <Card as="section" aria-labelledby="payment-details" className="flex flex-col gap-3 p-4 xl:col-span-8">
            <h2 id="payment-details" className="text-lg font-semibold text-foreground">
              Payment details
            </h2>
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe", variables: { borderRadius: "6px" } } }}>
              <StripePaymentForm orderId={orderId!} onSuccess={onStripeSuccess} onError={onStripeError} />
            </Elements>
          </Card>
          <StickyPanel label="Order summary" className="xl:col-span-4">
            <h2 className="text-lg font-semibold text-foreground">Order summary</h2>
            <DataTable caption="Order totals" firstColumnLabel rows={totals} />
          </StickyPanel>
        </div>
      ) : paymentStep === "processing" ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <div className="size-8 animate-spin rounded-md border-4 border-primary border-t-transparent" aria-hidden="true" />
          <p className="text-[13px] text-muted-foreground" role="status">
            Setting up your payment...
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <div className="flex flex-col gap-3 xl:col-span-8">
            <DataTable caption="Order items">
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th>Qty</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {(cart.items ?? []).map((item: any) => {
                  const bundle = item.metadata?.lineType === "bundle";
                  const subtitle = getCartLineSubtitle(item.metadata);
                  const sku = getCartLineSku(item.product, item.metadata);
                  return (
                    <tr key={item._id} className="border-t border-border">
                      <Td className="min-w-56">
                        <div className="flex flex-col gap-0.5">
                          <p className="text-sm font-semibold text-foreground">{getCartLineTitle(item.product, item.metadata)}</p>
                          {bundle ? (
                            <div className="flex flex-wrap gap-1">
                              {getCartLineBundleSelections(item.metadata).map((selection) => (
                                <Badge key={selection.componentId} tone="stock" className="normal-case tracking-normal">
                                  {selection.productTitle}
                                  {selection.quantity > 1 ? ` x${selection.quantity}` : ""}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <>
                              {subtitle ? <p className="text-[13px] text-muted-foreground">{subtitle}</p> : null}
                              {sku ? <p className="text-xs tabular-nums text-muted-foreground">SKU {sku}</p> : null}
                            </>
                          )}
                        </div>
                      </Td>
                      <Td className="tabular-nums">{item.quantity}</Td>
                      <Td align="right" className="whitespace-nowrap font-semibold text-foreground">
                        {money(item.lineTotalAmount)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
            <div>
              <LinkButton to="/cart" variant="secondary" size="sm">
                Edit cart
              </LinkButton>
            </div>
          </div>

          <StickyPanel label="Checkout summary" className="xl:col-span-4">
            <h2 className="text-lg font-semibold text-foreground">Checkout summary</h2>
            <DataTable
              caption="Checkout details"
              firstColumnLabel
              rows={[
                { key: "email", cells: ["Email", <span className="break-all">{session.email || "---"}</span>] },
                { key: "shipping-method", cells: ["Shipping", shippingLabel] },
                { key: "payment", cells: ["Payment", paymentLabel] },
                ...totals,
              ]}
            />
            {checkoutIssues.length > 0 ? (
              <Notice tone="primary" title="Checkout needs attention">
                <ul className="list-disc pl-4">
                  {checkoutIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}
            <Button onClick={() => void onPlaceOrder()} disabled={!canPlaceOrder} className="w-full">
              {isCardPayment ? "Place order & pay" : "Place order"}
            </Button>
            <LinkButton to="/checkout/payment" variant="secondary" className="w-full">
              Back to payment
            </LinkButton>
          </StickyPanel>
        </div>
      )}
    </Container>
  );
}
