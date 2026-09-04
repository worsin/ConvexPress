/**
 * Journal · checkout.details — step one of the receipt: the small-caps
 * progress line, one email field on the left, the order note on the right.
 * Same rules as Core: waits for the session, refuses an empty cart, shows
 * the failed / expired notice, and continues to shipping.
 */
import type { CheckoutDetailsSurfaceData } from "@/templates/packs/core/surfaces/checkout.details";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Container, EmptyState, LinkButton, SectionHeading, SkeletonBlock, SmallCaps } from "../parts";
import { AsideHeading, CheckoutStatusNotice, CheckoutSteps, ReceiptList, ReceiptRow, TextField } from "../parts/extra-commerce";

const FORM_ID = "journal-checkout-details";

export default function JournalCheckoutDetails({ data }: SurfaceProps<CheckoutDetailsSurfaceData>) {
  const { storeEmail, isReady, cart, session, email, isSubmitting, onEmailChange, onSubmit } = data;

  return (
    <Container data-slot="checkout-details" className="flex flex-col gap-10 py-6 md:gap-14 md:py-10">
      <SectionHeading level={1} eyebrow="Checkout" title="Contact" lede="Start checkout by confirming the email address attached to this order." />
      <CheckoutSteps current="contact" />

      {!isReady || cart === undefined ? (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16" aria-hidden="true">
          <SkeletonBlock className="h-40" />
          <SkeletonBlock className="h-40" />
        </div>
      ) : !cart || cart.itemCount <= 0 ? (
        <EmptyState
          eyebrow="Empty"
          title="Your cart is empty."
          action={
            <LinkButton to="/products" variant="primary">
              Browse products
            </LinkButton>
          }
        />
      ) : (
        <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16 lg:items-start">
          <form id={FORM_ID} onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-8">
            <CheckoutStatusNotice status={session?.status} failureReason={session?.failureReason} />
            <TextField id="checkout-email" label="Email address" type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="you@example.com" autoComplete="email" required />
            <p className="text-sm leading-6 text-muted-foreground">We use this address for the receipt and any updates about the order.</p>
          </form>

          <aside className="flex flex-col gap-8 lg:sticky lg:top-28" aria-label="Your order">
            <AsideHeading>Your order</AsideHeading>
            <ReceiptList>
              <ReceiptRow label="Items" value={cart.itemCount} />
              {storeEmail ? <ReceiptRow label="Store contact" value={<span className="normal-case">{storeEmail}</span>} /> : null}
            </ReceiptList>
            <Button type="submit" form={FORM_ID} variant="primary" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Saving…" : "Continue to shipping"}
            </Button>
            <SmallCaps as="p" className="text-center">
              Step 1 of 4
            </SmallCaps>
          </aside>
        </div>
      )}
    </Container>
  );
}
