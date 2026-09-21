import { shippingQuoteLabel } from "@/components/commerce/shippingQuoteLabel";
/**
 * Journal · checkout.shipping — step two: the delivery address as underline
 * fields, shipping methods as rule-separated choice rows (the lowest live
 * rate called out under an eyebrow), the receipt note on the right. Same
 * rules as Core: address collection stays on when shipping is disabled,
 * live rates refresh from a complete address, stale-address and fallback
 * notices, and the pill waits until a usable, current method is selected.
 */
import type { CheckoutShippingSurfaceData, ShippingQuote } from "@/templates/packs/core/surfaces/checkout.shipping";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Button, Container, EmptyState, Eyebrow, LinkButton, SectionHeading, SkeletonBlock, SmallCaps } from "../parts";
import { AsideHeading, CheckoutStatusNotice, CheckoutSteps, ChoiceRow, Field, Notice, ReceiptList, ReceiptRow, TextField, UnderlineSelect } from "../parts/extra-commerce";

const FORM_ID = "journal-checkout-shipping";

const ADDRESS_FIELDS = [
  ["firstName", "First name", "given-name"],
  ["lastName", "Last name", "family-name"],
  ["line1", "Address line 1", "address-line1"],
  ["line2", "Apartment, suite, etc.", "address-line2"],
  ["city", "City", "address-level2"],
  ["state", "State / province", "address-level1"],
  ["postalCode", "Postal code", "postal-code"],
  ["phone", "Phone", "tel"],
] as const;

function money(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(amount / 100);
}

function transit(quote: ShippingQuote) {
  if (typeof quote.estimatedDaysMin !== "number") return "Transit estimate unavailable";
  const max = quote.estimatedDaysMax ?? quote.estimatedDaysMin;
  if (quote.estimatedDaysMin === max) return `${max} business day${max === 1 ? "" : "s"}`;
  return `${quote.estimatedDaysMin}–${max} business days`;
}

