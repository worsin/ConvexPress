/**
 * Depot · checkout.shipping — step 2, delivery address and shipping method.
 * Left column: the address fields in a dense two-up grid, then the method
 * picker (live quotes as a data table with badges, or the manual methods).
 * Right: a sticky summary with the selected method and its price. Every
 * gate and message from Core is kept: stale rates, manual fallback, no
 * shipping available, refresh-rates button, lowest-price shortcut, savings
 * hints, and the submit disabled rules.
 */
import { Check } from "lucide-react";

import { formatMoney } from "@/lib/commerce/format";
import { cn } from "@/lib/utils";
import type { CheckoutShippingSurfaceData, ShippingAddressForm, ShippingQuote } from "@/templates/packs/core/surfaces/checkout.shipping";
import type { SurfaceProps } from "@/templates/sdk/types";

import { Badge, Button, Card, Container, DataTable, EmptyState, Label, LinkButton, Skeleton, StickyPanel, Td, Th } from "../parts";
import { CheckoutNotice, CheckoutSteps, Field, Notice, PageHeader, inputClasses } from "../parts/extra-commerce";

const ADDRESS_FIELDS: ReadonlyArray<{ key: keyof ShippingAddressForm; label: string; wide?: boolean; autoComplete: string }> = [
  { key: "firstName", label: "First name", autoComplete: "given-name" },
  { key: "lastName", label: "Last name", autoComplete: "family-name" },
  { key: "line1", label: "Address line 1", wide: true, autoComplete: "address-line1" },
  { key: "line2", label: "Apartment, suite, etc.", wide: true, autoComplete: "address-line2" },
  { key: "city", label: "City", autoComplete: "address-level2" },
  { key: "state", label: "State / province", autoComplete: "address-level1" },
  { key: "postalCode", label: "Postal code", autoComplete: "postal-code" },
  { key: "phone", label: "Phone", autoComplete: "tel" },
];

function transit(quote: ShippingQuote) {
  if (typeof quote.estimatedDaysMin !== "number") return "Transit estimate unavailable";
  const max = quote.estimatedDaysMax ?? quote.estimatedDaysMin;
  if (quote.estimatedDaysMin === max) return `${max} business day${max === 1 ? "" : "s"}`;
  return `${quote.estimatedDaysMin}-${max} business days`;
}

