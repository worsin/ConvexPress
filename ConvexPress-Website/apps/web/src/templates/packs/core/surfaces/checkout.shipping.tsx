import { shippingQuoteLabel } from "@/components/commerce/shippingQuoteLabel";
/** Core · checkout.shipping — step 2: delivery address and shipping method (live rates or manual). */
import type { FormEvent } from "react";

import {
  CheckoutProgress,
  CheckoutStatusNotice,
} from "@/components/commerce/CheckoutProgress";
import type { SurfaceProps } from "@/templates/sdk/types";

export interface ShippingAddressForm {
  firstName: string;
  lastName: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  phone: string;
}

export interface ShippingQuote {
  _id: string;
  quoteKey: string;
  provider?: string;
  carrierName: string;
  serviceName: string;
  amount: number;
  currency: string;
  estimatedDaysMin?: number;
  estimatedDaysMax?: number;
  isCheapest: boolean;
  isFastest: boolean;
  isBestValue: boolean;
  addressKey?: string;
  expiresAt?: number;
}

export interface CheckoutShippingSurfaceData {
  /** False until the commerce session token is available (skeleton state). */
  isReady: boolean;
  /** Checkout session; `undefined` while loading, `null` when checkout was not started. */
  session: any;
  /** Current address values (persisted by the route). */
  form: ShippingAddressForm;
  onFieldChange: (key: keyof ShippingAddressForm, value: string) => void;
  /** Country dropdown options; includes the current value when it is not a preset. */
  countryOptions: ReadonlyArray<{ code: string; label: string }>;
  /** Whether the phone field is required by store settings. */
  checkoutRequiresPhone: boolean;
  /** Store-level toggle; when false the address is still collected but no method is chosen. */
  shippingEnabled: boolean;
  /** Manual store shipping methods (empty when shipping is disabled). */
  shippingMethods: Array<{ code: string; label: string }>;
  /** Selected method: a live quote's `quoteKey` or a manual method `code`. */
  shippingMethod: string;
  onSelectRate: (code: string) => void;
  /** Live quotes sorted cheapest first. */
  sortedQuotes: ShippingQuote[];
  cheapestQuote: ShippingQuote | undefined;
  selectedQuote: ShippingQuote | undefined;
  /** Amount to show for the selected quote (falls back to the session's shipping amount). */
  selectedShippingAmount: number;
  /** How much more the selected quote costs than the cheapest. */
  extraCostOverCheapest: number;
  badgeLabels: { bestOption: string; cheapest: string; fastest: string };
  /** Provider given priority when fetching live rates. */
  liveRateProvider: string;
  /** Result of the last live-rate fetch, if any. */
  rateResult: { provider?: string; fallbackMessage?: string; quotes?: any[] } | null;
  /** Store-configured message when live rates fall back to manual methods. */
  fallbackMessage?: string | null;
  /** Quotes were fetched for a different address than the current one. */
  ratesAreStaleForAddress: boolean;
  hasCompleteAddress: boolean;
  hasAvailableShippingOption: boolean;
  isLoadingRates: boolean;
  isSubmitting: boolean;
  /** Store currency, used when a quote has none. */
  currencyCode: string;
  onRefreshRates: () => Promise<void>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

const ADDRESS_FIELDS = [
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["line1", "Address line 1"],
  ["line2", "Apartment, suite, etc."],
  ["city", "City"],
  ["state", "State / province"],
  ["postalCode", "Postal code"],
  ["phone", "Phone"],
] as const;

function formatMoney(amount: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
  }).format(amount / 100);
}

function formatTransit(quote: ShippingQuote) {
  if (typeof quote.estimatedDaysMin !== "number") {
    return "Transit estimate unavailable";
  }

  const max = quote.estimatedDaysMax ?? quote.estimatedDaysMin;
  if (quote.estimatedDaysMin === max) {
    return `${max} business day${max === 1 ? "" : "s"}`;
  }
  return `${quote.estimatedDaysMin}-${max} business days`;
}