export default function JournalCheckoutShipping({ data }: SurfaceProps<CheckoutShippingSurfaceData>) {
  const {
    isReady,
    session,
    form,
    onFieldChange,
    countryOptions,
    checkoutRequiresPhone,
    shippingEnabled,
    shippingMethods,
    shippingMethod,
    onSelectRate,
    sortedQuotes,
    cheapestQuote,
    selectedQuote,
    selectedShippingAmount,
    extraCostOverCheapest,
    badgeLabels,
    rateResult,
    fallbackMessage,
    ratesAreStaleForAddress,
    hasCompleteAddress,
    hasAvailableShippingOption,
    isLoadingRates,
    isSubmitting,
    currencyCode,
    onRefreshRates,
    onSubmit,
  } = data;

  const currency = (quote?: ShippingQuote) => quote?.currency || currencyCode || "USD";
  const selectedManual = shippingMethods.find((method) => method.code === shippingMethod);
  const submitDisabled = isSubmitting || (shippingEnabled && (!shippingMethod || !hasAvailableShippingOption || ratesAreStaleForAddress));

  return (
    <Container data-slot="checkout-shipping" className="flex flex-col gap-10 py-6 md:gap-14 md:py-10">
      <SectionHeading level={1} eyebrow="Checkout" title="Shipping" lede={`Where should we send this order?${!shippingEnabled ? " Shipping is currently disabled, but we still need a delivery address." : ""}`} />
      <CheckoutSteps current="shipping" />

      {!isReady || session === undefined ? (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16" aria-hidden="true">
          <SkeletonBlock className="h-80" />
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
      ) : (
        <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16 lg:items-start">
          <form id={FORM_ID} onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-12">
            <CheckoutStatusNotice status={session.status} failureReason={session.failureReason} />

            {/* Address */}
            <section className="flex flex-col gap-8">
              <SectionHeading level={2} title="Delivery address" lede="Shipping prices are calculated from this address. Refresh rates after changing it." />
              <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
                {ADDRESS_FIELDS.map(([key, label, autoComplete]) => (
                  <TextField
                    key={key}
                    id={`shipping-${key}`}
                    label={label}
                    type={key === "phone" ? "tel" : "text"}
                    autoComplete={autoComplete}
                    value={form[key]}
                    onChange={(event) => onFieldChange(key, event.target.value)}
                    required={["line1", "city", "postalCode"].includes(key) || (key === "phone" && checkoutRequiresPhone)}
                    className={["line1", "line2"].includes(key) ? "md:col-span-2" : undefined}
                  />
                ))}
                <Field label="Country" htmlFor="shipping-countryCode">
                  <UnderlineSelect id="shipping-countryCode" value={form.countryCode} onChange={(event) => onFieldChange("countryCode", event.target.value)} autoComplete="country" required>
                    {countryOptions.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.label}
                      </option>
                    ))}
                  </UnderlineSelect>
                </Field>
              </div>
            </section>

            {/* Shipping method */}
            {shippingEnabled ? (
              <section className="flex flex-col gap-6">
                <SectionHeading
                  level={2}
                  title="Shipping method"
                  action={
                    <button
                      type="button"
                      onClick={() => void onRefreshRates()}
                      disabled={isLoadingRates || !hasCompleteAddress}
                      className="text-sm font-medium text-foreground underline decoration-border underline-offset-[6px] transition-colors hover:decoration-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isLoadingRates ? "Refreshing…" : "Calculate delivery options"}
                    </button>
                  }
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Enter your delivery address to see available shipping options and prices.
                </p>

                {ratesAreStaleForAddress ? <Notice tone="primary">The address changed after these rates were loaded. Recalculate delivery options before continuing so the selected price matches the delivery address.</Notice> : null}

                {rateResult?.provider === "manual_fallback" ? (
                  <Notice tone="primary" title="Delivery options unavailable">
                    {rateResult.fallbackMessage || fallbackMessage || "Delivery options could not be calculated. Please try again or contact the store."}
                  </Notice>
                ) : null}

                {rateResult?.provider === "manual_fallback" && shippingMethods.length === 0 ? (
                  <Notice tone="destructive" title="No shipping available">
                    We're unable to calculate shipping for your address right now. Please try again later or contact support.
                  </Notice>
                ) : null}

                {sortedQuotes.length > 0 ? (
                  <div className="flex flex-col gap-6">
                    {cheapestQuote ? (
                      <div className="flex flex-col gap-4 border-y border-border py-6 sm:flex-row sm:items-end sm:justify-between">
                        <div className="flex flex-col gap-2">
                          <Eyebrow>Lowest shipping price</Eyebrow>
                          <p className="font-display text-xl leading-snug text-foreground">
                            {shippingQuoteLabel(cheapestQuote)}
                          </p>
                          <SmallCaps>{transit(cheapestQuote)}</SmallCaps>
                        </div>
                        <div className="flex flex-col items-start gap-2 sm:items-end">
                          <p className="font-display text-2xl tabular-nums text-foreground">{money(cheapestQuote.amount, currency(cheapestQuote))}</p>
                          {shippingMethod !== cheapestQuote.quoteKey ? (
                            <Button variant="ghost" onClick={() => onSelectRate(cheapestQuote.quoteKey)} className="h-9 px-4 text-xs">
                              Select lowest price
                            </Button>
                          ) : (
                            <Badge tone="primary">Selected</Badge>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {extraCostOverCheapest > 0 ? (
                      <p className="text-sm leading-6 text-muted-foreground">
                        The selected option costs <span className="font-medium text-foreground">{money(extraCostOverCheapest, currency(selectedQuote))}</span> more than the lowest available price.
                      </p>
                    ) : null}

                    <div className="flex flex-col divide-y divide-border border-y border-border">
                      {sortedQuotes.map((quote, index) => {
                        const isSelected = shippingMethod === quote.quoteKey;
                        const savings = selectedQuote && quote.amount < selectedQuote.amount ? selectedQuote.amount - quote.amount : 0;
                        return (
                          <ChoiceRow
                            key={quote._id}
                            name="shippingMethod"
                            value={quote.quoteKey}
                            checked={isSelected}
                            onChange={onSelectRate}
                            title={shippingQuoteLabel(quote)}
                            badges={
                              <>
                                {quote.isCheapest ? <Badge tone="primary">{badgeLabels.cheapest}</Badge> : null}
                                {quote.isBestValue ? <Badge>{badgeLabels.bestOption}</Badge> : null}
                                {quote.isFastest ? <Badge>{badgeLabels.fastest}</Badge> : null}
                              </>
                            }
                            meta={
                              <span className="flex flex-col gap-1">
                                <span className="flex flex-wrap gap-x-3 gap-y-1">
                                  <span>{transit(quote)}</span>
                                  {quote.provider ? <span className="uppercase tracking-[0.14em] text-[11px]">{String(quote.provider)}</span> : null}
                                  {quote.expiresAt ? <span>Valid until {new Date(quote.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span> : null}
                                </span>
                                {savings > 0 ? <span className="text-primary">Save {money(savings, currency(quote))} by choosing this option.</span> : null}
                              </span>
                            }
                            trailing={
                              <span className="flex flex-col items-end gap-1">
                                <span className="font-display text-lg tabular-nums text-foreground">{money(quote.amount, currency(quote))}</span>
                                {index === 0 ? <SmallCaps className="text-primary">Lowest price</SmallCaps> : null}
                              </span>
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                ) : shippingMethods.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    <Notice>The store also offers these free shipping options.</Notice>
                    <div className="flex flex-col divide-y divide-border border-y border-border">
                      {shippingMethods.map((method) => (
                        <ChoiceRow key={method.code} name="shippingMethod" value={method.code} checked={shippingMethod === method.code} onChange={onSelectRate} title={`${method.label} · Free`} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <Notice>No shipping methods are currently available.</Notice>
                )}
              </section>
            ) : null}
          </form>

          <aside className="flex flex-col gap-8 lg:sticky lg:top-28" aria-label="Your order">
            <AsideHeading>Your order</AsideHeading>
            <ReceiptList>
              {session.email ? <ReceiptRow label="Email" value={<span className="normal-case">{session.email}</span>} /> : null}
              {shippingEnabled ? (
                <>
                  <ReceiptRow
                    label="Shipping"
                    value={
                      selectedQuote ? (
                        <span className="flex flex-col items-end">
                          <span>
                            {shippingQuoteLabel(selectedQuote)}
                          </span>
                          <span className="text-xs text-muted-foreground">{transit(selectedQuote)}</span>
                        </span>
                      ) : selectedManual ? (
                        selectedManual.label
                      ) : (
                        <span className="text-muted-foreground">Not selected</span>
                      )
                    }
                  />
                  {selectedQuote ? <ReceiptRow label="Shipping cost" value={money(selectedShippingAmount, currency(selectedQuote))} /> : null}
                </>
              ) : (
                <ReceiptRow label="Shipping" value="Not required" />
              )}
            </ReceiptList>
            <Button type="submit" form={FORM_ID} variant="primary" disabled={submitDisabled} className="w-full">
              {isSubmitting ? "Saving…" : "Continue to payment"}
            </Button>
            <SmallCaps as="p" className="text-center">
              Step 2 of 4
            </SmallCaps>
          </aside>
        </div>
      )}
    </Container>
  );
}
