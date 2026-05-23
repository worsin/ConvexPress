import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { toast } from "sonner";
import { CreditCard, FileText, Truck } from "lucide-react";

import { useSettings } from "@/contexts/SettingsContext";
import { useCommerceSessionToken } from "@/hooks/useCommerceSessionToken";
import {
  CheckoutProgress,
  CheckoutStatusNotice,
} from "@/components/commerce/CheckoutProgress";

export const Route = createFileRoute("/_marketing/checkout/payment")({
  component: CheckoutPaymentPage,
});

const METHOD_ICONS: Record<string, typeof CreditCard> = {
  card: CreditCard,
  manual_invoice: FileText,
  cash_on_delivery: Truck,
};

function CheckoutPaymentPage() {
  const settings = useSettings();
  const router = useRouter();
  const { sessionToken, isReady } = useCommerceSessionToken();
  const session = useQuery(
    (api as any).commerce.checkout.getSession,
    isReady && sessionToken ? { sessionToken } : "skip",
  ) as any;
  const updateSession = useMutation(
    (api as any).commerce.checkout.updateSession,
  );

  // Get payment settings for Stripe publishable key availability
  const paymentSettings = useQuery(
    (api as any).commerce.payments.getSettings,
  ) as any;

  const paymentMethods = useMemo(
    () =>
      settings?.commerceConfig?.paymentMethods?.filter(
        (method: any) => method.enabled,
      ) ?? [
        { code: "card", label: "Credit or debit card", enabled: true },
        { code: "manual_invoice", label: "Manual invoice", enabled: true },
      ],
    [settings?.commerceConfig?.paymentMethods],
  );
  const [paymentMethod, setPaymentMethod] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (session?.selectedPaymentMethodCode) {
      setPaymentMethod(session.selectedPaymentMethodCode);
    } else if (paymentMethods[0]?.code) {
      setPaymentMethod(paymentMethods[0].code);
    }
  }, [paymentMethods, session?.selectedPaymentMethodCode]);

  const stripeAvailable = Boolean(paymentSettings?.stripePublishableKey);

  async function handleContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionToken) return;

    // Warn if card is selected but Stripe is not configured
    if (paymentMethod === "card" && !stripeAvailable) {
      toast.error(
        "Card payments are not currently available. Please select a different payment method or try again later.",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await updateSession({
        sessionToken,
        selectedPaymentMethodCode: paymentMethod,
      });
      router.navigate({ to: "/checkout/review" });
    } catch (error) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ??
          "Failed to save payment method",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-12">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Payment</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Select how you would like to pay for this order.
        </p>
      </div>
      <CheckoutProgress currentStep="payment" />

      {!isReady || session === undefined ? (
        <div className="h-48 animate-pulse rounded-[2rem] bg-muted" />
      ) : !session ? (
        <div className="rounded-[2rem] border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Start checkout from the cart first.
        </div>
      ) : paymentMethods.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No payment methods are enabled for checkout yet.
        </div>
      ) : (
        <form
          onSubmit={(event) => void handleContinue(event)}
          className="rounded-[2rem] border border-border bg-card p-8 shadow-sm"
        >
          <CheckoutStatusNotice
            status={session.status}
            failureReason={session.failureReason}
          />
          <div className="mt-4 space-y-3">
            {paymentMethods.map((method: any) => {
              const Icon = METHOD_ICONS[method.code];
              const isSelected = paymentMethod === method.code;
              const isCard = method.code === "card";

              return (
                <label
                  key={method.code}
                  className={`flex cursor-pointer items-start gap-4 rounded-2xl border px-5 py-4 transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={method.code}
                    checked={isSelected}
                    onChange={(event) =>
                      setPaymentMethod(event.target.value)
                    }
                    className="mt-0.5"
                  />
                  <div className="flex flex-1 items-start gap-3">
                    {Icon && (
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    )}
                    <div>
                      <span className="text-sm font-medium text-foreground">
                        {method.label}
                      </span>
                      {isCard && isSelected && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {stripeAvailable
                            ? "You will enter your card details securely on the next step."
                            : "Card payments are currently unavailable."}
                        </p>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !paymentMethod}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Continue to review"}
          </button>
        </form>
      )}
    </div>
  );
}
