import { computeAddressKey as addressKey } from "@convexpress-website/backend/generated/checkoutShippingGuards";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";

import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import CoreCheckoutShipping, {
  type CheckoutShippingSurfaceData,
  type ShippingAddressForm,
  type ShippingQuote,
} from "@/templates/packs/core/surfaces/checkout.shipping";
import { Surface } from "@/templates/sdk/Surface";

export const Route = createFileRoute("/_marketing/checkout/shipping")({
  component: CheckoutShippingPage,
});

const COUNTRY_OPTIONS = [
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "GB", label: "United Kingdom" },
  { code: "AU", label: "Australia" },
  { code: "NZ", label: "New Zealand" },
] as const;

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
  const addressEdited = useRef(false);
  const [form, setForm] = useState<ShippingAddressForm>({
    firstName: "",
    lastName: "",
    line1: "",
    line2: "",
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
    if (session?.shippingAddress && !addressEdited.current) {
      setForm({
        firstName: session.shippingAddress.firstName ?? "",
        lastName: session.shippingAddress.lastName ?? "",
        line1: session.shippingAddress.line1 ?? "",
        line2: session.shippingAddress.line2 ?? "",
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
    ((rateAddressKey !== null && rateAddressKey !== currentAddressKey) ||
      sortedQuotes.some(
        (quote) => quote.addressKey && quote.addressKey !== currentAddressKey,
      ));

  async function handleRefreshRates() {
    if (!sessionToken || !hasCompleteAddress) {
      toast.error("Complete the shipping address before calculating delivery options.");
      return;
    }

    setIsLoadingRates(true);
    try {
      const address = {
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        line1: form.line1,
        line2: form.line2 || undefined,
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
        toast.success("Delivery options updated.");
      } else if (result?.provider === "manual_fallback") {
        toast.info("Delivery options could not be calculated for this address.");
      } else {
        toast.error("No delivery options are available for this address.");
      }
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          (error instanceof Error ? error.message : "Unable to calculate delivery options"),
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
      line2: form.line2 || undefined,
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

  const surfaceData: CheckoutShippingSurfaceData = {
    isReady,
    session,
    form,
    onFieldChange: (key, value) => {
      addressEdited.current = true;
      setForm((current) => ({ ...current, [key]: value }));
    },
    countryOptions,
    checkoutRequiresPhone: Boolean(settings?.commerceConfig?.checkoutRequiresPhone),
    shippingEnabled,
    shippingMethods,
    shippingMethod,
    onSelectRate: setShippingMethod,
    sortedQuotes,
    cheapestQuote,
    selectedQuote,
    selectedShippingAmount,
    extraCostOverCheapest,
    badgeLabels,
    liveRateProvider,
    rateResult,
    fallbackMessage: settings?.commerceConfig?.fallbackMessage,
    ratesAreStaleForAddress,
    hasCompleteAddress,
    hasAvailableShippingOption,
    isLoadingRates,
    isSubmitting,
    currencyCode: settings?.commerceConfig?.currencyCode || "USD",
    onRefreshRates: handleRefreshRates,
    onSubmit: handleContinue,
  };

  return <Surface name="checkout.shipping" data={surfaceData} fallback={CoreCheckoutShipping} />;
}
