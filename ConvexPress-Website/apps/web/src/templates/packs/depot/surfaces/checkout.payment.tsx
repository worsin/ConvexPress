/**
 * Depot · checkout.payment — step 3, choose a payment method. Methods as a
 * boxed radio list in the left column (unavailable ones stay visible but
 * disabled, with the reason), a sticky summary on the right with the
 * session totals. Same gates as Core, including the "previous method
 * unavailable" notice and the submit rules.
 */
import { CreditCard, FileText, Truck } from "lucide-react";

import { formatMoney } from "@/lib/commerce/format";
import { cn } from "@/lib/utils";
import type { CheckoutPaymentSurfaceData } from "@/templates/packs/core/surfaces/checkout.payment";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Button, Card, Container, DataTable, EmptyState, LinkButton, Skeleton, StickyPanel } from "../parts";
import { CheckoutNotice, CheckoutSteps, Notice, PageHeader } from "../parts/extra-commerce";

const METHOD_ICONS: Record<string, typeof CreditCard> = {
  card: CreditCard,
  manual_invoice: FileText,
  cash_on_delivery: Truck,
};

export default function DepotCheckoutPayment({ data }: SurfaceProps<CheckoutPaymentSurfaceData>) {
  const { isReady, session, paymentMethods, availablePaymentMethods, paymentMethod, isSubmitting, onSelectMethod, onSubmit } = data;
  const currency = session?.currencyCode ?? "USD";
  const money = (amount: number) => formatMoney(amount, currency);
  const selected = paymentMethods.find((method) => method.code === paymentMethod);
  const submitDisabled = isSubmitting || !paymentMethod || Boolean(selected?.unavailableReason);

  return (
    <Container padded={false} data-slot="checkout-payment" className="flex flex-col gap-4 py-6 md:py-8">
      <PageHeader label="Checkout" title="Payment" description="Select how you would like to pay for this order." />
      <CheckoutSteps current="payment" />

      {!isReady || session === undefined ? (
        <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <Skeleton className="h-64 xl:col-span-8" />
          <Skeleton className="h-48 xl:col-span-4" />
        </div>
      ) : !session ? (
        <EmptyState title="Start checkout from the cart first." action={<LinkButton to="/cart">Go to cart</LinkButton>} />
      ) : availablePaymentMethods.length === 0 ? (
        <EmptyState title="No usable payment methods are available for checkout yet." action={<LinkButton to="/cart" variant="secondary">Return to cart</LinkButton>} />
      ) : (
        <form onSubmit={(event) => void onSubmit(event)} className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <div className="flex flex-col gap-3 xl:col-span-8">
            <CheckoutNotice status={session.status} failureReason={session.failureReason} />
            <Card as="section" aria-labelledby="payment-method" className="flex flex-col gap-3 p-4">
              <h2 id="payment-method" className="text-lg font-semibold text-foreground">
                Payment method
              </h2>
              <div className="flex flex-col overflow-hidden rounded-md border border-border">
                {paymentMethods.map((method) => {
                  const Icon = METHOD_ICONS[method.code];
                  const isSelected = paymentMethod === method.code;
                  const isCard = method.code === "card";
                  const disabled = Boolean(method.unavailableReason);
                  return (
                    <label
                      key={method.code}
                      className={cn(
                        "flex items-start gap-3 border-t border-border px-3 py-2.5 transition-colors first:border-t-0",
                        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/40",
                        isSelected && "bg-primary/5",
                      )}
                    >
                      <input type="radio" name="paymentMethod" value={method.code} checked={isSelected} disabled={disabled} onChange={(event) => onSelectMethod(event.target.value)} className="mt-1 size-4 accent-primary" />
                      {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className={cn("text-sm text-foreground", isSelected && "font-semibold")}>{method.label}</span>
                          {disabled ? <Badge tone="stock">Unavailable</Badge> : null}
                        </span>
                        {isCard && (isSelected || disabled) && <span className="text-xs text-muted-foreground">{method.unavailableReason ?? "You will enter your card details securely on the next step."}</span>}
                        {!isCard && disabled && method.unavailableReason ? <span className="text-xs text-muted-foreground">{method.unavailableReason}</span> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
              {session?.selectedPaymentMethodCode && session.selectedPaymentMethodCode !== paymentMethod ? <Notice tone="primary">The previously selected payment method is unavailable, so checkout selected the next usable method.</Notice> : null}
            </Card>
          </div>

          <StickyPanel label="Payment summary" className="xl:col-span-4">
            <h2 className="text-lg font-semibold text-foreground">Summary</h2>
            <DataTable
              caption="Payment summary"
              firstColumnLabel
              rows={[
                { key: "email", cells: ["Email", <span className="break-all">{session.email || "—"}</span>] },
                { key: "shipping-method", cells: ["Shipping", session.selectedShippingMethodLabel || session.selectedShippingMethodCode || "Not required"] },
                { key: "payment", cells: ["Payment", selected ? selected.label : <span className="text-muted-foreground">Not selected</span>] },
                ...(typeof session.subtotalAmount === "number" ? [{ key: "subtotal", cells: ["Subtotal", <span className="tabular-nums">{money(session.subtotalAmount)}</span>] }] : []),
                ...((session.discountAmount ?? 0) > 0 ? [{ key: "discount", cells: [`Discount${session.appliedDiscountCode ? ` (${session.appliedDiscountCode})` : ""}`, <span className="tabular-nums">-{money(session.discountAmount)}</span>] }] : []),
                ...((session.shippingAmount ?? 0) > 0 ? [{ key: "shipping", cells: ["Shipping", <span className="tabular-nums">{money(session.shippingAmount)}</span>] }] : []),
                ...((session.taxAmount ?? 0) > 0 ? [{ key: "tax", cells: ["Tax", <span className="tabular-nums">{money(session.taxAmount)}</span>] }] : []),
                ...(typeof session.totalAmount === "number" ? [{ key: "total", cells: [<span className="font-semibold text-foreground">Total</span>, <span className="text-lg font-semibold tabular-nums text-foreground">{money(session.totalAmount)}</span>] }] : []),
              ]}
            />
            <Button type="submit" disabled={submitDisabled} className="w-full">
              {isSubmitting ? "Saving..." : "Continue to review"}
            </Button>
            <LinkButton to="/checkout/shipping" variant="secondary" className="w-full">
              Back to shipping
            </LinkButton>
          </StickyPanel>
        </form>
      )}
    </Container>
  );
}
