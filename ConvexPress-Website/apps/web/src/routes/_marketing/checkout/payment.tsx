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

type PaymentMethodOption = {
  code: string;
  label: string;
  enabled: boolean;
  unavailableReason?: string;
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

  const stripeAvailable = Boolean(paymentSettings?.stripePublishableKey);
  const paymentMethods = useMemo<PaymentMethodOption[]>(() => {
    const configured =
      settings?.commerceConfig?.paymentMethods?.filter(
        (method: any) => method.enabled,
      ) ?? [
        { code: "manual_invoice", label: "Manual invoice", enabled: true },
      ];

    return configured.map((method: any) => {
      if (method.code === "card" && !stripeAvailable) {
        return {
          ...method,
          unavailableReason: "Card payments are currently unavailable.",
        };
      }
      return method;
    });
  }, [settings?.commerceConfig?.paymentMethods, stripeAvailable]);
  const availablePaymentMethods = useMemo(
    () => paymentMethods.filter((method) => !method.unavailableReason),
    [paymentMethods],
  );
  const [paymentMethod, setPaymentMethod] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const savedMethod = paymentMethods.find(
      (method) =>
        method.code === session?.selectedPaymentMethodCode &&
        !method.unavailableReason,
    );
    setPaymentMethod(savedMethod?.code ?? availablePaymentMethods[0]?.code ?? "");
  }, [availablePaymentMethods, paymentMethods, session?.selectedPaymentMethodCode]);

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
    const selectedMethod = paymentMethods.find(
      (method) => method.code === paymentMethod,
    );
    if (!selectedMethod) {
      toast.error("Select a payment method before continuing.");
      return;
    }
    if (selectedMethod?.unavailableReason) {
      toast.error(selectedMethod.unavailableReason);
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
      ) : availablePaymentMethods.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No usable payment methods are available for checkout yet.
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
              const disabled = Boolean(method.unavailableReason);

              return (
                <label
                  key={method.code}
                  className={`flex items-start gap-4 rounded-2xl border px-5 py-4 transition-colors ${
                    disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                  } ${
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
                    disabled={disabled}
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
                      {isCard && (isSelected || disabled) && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {method.unavailableReason ??
                            "You will enter your card details securely on the next step."}
                        </p>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {session?.selectedPaymentMethodCode &&
          session.selectedPaymentMethodCode !== paymentMethod ? (
            <div className="mt-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
              The previously selected payment method is unavailable, so checkout selected the next usable method.
            </div>
          ) : null}

          <button
            type="submit"
            disabled={
              isSubmitting ||
              !paymentMethod ||
              Boolean(
                paymentMethods.find((method) => method.code === paymentMethod)
                  ?.unavailableReason,
              )
            }
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Continue to review"}
          </button>
        </form>
      )}
    </div>
  );
}
