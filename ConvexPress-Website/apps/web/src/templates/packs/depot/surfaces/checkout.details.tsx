/**
 * Depot · checkout.details — step 1, contact email. The numbered step strip
 * across the top, the form in the left column, a sticky summary on the
 * right. Same gates as Core: skeleton until the session is ready, an empty
 * cart stops here, the failed / expired notice shows above the field.
 */
import type { FormEvent } from "react";

import type { CheckoutDetailsSurfaceData } from "@/templates/packs/core/surfaces/checkout.details";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Button, Card, Container, DataTable, EmptyState, LinkButton, Skeleton, StickyPanel } from "../parts";
import { CheckoutNotice, CheckoutSteps, Field, PageHeader } from "../parts/extra-commerce";

export default function DepotCheckoutDetails({ data }: SurfaceProps<CheckoutDetailsSurfaceData>) {
  const { storeEmail, isReady, cart, session, email, isSubmitting, onEmailChange, onSubmit } = data;

  return (
    <Container padded={false} data-slot="checkout-details" className="flex flex-col gap-4 py-6 md:py-8">
      <PageHeader label="Checkout" title="Contact" description="Start checkout by confirming the contact email attached to this order." meta={storeEmail ? <span>Store contact: {storeEmail}</span> : undefined} />
      <CheckoutSteps current="contact" />

      {!isReady || cart === undefined ? (
        <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <Skeleton className="h-48 xl:col-span-8" />
          <Skeleton className="h-40 xl:col-span-4" />
        </div>
      ) : !cart || cart.itemCount <= 0 ? (
        <EmptyState title="Your cart is empty." description="Add something from the catalog before checking out." action={<LinkButton to="/products">Browse products</LinkButton>} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <Card as="form" onSubmit={(event: FormEvent<HTMLFormElement>) => void onSubmit(event)} className="flex flex-col gap-4 p-4 xl:col-span-8">
            <CheckoutNotice status={(session as any)?.status} failureReason={(session as any)?.failureReason} />
            <h2 className="text-lg font-semibold text-foreground">Contact email</h2>
            <Field label="Email address" type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="you@example.com" autoComplete="email" required className="max-w-md" hint="Order updates and receipts go to this address." />
            <div>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Continue to shipping"}
              </Button>
            </div>
          </Card>

          <StickyPanel label="Order summary" className="xl:col-span-4">
            <h2 className="text-lg font-semibold text-foreground">Summary</h2>
            <DataTable
              caption="Checkout summary"
              firstColumnLabel
              rows={[
                { key: "items", cells: ["Items", <span className="tabular-nums">{cart.itemCount}</span>] },
                { key: "email", cells: ["Email", <span className="break-all">{email || session?.email || "—"}</span>] },
                { key: "next", cells: ["Next", "Shipping address and method"] },
              ]}
            />
            <LinkButton to="/cart" variant="secondary" className="w-full">
              Edit cart
            </LinkButton>
          </StickyPanel>
        </div>
      )}
    </Container>
  );
}
