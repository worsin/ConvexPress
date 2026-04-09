import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";

import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";

export const Route = createFileRoute("/_marketing/checkout/shipping")({
  component: CheckoutShippingPage,
});

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
    | Array<{
        _id: string;
        quoteKey: string;
        carrierName: string;
        serviceName: string;
        amount: number;
        currency: string;
        estimatedDaysMin?: number;
        estimatedDaysMax?: number;
        isCheapest: boolean;
        isFastest: boolean;
        isBestValue: boolean;
      }>
    | undefined;
  const updateSession = useMutation((api as any).commerce.checkout.updateSession);
  const fetchCheckoutRates = useAction((api as any).shipping.actions.fetchCheckoutRates);
  const shippingMethods = useMemo(
    () =>
      settings?.commerceConfig?.shippingEnabled === false
        ? []
        : settings?.commerceConfig?.shippingMethods?.length
          ? settings.commerceConfig.shippingMethods
          : [{ code: "standard", label: "Standard shipping" }],
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
  const [rateResult, setRateResult] = useState<{
    provider?: string;
    fallbackMessage?: string;
    quotes?: any[];
  } | null>(null);
  const liveRateProvider =
    settings?.commerceConfig?.preferredProvider || "shipstation";

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
    } else if (quotes?.find((quote) => quote.isBestValue)?.quoteKey) {
      setShippingMethod(quotes.find((quote) => quote.isBestValue)!.quoteKey);
    } else if (shippingMethods[0]?.code) {
      setShippingMethod(shippingMethods[0].code);
    }
  }, [quotes, session?.selectedShippingMethodCode, session?.shippingAddress, shippingMethods]);

  const hasCompleteAddress =
    Boolean(form.line1.trim()) &&
    Boolean(form.city.trim()) &&
    Boolean(form.postalCode.trim()) &&
    Boolean((form.countryCode || settings?.commerceConfig?.defaultCountryCode || "US").trim());

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
      if (result?.quotes?.length) {
        const recommended = result.quotes.find((quote: any) => quote.isBestValue);
        if (recommended?.quoteKey) {
          setShippingMethod(recommended.quoteKey);
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
          {settings?.commerceConfig?.shippingEnabled !== false ? (
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
                ConvexPress ranks quotes across enabled live providers and highlights the best overall option. Current provider priority starts with {liveRateProvider}. If no live providers return rates, checkout keeps manual shipping methods available.
              </p>

              {rateResult?.provider === "manual_fallback" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 mb-4">
                  <p className="font-medium">Live Rates Unavailable</p>
                  <p className="mt-1 text-amber-700">
                    {rateResult.fallbackMessage ||
                      "Live shipping rates are temporarily unavailable. Standard shipping options are shown below."}
                  </p>
                </div>
              )}

              {rateResult?.provider === "manual_fallback" && shippingMethods.length === 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <p className="font-medium">No Shipping Available</p>
                  <p className="mt-1">
                    We're unable to calculate shipping for your address right now. Please try again later or contact support.
                  </p>
                </div>
              )}

              {quotes && quotes.length > 0 ? (
                <div className="space-y-3">
                  {quotes.map((quote, index) => (
                    <label
                      key={quote._id}
                      className={`block cursor-pointer rounded-2xl border px-4 py-4 ${
                        index === 0
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="shippingMethod"
                          value={quote.quoteKey}
                          checked={shippingMethod === quote.quoteKey}
                          onChange={(event) => setShippingMethod(event.target.value)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {quote.carrierName} {quote.serviceName}
                            </span>
                            {quote.isBestValue ? (
                              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                                Best Option
                              </span>
                            ) : null}
                            {quote.isCheapest ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                                Cheapest
                              </span>
                            ) : null}
                            {quote.isFastest ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                                Fastest
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {typeof quote.estimatedDaysMin === "number"
                              ? `${quote.estimatedDaysMin}-${quote.estimatedDaysMax ?? quote.estimatedDaysMin} day estimate`
                              : "Transit estimate unavailable"}
                          </p>
                        </div>
                        <div className="text-right text-sm font-semibold text-foreground">
                          {new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: quote.currency || settings?.commerceConfig?.currencyCode || "USD",
                          }).format(quote.amount / 100)}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              ) : shippingMethods.length > 0 ? (
                shippingMethods.map((method) => (
                  <label
                    key={method.code}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border px-4 py-4"
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
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                  No shipping methods are currently available.
                </div>
              )}
            </div>
          ) : null}

          {[
            ["firstName", "First name"],
            ["lastName", "Last name"],
            ["line1", "Address line 1"],
            ["city", "City"],
            ["state", "State"],
            ["postalCode", "Postal code"],
            ["countryCode", "Country code"],
            ["phone", "Phone"],
          ].map(([key, label]) => (
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
                  ["line1", "city", "postalCode", "countryCode"].includes(key) ||
                  (key === "phone" &&
                    Boolean(settings?.commerceConfig?.checkoutRequiresPhone))
                }
              />
            </label>
          ))}

          <div className="md:col-span-2">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground"
            >
              Continue to payment
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