export default function DepotCheckoutShipping({ data }: SurfaceProps<CheckoutShippingSurfaceData>) {
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
    liveRateProvider,
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

  const money = (amount: number, currency?: string) => formatMoney(amount, currency || currencyCode || "USD");
  const manualFallback = rateResult?.provider === "manual_fallback";
  const selectedManual = shippingMethods.find((method) => method.code === shippingMethod);
  const submitDisabled = isSubmitting || (shippingEnabled && (!shippingMethod || !hasAvailableShippingOption || ratesAreStaleForAddress));

  return (
    <Container padded={false} data-slot="checkout-shipping" className="flex flex-col gap-4 py-6 md:py-8">
      <PageHeader label="Checkout" title="Shipping" description={`Collect the delivery address for this checkout session.${!shippingEnabled ? " Shipping is currently disabled, but address collection remains available." : ""}`} />
      <CheckoutSteps current="shipping" />

      {!isReady || session === undefined ? (
        <div className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <Skeleton className="h-96 xl:col-span-8" />
          <Skeleton className="h-48 xl:col-span-4" />
        </div>
      ) : !session ? (
        <EmptyState title="Start checkout from the cart first." action={<LinkButton to="/cart">Go to cart</LinkButton>} />
      ) : (
        <form onSubmit={(event) => void onSubmit(event)} className="grid gap-4 xl:grid-cols-12 xl:items-start">
          <div className="flex flex-col gap-3 xl:col-span-8">
            <CheckoutNotice status={session.status} failureReason={session.failureReason} />

            <Card as="section" aria-labelledby="delivery-address" className="flex flex-col gap-3 p-4">
              <div className="flex flex-col gap-0.5">
                <h2 id="delivery-address" className="text-lg font-semibold text-foreground">
                  Delivery address
                </h2>
                <p className="text-[13px] text-muted-foreground">Shipping prices are calculated from this address. Refresh rates after changing it.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {ADDRESS_FIELDS.map((field) => (
                  <Field
                    key={field.key}
                    label={field.label}
                    type="text"
                    value={form[field.key]}
                    onChange={(event) => onFieldChange(field.key, event.target.value)}
                    autoComplete={field.autoComplete}
                    required={["line1", "city", "postalCode"].includes(field.key) || (field.key === "phone" && checkoutRequiresPhone)}
                    className={cn(field.wide && "md:col-span-2")}
                  />
                ))}
                <Field label="Country">
                  <select value={form.countryCode} onChange={(event) => onFieldChange("countryCode", event.target.value)} className={inputClasses} required autoComplete="country">
                    {countryOptions.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </Card>

            {shippingEnabled && (
              <Card as="section" aria-labelledby="shipping-method" className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <h2 id="shipping-method" className="text-lg font-semibold text-foreground">
                      Shipping method
                    </h2>
                    <p className="text-[13px] text-muted-foreground">
                      ConvexPress compares enabled live providers and shows the lowest available shipping price first. Current provider priority starts with {liveRateProvider}. If no live providers return rates, checkout keeps manual shipping methods available.
                    </p>
                  </div>
                  <Button type="button" variant="secondary" onClick={() => void onRefreshRates()} disabled={isLoadingRates || !hasCompleteAddress}>
                    {isLoadingRates ? "Refreshing..." : `Refresh live rates (${String(liveRateProvider).toUpperCase()} priority)`}
                  </Button>
                </div>

                {ratesAreStaleForAddress ? <Notice tone="primary">The address changed after these rates were loaded. Refresh live rates before continuing so the selected price matches the delivery address.</Notice> : null}

                {manualFallback && (
                  <Notice tone="primary" title="Live rates unavailable">
                    {rateResult?.fallbackMessage || fallbackMessage || "Live shipping rates are temporarily unavailable. Standard shipping options are shown below."}
                  </Notice>
                )}

                {manualFallback && shippingMethods.length === 0 && (
                  <Notice tone="danger" title="No shipping available">
                    We're unable to calculate shipping for your address right now. Please try again later or contact support.
                  </Notice>
                )}

                {sortedQuotes.length > 0 ? (
                  <>
                    {cheapestQuote ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary bg-primary/10 px-3 py-2">
                        <div className="flex min-w-0 flex-col">
                          <Label className="text-primary">Lowest shipping price</Label>
                          <p className="text-sm font-semibold text-foreground">
                            {cheapestQuote.carrierName} {cheapestQuote.serviceName}
                          </p>
                          <p className="text-xs text-muted-foreground">{transit(cheapestQuote)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-semibold tabular-nums text-foreground">{money(cheapestQuote.amount, cheapestQuote.currency)}</span>
                          {shippingMethod !== cheapestQuote.quoteKey ? (
                            <Button type="button" size="sm" onClick={() => onSelectRate(cheapestQuote.quoteKey)}>
                              Select lowest price
                            </Button>
                          ) : (
                            <Badge tone="sale">Selected</Badge>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {extraCostOverCheapest > 0 ? (
                      <Notice>
                        The selected shipping option costs <span className="font-semibold text-foreground">{money(extraCostOverCheapest, selectedQuote?.currency)}</span> more than the lowest available price.
                      </Notice>
                    ) : null}

                    <DataTable caption="Live shipping quotes">
                      <thead>
                        <tr>
                          <Th>
                            <span className="sr-only">Select</span>
                          </Th>
                          <Th>Service</Th>
                          <Th className="hidden md:table-cell">Transit</Th>
                          <Th className="text-right">Price</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedQuotes.map((quote, index) => {
                          const selected = shippingMethod === quote.quoteKey;
                          const savings = selectedQuote && quote.amount < selectedQuote.amount ? selectedQuote.amount - quote.amount : 0;
                          const id = `quote-${quote._id}`;
                          return (
                            <tr key={quote._id} className={cn("border-t border-border transition-colors", selected ? "bg-primary/5" : index === 0 ? "bg-muted/30" : "hover:bg-muted/40")}>
                              <Td className="w-10">
                                <input id={id} type="radio" name="shippingMethod" value={quote.quoteKey} checked={selected} onChange={(event) => onSelectRate(event.target.value)} className="size-4 accent-primary" />
                              </Td>
                              <Td>
                                <label htmlFor={id} className="flex cursor-pointer flex-col gap-1">
                                  <span className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-sm font-semibold text-foreground">
                                      {quote.carrierName} {quote.serviceName}
                                    </span>
                                    {quote.isCheapest ? <Badge tone="sale">{badgeLabels.cheapest}</Badge> : null}
                                    {quote.isBestValue ? <Badge tone="new">{badgeLabels.bestOption}</Badge> : null}
                                    {quote.isFastest ? <Badge tone="stock">{badgeLabels.fastest}</Badge> : null}
                                  </span>
                                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground md:hidden">
                                    <span>{transit(quote)}</span>
                                  </span>
                                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                    {quote.provider ? <span>{String(quote.provider).toUpperCase()}</span> : null}
                                    {quote.expiresAt ? <span>Valid until {new Date(quote.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span> : null}
                                  </span>
                                  {savings > 0 ? <span className="text-xs font-medium text-primary">Save {money(savings, quote.currency)} by choosing this option.</span> : null}
                                </label>
                              </Td>
                              <Td className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{transit(quote)}</Td>
                              <Td align="right" className="whitespace-nowrap">
                                <span className="text-sm font-semibold text-foreground">{money(quote.amount, quote.currency)}</span>
                                {index === 0 ? <span className="block text-[11px] font-semibold uppercase tracking-wide text-primary">Lowest price</span> : null}
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </DataTable>
                  </>
                ) : shippingMethods.length > 0 ? (
                  <>
                    <Notice>Live carrier quotes are not loaded. Manual store shipping options are available below.</Notice>
                    <div className="flex flex-col overflow-hidden rounded-md border border-border">
                      {shippingMethods.map((method) => {
                        const selected = shippingMethod === method.code;
                        return (
                          <label key={method.code} className={cn("flex cursor-pointer items-center gap-3 border-t border-border px-3 py-2 text-sm transition-colors first:border-t-0", selected ? "bg-primary/5 font-semibold text-foreground" : "text-foreground hover:bg-muted/40")}>
                            <input type="radio" name="shippingMethod" value={method.code} checked={selected} onChange={(event) => onSelectRate(event.target.value)} className="size-4 accent-primary" />
                            <span>{method.label}</span>
                            {selected ? <Check className="ml-auto size-4 text-primary" aria-hidden="true" /> : null}
                          </label>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <EmptyState title="No shipping methods are currently available." className="py-6" />
                )}
              </Card>
            )}
          </div>

          <StickyPanel label="Shipping summary" className="xl:col-span-4">
            <h2 className="text-lg font-semibold text-foreground">Summary</h2>
            <DataTable
              caption="Shipping summary"
              firstColumnLabel
              rows={[
                { key: "email", cells: ["Email", <span className="break-all">{session.email || "—"}</span>] },
                {
                  key: "deliver",
                  cells: [
                    "Deliver to",
                    hasCompleteAddress ? (
                      <span>
                        {[form.line1, form.line2, form.city, form.state, form.postalCode, form.countryCode].filter(Boolean).join(", ")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Address incomplete</span>
                    ),
                  ],
                },
                ...(shippingEnabled
                  ? [
                      {
                        key: "method",
                        cells: [
                          "Method",
                          selectedQuote ? (
                            <span>
                              {selectedQuote.carrierName} {selectedQuote.serviceName}
                              <span className="block text-xs text-muted-foreground">{transit(selectedQuote)}</span>
                            </span>
                          ) : selectedManual ? (
                            selectedManual.label
                          ) : (
                            <span className="text-muted-foreground">Not selected</span>
                          ),
                        ],
                      },
                      {
                        key: "shipping",
                        cells: [<span className="font-semibold text-foreground">Shipping</span>, selectedQuote ? <span className="text-lg font-semibold tabular-nums text-foreground">{money(selectedShippingAmount, selectedQuote.currency)}</span> : <span className="text-muted-foreground">—</span>],
                      },
                    ]
                  : [{ key: "shipping", cells: ["Shipping", <span className="text-muted-foreground">Not required</span>] }]),
              ]}
            />
            {shippingEnabled && ratesAreStaleForAddress ? <p className="text-xs text-primary">Refresh live rates to continue.</p> : null}
            <Button type="submit" disabled={submitDisabled} className="w-full">
              {isSubmitting ? "Saving..." : "Continue to payment"}
            </Button>
            <LinkButton to="/checkout" variant="secondary" className="w-full">
              Back to contact
            </LinkButton>
          </StickyPanel>
        </form>
      )}
    </Container>
  );
}
