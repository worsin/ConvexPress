import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";

import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import {
  CheckoutProgress,
  CheckoutStatusNotice,
} from "@/components/commerce/CheckoutProgress";

export const Route = createFileRoute("/_marketing/checkout/shipping")({
  component: CheckoutShippingPage,
});

const ADDRESS_FIELDS = [
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["line1", "Address line 1"],
  ["city", "City"],
  ["state", "State / province"],
  ["postalCode", "Postal code"],
  ["phone", "Phone"],
] as const;

const COUNTRY_OPTIONS = [
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "GB", label: "United Kingdom" },
  { code: "AU", label: "Australia" },
  { code: "NZ", label: "New Zealand" },
] as const;

type ShippingQuote = {
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
  expiresAt?: number;
};

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

function addressKey(address: {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
}) {
  return [
    address.line1,
    address.city,
    address.state,
    address.postalCode,
    address.countryCode,
  ]
    .map((part) => part.trim().toUpperCase())
    .join("|");
}

function CheckoutShippingPage() {
  const settings = useSettings();
  const router = useRouter();
  const { sessionToken, isReady } = useCommerceSessionToken();
  const session = useQuery(
    (api as any).commerce.checkout.getSession,
    isReady && sessionToken ? { sessionToken } : "skip",
  ) as any;
  const quotes = useQuery(
    (api as any).shipping.queries.listCheckoutQuotes,
    isReady && sessionToken ? { sessionToken } : "skip",
  ) as
    | Array<ShippingQuote>
    | undefined;
  const updateSession = useMutation((api as any).commerce.checkout.updateSession);
  const fetchCheckoutRates = useAction((api as any).shipping.actions.fetchCheckoutRates);
  const shippingMethods = useMemo<Array<{ code: string; label: string }>>(
    () =>
      settings?.commerceConfig?.shippingEnabled === false
        ? []
        : settings?.commerceConfig?.shippingMethods ?? [],
    [
      settings?.commerceConfig?.shippingEnabled,
      settings?.commerceConfig?.shippingMethods,
    ],
  );
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    line1: "",
    city: "",
    state: "",
    postalCode: "",
    countryCode: "US",
    phone: "",
  });
  const [shippingMethod, setShippingMethod] = useState("");
  const [isLoadingRates, setIsLoadingRates] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rateAddressKey, setRateAddressKey] = useState<string | null>(null);
  const [rateResult, setRateResult] = useState<{
    provider?: string;
    fallbackMessage?: string;
    quotes?: any[];
  } | null>(null);
  const liveRateProvider =
    settings?.commerceConfig?.preferredProvider || "shipstation";
  const shippingEnabled = settings?.commerceConfig?.shippingEnabled !== false;
  const hasAvailableShippingOption =
    !shippingEnabled || Boolean(quotes?.length) || shippingMethods.length > 0;
  const sortedQuotes = useMemo(
    () =>
      [...(quotes ?? [])].sort((a, b) => {
        if (a.isCheapest !== b.isCheapest) return a.isCheapest ? -1 : 1;
        if (a.amount !== b.amount) return a.amount - b.amount;
        if (a.isBestValue !== b.isBestValue) return a.isBestValue ? -1 : 1;
        if (a.isFastest !== b.isFastest) return a.isFastest ? -1 : 1;
        return (a.estimatedDaysMax ?? 9999) - (b.estimatedDaysMax ?? 9999);
      }),
    [quotes],
  );
  const cheapestQuote = sortedQuotes[0];
  const selectedQuote = sortedQuotes.find(
    (quote) => quote.quoteKey === shippingMethod,
  );
  const selectedShippingAmount = selectedQuote?.amount ?? session?.shippingAmount ?? 0;
  const extraCostOverCheapest =
    selectedQuote && cheapestQuote
      ? Math.max(0, selectedQuote.amount - cheapestQuote.amount)
      : 0;
  const badgeLabels = {
    bestOption: settings?.commerceConfig?.bestOptionBadgeLabel || "Best Option",
    cheapest: settings?.commerceConfig?.cheapestBadgeLabel || "Cheapest",
    fastest: settings?.commerceConfig?.fastestBadgeLabel || "Fastest",
  };

  useEffect(() => {
    if (session?.shippingAddress) {
      setForm({
        firstName: session.shippingAddress.firstName ?? "",
        lastName: session.shippingAddress.lastName ?? "",
        line1: session.shippingAddress.line1 ?? "",
        city: session.shippingAddress.city ?? "",
        state: session.shippingAddress.state ?? "",
        postalCode: session.shippingAddress.postalCode ?? "",
        countryCode: session.shippingAddress.countryCode ?? "US",
        phone: session.shippingAddress.phone ?? "",
      });
    }
    if (session?.selectedShippingMethodCode) {
      setShippingMethod(session.selectedShippingMethodCode);
    } else if (sortedQuotes[0]?.quoteKey) {
      setShippingMethod(sortedQuotes[0].quoteKey);
    } else if (shippingMethods[0]?.code) {
      setShippingMethod(shippingMethods[0].code);
    }
  }, [session?.selectedShippingMethodCode, session?.shippingAddress, shippingMethods, sortedQuotes]);

  const hasCompleteAddress =
    Boolean(form.line1.trim()) &&
    Boolean(form.city.trim()) &&
    Boolean(form.postalCode.trim()) &&
    Boolean((form.countryCode || settings?.commerceConfig?.defaultCountryCode || "US").trim());
  const currentAddressKey = addressKey(form);
  const countryOptions = useMemo(() => {
    if (COUNTRY_OPTIONS.some((country) => country.code === form.countryCode)) {
      return COUNTRY_OPTIONS;
    }
    return [
      ...COUNTRY_OPTIONS,
      { code: form.countryCode, label: form.countryCode },
    ];
  }, [form.countryCode]);
  const ratesAreStaleForAddress =
    sortedQuotes.length > 0 &&
    rateAddressKey !== null &&
    rateAddressKey !== currentAddressKey;

  async function handleRefreshRates() {
    if (!sessionToken || !hasCompleteAddress) {
      toast.error("Complete the shipping address before requesting live rates.");
      return;
    }

    setIsLoadingRates(true);
    try {
      const address = {
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        line1: form.line1,
        city: form.city,
        state: form.state || undefined,
        postalCode: form.postalCode,
        countryCode:
          form.countryCode || settings?.commerceConfig?.defaultCountryCode || "US",
        phone: form.phone || undefined,
      };
      const result = await fetchCheckoutRates({
        sessionToken,
        provider: liveRateProvider,
        shippingAddress: address,
      });
      setRateResult(result as any);
      setRateAddressKey(addressKey(form));
      if (result?.quotes?.length) {
        const cheapest = [...result.quotes].sort(
          (a: any, b: any) => Number(a.amount ?? 0) - Number(b.amount ?? 0),
        )[0];
        if (cheapest?.quoteKey) {
          setShippingMethod(cheapest.quoteKey);
        }
        toast.success("Live shipping rates refreshed.");
      } else if (result?.provider === "manual_fallback") {
        toast.info("Live rates unavailable. Using manual shipping methods.");
      } else {
        toast.error("No live rates were returned for this address.");
      }
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          (error instanceof Error ? error.message : "Failed to fetch live rates"),
      );
    } finally {
      setIsLoadingRates(false);
    }
  }

  async function handleContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionToken) return;
    if (shippingEnabled) {
      if (ratesAreStaleForAddress) {
        toast.error("Refresh shipping rates for the updated address before continuing.");
        return;
      }
      if (!hasAvailableShippingOption) {
        toast.error("No shipping methods are available for this order.");
        return;
      }
      if (!shippingMethod) {
        toast.error("Select a shipping method before continuing.");
        return;
      }
    }

    const address = {
      firstName: form.firstName || undefined,
      lastName: form.lastName || undefined,
      line1: form.line1,
      city: form.city,
      state: form.state || undefined,
      postalCode: form.postalCode,
      countryCode:
        form.countryCode || settings?.commerceConfig?.defaultCountryCode || "US",
      phone:
        settings?.commerceConfig?.checkoutRequiresPhone || form.phone
          ? form.phone || undefined
          : undefined,
    };

    setIsSubmitting(true);
    try {
      await updateSession({
        sessionToken,
        shippingAddress: address,
        billingAddress: address,
        ...(shippingMethod
          ? { selectedShippingMethodCode: shippingMethod }
          : {}),
      });
      router.navigate({ to: "/checkout/payment" });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to save shipping information",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 py-12">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Shipping</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Collect the delivery address for this checkout session.
          {settings?.commerceConfig?.shippingEnabled === false
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
          onSubmit={(event) => void handleContinue(event)}
          className="grid gap-4 rounded-[2rem] border border-border bg-card p-8 shadow-sm md:grid-cols-2"
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
            <label key={key} className={key === "line1" ? "md:col-span-2" : ""}>
              <span className="mb-2 block text-sm font-medium text-foreground">
                {label}
              </span>
              <input
                type="text"
                value={form[key as keyof typeof form]}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                required={
                  ["line1", "city", "postalCode"].includes(key) ||
                  (key === "phone" &&
                    Boolean(settings?.commerceConfig?.checkoutRequiresPhone))
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
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  countryCode: event.target.value,
                }))
              }
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
                  onClick={() => void handleRefreshRates()}
                  disabled={isLoadingRates || !hasCompleteAddress}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoadingRates
                    ? "Refreshing..."
                    : `Refresh live rates (${String(liveRateProvider).toUpperCase()} priority)`}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                ConvexPress compares enabled live providers and shows the lowest available shipping price first. Current provider priority starts with {liveRateProvider}. If no live providers return rates, checkout keeps manual shipping methods available.
              </p>

              {ratesAreStaleForAddress ? (
                <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
                  The address changed after these rates were loaded. Refresh live rates before continuing so the selected price matches the delivery address.
                </div>
              ) : null}

              {rateResult?.provider === "manual_fallback" && (
                <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm text-primary mb-4">
                  <p className="font-medium">Live Rates Unavailable</p>
                  <p className="mt-1 text-primary/80">
                    {rateResult.fallbackMessage ||
                      settings?.commerceConfig?.fallbackMessage ||
                      "Live shipping rates are temporarily unavailable. Standard shipping options are shown below."}
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
                            {cheapestQuote.carrierName} {cheapestQuote.serviceName}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatTransit(cheapestQuote)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-semibold text-foreground">
                            {formatMoney(
                              cheapestQuote.amount,
                              cheapestQuote.currency ||
                                settings?.commerceConfig?.currencyCode ||
                                "USD",
                            )}
                          </p>
                          {shippingMethod !== cheapestQuote.quoteKey ? (
                            <button
                              type="button"
                              onClick={() => setShippingMethod(cheapestQuote.quoteKey)}
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
                          selectedQuote?.currency ||
                            settings?.commerceConfig?.currencyCode ||
                            "USD",
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
                              onChange={(event) => setShippingMethod(event.target.value)}
                              className="mt-1"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-foreground">
                                  {quote.carrierName} {quote.serviceName}
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
                                    quote.currency ||
                                      settings?.commerceConfig?.currencyCode ||
                                      "USD",
                                  )}{" "}
                                  by choosing this option.
                                </p>
                              ) : null}
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-semibold text-foreground">
                                {formatMoney(
                                  quote.amount,
                                  quote.currency ||
                                    settings?.commerceConfig?.currencyCode ||
                                    "USD",
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
                    Live carrier quotes are not loaded. Manual store shipping options are available below.
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
                        onChange={(event) => setShippingMethod(event.target.value)}
                      />
                      <span className="text-sm font-medium text-foreground">
                        {method.label}
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
                    Selected shipping: {selectedQuote.carrierName}{" "}
                    {selectedQuote.serviceName}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {formatTransit(selectedQuote)}
                  </p>
                </div>
                <p className="text-lg font-semibold text-foreground">
                  {formatMoney(
                    selectedShippingAmount,
                    selectedQuote.currency ||
                      settings?.commerceConfig?.currencyCode ||
                      "USD",
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