export default function CoreCheckoutShipping({ data }: SurfaceProps<CheckoutShippingSurfaceData>) {
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

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 py-10 lg:py-12">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Shipping</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Collect the delivery address for this checkout session.
          {!shippingEnabled
            ? " Shipping is currently disabled, but address collection remains available."
            : ""}
        </p>
      </div>
      <CheckoutProgress currentStep="shipping" />

      {!isReady || session === undefined ? (
        <div className="h-48 animate-pulse rounded-[2rem] bg-muted" />
      ) : !session ? (
        <div className="rounded-[2rem] border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Start checkout from the cart first.
        </div>
      ) : (
        <form
          onSubmit={(event) => void onSubmit(event)}
          className="grid gap-4 rounded-[2rem] border border-border bg-card p-8 shadow-sm md:grid-cols-2 lg:p-10"
        >
          <div className="md:col-span-2">
            <CheckoutStatusNotice
              status={session.status}
              failureReason={session.failureReason}
            />
          </div>

          <div className="md:col-span-2">
            <h2 className="text-lg font-semibold text-foreground">
              Delivery address
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Shipping prices are calculated from this address. Refresh rates after changing it.
            </p>
          </div>

          {ADDRESS_FIELDS.map(([key, label]) => (
            <label
              key={key}
              className={["line1", "line2"].includes(key) ? "md:col-span-2" : ""}
            >
              <span className="mb-2 block text-sm font-medium text-foreground">
                {label}
              </span>
              <input
                type="text"
                value={form[key]}
                onChange={(event) => onFieldChange(key, event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                required={
                  ["line1", "city", "postalCode"].includes(key) ||
                  (key === "phone" && checkoutRequiresPhone)
                }
              />
            </label>
          ))}

          <label>
            <span className="mb-2 block text-sm font-medium text-foreground">
              Country
            </span>
            <select
              value={form.countryCode}
              onChange={(event) => onFieldChange("countryCode", event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
              required
            >
              {countryOptions.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.label}
                </option>
              ))}
            </select>
          </label>

          {shippingEnabled ? (
            <div className="space-y-3 md:col-span-2">
              <div className="flex items-center justify-between gap-4">
                <span className="block text-sm font-medium text-foreground">
                  Shipping method
                </span>
                <button
                  type="button"
                  onClick={() => void onRefreshRates()}
                  disabled={isLoadingRates || !hasCompleteAddress}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoadingRates
                    ? "Refreshing..."
                    : "Calculate delivery options"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter your delivery address to see available shipping options and prices.
              </p>

              {ratesAreStaleForAddress ? (
                <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
                  The address changed after these rates were loaded. Recalculate delivery options before continuing so the selected price matches the delivery address.
                </div>
              ) : null}

              {rateResult?.provider === "manual_fallback" && (
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm text-primary mb-4">
                  <p className="font-medium">Delivery options unavailable</p>
                  <p className="mt-1 text-primary/80">
                    {rateResult.fallbackMessage ||
                      fallbackMessage ||
                      "Delivery options could not be calculated. Please try again or contact the store."}
                  </p>
                </div>
              )}

              {rateResult?.provider === "manual_fallback" && shippingMethods.length === 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  <p className="font-medium">No Shipping Available</p>
                  <p className="mt-1 text-destructive/80">
                    We're unable to calculate shipping for your address right now. Please try again later or contact support.
                  </p>
                </div>
              )}

              {sortedQuotes.length > 0 ? (
                <div className="space-y-4">
                  {cheapestQuote ? (
                    <div className="rounded-2xl border border-primary bg-primary/10 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-primary">
                            Lowest shipping price
                          </p>
                          <p className="mt-1 text-sm text-foreground">
                            {shippingQuoteLabel(cheapestQuote)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatTransit(cheapestQuote)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-semibold text-foreground">
                            {formatMoney(
                              cheapestQuote.amount,
                              cheapestQuote.currency || currencyCode || "USD",
                            )}
                          </p>
                          {shippingMethod !== cheapestQuote.quoteKey ? (
                            <button
                              type="button"
                              onClick={() => onSelectRate(cheapestQuote.quoteKey)}
                              className="mt-2 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                            >
                              Select lowest price
                            </button>
                          ) : (
                            <span className="mt-2 inline-flex rounded-xl border border-primary px-3 py-2 text-xs font-medium text-primary">
                              Selected
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {extraCostOverCheapest > 0 ? (
                    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                      The selected shipping option costs{" "}
                      <span className="font-medium text-foreground">
                        {formatMoney(
                          extraCostOverCheapest,
                          selectedQuote?.currency || currencyCode || "USD",
                        )}
                      </span>{" "}
                      more than the lowest available price.
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    {sortedQuotes.map((quote, index) => {
                      const isSelected = shippingMethod === quote.quoteKey;
                      const savingsComparedToSelected =
                        selectedQuote && quote.amount < selectedQuote.amount
                          ? selectedQuote.amount - quote.amount
                          : 0;

                      return (
                        <label
                          key={quote._id}
                          className={`block cursor-pointer rounded-2xl border px-4 py-4 transition-colors ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : index === 0
                                ? "border-primary/60 bg-primary/5"
                                : "border-border hover:border-primary/40"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="radio"
                              name="shippingMethod"
                              value={quote.quoteKey}
                              checked={isSelected}
                              onChange={(event) => onSelectRate(event.target.value)}
                              className="mt-1"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-foreground">
                                  {shippingQuoteLabel(quote)}
                                </span>
                                {quote.isCheapest ? (
                                  <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                                    {badgeLabels.cheapest}
                                  </span>
                                ) : null}
                                {quote.isBestValue ? (
                                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                                    {badgeLabels.bestOption}
                                  </span>
                                ) : null}
                                {quote.isFastest ? (
                                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                                    {badgeLabels.fastest}
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>{formatTransit(quote)}</span>
                                {quote.provider ? (
                                  <span>{String(quote.provider).toUpperCase()}</span>
                                ) : null}
                                {quote.expiresAt ? (
                                  <span>
                                    Valid until{" "}
                                    {new Date(quote.expiresAt).toLocaleTimeString([], {
                                      hour: "numeric",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                ) : null}
                              </div>
                              {savingsComparedToSelected > 0 ? (
                                <p className="mt-2 text-xs font-medium text-primary">
                                  Save{" "}
                                  {formatMoney(
                                    savingsComparedToSelected,
                                    quote.currency || currencyCode || "USD",
                                  )}{" "}
                                  by choosing this option.
                                </p>
                              ) : null}
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-semibold text-foreground">
                                {formatMoney(
                                  quote.amount,
                                  quote.currency || currencyCode || "USD",
                                )}
                              </p>
                              {index === 0 ? (
                                <p className="mt-1 text-xs font-medium text-primary">
                                  Lowest price
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : shippingMethods.length > 0 ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    The store also offers these free shipping options.
                  </div>
                  {shippingMethods.map((method) => (
                    <label
                      key={method.code}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-4 transition-colors ${
                        shippingMethod === method.code
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <input
                        type="radio"
                        name="shippingMethod"
                        value={method.code}
                        checked={shippingMethod === method.code}
                        onChange={(event) => onSelectRate(event.target.value)}
                      />
                      <span className="text-sm font-medium text-foreground">
                        {method.label} · Free
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                  No shipping methods are currently available.
                </div>
              )}
            </div>
          ) : null}

          {shippingEnabled && selectedQuote ? (
            <div className="md:col-span-2 rounded-2xl border border-border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">
                    Selected shipping: {shippingQuoteLabel(selectedQuote)}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {formatTransit(selectedQuote)}
                  </p>
                </div>
                <p className="text-lg font-semibold text-foreground">
                  {formatMoney(
                    selectedShippingAmount,
                    selectedQuote.currency || currencyCode || "USD",
                  )}
                </p>
              </div>
            </div>
          ) : null}

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={
                isSubmitting ||
                (shippingEnabled &&
                  (!shippingMethod ||
                    !hasAvailableShippingOption ||
                    ratesAreStaleForAddress))
              }
              className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Saving..." : "Continue to payment"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
