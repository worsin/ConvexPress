/**
 * Journal · checkout.payment — step three: payment methods as rule-separated
 * choice rows on the left, the receipt note on the right. Same rules as
 * Core: unavailable methods stay visible but disabled with their reason, the
 * card note appears when card is selected or unavailable, the fallback
 * notice explains a silently changed method, and the pill waits while
 * saving or when the selection is unusable.
 */
import type { CheckoutPaymentSurfaceData } from "@/templates/packs/core/surfaces/checkout.payment";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Container, EmptyState, LinkButton, SectionHeading, SkeletonBlock, SmallCaps } from "../parts";
import { AsideHeading, CheckoutStatusNotice, CheckoutSteps, ChoiceRow, Notice, ReceiptList, ReceiptRow } from "../parts/extra-commerce";

const FORM_ID = "journal-checkout-payment";

export default function JournalCheckoutPayment({ data }: SurfaceProps<CheckoutPaymentSurfaceData>) {
  const { isReady, session, paymentMethods, availablePaymentMethods, paymentMethod, isSubmitting, onSelectMethod, onSubmit } = data;
  const selected = paymentMethods.find((method) => method.code === paymentMethod);
  const submitDisabled = isSubmitting || !paymentMethod || Boolean(selected?.unavailableReason);

  return (
    <Container data-slot="checkout-payment" className="flex flex-col gap-10 py-6 md:gap-14 md:py-10">
      <SectionHeading level={1} eyebrow="Checkout" title="Payment" lede="Select how you would like to pay for this order." />
      <CheckoutSteps current="payment" />

      {!isReady || session === undefined ? (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16" aria-hidden="true">
          <SkeletonBlock className="h-48" />
          <SkeletonBlock className="h-40" />
        </div>
      ) : !session ? (
        <EmptyState
          eyebrow="Not started"
          title="Start checkout from the cart first."
          action={
            <LinkButton to="/cart" variant="primary">
              Go to cart
            </LinkButton>
          }
        />
      ) : availablePaymentMethods.length === 0 ? (
        <EmptyState eyebrow="Unavailable" title="No usable payment methods are available for checkout yet." />
      ) : (
        <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16 lg:items-start">
          <form id={FORM_ID} onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-8">
            <CheckoutStatusNotice status={session.status} failureReason={session.failureReason} />
            <fieldset className="flex flex-col">
              <legend className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Payment method</legend>
              <div className="flex flex-col divide-y divide-border border-y border-border">
                {paymentMethods.map((method) => {
                  const isSelected = paymentMethod === method.code;
                  const isCard = method.code === "card";
                  const disabled = Boolean(method.unavailableReason);
                  return (
                    <ChoiceRow
                      key={method.code}
                      name="paymentMethod"
                      value={method.code}
                      checked={isSelected}
                      disabled={disabled}
                      onChange={onSelectMethod}
                      title={method.label}
                      meta={isCard && (isSelected || disabled) ? (method.unavailableReason ?? "You will enter your card details securely on the next step.") : !isCard && disabled ? method.unavailableReason : undefined}
                    />
                  );
                })}
              </div>
            </fieldset>

            {session?.selectedPaymentMethodCode && session.selectedPaymentMethodCode !== paymentMethod ? (
              <Notice tone="primary">The previously selected payment method is unavailable, so checkout selected the next usable method.</Notice>
            ) : null}
          </form>

          <aside className="flex flex-col gap-8 lg:sticky lg:top-28" aria-label="Your order">
            <AsideHeading>Your order</AsideHeading>
            <ReceiptList>
              {session.email ? <ReceiptRow label="Email" value={<span className="normal-case">{session.email}</span>} /> : null}
              <ReceiptRow label="Payment" value={selected?.label ?? "—"} />
            </ReceiptList>
            <Button type="submit" form={FORM_ID} variant="primary" disabled={submitDisabled} className="w-full">
              {isSubmitting ? "Saving…" : "Continue to review"}
            </Button>
            <SmallCaps as="p" className="text-center">
              Step 3 of 4
            </SmallCaps>
          </aside>
        </div>
      )}
    </Container>
  );
}
